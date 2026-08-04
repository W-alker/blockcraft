import {EmbedBlot, ScrollBlot, TextBlot} from '../blot'
import type {InlineFloatGeometry} from './inline-float-layout'

export const INLINE_FRAGMENT_GROUP_ATTRIBUTE = 'data-bc-inline-fragment-group'
export const INLINE_FRAGMENT_ROW_ATTRIBUTE = 'data-bc-inline-fragment-row'
export const INLINE_FRAGMENT_SIDE_ATTRIBUTE = 'data-bc-inline-fragment-side'
export const INLINE_FRAGMENT_ANCHOR_ATTRIBUTE = 'data-bc-inline-fragment-anchor'

export interface InlineFragmentRange {
  start: number
  end: number
}

export interface InlineFragmentFit {
  end: number
  advance: number
}

export interface InlineFragmentRow {
  left: InlineFragmentRange
  right: InlineFragmentRange
  leftAdvance: number
}

export interface InlineDualFragmentPlan {
  anchor: EmbedBlot
  anchorOffset: number
  startOffset: number
  endOffset: number
  lineHeight: number
  geometry: InlineFloatGeometry
  rows: InlineFragmentRow[]
}

export interface InlineFragmentPlanInput {
  anchor: EmbedBlot
  anchorOffset: number
  lineStart: number
  endOffset: number
  lineHeight: number
  geometry: InlineFloatGeometry
  fitFragment: (
    start: number,
    end: number,
    width: number,
    measureAdvance: boolean,
  ) => InlineFragmentFit
  nextOffset: (offset: number, end: number) => number
}

/**
 * Build model-ordered left/right rows for one dual-sided exclusion band.
 * DOM measurement remains outside this pure planner through `fitFragment`.
 *
 * @internal
 */
export function buildInlineFragmentPlan(
  input: InlineFragmentPlanInput,
): InlineDualFragmentPlan | null {
  if (
    input.geometry.layoutMode !== 'dual' ||
    input.lineHeight <= 0 ||
    !Number.isFinite(input.lineHeight)
  ) {
    return null
  }

  const limit = Math.max(
    input.lineStart,
    input.geometry.containerWidth > 0 ? input.endOffset : input.lineStart,
  )
  const minimumEnd = Math.min(limit, input.anchorOffset + input.anchor.length)
  const minimumRows = Math.max(
    1,
    Math.ceil(input.geometry.exclusionHeight / input.lineHeight),
  )
  const rows: InlineFragmentRow[] = []
  let cursor = Math.max(0, input.lineStart)

  // The center exclusion must end with the image. If reduced line capacity
  // cannot reach the logical Embed within these rows, the caller falls back
  // to single-side layout instead of extending an empty center band.
  while (rows.length < minimumRows) {
    const leftFit = input.fitFragment(
      cursor,
      limit,
      input.geometry.leftTextWidth,
      true,
    )
    const leftEnd = ensureProgress(cursor, limit, leftFit.end, input.nextOffset)
    const rightFit = input.fitFragment(
      leftEnd,
      limit,
      input.geometry.rightTextWidth,
      false,
    )
    const rightEnd = ensureProgress(
      leftEnd,
      limit,
      rightFit.end,
      input.nextOffset,
    )
    rows.push({
      left: {start: cursor, end: leftEnd},
      right: {start: leftEnd, end: rightEnd},
      leftAdvance: normalizeAdvance(
        leftFit.advance,
        input.geometry.leftTextWidth,
      ),
    })
    cursor = rightEnd
    if (cursor >= limit && rows.length >= minimumRows) break
  }

  if (cursor < minimumEnd) return null
  return {
    anchor: input.anchor,
    anchorOffset: input.anchorOffset,
    startOffset: input.lineStart,
    endOffset: cursor,
    lineHeight: input.lineHeight,
    geometry: input.geometry,
    rows,
  }
}

function normalizeAdvance(value: number, availableWidth: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(Math.max(0, availableWidth), value)
}

function ensureProgress(
  start: number,
  limit: number,
  measuredEnd: number,
  nextOffset: (offset: number, end: number) => number,
): number {
  const safeEnd = Math.max(start, Math.min(limit, measuredEnd))
  if (safeEnd > start || start >= limit) return safeEnd
  return Math.max(start, Math.min(limit, nextOffset(start, limit)))
}

