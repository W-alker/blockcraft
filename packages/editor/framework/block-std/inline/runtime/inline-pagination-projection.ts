import {ScrollBlot, TextBlot} from '../blot'

export const INLINE_PAGINATION_GAP_ATTRIBUTE =
  'data-bc-inline-pagination-gap'

export interface InlinePaginationGap {
  /** Y.Text UTF-16 offset；页缝自身长度恒为 0。 */
  offset: number
  /** 从当前锚点到下一页内容区顶的总视图高度。 */
  height: number
  /** 纸间背景带相对页缝顶的起点。 */
  backdropOffset: number
  /** 屏幕纸间距高度。 */
  backdropHeight: number
}

interface InlinePaginationShiftSnapshot {
  element: HTMLElement
  position: {value: string; priority: string}
  top: {value: string; priority: string}
}

/**
 * 可逆的行内分页 DOM 投影。它只拆分真实 TextBlot 并插入零模型长度节点，
 * revoke 后恢复规范 DOM 顺序并合并所有临时文本段。
 *
 * @internal Pagination view only.
 */
export class InlinePaginationProjection {
  private _splits: Array<readonly [TextBlot, TextBlot]> = []
  private _shiftSnapshots: InlinePaginationShiftSnapshot[] = []
  private _markers: HTMLElement[] = []
  private _signature = ''
  private _containerWidthSnapshot?: {value: string; priority: string}
  private _containerPaddingSnapshot?: {value: string; priority: string}

  constructor(private readonly _scroll: ScrollBlot) {}

  get active(): boolean {
    return this._markers.length > 0
  }

  apply(gaps: readonly InlinePaginationGap[]): boolean {
    const normalized = normalizeInlinePaginationGaps(
      gaps,
      this._scroll.textLength,
    )
    const signature = JSON.stringify(normalized)
    if (signature === this._signature && this._isHealthy(normalized.length)) {
      return true
    }

    this.revoke()
    if (!normalized.length) return true

    try {
      this._freezeContainerWidth()
      for (const offset of [...new Set(normalized.map(gap => gap.offset))]) {
        const split = this._scroll.splitTextForLayout(offset)
        if (split) this._splits.push(split)
      }
      this._applyRelativeFlow(normalized)
      this._signature = signature
      return true
    } catch {
      this.revoke()
      return false
    }
  }

  revoke(): void {
    if (
      !this._markers.length
      && !this._shiftSnapshots.length
      && !this._splits.length
      && !this._signature
      && !this._containerWidthSnapshot
      && !this._containerPaddingSnapshot
      && this._hasCanonicalDomOrder()
    ) {
      return
    }

    this._scroll.restoreCanonicalDomOrder()
    for (const marker of this._markers) marker.remove()
    this._markers = []
    for (let index = this._shiftSnapshots.length - 1; index >= 0; index--) {
      const snapshot = this._shiftSnapshots[index]
      this._restoreStyleProperty(snapshot.element, 'position', snapshot.position)
      this._restoreStyleProperty(snapshot.element, 'top', snapshot.top)
    }
    this._shiftSnapshots = []
    for (let index = this._splits.length - 1; index >= 0; index--) {
      this._scroll.mergeLayoutTextSplit(this._splits[index])
    }
    this._splits = []
    this._signature = ''
    this._restoreContainerPadding()
    this._restoreContainerWidth()
  }

  /**
   * `width: fit-content` 的列表正文会在文本被拆成左右两段后重新计算内在宽度；
   * 宽度一旦变窄，切点前的文字会二次换行，而分页遮罩仍停留在自然布局的旧行顶。
   * 投影存续期间固定自然 content-box 宽度，只稳定排版，不改变模型与分页 offset。
   */
  private _freezeContainerWidth(): void {
    const container = this._scroll.domNode
    const width = container.clientWidth
      || container.getBoundingClientRect().width
    if (!Number.isFinite(width) || width <= 0) return

    this._containerWidthSnapshot = {
      value: container.style.getPropertyValue('width'),
      priority: container.style.getPropertyPriority('width'),
    }
    container.style.setProperty('width', `${width}px`)
  }

  private _restoreContainerWidth(): void {
    const snapshot = this._containerWidthSnapshot
    if (!snapshot) return
    this._containerWidthSnapshot = undefined
    if (snapshot.value) {
      this._scroll.domNode.style.setProperty(
        'width',
        snapshot.value,
        snapshot.priority,
      )
    } else {
      this._scroll.domNode.style.removeProperty('width')
    }
  }

