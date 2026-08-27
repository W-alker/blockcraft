import {
  DEFAULT_INLINE_IMAGE_HEIGHT,
  DEFAULT_INLINE_IMAGE_WIDTH,
  DEFAULT_INLINE_IMAGE_WRAP_GAP,
  InlineImageWrapSide,
} from '../../../../embeds/image'
import {EmbedBlot, ScrollBlot} from '../blot'
import {
  buildInlineFragmentPlan,
  INLINE_FRAGMENT_GROUP_ATTRIBUTE,
  InlineDualFragmentPlan,
  InlineFragmentProjection,
  InlineRangeMeasurer,
} from './inline-fragment-layout'
import type {InlinePaginationGap} from './inline-pagination-projection'

export const INLINE_FLOAT_OWNER_ATTRIBUTE = 'data-bc-inline-float-owner'
export const INLINE_FLOAT_PREVIEW_ATTRIBUTE = 'data-bc-inline-float-preview'
export const INLINE_FLOAT_LOGICAL_ANCHOR_ATTRIBUTE =
  'data-bc-inline-logical-anchor'
export const DEFAULT_INLINE_WRAP_MIN_TEXT_WIDTH = 96
const INLINE_FLOAT_SELECTOR =
  '[data-bc-inline-float][data-bc-inline-float-layout="wrap"], ' +
  '[data-bc-inline-float][data-bc-inline-image-layout="wrap"]'

const inlineFloatFrame = (shell: HTMLElement): HTMLElement | null =>
  shell.querySelector<HTMLElement>('[data-bc-inline-float-frame]') ??
  shell.querySelector<HTMLElement>('.bc-inline-image-frame')

export interface InlineFloatPaginationBand {
  top: number
  bottom: number
}

/**
 * Snapshot the painted exclusion bands owned by wrapped inline objects.
 * Single-side CSS floats use the shell box because it includes the configured
 * wrap gap; dual-side projections also contribute their fragment group and
 * transformed frame. Zero-sized logical anchors are ignored.
 *
 * @internal Pagination measurement only.
 */
export function measureInlineFloatPaginationBands(
  root: HTMLElement,
  originTop = root.getBoundingClientRect().top,
): InlineFloatPaginationBand[] {
  const elements = [
    ...Array.from(root.querySelectorAll<HTMLElement>(
      `[${INLINE_FRAGMENT_GROUP_ATTRIBUTE}]`,
    )),
    ...Array.from(root.querySelectorAll<HTMLElement>(INLINE_FLOAT_SELECTOR))
      .flatMap(shell => [shell, inlineFloatFrame(shell)])
      .filter((element): element is HTMLElement => !!element),
  ]
  return elements
    .map(element => element.getBoundingClientRect())
    .filter(rect =>
      Number.isFinite(rect.top)
      && Number.isFinite(rect.bottom)
      && rect.bottom - rect.top > 0.75,
    )
    .map(rect => ({
      top: rect.top - originTop,
      bottom: rect.bottom - originTop,
    }))
}

const samePaginationGaps = (
  left: readonly InlinePaginationGap[],
  right: readonly InlinePaginationGap[],
): boolean => left.length === right.length && left.every((gap, index) => {
  const other = right[index]
  return gap.offset === other.offset
    && gap.height === other.height
    && gap.backdropOffset === other.backdropOffset
    && gap.backdropHeight === other.backdropHeight
})

export interface InlineFloatGeometryInput {
  containerWidth: number
  imageWidth: number
  imageHeight: number
  x?: number
  side?: InlineImageWrapSide
  gap?: number
  minTextWidth?: number
}

export interface InlineFloatGeometry {
  containerWidth: number
  layoutMode: 'single' | 'dual'
  resolvedTextSide: Exclude<InlineImageWrapSide, 'auto'>
  floatDirection: 'left' | 'right'
  imageX: number
  normalizedX: number
  imageWidth: number
  imageHeight: number
  exclusionWidth: number
  exclusionHeight: number
  frameLeft: number
  leftTextWidth: number
  rightTextWidth: number
  textIntervals: InlineFloatTextInterval[]
  availableTextWidth: number
}

