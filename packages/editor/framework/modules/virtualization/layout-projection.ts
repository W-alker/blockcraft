import {Observable, Subject} from 'rxjs'
import {HeightMap} from './height-map'

export interface VerticalLayoutChange {
  readonly revision: number
}

/** @internal Query-only vertical geometry consumed by root virtualization. */
export interface VerticalLayoutProjection {
  readonly revision: number
  readonly length: number
  readonly totalHeight: number
  readonly change$: Observable<VerticalLayoutChange>
  /** Optional pre-commit signal for mutable custom projections. */
  readonly willChange$?: Observable<VerticalLayoutChange>
  /**
   * Stable root order for custom projections. Continuous layout omits this
   * because RootVirtualizationManager already owns its canonical block order.
   */
  readonly blockIds?: readonly string[]

  offsetAt(index: number): number
  contentOffsetAt(index: number): number
  extentAt(index: number): number
  rangeHeight(start: number, end: number): number
  indexAtOffset(offset: number): number
}

/** @internal Adapts the mutable continuous HeightMap to query-only geometry. */
export class ContinuousLayoutProjection implements VerticalLayoutProjection {
  private readonly changes = new Subject<VerticalLayoutChange>()
  private revisionValue = 0
  private disposed = false

  readonly change$ = this.changes.asObservable()

  constructor(private readonly heights: HeightMap) {}

  get revision(): number {
    return this.revisionValue
  }

  get length(): number {
    return this.heights.length
  }

  get totalHeight(): number {
    return this.heights.totalHeight
  }

  offsetAt(index: number): number {
    return this.heights.getOffset(index)
  }

  contentOffsetAt(index: number): number {
    return this.heights.getOffset(index)
  }

  extentAt(index: number): number {
    return this.heights.get(index)
  }

  rangeHeight(start: number, end: number): number {
    return this.heights.getRangeHeight(start, end)
  }

  indexAtOffset(offset: number): number {
    return this.heights.findIndexByOffset(offset)
  }

  notifyChange(): void {
    if (this.disposed) return
    const revision = ++this.revisionValue
    this.changes.next({revision})
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.changes.complete()
  }
}

export function isVerticalLayoutProjection(
  value: HeightMap | VerticalLayoutProjection,
): value is VerticalLayoutProjection {
  return 'indexAtOffset' in value
}