/**
 * Return UTF-16 offsets at grapheme boundaries. The fallback protects the
 * clusters most likely to be corrupted by a layout split (surrogate pairs,
 * combining marks, variation selectors, emoji modifiers and ZWJ chains).
 *
 * @internal
 */
export function graphemeBoundaries(text: string): number[] {
  const boundaries = [0]
  const Segmenter = (
    Intl as typeof Intl & {
      Segmenter?: new (...args: any[]) => {
        segment(value: string): Iterable<{index: number; segment: string}>
      }
    }
  ).Segmenter
  if (Segmenter) {
    const segmenter = new Segmenter(undefined, {granularity: 'grapheme'})
    for (const part of segmenter.segment(text)) {
      const end = part.index + part.segment.length
      if (end > boundaries[boundaries.length - 1]) boundaries.push(end)
    }
    if (boundaries[boundaries.length - 1] !== text.length) {
      boundaries.push(text.length)
    }
    return boundaries
  }

  let offset = 0
  while (offset < text.length) {
    offset += codePointLengthAt(text, offset)
    while (offset < text.length) {
      const cp = text.codePointAt(offset)!
      if (isClusterExtension(cp)) {
        offset += codePointLengthAt(text, offset)
        continue
      }
      if (cp === 0x200d) {
        offset += 1
        if (offset < text.length) offset += codePointLengthAt(text, offset)
        continue
      }
      break
    }
    boundaries.push(offset)
  }
  return boundaries
}