export interface InlineFloatTextInterval {
  side: Exclude<InlineImageWrapSide, 'auto'>
  start: number
  width: number
}

const finite = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const positive = (value: unknown, fallback: number): number => {
  const parsed = finite(value, fallback)
  return parsed > 0 ? parsed : fallback
}

const nonNegative = (value: unknown, fallback: number): number =>
  Math.max(0, finite(value, fallback))

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const normalizeSide = (value: unknown): InlineImageWrapSide =>
  value === 'left' || value === 'right' ? value : 'auto'

export function resolveInlineFloatGeometry(
  input: InlineFloatGeometryInput,
): InlineFloatGeometry {
  const containerWidth = nonNegative(input.containerWidth, 0)
  if (containerWidth <= 0) {
    return {
      containerWidth: 0,
      layoutMode: 'single',
      resolvedTextSide: 'right',
      floatDirection: 'left',
      imageX: 0,
      normalizedX: 0,
      imageWidth: 0,
      imageHeight: 0,
      exclusionWidth: 0,
      exclusionHeight: 0,
      frameLeft: 0,
      leftTextWidth: 0,
      rightTextWidth: 0,
      textIntervals: [],
      availableTextWidth: 0,
    }
  }

  const sourceWidth = positive(input.imageWidth, DEFAULT_INLINE_IMAGE_WIDTH)
  const sourceHeight = positive(input.imageHeight, DEFAULT_INLINE_IMAGE_HEIGHT)
  const imageWidth = Math.min(sourceWidth, containerWidth)
  const imageHeight = (sourceHeight * imageWidth) / sourceWidth
  const gap = nonNegative(input.gap, DEFAULT_INLINE_IMAGE_WRAP_GAP)
  const minTextWidth = Math.min(
    containerWidth,
    positive(input.minTextWidth, DEFAULT_INLINE_WRAP_MIN_TEXT_WIDTH),
  )
  const normalizedStart = clamp(finite(input.x, 0), 0, 1)
  const maxImageX = Math.max(0, containerWidth - imageWidth)
  let imageX = clamp(normalizedStart * containerWidth, 0, maxImageX)

  let leftTextWidth = Math.max(0, imageX - gap)
  let rightTextWidth = Math.max(0, containerWidth - imageX - imageWidth - gap)
  const widerSide = leftTextWidth >= rightTextWidth ? 'left' : 'right'
  const requestedSide = normalizeSide(input.side)
  const resolvedTextSide = requestedSide === 'auto' ? widerSide : requestedSide
  const layoutMode =
    requestedSide === 'auto' &&
    leftTextWidth >= minTextWidth &&
    rightTextWidth >= minTextWidth
      ? 'dual'
      : 'single'
  const canReserveText = containerWidth - imageWidth - gap >= minTextWidth

  if (
    layoutMode === 'single' &&
    canReserveText &&
    resolvedTextSide === 'right'
  ) {
    imageX = Math.min(imageX, containerWidth - imageWidth - gap - minTextWidth)
  } else if (
    layoutMode === 'single' &&
    canReserveText &&
    resolvedTextSide === 'left'
  ) {
    imageX = Math.max(imageX, gap + minTextWidth)
  }
  imageX = clamp(imageX, 0, maxImageX)
  leftTextWidth = Math.max(0, imageX - gap)
  rightTextWidth = Math.max(0, containerWidth - imageX - imageWidth - gap)

  const textIntervals: InlineFloatTextInterval[] =
    layoutMode === 'dual'
      ? [
          {side: 'left', start: 0, width: leftTextWidth},
          {
            side: 'right',
            start: imageX + imageWidth + gap,
            width: rightTextWidth,
          },
        ]
      : resolvedTextSide === 'right'
        ? [
            {
              side: 'right',
              start: imageX + imageWidth + gap,
              width: rightTextWidth,
            },
          ]
        : [{side: 'left', start: 0, width: leftTextWidth}]

  const exclusionWidth =
    resolvedTextSide === 'right'
      ? clamp(imageX + imageWidth + gap, 0, containerWidth)
      : clamp(containerWidth - imageX + gap, 0, containerWidth)
  const shellStart =
    resolvedTextSide === 'right' ? 0 : containerWidth - exclusionWidth

  return {
    containerWidth,
    layoutMode,
    resolvedTextSide,
    floatDirection: resolvedTextSide === 'right' ? 'left' : 'right',
    imageX,
    normalizedX: containerWidth > 0 ? imageX / containerWidth : 0,
    imageWidth,
    imageHeight,
    exclusionWidth,
    exclusionHeight: imageHeight + gap,
    frameLeft: imageX - shellStart,
    leftTextWidth,
    rightTextWidth,
    textIntervals,
    availableTextWidth:
      layoutMode === 'dual'
        ? leftTextWidth + rightTextWidth
        : resolvedTextSide === 'right'
          ? rightTextWidth
          : leftTextWidth,
  }
}