  /**
   * Move only the painted continuation fragments. The hidden marker cannot
   * participate in inline formatting; bottom padding contributes the same
   * total height to the row.
   */
  private _applyRelativeFlow(gaps: readonly InlinePaginationGap[]): void {
    const container = this._scroll.domNode
    const leaves = this._scroll.leaves
    const anchors = new Map<number, Node | null>()
    const breakNode = this._scroll.children.find(
      child => child.type === 'break',
    )?.domNode ?? null
    let leafIndex = 0
    let leafOffset = 0
    let cumulativeShift = 0
    let gapIndex = 0
    for (const target of [...new Set(gaps.map(gap => gap.offset))]) {
      while (leafIndex < leaves.length && leafOffset < target) {
        leafOffset += leaves[leafIndex].length
        leafIndex++
      }
      if (leafOffset !== target) {
        throw new Error(`Inline pagination offset ${target} is not projectable`)
      }
      anchors.set(target, leaves[leafIndex]?.domNode ?? breakNode)
    }

    for (const leaf of leaves) {
      const start = this._scroll.offsetOf(leaf)
      while (gapIndex < gaps.length && gaps[gapIndex].offset <= start) {
        cumulativeShift += gaps[gapIndex].height
        gapIndex++
      }
      if (cumulativeShift <= 0) continue
      const element = leaf.domNode as HTMLElement
      this._shiftSnapshots.push({
        element,
        position: this._snapshotStyleProperty(element, 'position'),
        top: this._snapshotStyleProperty(element, 'top'),
      })
      element.style.setProperty('position', 'relative')
      element.style.setProperty('top', `${cumulativeShift}px`)
    }

    const totalGap = gaps.reduce((sum, gap) => sum + gap.height, 0)
    const computedPadding = Number.parseFloat(
      container.ownerDocument.defaultView?.getComputedStyle(container).paddingBottom
        ?? '0',
    )
    this._containerPaddingSnapshot = this._snapshotStyleProperty(
      container,
      'padding-bottom',
    )
    container.style.setProperty(
      'padding-bottom',
      `${Math.max(0, Number.isFinite(computedPadding) ? computedPadding : 0) + totalGap}px`,
    )

    for (const gap of gaps) {
      const marker = buildInlinePaginationGapMarker(gap)
      marker.style.display = 'none'
      container.insertBefore(marker, anchors.get(gap.offset) ?? null)
      this._markers.push(marker)
    }
  }

  private _snapshotStyleProperty(
    element: HTMLElement,
    property: string,
  ): {value: string; priority: string} {
    return {
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    }
  }

  private _restoreStyleProperty(
    element: HTMLElement,
    property: string,
    snapshot: {value: string; priority: string},
  ): void {
    if (snapshot.value) {
      element.style.setProperty(property, snapshot.value, snapshot.priority)
    } else {
      element.style.removeProperty(property)
    }
  }

  private _restoreContainerPadding(): void {
    const snapshot = this._containerPaddingSnapshot
    if (!snapshot) return
    this._containerPaddingSnapshot = undefined
    this._restoreStyleProperty(this._scroll.domNode, 'padding-bottom', snapshot)
  }

  private _isHealthy(expectedMarkerCount: number): boolean {
    return this._markers.length === expectedMarkerCount
      && this._markers.every(marker =>
        marker.isConnected && marker.parentNode === this._scroll.domNode,
      )
      && this._hasCanonicalDomOrder()
  }

  private _hasCanonicalDomOrder(): boolean {
    const expected = this._scroll.children.map(child => child.domNode)
    const owned = new Set<Node>(expected)
    const direct = Array.from(this._scroll.domNode.childNodes)
      .filter(node => owned.has(node))
    return direct.length === expected.length
      && direct.every((node, index) => node === expected[index])
  }

}

/** @internal Shared with the composed inline-float pagination projection. */
export function normalizeInlinePaginationGaps(
  gaps: readonly InlinePaginationGap[],
  textLength: number,
): InlinePaginationGap[] {
  return gaps
    .filter(gap =>
      Number.isInteger(gap.offset)
      && gap.offset >= 0
      && gap.offset <= textLength
      && Number.isFinite(gap.height)
      && gap.height > 0,
    )
    .map(gap => ({
      offset: gap.offset,
      height: gap.height,
      backdropOffset: Math.max(0, Math.min(gap.height, gap.backdropOffset)),
      backdropHeight: Math.max(
        0,
        Math.min(gap.height - Math.max(0, gap.backdropOffset), gap.backdropHeight),
      ),
    }))
    .sort((left, right) => left.offset - right.offset)
}

/** @internal Shared with the composed inline-float pagination projection. */
export function buildInlinePaginationGapMarker(
  gap: InlinePaginationGap,
): HTMLElement {
  const marker = document.createElement('span')
  marker.setAttribute(INLINE_PAGINATION_GAP_ATTRIBUTE, '')
  marker.setAttribute('contenteditable', 'false')
  marker.setAttribute('aria-hidden', 'true')
  marker.style.display = 'block'
  marker.style.height = `${gap.height}px`
  marker.style.margin = '0'
  marker.style.padding = '0'
  marker.style.lineHeight = '0'
  marker.style.pointerEvents = 'none'
  marker.style.userSelect = 'none'
  marker.style.webkitUserSelect = 'none'
  // 这里只负责把后续文字推到下一页。纸张/页间背景必须由表格级 mask
  // 在统一坐标系中绘制；若每个文字锚点各画一份渐变，多列切点不同时就会
  // 在页内暴露彼此错位的灰色条带。
  marker.style.background = 'transparent'
  return marker
}
