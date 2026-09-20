import {Subject, Subscription} from 'rxjs'
import type {ResolvedPaginationGeometry} from '../../pagination/pagination.types'
import {AbsolutePlacementVisibilityIndex} from '../../virtualization/absolute-placement-visibility-index'
import {subscribeRevisionPresentationChange} from '../../../revision/presentation-change'

/** View-only document extent; object coordinates remain free. No Yjs writes or scroll work. */
export class BlockPlacementSurfaceController {
  private readonly subscriptions = new Subscription()
  private readonly changes = new Subject<void>()
  private readonly index = new AbsolutePlacementVisibilityIndex(this.doc)
  private observer: ResizeObserver | null = null
  private readonly measuredSizes = new Map<string, {width: number; height: number}>()
  private readonly views = new Map<string, BlockCraft.BlockComponent>()
  private rootIds: readonly string[] = []
  private layoutIds = new Set<string>()
  private geometry: ResolvedPaginationGeometry | null = null
  private previewBottom = 0
  private root: HTMLElement | null = null
  private originalMinHeight = ''
  private minimum = '0px'
  private flowPadding = 0
  private dirty = true
  private frame = 0
  private destroyed = false
  private revisionValue = 0
  readonly change$ = this.changes.asObservable()

  constructor(private readonly doc: BlockCraft.Doc) {
    doc.afterInit?.(root => {
      if (this.destroyed || !doc.model?.contentChange$ || !doc.objectSizing) return
      this.root = root.hostElement
      this.originalMinHeight = this.root.style.minHeight
      this.minimum = this.root.ownerDocument.defaultView
        ?.getComputedStyle(this.root).minHeight || '0px'
      const ResizeObserverCtor = this.root.ownerDocument.defaultView?.ResizeObserver
      if (ResizeObserverCtor) {
        this.doc.ngZone.runOutsideAngular(() => {
          this.observer = new ResizeObserverCtor(entries => {
            let changed = false
            for (const entry of entries) {
              const id = (entry.target as HTMLElement).dataset['blockId']
              if (!id || !this.isRootObject(id)) continue
              const box = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize
              const height = box?.blockSize ?? entry.contentRect.height
              const width = box?.inlineSize ?? entry.contentRect.width
              const previous = this.measuredSizes.get(id)
              if (height > 0 && width > 0 && (!previous
                || Math.abs(previous.height - height) > 0.5 || Math.abs(previous.width - width) > 0.5)) {
                this.measuredSizes.set(id, {width, height})
                changed = true
              }
            }
            if (changed) this.invalidate()
          })
        })
      }
      this.syncStructure()
      this.subscriptions.add(doc.model.structureChange$.subscribe(() => this.syncStructure()))
      this.subscriptions.add(doc.model.contentChange$.subscribe(change => {
        if (change.blockIds.some(id => this.belongsToSurface(id))) {
          this.clearUnmountedMeasurements()
          this.invalidate()
        }
      }))
      this.subscriptions.add(doc.objectSizing.widthChange$.subscribe(() => {
        this.clearUnmountedMeasurements()
        this.invalidate()
      }))
      if (doc.layoutMetrics?.change$) {
        this.subscriptions.add(doc.layoutMetrics.change$.subscribe(() => {
          this.clearUnmountedMeasurements()
          this.invalidate()
        }))
      }
      this.subscriptions.add(subscribeRevisionPresentationChange(doc.revisions, () => this.invalidate()))
    })
  }

  register(block: BlockCraft.BlockComponent): () => void {
    this.views.set(block.id, block)
    const observe = () => {
      if (this.isRootObject(block.id) && block.hostElement.isConnected) this.observer?.observe(block.hostElement)
    }
    observe()
    const subscriptions = new Subscription()
    subscriptions.add(block.onReattach$.subscribe(observe))
    subscriptions.add(block.onDetach$.subscribe(() => this.observer?.unobserve(block.hostElement)))
    return () => {
      subscriptions.unsubscribe()
      this.observer?.unobserve(block.hostElement)
      if (this.views.get(block.id) === block) this.views.delete(block.id)
    }
  }

