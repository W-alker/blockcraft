import {Subject} from 'rxjs'

export interface DocumentLayoutMetrics {
  /** Resolved `--bc-fs` in layout CSS pixels. */
  readonly baseFontSize: number
  /** Resolved root line box height in layout CSS pixels. */
  readonly lineHeight: number
  /** Resolved default block-to-block gap in layout CSS pixels. */
  readonly segmentGap: number
}

export type DocumentLayoutMetricsConfig = Partial<DocumentLayoutMetrics>

const DEFAULT_METRICS: DocumentLayoutMetrics = {
  baseFontSize: 16,
  lineHeight: 24,
  segmentGap: 10,
}

const positiveNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null

const nonNegativeNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null

/**
 * Owns the document-wide typography facts used by DOM-free layout estimates.
 *
 * Initialisation reads computed style exactly once unless the host supplies
 * `DocConfig.layoutMetrics`. A host that changes `--bc-fs` / `--bc-lh` later
 * must call `update()` with the resolved pixel values or `refresh()` after the
 * CSS change; estimation code never queries computed style itself.
 */
export class DocumentLayoutMetricsManager {
  private _element: HTMLElement | null = null
  private _value: DocumentLayoutMetrics = DEFAULT_METRICS
  private readonly _change = new Subject<DocumentLayoutMetrics>()

  readonly change$ = this._change.asObservable()

  constructor(
    private readonly configured: DocumentLayoutMetricsConfig = {},
  ) {}

  get value(): Readonly<DocumentLayoutMetrics> {
    return this._value
  }

  get baseFontSize(): number {
    return this._value.baseFontSize
  }

  get lineHeight(): number {
    return this._value.lineHeight
  }

  get segmentGap(): number {
    return this._value.segmentGap
  }

  init(element: HTMLElement): void {
    if (this._element === element) return
    this._element = element
    const measured = this.measure(element)
    const configuredFontSize = positiveNumber(this.configured.baseFontSize)
    const configuredLineHeight = positiveNumber(this.configured.lineHeight)
    const configuredSegmentGap = nonNegativeNumber(this.configured.segmentGap)
    this.publish({
      baseFontSize: configuredFontSize ?? measured.baseFontSize,
      lineHeight: configuredLineHeight ?? measured.lineHeight,
      segmentGap: configuredSegmentGap ?? measured.segmentGap,
    }, configuredFontSize !== null || configuredLineHeight !== null || configuredSegmentGap !== null)
  }

  /** Update metrics and the matching root CSS custom properties explicitly. */
  update(metrics: DocumentLayoutMetricsConfig): void {
    const baseFontSize = metrics.baseFontSize === undefined
      ? this._value.baseFontSize
      : this.requirePositive('baseFontSize', metrics.baseFontSize)
    const lineHeight = metrics.lineHeight === undefined
      ? this._value.lineHeight
      : this.requirePositive('lineHeight', metrics.lineHeight)
    const segmentGap = metrics.segmentGap === undefined
      ? this._value.segmentGap
      : this.requireNonNegative('segmentGap', metrics.segmentGap)
    this.publish({baseFontSize, lineHeight, segmentGap}, true)
  }

  /** Re-read computed typography once after an external CSS-variable change. */
  refresh(): void {
    if (!this._element) return
    // Font-family and other typography changes can alter wrapping without
    // changing the resolved font-size/line-height numbers. A refresh is an
    // explicit invalidation request, so publish even when both metrics compare
    // equal and let virtualization/pagination discard stale geometry.
    this.publish(this.measure(this._element), false, true)
  }

  destroy(): void {
    this._element = null
    this._change.complete()
  }

  private publish(
    metrics: DocumentLayoutMetrics,
    applyCss: boolean,
    force = false,
  ): void {
    if (applyCss && this._element) {
      this._element.style.setProperty('--bc-fs', `${metrics.baseFontSize}px`)
      this._element.style.setProperty(
        '--bc-lh',
        `${metrics.lineHeight / metrics.baseFontSize}`,
      )
      this._element.style.setProperty('--bc-segments-gap', `${metrics.segmentGap}px`)
    }
    if (
      metrics.baseFontSize === this._value.baseFontSize &&
      metrics.lineHeight === this._value.lineHeight &&
      metrics.segmentGap === this._value.segmentGap
    ) {
      if (force) this._change.next(this._value)
      return
    }
    this._value = Object.freeze({...metrics})
    this._change.next(this._value)
  }

  private measure(element: HTMLElement): DocumentLayoutMetrics {
    const style = element.ownerDocument.defaultView?.getComputedStyle(element)
    const baseFontSize = positiveNumber(
      Number.parseFloat(style?.fontSize ?? ''),
    ) ?? DEFAULT_METRICS.baseFontSize
    const lineHeight = positiveNumber(
      Number.parseFloat(style?.lineHeight ?? ''),
    ) ?? baseFontSize * 1.5
    const segmentGap = nonNegativeNumber(
      Number.parseFloat(style?.getPropertyValue('--bc-segments-gap') ?? ''),
    ) ?? DEFAULT_METRICS.segmentGap
    return {baseFontSize, lineHeight, segmentGap}
  }

  private requirePositive(
    name: keyof DocumentLayoutMetrics,
    value: unknown,
  ): number {
    const normalized = positiveNumber(value)
    if (normalized !== null) return normalized
    throw new RangeError(`Document layout metric ${name} must be positive`)
  }

  private requireNonNegative(
    name: keyof DocumentLayoutMetrics,
    value: unknown,
  ): number {
    const normalized = nonNegativeNumber(value)
    if (normalized !== null) return normalized
    throw new RangeError(`Document layout metric ${name} must be non-negative`)
  }
}
