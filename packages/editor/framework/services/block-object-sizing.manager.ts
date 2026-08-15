import {BehaviorSubject, distinctUntilChanged} from 'rxjs'
import type {BlockObjectSizingCapability} from '../block-std/schema/block-schema'
import type {IBlockProps} from '../block-std/types/block.type'
import {BLOCK_OBJECT_GROUP_PADDING} from './block-placement/types'

const MIN_WR = 1
const MAX_WR = 100
const FALLBACK_AR = 1
const PRECISION_WR = 4
const PRECISION_AR = 6

export interface BlockObjectSizeProps extends IBlockProps {
  wr?: number | null
  ar?: number | null
  /** @deprecated Legacy CSS pixel width. */
  width?: number | null
  /** @deprecated Legacy CSS pixel height. */
  height?: number | null
}

export type ObjectDimensionsSource = 'ratio' | 'legacy' | 'default'

export interface NormalizedObjectSize {
  wr: number
  ar: number
  source: ObjectDimensionsSource
  exact: boolean
}

export interface ResolvedObjectDimensions extends NormalizedObjectSize {
  width: number
  height: number
}

type ObjectSizeInput = Readonly<Record<string, unknown>>

const finitePositive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null

const clampWr = (value: number): number =>
  Math.min(MAX_WR, Math.max(MIN_WR, value))