const datasetNumber = (
  shell: HTMLElement,
  key: string,
  fallback: number,
): number => {
  const parsed = Number(shell.dataset[key])
  return Number.isFinite(parsed) ? parsed : fallback
}

export function readInlineImageFloatInput(
  shell: HTMLElement,
  containerWidth: number,
): InlineFloatGeometryInput {
  return {
    containerWidth,
    imageWidth: datasetNumber(
      shell,
      shell.dataset['bcInlineFloatWidth'] !== undefined
        ? 'bcInlineFloatWidth'
        : 'bcInlineImageWidth',
      DEFAULT_INLINE_IMAGE_WIDTH,
    ),
    imageHeight: datasetNumber(
      shell,
      shell.dataset['bcInlineFloatHeight'] !== undefined
        ? 'bcInlineFloatHeight'
        : 'bcInlineImageHeight',
      DEFAULT_INLINE_IMAGE_HEIGHT,
    ),
    x: datasetNumber(
      shell,
      shell.dataset['bcInlineFloatX'] !== undefined
        ? 'bcInlineFloatX'
        : 'bcInlineImageWrapX',
      0,
    ),
    side: normalizeSide(
      shell.dataset['bcInlineFloatSide'] ??
      shell.dataset['bcInlineImageWrapSide'],
    ),
    gap: datasetNumber(
      shell,
      shell.dataset['bcInlineFloatGap'] !== undefined
        ? 'bcInlineFloatGap'
        : 'bcInlineImageWrapGap',
      DEFAULT_INLINE_IMAGE_WRAP_GAP,
    ),
  }
}

export function applyInlineImageFloatLayout(
  shell: HTMLElement,
  input: InlineFloatGeometryInput,
): InlineFloatGeometry {
  const geometry = resolveInlineFloatGeometry(input)
  const frame = inlineFloatFrame(shell)

  shell.removeAttribute(INLINE_FLOAT_LOGICAL_ANCHOR_ATTRIBUTE)
  shell.dataset['bcInlineImageResolvedTextSide'] = geometry.resolvedTextSide
  shell.style.setProperty('--bc-inline-image-x', `${geometry.imageX}px`)
  shell.style.setProperty('--bc-inline-image-width', `${geometry.imageWidth}px`)
  shell.style.setProperty(
    '--bc-inline-image-height',
    `${geometry.imageHeight}px`,
  )
  shell.style.setProperty(
    '--bc-inline-image-exclusion-width',
    `${geometry.exclusionWidth}px`,
  )
  shell.style.setProperty(
    '--bc-inline-image-exclusion-height',
    `${geometry.exclusionHeight}px`,
  )
  shell.style.cssFloat =
    geometry.containerWidth > 0 ? geometry.floatDirection : 'none'
  shell.style.width = `${geometry.exclusionWidth}px`
  shell.style.height = `${geometry.exclusionHeight}px`
  shell.style.removeProperty('aspect-ratio')

  if (frame) {
    frame.style.removeProperty('visibility')
    frame.style.left = `${geometry.frameLeft}px`
    frame.style.width = `${geometry.imageWidth}px`
    frame.style.height = `${geometry.imageHeight}px`
    frame.style.aspectRatio = `${geometry.imageWidth} / ${geometry.imageHeight}`
  }
  return geometry
}

