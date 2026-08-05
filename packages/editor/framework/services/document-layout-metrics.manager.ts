import {Subject} from 'rxjs'

export interface DocumentLayoutMetrics {
  /** Resolved `--bc-fs` in layout CSS pixels. */
  readonly baseFontSize: number
  /** Resolved root line box height in layout CSS pixels. */
  readonly lineHeight: number
}

export type DocumentLayoutMetricsConfig = Partial<DocumentLayoutMetrics>

const DEFAULT_METRICS: DocumentLayoutMetrics = {
  baseFontSize: 16,
  lineHeight: 24,
}

const positiveNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
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

  init(element: HTMLElement): void {
    if (this._element === element) return
    this._element = element
    const measured = this.measure(element)
    const configuredFontSize = positiveNumber(this.configured.baseFontSize)
    const configuredLineHeight = positiveNumber(this.configured.lineHeight)
    this.publish({
      baseFontSize: configuredFontSize ?? measured.baseFontSize,
      lineHeight: configuredLineHeight ?? measured.lineHeight,
    }, configuredFontSize !== null || configuredLineHeight !== null)
  }

  /** Update metrics and the matching root CSS custom properties explicitly. */
  update(metrics: DocumentLayoutMetricsConfig): void {
    const baseFontSize = metrics.baseFontSize === undefined
      ? this._value.baseFontSize
      : this.requirePositive('baseFontSize', metrics.baseFontSize)
    const lineHeight = metrics.lineHeight === undefined
      ? this._value.lineHeight
      : this.requirePositive('lineHeight', metrics.lineHeight)
    this.publish({baseFontSize, lineHeight}, true)
  }

  /** Re-read computed typography once after an external CSS-variable change. */
  refresh(): void {
    if (!this._element) return
    this.publish(this.measure(this._element), false)
  }

  destroy(): void {
    this._element = null
    this._change.complete()
  }

  private publish(
    metrics: DocumentLayoutMetrics,
    applyCss: boolean,
  ): void {
    if (applyCss && this._element) {
      this._element.style.setProperty('--bc-fs', `${metrics.baseFontSize}px`)
      this._element.style.setProperty(
        '--bc-lh',
        `${metrics.lineHeight / metrics.baseFontSize}`,
      )
    }
    if (
      metrics.baseFontSize === this._value.baseFontSize &&
      metrics.lineHeight === this._value.lineHeight
    ) {
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
    return {baseFontSize, lineHeight}
  }

  private requirePositive(
    name: keyof DocumentLayoutMetrics,
    value: unknown,
  ): number {
    const normalized = positiveNumber(value)
    if (normalized !== null) return normalized
    throw new RangeError(`Document layout metric ${name} must be positive`)
  }
}