const roundTo = (value: number, precision: number): number => {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

const normalizeCapability = (
  capability: BlockObjectSizingCapability,
): BlockObjectSizingCapability => ({
  defaultWr: clampWr(finitePositive(capability.defaultWr) ?? MAX_WR),
  defaultAr: finitePositive(capability.defaultAr) ?? FALLBACK_AR,
})

export function normalizeObjectSize(
  props: ObjectSizeInput | null | undefined,
  capability: BlockObjectSizingCapability,
): NormalizedObjectSize {
  const defaults = normalizeCapability(capability)
  const wr = finitePositive(props?.['wr'])
  const ar = finitePositive(props?.['ar'])
  if (wr !== null) {
    return {
      wr: clampWr(wr),
      ar: ar ?? defaults.defaultAr,
      source: 'ratio',
      exact: ar !== null,
    }
  }

  const legacyWidth = finitePositive(props?.['width'])
  if (legacyWidth !== null) {
    const legacyHeight = finitePositive(props?.['height'])
    return {
      wr: defaults.defaultWr,
      ar: legacyHeight === null
        ? defaults.defaultAr
        : legacyWidth / legacyHeight,
      source: 'legacy',
      exact: legacyHeight !== null,
    }
  }

  return {
    wr: defaults.defaultWr,
    ar: ar ?? defaults.defaultAr,
    source: 'default',
    exact: false,
  }
}

export function resolveObjectDimensions(
  props: ObjectSizeInput | null | undefined,
  rootContentWidth: number,
  capability: BlockObjectSizingCapability,
): ResolvedObjectDimensions | null {
  const normalized = normalizeObjectSize(props, capability)
  const legacyWidth = finitePositive(props?.['width'])
  const legacyHeight = finitePositive(props?.['height'])

  if (normalized.source === 'legacy' && legacyWidth !== null) {
    return {
      ...normalized,
      width: legacyWidth,
      height: legacyHeight ?? legacyWidth / normalized.ar,
    }
  }

  if (!Number.isFinite(rootContentWidth) || rootContentWidth <= 0) return null
  const width = rootContentWidth * normalized.wr / 100
  return {
    ...normalized,
    width,
    height: width / normalized.ar,
  }
}

export function deriveObjectSizeFromPixels(
  width: number,
  height: number,
  rootContentWidth: number,
): Pick<NormalizedObjectSize, 'wr' | 'ar'> | null {
  const normalizedWidth = finitePositive(width)
  const normalizedHeight = finitePositive(height)
  const normalizedRootWidth = finitePositive(rootContentWidth)
  if (
    normalizedWidth === null ||
    normalizedHeight === null ||
    normalizedRootWidth === null
  ) {
    return null
  }
  return {
    wr: roundTo(clampWr(normalizedWidth / normalizedRootWidth * 100), PRECISION_WR),
    ar: roundTo(normalizedWidth / normalizedHeight, PRECISION_AR),
  }
}

/**
 * Owns the single live root-content width measurement for one document.
 * Individual blocks and virtualization consume the cached value rather than
 * installing per-block observers or reading layout during rendering.
 */
export class BlockObjectSizingManager {
  private readonly _width = new BehaviorSubject(0)
  private _observer: ResizeObserver | null = null
  private _container: HTMLElement | null = null
  private _ownerWindow: Window | null = null

  readonly widthChange$ = this._width.pipe(distinctUntilChanged())

  constructor(private readonly doc: BlockCraft.Doc) {}

  get rootContentWidth(): number {
    return this._width.value
  }

  get rootContentElement(): HTMLElement | null {
    return this._container
  }

  init(container: HTMLElement): void {
    if (this._container === container) return
    this.disconnectView()
    this._container = container
    this._ownerWindow = container.ownerDocument.defaultView
    this.publishWidth(this.measureContentWidth(container))

    const ResizeObserverCtor = (
      this._ownerWindow as (Window & typeof globalThis) | null
    )?.ResizeObserver
    if (!ResizeObserverCtor) return

    this.doc.ngZone.runOutsideAngular(() => {
      this._observer = new ResizeObserverCtor(entries => {
        const entry = entries.find(candidate => candidate.target === container)
        if (!entry) return
        const contentBox = Array.isArray(entry.contentBoxSize)
          ? entry.contentBoxSize[0]
          : entry.contentBoxSize as unknown as ResizeObserverSize | undefined
        this.publishWidth(
          contentBox?.inlineSize ??
          entry.contentRect?.width ??
          this.measureContentWidth(container),
        )
      })
      this._observer.observe(container)
    })
  }

  getCapability(flavour: string): BlockObjectSizingCapability | null {
    return this.doc.schemas.get(flavour, false)?.metadata.objectSizing ?? null
  }

  resolve(
    flavour: string,
    props: ObjectSizeInput | null | undefined,
  ): ResolvedObjectDimensions | null {
    const capability = this.getCapability(flavour)
    if (!capability) return null
    return resolveObjectDimensions(
      props,
      this.rootContentWidth,
      capability,
    )
  }

  /** Resolve an object's ratio size against its nearest placement plane. */
  resolveForBlock(
    blockId: string,
    flavour: string,
    props: ObjectSizeInput | null | undefined,
  ): ResolvedObjectDimensions | null {
    const capability = this.getCapability(flavour)
    if (!capability) return null
    return resolveObjectDimensions(
      props,
      this.getReferenceWidth(blockId),
      capability,
    )
  }

  /**
   * Ratio-sized children of an object group use its inset content-plane width;
   * every other object keeps the document root content width as its basis.
   */
  getReferenceWidth(blockId: string): number {
    const parentId = this.doc.model?.getParentId?.(blockId)
    if (parentId && this.doc.placement?.isObjectGroup?.(parentId)) {
      const width = this.doc.model?.getProps?.(parentId)?.['width']
      if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
        return Math.max(1, width - BLOCK_OBJECT_GROUP_PADDING * 2)
      }
    }
    return this.rootContentWidth
  }

  destroy(): void {
    this.disconnectView()
    this._width.complete()
  }

  private publishWidth(width: number): void {
    if (!Number.isFinite(width) || width <= 0) return
    this._width.next(roundTo(width, 3))
  }

  private measureContentWidth(container: HTMLElement): number {
    const ownerWindow = container.ownerDocument.defaultView
    const style = ownerWindow?.getComputedStyle(container)
    const padding =
      (Number.parseFloat(style?.paddingLeft ?? '') || 0) +
      (Number.parseFloat(style?.paddingRight ?? '') || 0)
    const border =
      (Number.parseFloat(style?.borderLeftWidth ?? '') || 0) +
      (Number.parseFloat(style?.borderRightWidth ?? '') || 0)
    const clientWidth = container.clientWidth
    if (clientWidth > 0) return Math.max(0, clientWidth - padding)
    return Math.max(
      0,
      container.getBoundingClientRect().width - padding - border,
    )
  }

  private disconnectView(): void {
    this._observer?.disconnect()
    this._observer = null
    this._container = null
    this._ownerWindow = null
  }
}