function clearInlineImageFloatLayout(shell: HTMLElement): void {
  shell.removeAttribute(INLINE_FLOAT_LOGICAL_ANCHOR_ATTRIBUTE)
  delete shell.dataset['bcInlineImageResolvedTextSide']
  for (const property of [
    'float',
    'width',
    'height',
    'position',
    'display',
    'overflow',
    'aspect-ratio',
    '--bc-inline-image-x',
    '--bc-inline-image-width',
    '--bc-inline-image-height',
    '--bc-inline-image-exclusion-width',
    '--bc-inline-image-exclusion-height',
  ]) {
    shell.style.removeProperty(property)
  }
  const frame = inlineFloatFrame(shell)
  if (!frame) return
  for (const property of [
    'left',
    'top',
    'height',
    'position',
    'visibility',
    'z-index',
  ]) {
    frame.style.removeProperty(property)
  }
}

function prepareInlineImageLogicalAnchor(
  shell: HTMLElement,
  geometry: InlineFloatGeometry,
): void {
  clearInlineImageFloatLayout(shell)
  shell.setAttribute(INLINE_FLOAT_LOGICAL_ANCHOR_ATTRIBUTE, '')
  shell.style.cssFloat = 'none'
  shell.style.width = '0px'
  shell.style.height = '0px'
  const frame = inlineFloatFrame(shell)
  if (!frame) return
  frame.style.position = 'absolute'
  frame.style.left = `${geometry.imageX}px`
  frame.style.top = '0'
  frame.style.width = `${geometry.imageWidth}px`
  frame.style.height = `${geometry.imageHeight}px`
  frame.style.visibility = 'hidden'
}

export class InlineFloatLayoutController {
  private _resizeObserver?: ResizeObserver
  private _scheduledFrame?: number
  private _lastObservedWidth?: number
  private _destroyed = false
  private _freezeCount = 0
  private _dirtyWhileFrozen = false
  private _notifyPaginationReadyAfterRefresh = false
  private readonly _paginationReadyListeners = new Set<() => void>()
  private readonly _projection?: InlineFragmentProjection
  private readonly _measurer?: InlineRangeMeasurer
  private _activePlans: InlineDualFragmentPlan[] = []
  private _paginationGaps: InlinePaginationGap[] = []

  constructor(
    readonly container: HTMLElement,
    private readonly _scroll?: ScrollBlot,
    private readonly _selectionProjection?: {
      beginProjection?: () => () => void
    },
  ) {
    if (_scroll) {
      this._projection = new InlineFragmentProjection(_scroll)
      this._measurer = new InlineRangeMeasurer(
        container,
        _scroll,
        (start, end) => {
          const range = document.createRange()
          const startPoint = this._modelPoint(start)
          const endPoint = this._modelPoint(end)
          range.setStart(startPoint.node, startPoint.offset)
          range.setEnd(endPoint.node, endPoint.offset)
          return range
        },
      )
    }
  }

  sync(): void {
    if (this._destroyed) return
    const shells = this._shells()
    const hasFloats = shells.length > 0
    this.container.toggleAttribute(INLINE_FLOAT_OWNER_ATTRIBUTE, hasFloats)

    if (!hasFloats) {
      this._activePlans = []
      this._paginationGaps = []
      this._revokeProjection()
      this._disconnectObserver()
      this._notifyPaginationReadyAfterRefresh = false
      this._notifyPaginationReady()
      return
    }
    this._ensureObserver()
    if (this._freezeCount > 0) {
      this._dirtyWhileFrozen = true
      return
    }
    // Mounted layout measurement may flush browser style/layout. Coalesce it
    // into the next pre-paint frame instead of doing that work in the Yjs
    // render/applyDelta call stack. Detached runtimes retain synchronous
    // behavior so model-only/test hosts do not depend on a browser frame.
    if (this.container.isConnected) this._scheduleRefresh()
    else this.refresh(shells)
  }

  refresh(shells = this._shells()): void {
    if (this._destroyed || !shells.length) return
    if (this._freezeCount > 0) {
      this._dirtyWhileFrozen = true
      return
    }
    if (!this._scroll || !this._projection || !this._measurer) {
      this._refreshSingleSide(shells)
      return
    }
    this._layoutFragments(shells)
  }