function codePointLengthAt(text: string, offset: number): number {
  return (text.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1
}

function isClusterExtension(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
    (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  )
}

interface MeasurementPoint {
  node: Node
  offset: number
}

interface MeasurementContent {
  root: HTMLElement
  offsets: number[]
  points: Map<number, MeasurementPoint>
}

interface MeasurementLeafEntry {
  blot: TextBlot | EmbedBlot
  start: number
  end: number
}

const INITIAL_FIT_CANDIDATE_CAP = 64
const MAX_FIT_CANDIDATE_CAP = 1024

/**
 * Browser-backed fragment fitter. Clones are used only inside a hidden,
 * non-editable measurement box; visible glyphs always remain real Blot DOM.
 *
 * @internal
 */
export class InlineRangeMeasurer {
  private _leafEntries?: MeasurementLeafEntry[]

  constructor(
    private readonly _container: HTMLElement,
    private readonly _scroll: ScrollBlot,
    private readonly _createRange: (start: number, end: number) => Range,
  ) {}

  beginLayoutPass(): void {
    this._leafEntries = this._buildLeafEntries()
  }

  endLayoutPass(): void {
    this._leafEntries = undefined
  }

  lineHeight(): number {
    const style = getComputedStyle(this._container)
    const parsed = Number.parseFloat(style.lineHeight)
    if (Number.isFinite(parsed) && parsed > 0) return parsed

    for (const leaf of this._scroll.leaves) {
      if (!(leaf instanceof TextBlot) || !leaf.length) continue
      const range = document.createRange()
      range.setStart(leaf.textNode, 0)
      range.setEnd(leaf.textNode, Math.min(1, leaf.length))
      const height = range.getBoundingClientRect().height
      if (Number.isFinite(height) && height > 0) return height
    }
    const fontSize = Number.parseFloat(style.fontSize)
    return Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.4 : 20
  }

  safeOffsets(start: number, end: number, cap = 1024): number[] {
    const result = new Set<number>([start])
    let capped = false
    for (const {blot: leaf, start: leafStart, end: leafEnd} of
      this._entries()) {
      if (leafEnd <= start || leafStart >= end) continue
      if (leaf instanceof TextBlot) {
        const from = Math.max(start, leafStart)
        const to = Math.min(end, leafEnd)
        const localFrom = from - leafStart
        const remainingBudget = Math.max(1, cap - result.size)
        const localBudget = Math.min(
          to - from,
          Math.max(256, remainingBudget * 8),
        )
        const lookahead = Math.min(to - from, localBudget + 256)
        const text = leaf.text.slice(localFrom, localFrom + lookahead)
        for (const boundary of graphemeBoundaries(text)) {
          if (boundary > localBudget) {
            capped = true
            break
          }
          result.add(from + boundary)
          if (result.size >= cap) {
            capped = true
            break
          }
        }
      } else {
        result.add(Math.max(start, leafStart))
        result.add(Math.min(end, leafEnd))
      }
      if (result.size >= cap || capped) break
    }
    if (!capped) result.add(end)
    return [...result]
      .filter(offset => offset >= start && offset <= end)
      .sort((a, b) => a - b)
  }

  /**
   * Return a bounded safe-offset window ending at `end`.
   *
   * `safeOffsets()` intentionally keeps the first candidates for forward
   * fitting. Anchor-line lookup needs the opposite edge: the candidates
   * nearest the image anchor. The scanned UTF-16 window is already bounded by
   * the caller, so collecting it once and slicing the tail remains O(window).
   *
   * @internal
   */
  safeOffsetsEndingAt(start: number, end: number, cap = 1024): number[] {
    const safeCap = Math.max(1, Math.floor(cap))
    const scanCap = Math.max(safeCap, Math.ceil(Math.max(0, end - start)) + 2)
    const offsets = this.safeOffsets(start, end, scanCap)
    return offsets.length <= safeCap
      ? offsets
      : offsets.slice(offsets.length - safeCap)
  }

  nextOffset(start: number, end: number): number {
    const nearby = this.safeOffsets(start, end, 3).find(
      offset => offset > start,
    )
    if (nearby !== undefined) return nearby
    const info = this._scroll.findByOffset(start)
    if (!info) return end
    if (info.blot instanceof EmbedBlot) {
      return Math.min(end, start + 1)
    }
    const remainder = info.blot.text.slice(info.localOffset)
    const nextBoundary = graphemeBoundaries(remainder).find(
      offset => offset > 0,
    )
    return Math.min(end, start + (nextBoundary ?? remainder.length))
  }

  fitFragment(
    start: number,
    end: number,
    width: number,
    measureAdvance = true,
  ): InlineFragmentFit {
    if (start >= end || width <= 0 || !this._container.isConnected) {
      return {end: start, advance: 0}
    }
    let candidateCap = INITIAL_FIT_CANDIDATE_CAP
    while (true) {
      const content = this._createMeasurementContent(
        start,
        end,
        width,
        candidateCap,
      )
      try {
        if (content.offsets.length <= 1) return {end: start, advance: 0}
        let low = 0
        let high = content.offsets.length - 1
        while (low < high) {
          const mid = Math.ceil((low + high) / 2)
          if (this._fitsFirstLine(content, content.offsets[mid], width)) {
            low = mid
          } else {
            high = mid - 1
          }
        }
        const fittedEnd = content.offsets[low]
        const measuredEnd = content.offsets[content.offsets.length - 1]
        if (
          low === content.offsets.length - 1 &&
          measuredEnd < end &&
          candidateCap < MAX_FIT_CANDIDATE_CAP
        ) {
          candidateCap = Math.min(
            MAX_FIT_CANDIDATE_CAP,
            candidateCap * 2,
          )
          continue
        }
        return {
          end: fittedEnd,
          advance: measureAdvance
            ? this._firstLineAdvance(content, fittedEnd)
            : 0,
        }
      } finally {
        content.root.remove()
      }
    }
  }

  findLineStart(anchorOffset: number, minimumOffset = 0): number {
    if (anchorOffset <= minimumOffset || !this._container.isConnected) {
      return minimumOffset
    }
    const measurementStart = this._safeOffsetAtOrBefore(
      Math.max(minimumOffset, anchorOffset - 2048),
      minimumOffset,
    )
    const offsets = this.safeOffsetsEndingAt(
      measurementStart,
      Math.min(anchorOffset, this._scroll.textLength),
      513,
    )
    if (offsets.length < 2) return measurementStart

    let targetTop: number | undefined
    let lineStart = offsets[offsets.length - 2]
    for (let i = offsets.length - 2; i >= 0; i--) {
      const rect = this._firstUsefulRect(offsets[i], offsets[i + 1])
      if (!rect) continue
      if (targetTop === undefined) {
        targetTop = rect.top
        lineStart = offsets[i]
        continue
      }
      if (Math.abs(rect.top - targetTop) > 0.75) break
      lineStart = offsets[i]
    }
    return lineStart
  }

  private _firstUsefulRect(start: number, end: number): DOMRect | undefined {
    try {
      return Array.from(this._createRange(start, end).getClientRects()).find(
        rect => rect.width > 0.01 || rect.height > 0.01,
      )
    } catch {
      return undefined
    }
  }

  private _safeOffsetAtOrBefore(offset: number, minimum: number): number {
    const info = this._scroll.findByOffset(offset)
    if (
      !info ||
      !(info.blot instanceof TextBlot) ||
      info.localOffset <= 0 ||
      info.localOffset >= info.blot.length
    ) {
      return offset
    }
    const leafStart = this._scroll.offsetOf(info.blot)
    const localWindowStart = Math.max(0, info.localOffset - 256)
    const windowText = info.blot.text.slice(
      localWindowStart,
      Math.min(info.blot.length, info.localOffset + 256),
    )
    const boundary = graphemeBoundaries(windowText)
      .filter(
        value => value > 0 && value <= info.localOffset - localWindowStart,
      )
      .pop()
    if (boundary !== undefined) {
      return Math.max(minimum, leafStart + localWindowStart + boundary)
    }
    return Math.max(minimum, leafStart)
  }

  private _createMeasurementContent(
    start: number,
    end: number,
    width: number,
    candidateCap = MAX_FIT_CANDIDATE_CAP,
  ): MeasurementContent {
    const root = document.createElement('span')
    const style = getComputedStyle(this._container)
    root.className = this._container.className
    root.classList.add('edit-container')
    root.dataset['bcInlineFragmentMeasure'] = 'true'
    root.setAttribute('contenteditable', 'false')
    root.style.position = 'fixed'
    root.style.left = '-100000px'
    root.style.top = '0'
    root.style.display = 'block'
    root.style.visibility = 'hidden'
    root.style.pointerEvents = 'none'
    root.style.contain = 'layout style paint'
    root.style.width = `${width}px`
    root.style.maxWidth = `${width}px`
    root.style.font = style.font
    root.style.fontKerning = style.fontKerning
    root.style.fontFeatureSettings = style.fontFeatureSettings
    root.style.fontVariationSettings = style.fontVariationSettings
    root.style.letterSpacing = style.letterSpacing
    root.style.wordSpacing = style.wordSpacing
    root.style.lineHeight = style.lineHeight
    root.style.whiteSpace = style.whiteSpace || 'break-spaces'
    root.style.wordBreak = style.wordBreak || 'break-all'
    root.style.direction = style.direction

    const points = new Map<number, MeasurementPoint>()
    const offsets = this.safeOffsets(start, end, candidateCap)
    const measurementEnd = offsets[offsets.length - 1] ?? start
    for (const {blot: leaf, start: leafStart, end: leafEnd} of
      this._entries()) {
      if (leafEnd <= start || leafStart >= measurementEnd) continue
      const from = Math.max(start, leafStart)
      const to = Math.min(measurementEnd, leafEnd)
      points.set(from, {node: root, offset: root.childNodes.length})

      if (leaf instanceof TextBlot) {
        const clone = leaf.cElement.cloneNode(true) as HTMLElement
        const textNode = clone.firstElementChild?.firstChild as Text | null
        if (!textNode) continue
        const localFrom = from - leafStart
        textNode.textContent = leaf.text.slice(localFrom, to - leafStart)
        root.appendChild(clone)
        for (
          let index = lowerBound(offsets, from);
          index < offsets.length && offsets[index] <= to;
          index++
        ) {
          const offset = offsets[index]
          points.set(offset, {
            node: textNode,
            offset: offset - from,
          })
        }
      } else {
        const clone = leaf.cElement.cloneNode(true) as HTMLElement
        for (const frame of Array.from(
          clone.querySelectorAll(
            '[data-bc-inline-float-frame], .bc-inline-image-frame',
          ),
        )) {
          frame.remove()
        }
        clone.style.display = 'inline-block'
        clone.style.width = '0'
        clone.style.height = '0'
        root.appendChild(clone)
        points.set(to, {node: root, offset: root.childNodes.length})
      }
    }
    points.set(
      measurementEnd,
      points.get(measurementEnd) ?? {
        node: root,
        offset: root.childNodes.length,
      },
    )

    const host = this._container.parentElement ?? document.body
    host.appendChild(root)
    return {
      root,
      offsets: offsets.filter(offset => points.has(offset)),
      points,
    }
  }

  private _entries(): MeasurementLeafEntry[] {
    return this._leafEntries ?? this._buildLeafEntries()
  }

  private _buildLeafEntries(): MeasurementLeafEntry[] {
    let start = 0
    return this._scroll.leaves.map(blot => {
      const entry = {blot, start, end: start + blot.length}
      start = entry.end
      return entry
    })
  }

  private _fitsFirstLine(
    content: MeasurementContent,
    end: number,
    width: number,
  ): boolean {
    const point = content.points.get(end)
    if (!point) return false
    const range = document.createRange()
    range.setStart(content.root, 0)
    range.setEnd(point.node, point.offset)
    const rects = Array.from(range.getClientRects()).filter(
      rect => rect.width > 0.01 || rect.height > 0.01,
    )
    if (!rects.length) return true
    const firstTop = rects[0].top
    const rootLeft = content.root.getBoundingClientRect().left
    return rects.every(
      rect =>
        Math.abs(rect.top - firstTop) <= 0.75 &&
        rect.right - rootLeft <= width + 0.75,
    )
  }

  private _firstLineAdvance(content: MeasurementContent, end: number): number {
    const point = content.points.get(end)
    if (!point) return 0
    const range = document.createRange()
    range.setStart(content.root, 0)
    range.setEnd(point.node, point.offset)
    const rects = Array.from(range.getClientRects()).filter(
      rect => rect.width > 0.01 || rect.height > 0.01,
    )
    if (!rects.length) return 0
    const firstTop = rects[0].top
    const rootLeft = content.root.getBoundingClientRect().left
    return Math.max(
      0,
      ...rects
        .filter(rect => Math.abs(rect.top - firstTop) <= 0.75)
        .map(rect => rect.right - rootLeft),
    )
  }
}

function lowerBound(values: readonly number[], target: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (values[middle] < target) low = middle + 1
    else high = middle
  }
  return low
}