  configure(geometry: ResolvedPaginationGeometry | null): void {
    this.geometry = geometry
    this.invalidate()
    this.refresh()
  }

  get revision(): number { return this.revisionValue }

  measuredHeight(blockId: string): number | undefined {
    return this.measuredSizes.get(blockId)?.height
  }

  measuredWidth(blockId: string): number | undefined {
    return this.measuredSizes.get(blockId)?.width
  }

  get bottom(): number {
    this.refresh()
    return Math.max(this.index.bottom, this.previewBottom)
  }

  /** The drag preview may need another paper before pointerup persists it. */
  preview(bottom: number): void {
    if (this.previewBottom === bottom) return
    const page = (extent: number) => this.geometry
      ? Math.ceil((extent + (this.geometry.contentTop ?? this.geometry.margins.top)
        + this.geometry.geometry.contentHeight
        - (this.geometry.geometry.firstPageContentHeight ?? this.geometry.geometry.contentHeight)
        + this.geometry.pageGap) / (this.geometry.sheetHeightPx + this.geometry.pageGap)) : 0
    const previousPage = page(this.bottom)
    this.previewBottom = bottom
    if (page(this.bottom) !== previousPage) this.changes.next()
    if (!this.geometry) this.applyHeight(false)
  }

  destroy(): void {
    this.destroyed = true
    if (this.frame) this.root?.ownerDocument.defaultView?.cancelAnimationFrame(this.frame)
    if (this.root) this.root.style.minHeight = this.originalMinHeight
    this.observer?.disconnect()
    this.observer = null
    this.measuredSizes.clear()
    this.subscriptions.unsubscribe()
    this.changes.complete()
    this.views.clear()
  }

  private isRootObject(id: string): boolean {
    return this.layoutIds.has(this.doc.model.getParentId(id) ?? '')
  }

  private belongsToSurface(id: string): boolean {
    if (this.layoutIds.has(id)) return true
    const path = this.doc.model.getPath(id)
    return !!path && path.some(parent => this.layoutIds.has(parent))
  }

  private clearUnmountedMeasurements(): void {
    for (const id of this.measuredSizes.keys()) {
      if (!this.isRootObject(id) || !this.views.get(id)?.isAttached) this.measuredSizes.delete(id)
    }
  }

  private syncStructure(): void {
    this.rootIds = this.doc.model.getChildrenIds(this.doc.rootId)
    this.layoutIds = new Set(this.rootIds.filter(id =>
      this.doc.model.getFlavour(id) === 'placement-layout'))
    this.clearUnmountedMeasurements()
    for (const [id, block] of this.views) {
      if (this.isRootObject(id) && block.hostElement.isConnected) this.observer?.observe(block.hostElement)
      else this.observer?.unobserve(block.hostElement)
    }
    this.invalidate()
  }

  private invalidate(): void {
    if (this.destroyed) return
    this.dirty = true
    this.revisionValue++
    if (!this.frame && this.root) {
      this.doc.ngZone.runOutsideAngular(() => {
        this.frame = this.root!.ownerDocument.defaultView!.requestAnimationFrame(() => {
          this.frame = 0
          this.refresh()
          this.applyHeight()
        })
      })
    }
    this.changes.next()
  }

  private refresh(): void {
    if (!this.dirty || this.destroyed) return
    this.dirty = false
    this.index.rebuild(this.rootIds)
  }

  private applyHeight(refreshPadding = true): void {
    if (!this.root) return
    if (this.geometry || !(this.bottom > 0)) {
      this.root.style.minHeight = this.originalMinHeight
      return
    }
    if (refreshPadding) {
      const style = this.root.ownerDocument.defaultView!.getComputedStyle(this.root)
      this.flowPadding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
    }
    this.root.style.minHeight = `max(${this.minimum}, ${Math.ceil(this.bottom + this.flowPadding)}px)`
  }
}