  /** Restore canonical direct-Blot DOM before an incremental Delta patch. */
  beforeMutation(selectionAlreadyGuarded = false): void {
    if (this._destroyed) return
    this._activePlans = []
    this._paginationGaps = []
    if (selectionAlreadyGuarded) this._projection?.revoke()
    else this._revokeProjection()
  }

  get hasFloatOwner(): boolean {
    return this.container.hasAttribute(INLINE_FLOAT_OWNER_ATTRIBUTE)
  }

  get hasPaginationGaps(): boolean {
    return this._paginationGaps.length > 0
  }

  get hasProjection(): boolean {
    return this._projection?.active ?? false
  }

  get paginationProjectionWritable(): boolean {
    return this._destroyed
      || !this.hasFloatOwner
      || (
        this._freezeCount === 0
        && !this._dirtyWhileFrozen
        && !this._notifyPaginationReadyAfterRefresh
      )
  }

  /** Notify pagination once a pointer/IME layout lease is fully released. */
  whenPaginationProjectionWritable(listener: () => void): () => void {
    if (this.paginationProjectionWritable) {
      let active = true
      queueMicrotask(() => {
        if (active) listener()
      })
      return () => { active = false }
    }
    this._paginationReadyListeners.add(listener)
    return () => this._paginationReadyListeners.delete(listener)
  }

  /**
   * A wrapped object and the visual rows that surround it form one atomic
   * inline band. Pagination may cut immediately before or after that band, but
   * never through its model interval or painted vertical extent.
   */
  paginationBoundaryGuard(): (offset: number, lineTop: number) => boolean {
    if (!this.hasFloatOwner) return () => true
    const modelBands = this._activePlans.map(plan => ({
      start: plan.startOffset,
      end: plan.endOffset,
    }))
    const containerTop = this.container.getBoundingClientRect().top
    const visualBands = measureInlineFloatPaginationBands(
      this.container,
      containerTop,
    )

    return (offset, lineTop) =>
      modelBands.every(band => offset <= band.start || offset >= band.end)
      && visualBands.every(band =>
        lineTop <= band.top + 0.75 || lineTop >= band.bottom - 0.75,
      )
  }

  /** Apply page gaps through the same projection that owns dual-side rows. */
  applyPaginationGaps(gaps: readonly InlinePaginationGap[]): boolean {
    if (
      this._destroyed
      || !this.hasFloatOwner
      || !this._projection
      || !this.paginationProjectionWritable
    ) {
      return false
    }
    const previous = this._paginationGaps.map(gap => ({...gap}))
    const next = gaps.map(gap => ({...gap}))
    if (
      this._projection.active
      && samePaginationGaps(previous, next)
    ) {
      return true
    }
    const applied = this._projection.apply(this._activePlans, next)
    if (!applied) {
      if (!this._projection.apply(this._activePlans, previous)) {
        this._activePlans = []
        this._paginationGaps = []
        this._scheduleRefresh()
      }
      return false
    }
    this._paginationGaps = next
    return true
  }

  /** Rebuild the natural wrapped projection synchronously before measurement. */
  clearPaginationGaps(): void {
    if (!this._paginationGaps.length || !this._projection) return
    this._paginationGaps = []
    if (this._freezeCount > 0) {
      this._projection.clearPaginationLayerInPlace()
      this._dirtyWhileFrozen = true
      return
    }
    if (!this._projection.apply(this._activePlans)) {
      this._activePlans = []
      this._scheduleRefresh()
    }
  }

  /**
   * Freeze fragment boundaries for IME or pointer drag. The returned release
   * function is idempotent and schedules one deferred refresh.
   */
  acquireFreeze(): () => void {
    if (this._destroyed) return () => undefined
    this._freezeCount++
    let released = false
    return () => {
      if (released) return
      released = true
      this._freezeCount = Math.max(0, this._freezeCount - 1)
      if (this._freezeCount !== 0) return
      if (this._dirtyWhileFrozen) {
        this._dirtyWhileFrozen = false
        this._notifyPaginationReadyAfterRefresh = true
        this._scheduleRefresh()
      } else if (this._scheduledFrame !== undefined) {
        this._notifyPaginationReadyAfterRefresh = true
      } else {
        this._notifyPaginationReady()
      }
    }
  }