interface StyleSnapshot {
  element: HTMLElement
  style: string | null
  anchorAttribute: boolean
}

/**
 * Reversible DOM projection for dual-sided rows. It moves real Blot nodes;
 * no visible text clone is created and no model data is changed.
 *
 * @internal
 */
export class InlineFragmentProjection {
  private _splits: Array<readonly [TextBlot, TextBlot]> = []
  private _groups: HTMLElement[] = []
  private _styleSnapshots: StyleSnapshot[] = []

  constructor(private readonly _scroll: ScrollBlot) {}

  get active(): boolean {
    return this._groups.length > 0
  }

  apply(plans: readonly InlineDualFragmentPlan[]): boolean {
    this.revoke()
    if (!plans.length) return true

    try {
      const boundaries = new Set<number>()
      for (const plan of plans) {
        boundaries.add(plan.startOffset)
        boundaries.add(plan.endOffset)
        for (const row of plan.rows) {
          boundaries.add(row.left.start)
          boundaries.add(row.left.end)
          boundaries.add(row.right.start)
          boundaries.add(row.right.end)
        }
      }
      for (const boundary of [...boundaries].sort((a, b) => a - b)) {
        const split = this._scroll.splitTextForLayout(boundary)
        if (split) this._splits.push(split)
      }

      for (const plan of plans) this._applyPlan(plan)
      return true
    } catch {
      this.revoke()
      return false
    }
  }

