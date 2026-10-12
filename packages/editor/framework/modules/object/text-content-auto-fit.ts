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

/** Package-internal view measurement; only text objects opt in. */
export class TextContentAutoFit {
  private frame: number | null = null
  private destroyed = false
  private paused = false
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
    this.props.add(block.onReattach$.subscribe(this.schedule))
    this.syncObservation()
    void this.fonts.ready.then(this.schedule)
    block.onDestroy$.subscribe(() => this.destroy())
    this.schedule()
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (!paused) this.schedule()
  }

  readonly schedule = (): void => {
    if (this.destroyed || this.paused || this.frame !== null || this.block.isReadonly || !this.layout()) return
    this.block.doc.ngZone.runOutsideAngular(() => {
      this.frame = this.ownerWindow.requestAnimationFrame(() => {
        this.frame = null
        this.fit()
      })
    })
  }

  private syncObservation(): void {
    const enabled = !!this.layout()
    if (enabled === this.observing) return
    this.observing = enabled
    if (enabled) {
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

  private fit(): void {
    if (this.destroyed || this.paused || this.block.isReadonly || !this.surface.isConnected) return
    const layout = this.layout()
    if (!layout || this.surface.getClientRects().length === 0) return
    // Intrinsic block size can shrink too. scrollHeight of a stretched/flex-filled
    // frame only detects overflow and cannot recover the natural content size.
    // The temporary styles never survive this synchronous measurement or enter
    // Yjs, and layout pixels remain independent of zoom/rotation.
    const style = this.content.getAttribute('style')
    const scrollTop = this.content.scrollTop
    const scrollLeft = this.content.scrollLeft
    this.mutation.disconnect()
    let natural = 0
    try {
      Object.assign(this.content.style, {
        blockSize: 'max-content', minBlockSize: '0', maxBlockSize: 'none',
        insetBlockEnd: 'auto', flex: 'none',
      })
      natural = Math.max(
        parseFloat(this.ownerWindow.getComputedStyle(this.content)[layout.axis]),
        layout.axis === 'height' ? this.content.scrollHeight : this.content.scrollWidth,
      )
    } finally {
      if (style === null) this.content.removeAttribute('style')
      else this.content.setAttribute('style', style)
      this.content.scrollTop = scrollTop
      this.content.scrollLeft = scrollLeft
      this.observeContent()
    }
    if (!Number.isFinite(natural) || natural <= 0 || layout.inset >= 1) return
    const size = Math.min(layout.max, Math.max(layout.min,
      Math.ceil((natural + layout.padding) / (1 - layout.inset))))
    if (Math.abs(size - layout.size) < 1) return
    // Derived geometry must not add an undo step or discard redo after replay.
    // Placement owns the dependent group bounds and updates them atomically.
    this.block.doc.ngZone.run(() => {
      this.block.doc.crud.transact(() => {
        this.block.doc.placement.updateObjectGeometry(this.block, {textFit: size})
      }, ORIGIN_NO_RECORD)
    })
  }

  private destroy(): void {
    this.destroyed = true
    this.mutation.disconnect()
    this.resize?.disconnect()
    this.props.unsubscribe()
    this.fonts.removeEventListener('loadingdone', this.schedule)
    if (this.frame !== null) this.ownerWindow.cancelAnimationFrame(this.frame)
    this.frame = null
  }
}