  private _refreshSingleSide(shells: HTMLElement[]): void {
    const width =
      this.container.clientWidth || this.container.getBoundingClientRect().width
    for (const shell of shells) {
      if (shell.hasAttribute(INLINE_FLOAT_PREVIEW_ATTRIBUTE)) continue
      applyInlineImageFloatLayout(
        shell,
        readInlineImageFloatInput(shell, width),
      )
    }
  }

  private _layoutFragments(shells: HTMLElement[]): void {
    const releaseSelectionGuard = this._selectionProjection?.beginProjection?.()
    try {
      this._projection!.revoke()
      for (const shell of shells) clearInlineImageFloatLayout(shell)

      const width =
        this.container.clientWidth ||
        this.container.getBoundingClientRect().width
      if (width <= 0) return
      this._measurer!.beginLayoutPass()

      const anchors = this._scroll!.leaves.filter(
        (leaf): leaf is EmbedBlot =>
          leaf instanceof EmbedBlot &&
          leaf.embedElement.matches(
            INLINE_FLOAT_SELECTOR,
          ),
      )
        .map(anchor => ({
          anchor,
          shell: anchor.embedElement,
          offset: this._scroll!.offsetOf(anchor),
        }))
        .sort((a, b) => a.offset - b.offset)

      const candidates = anchors.map(item => ({
        ...item,
        geometry: resolveInlineFloatGeometry(
          readInlineImageFloatInput(item.shell, width),
        ),
      }))
      for (const candidate of candidates) {
        if (candidate.geometry.layoutMode === 'single') {
          applyInlineImageFloatLayout(
            candidate.shell,
            readInlineImageFloatInput(candidate.shell, width),
          )
        } else {
          prepareInlineImageLogicalAnchor(candidate.shell, candidate.geometry)
        }
      }

      const plans: InlineDualFragmentPlan[] = []
      let previousEnd = 0
      const lineHeight = this._measurer!.lineHeight()
      for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index]
        if (candidate.geometry.layoutMode !== 'dual') continue
        const nextAnchor = candidates
          .slice(index + 1)
          .find(next => next.offset > candidate.offset)
        const endOffset = Math.max(
          candidate.offset + candidate.anchor.length,
          nextAnchor?.offset ?? this._scroll!.textLength,
        )
        const lineStart = Math.max(
          previousEnd,
          this._measurer!.findLineStart(candidate.offset, previousEnd),
        )
        const plan = buildInlineFragmentPlan({
          anchor: candidate.anchor,
          anchorOffset: candidate.offset,
          lineStart,
          endOffset,
          lineHeight,
          geometry: candidate.geometry,
          fitFragment: (start, end, intervalWidth, measureAdvance) =>
            this._measurer!.fitFragment(
              start,
              end,
              intervalWidth,
              measureAdvance,
            ),
          nextOffset: (offset, end) => this._measurer!.nextOffset(offset, end),
        })
        if (!plan) {
          clearInlineImageFloatLayout(candidate.shell)
          applyInlineImageFloatLayout(
            candidate.shell,
            readInlineImageFloatInput(candidate.shell, width),
          )
          continue
        }
        plans.push(plan)
        previousEnd = plan.endOffset
      }