  revoke(): void {
    if (
      !this._groups.length &&
      !this._splits.length &&
      !this._styleSnapshots.length
    ) {
      return
    }

    this._scroll.restoreCanonicalDomOrder()
    for (const group of this._groups) group.remove()
    this._groups = []

    for (let i = this._styleSnapshots.length - 1; i >= 0; i--) {
      const snapshot = this._styleSnapshots[i]
      if (snapshot.style == null) snapshot.element.removeAttribute('style')
      else snapshot.element.setAttribute('style', snapshot.style)
      snapshot.element.toggleAttribute(
        INLINE_FRAGMENT_ANCHOR_ATTRIBUTE,
        snapshot.anchorAttribute,
      )
    }
    this._styleSnapshots = []

    for (let i = this._splits.length - 1; i >= 0; i--) {
      this._scroll.mergeLayoutTextSplit(this._splits[i])
    }
    this._splits = []
  }

  private _applyPlan(plan: InlineDualFragmentPlan): void {
    const leaves = this._scroll.leaves
    const entries = leaves.map(blot => ({
      blot,
      start: this._scroll.offsetOf(blot),
    }))
    const first = entries.find(
      entry => entry.start >= plan.startOffset && entry.start < plan.endOffset,
    )
    if (!first) throw new Error('Inline fragment plan has no Blot range')

    const group = document.createElement('span')
    group.setAttribute(INLINE_FRAGMENT_GROUP_ATTRIBUTE, '')
    group.style.display = 'block'
    group.style.position = 'relative'
    group.style.width = '100%'
    group.style.minWidth = '0'
    group.style.minHeight = `${Math.max(
      plan.geometry.exclusionHeight,
      plan.rows.length * plan.lineHeight,
    )}px`
    first.blot.domNode.parentNode!.insertBefore(group, first.blot.domNode)
    this._groups.push(group)

    const moved = new Set<TextBlot | EmbedBlot>()
    for (let rowIndex = 0; rowIndex < plan.rows.length; rowIndex++) {
      const rowPlan = plan.rows[rowIndex]
      const row = document.createElement('span')
      const left = document.createElement('span')
      const right = document.createElement('span')
      row.setAttribute(INLINE_FRAGMENT_ROW_ATTRIBUTE, String(rowIndex))
      left.setAttribute(INLINE_FRAGMENT_SIDE_ATTRIBUTE, 'left')
      right.setAttribute(INLINE_FRAGMENT_SIDE_ATTRIBUTE, 'right')
      row.style.display = 'block'
      row.style.height = `${plan.lineHeight}px`
      row.style.lineHeight = `${plan.lineHeight}px`
      row.style.whiteSpace = 'pre'
      for (const fragment of [left, right]) {
        fragment.style.display = 'inline'
        fragment.style.minWidth = '0'
        fragment.style.whiteSpace = 'pre'
      }
      const rightStart = Math.max(
        0,
        plan.geometry.containerWidth - plan.geometry.rightTextWidth,
      )
      right.style.marginInlineStart = `${Math.max(
        0,
        rightStart - rowPlan.leftAdvance,
      )}px`
      this._moveRange(entries, rowPlan.left, left, moved)
      this._moveRange(entries, rowPlan.right, right, moved)
      row.append(left, right)
      group.appendChild(row)
    }

    this._projectAnchor(plan, group)
  }

