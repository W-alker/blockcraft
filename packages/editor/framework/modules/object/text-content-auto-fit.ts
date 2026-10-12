import type {Subscription} from 'rxjs'
import {ORIGIN_NO_RECORD} from '../../doc/origins'

type FitLayout = {
  axis: 'width' | 'height'
  size: number
  min: number
  max: number
  /** Fraction of the outer size reserved by the shape, excluding pixel padding. */
  inset: number
  padding: number
}

type FitBatch = {
  pending: Set<TextContentAutoFit>
  frame: number | null
  ownerWindow: Window
}

type FitMeasurement = {
  target: TextContentAutoFit
  layout: FitLayout
  style: string | null
  scrollTop: number
  scrollLeft: number
  size?: number
}

/** Package-internal view measurement; only text objects opt in. */
export class TextContentAutoFit {
  private static readonly batches = new WeakMap<BlockCraft.Doc, FitBatch>()
  private readonly batch: FitBatch
  private destroyed = false
  private paused = false
  private detached = false
  private observing = false
  private readonly inlineSizes = new WeakMap<Element, number>()
  private readonly mutation: MutationObserver
  private readonly resize?: ResizeObserver
  private readonly props: Subscription
  private readonly ownerWindow: Window
  private readonly fonts: FontFaceSet

  constructor(
    private readonly block: BlockCraft.BlockComponent,
    private readonly surface: HTMLElement,
    private readonly content: HTMLElement,
    private readonly layout: () => FitLayout | null,
  ) {
    this.ownerWindow = content.ownerDocument.defaultView!
    let batch = TextContentAutoFit.batches.get(block.doc)
    if (!batch) {
      batch = {pending: new Set(), frame: null, ownerWindow: this.ownerWindow}
      TextContentAutoFit.batches.set(block.doc, batch)
    }
    this.batch = batch
    this.fonts = content.ownerDocument.fonts
    this.mutation = new MutationObserver(() => this.schedule())
    if (typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(entries => {
        const layout = this.layout()
        if (!layout) return
        for (const entry of entries) {
          const inlineSize = layout.axis === 'height' ? entry.contentRect.width : entry.contentRect.height
          if (this.inlineSizes.get(entry.target) === inlineSize) continue
          this.inlineSizes.set(entry.target, inlineSize)
          this.schedule()
        }
      })
    }
    this.props = block.onPropsChange.subscribe(changes => {
      // A peer's measured cache is a result, not a new measurement request.
      // Observing only the inline axis above also prevents feedback between
      // clients with different font metrics or viewport constraints.
      if ([...changes.keys()].every(key => ['textFit', 'position', 'rotation', 'placementLayer'].includes(String(key)))) return
      this.syncObservation()
      this.schedule()
    })
    this.props.add(block.onDetach$.subscribe(() => {
      this.detached = true
      this.syncObservation()
      this.cancel()
    }))
    this.props.add(block.onReattach$.subscribe(() => {
      this.detached = false
      this.syncObservation()
      this.schedule()
    }))
    this.syncObservation()
    void this.fonts.ready.then(this.schedule)
    block.onDestroy$.subscribe(() => this.destroy())
    this.schedule()
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    this.syncObservation()
    if (paused) this.cancel()
    else this.schedule()
  }

  readonly schedule = (): void => {
    if (this.destroyed || this.detached || this.paused || this.block.isReadonly || !this.layout()) return
    this.batch.pending.add(this)
    if (this.batch.frame !== null) return
    this.block.doc.ngZone.runOutsideAngular(() => {
      this.batch.frame = this.batch.ownerWindow.requestAnimationFrame(() => {
        TextContentAutoFit.flush(this.batch)
      })
    })
  }

  private cancel(): void {
    this.batch.pending.delete(this)
    if (!this.batch.pending.size && this.batch.frame !== null) {
      this.batch.ownerWindow.cancelAnimationFrame(this.batch.frame)
      this.batch.frame = null
    }
  }