      if (!this._projection!.apply(plans, this._paginationGaps)) {
        this._activePlans = []
        this._paginationGaps = []
        for (const candidate of candidates) {
          clearInlineImageFloatLayout(candidate.shell)
          applyInlineImageFloatLayout(
            candidate.shell,
            readInlineImageFloatInput(candidate.shell, width),
          )
        }
      } else {
        this._activePlans = plans
      }
    } catch {
      this._projection!.revoke()
      this._activePlans = []
      this._paginationGaps = []
      const width =
        this.container.clientWidth ||
        this.container.getBoundingClientRect().width
      for (const shell of shells) {
        if (shell.hasAttribute(INLINE_FLOAT_PREVIEW_ATTRIBUTE)) continue
        clearInlineImageFloatLayout(shell)
        applyInlineImageFloatLayout(
          shell,
          readInlineImageFloatInput(shell, width),
        )
      }
    } finally {
      this._measurer?.endLayoutPass()
      releaseSelectionGuard?.()
    }
  }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._freezeCount = 0
    this._notifyPaginationReady()
    this._activePlans = []
    this._paginationGaps = []
    this._notifyPaginationReadyAfterRefresh = false
    this._paginationReadyListeners.clear()
    this._revokeProjection()
    for (const shell of this._shells()) clearInlineImageFloatLayout(shell)
    this.container.removeAttribute(INLINE_FLOAT_OWNER_ATTRIBUTE)
    this._disconnectObserver()
  }

  private _shells(): HTMLElement[] {
    return Array.from(
      this.container.querySelectorAll<HTMLElement>(
        INLINE_FLOAT_SELECTOR,
      ),
    )
  }

  private _ensureObserver(): void {
    if (this._resizeObserver || typeof ResizeObserver === 'undefined') {
      return
    }
    this._resizeObserver = new ResizeObserver(entries => {
      const observedWidth = entries.find(
        entry => entry.target === this.container,
      )?.contentRect.width
      if (typeof observedWidth === 'number' && Number.isFinite(observedWidth)) {
        if (
          this._lastObservedWidth !== undefined &&
          Math.abs(this._lastObservedWidth - observedWidth) < 0.5
        ) {
          return
        }
        this._lastObservedWidth = observedWidth
      }
      if (this._scheduledFrame !== undefined) return
      this._scheduleRefresh()
    })
    this._resizeObserver.observe(this.container)
  }

  private _disconnectObserver(): void {
    this._resizeObserver?.disconnect()
    this._resizeObserver = undefined
    this._lastObservedWidth = undefined
    if (
      this._scheduledFrame !== undefined &&
      typeof cancelAnimationFrame !== 'undefined'
    ) {
      cancelAnimationFrame(this._scheduledFrame)
    }
    this._scheduledFrame = undefined
  }

  private _scheduleRefresh(): void {
    if (this._destroyed || this._scheduledFrame !== undefined) return
    if (typeof requestAnimationFrame === 'undefined') {
      try {
        this.refresh()
      } finally {
        this._notifyPaginationAfterRefresh()
      }
      return
    }
    this._scheduledFrame = requestAnimationFrame(() => {
      try {
        this.refresh()
      } finally {
        this._scheduledFrame = undefined
        this._notifyPaginationAfterRefresh()
      }
    })
  }

  private _notifyPaginationAfterRefresh(): void {
    this._notifyPaginationReadyAfterRefresh = false
    this._notifyPaginationReady()
  }

  private _notifyPaginationReady(): void {
    if (
      !this.paginationProjectionWritable
      || !this._paginationReadyListeners.size
    ) {
      return
    }
    const listeners = [...this._paginationReadyListeners]
    this._paginationReadyListeners.clear()
    for (const listener of listeners) listener()
  }

  private _revokeProjection(): void {
    if (!this._projection?.active) return
    const releaseSelectionGuard = this._selectionProjection?.beginProjection?.()
    try {
      this._projection.revoke()
    } finally {
      releaseSelectionGuard?.()
    }
  }

  private _modelPoint(index: number): {node: Node; offset: number} {
    if (index <= 0) {
      const leading = this.container.firstElementChild?.firstChild
      return leading
        ? {node: leading, offset: 0}
        : {node: this.container, offset: 0}
    }
    let remaining = index
    for (const leaf of this._scroll!.leaves) {
      if (remaining <= leaf.length) {
        if (leaf instanceof EmbedBlot) {
          if (remaining === 0) {
            return {node: leaf.cElement, offset: 0}
          }
          return {node: leaf.gapNode.firstChild ?? leaf.gapNode, offset: 0}
        }
        return {node: leaf.textNode, offset: remaining}
      }
      remaining -= leaf.length
    }
    const breakNode = this._scroll!.children.find(
      child => child.type === 'break',
    )?.domNode
    return breakNode
      ? {node: breakNode, offset: 0}
      : {node: this.container, offset: this.container.childNodes.length}
  }
}