  private _moveRange(
    entries: Array<{
      blot: TextBlot | EmbedBlot
      start: number
    }>,
    range: InlineFragmentRange,
    target: HTMLElement,
    moved: Set<TextBlot | EmbedBlot>,
  ): void {
    for (const entry of entries) {
      if (
        entry.start < range.start ||
        entry.start >= range.end ||
        moved.has(entry.blot)
      ) {
        continue
      }
      target.appendChild(entry.blot.domNode)
      moved.add(entry.blot)
    }
  }

  private _projectAnchor(
    plan: InlineDualFragmentPlan,
    group: HTMLElement,
  ): void {
    const shell = plan.anchor.embedElement
    const frame =
      shell.querySelector<HTMLElement>('[data-bc-inline-float-frame]') ??
      shell.querySelector<HTMLElement>('.bc-inline-image-frame')
    const wrapper = shell.parentElement
    const cElement = plan.anchor.cElement
    if (!frame || !wrapper) throw new Error('Inline float frame is missing')

    for (const element of [cElement, wrapper, shell, frame]) {
      this._styleSnapshots.push({
        element,
        style: element.getAttribute('style'),
        anchorAttribute: element.hasAttribute(INLINE_FRAGMENT_ANCHOR_ATTRIBUTE),
      })
    }
    shell.setAttribute(INLINE_FRAGMENT_ANCHOR_ATTRIBUTE, '')
    cElement.style.display = 'inline-block'
    cElement.style.width = '0'
    cElement.style.height = '0'
    cElement.style.overflow = 'visible'
    wrapper.style.display = 'inline-block'
    wrapper.style.width = '0'
    wrapper.style.height = '0'
    wrapper.style.margin = '0'
    shell.style.position = 'static'
    shell.style.cssFloat = 'none'
    shell.style.display = 'inline-block'
    shell.style.width = '0'
    shell.style.height = '0'
    shell.style.overflow = 'visible'
    frame.style.position = 'absolute'
    frame.style.visibility = 'visible'
    frame.style.left = `${plan.geometry.imageX}px`
    frame.style.top = '0'
    frame.style.width = `${plan.geometry.imageWidth}px`
    frame.style.height = `${plan.geometry.imageHeight}px`
    frame.style.aspectRatio = `${plan.geometry.imageWidth} / ${plan.geometry.imageHeight}`
    frame.style.zIndex = '1'
    // Make the containing block explicit even if host theme styles change.
    group.style.position = 'relative'
  }
}