  private syncObservation(): void {
    const enabled = !this.detached && !this.paused && !!this.layout()
    if (enabled === this.observing) return
    this.observing = enabled
    if (enabled) {
      this.inlineSizes.delete(this.surface)
      this.inlineSizes.delete(this.content)
      this.observeContent()
      this.resize?.observe(this.surface)
      this.resize?.observe(this.content)
      this.fonts.addEventListener('loadingdone', this.schedule)
    } else {
      this.mutation.disconnect()
      this.resize?.disconnect()
      this.fonts.removeEventListener('loadingdone', this.schedule)
    }
  }

  private observeContent(): void {
    this.mutation.observe(this.content, {
      childList: true, characterData: true, attributes: true, subtree: true,
      attributeFilter: ['style', 'class'],
    })
  }

  private capture(): FitMeasurement | null {
    if (this.destroyed || this.detached || this.paused || this.block.isReadonly || !this.surface.isConnected) return null
    const layout = this.layout()
    if (!layout || this.surface.getClientRects().length === 0) return null
    return {target: this, layout, style: this.content.getAttribute('style'),
      scrollTop: this.content.scrollTop, scrollLeft: this.content.scrollLeft}
  }

  private static flush(batch: FitBatch): void {
    batch.frame = null
    const pending = [...batch.pending]
    batch.pending.clear()
    // Read the original layout of every object before changing any styles.
    const measurements = pending.map(target => target.capture())
      .filter((value): value is FitMeasurement => value !== null)
    if (!measurements.length) return

    // Let CSS calculate intrinsic sizes together. Interleaving these writes and
    // reads per object forces one browser layout for every object in the batch.
    try {
      for (const {target} of measurements) {
        target.mutation.disconnect()
        Object.assign(target.content.style, {
          blockSize: 'max-content', minBlockSize: '0', maxBlockSize: 'none',
          insetBlockEnd: 'auto', flex: 'none',
        })
      }
      for (const measurement of measurements) measurement.target.fit(measurement)
    } finally {
      for (const {target, style} of measurements) {
        if (style === null) target.content.removeAttribute('style')
        else target.content.setAttribute('style', style)
      }
      // Restore scroll offsets only after all styles are restored. A scroll
      // setter can flush layout too, so it must not be interleaved with writes.
      for (const {target, scrollTop, scrollLeft} of measurements) {
        if (scrollTop) target.content.scrollTop = scrollTop
        if (scrollLeft) target.content.scrollLeft = scrollLeft
        target.observeContent()
      }
    }
    const changed = measurements.filter(measurement => measurement.size !== undefined
      && Math.abs(measurement.size - measurement.layout.size) >= 1)
    const doc = measurements[0]!.target.block.doc
    // Publish one model change per frame/document. Virtual height estimation
    // then revisits each affected root once, even for hundreds of descendants.
    if (changed.length) doc.ngZone.run(() => doc.crud.transact(() => {
      for (const {target, size} of changed) {
        doc.placement.updateObjectGeometry(target.block, {textFit: size!})
      }
    }, ORIGIN_NO_RECORD))
  }

  private fit(measurement: FitMeasurement): void {
    const {layout} = measurement
    const natural = Math.max(
      parseFloat(this.ownerWindow.getComputedStyle(this.content)[layout.axis]),
      layout.axis === 'height' ? this.content.scrollHeight : this.content.scrollWidth,
    )
    if (!Number.isFinite(natural) || natural <= 0 || layout.inset >= 1) return
    const size = Math.min(layout.max, Math.max(layout.min,
      Math.ceil((natural + layout.padding) / (1 - layout.inset))))
    measurement.size = size
  }

  private destroy(): void {
    this.destroyed = true
    this.mutation.disconnect()
    this.resize?.disconnect()
    this.props.unsubscribe()
    this.fonts.removeEventListener('loadingdone', this.schedule)
    this.cancel()
  }
}
