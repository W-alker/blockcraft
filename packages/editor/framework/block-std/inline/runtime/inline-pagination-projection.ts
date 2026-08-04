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

/**
 * 可逆的行内分页 DOM 投影。它只拆分真实 TextBlot 并插入零模型长度节点，
 * revoke 后恢复规范 DOM 顺序并合并所有临时文本段。
 *
 * @internal Pagination view only.
 */
export class InlinePaginationProjection {
  private _splits: Array<readonly [TextBlot, TextBlot]> = []
  private _markers: HTMLElement[] = []
  private _signature = ''
  private _containerWidthSnapshot?: {value: string; priority: string}

  constructor(private readonly _scroll: ScrollBlot) {}

  get active(): boolean {
    return this._markers.length > 0
  }

  apply(gaps: readonly InlinePaginationGap[]): boolean {
    const normalized = normalizeGaps(gaps, this._scroll.textLength)
    const signature = JSON.stringify(normalized)
    if (signature === this._signature) return true

    this.revoke()
    if (!normalized.length) return true

    try {
      this._freezeContainerWidth()
      for (const offset of [...new Set(normalized.map(gap => gap.offset))]) {
        const split = this._scroll.splitTextForLayout(offset)
        if (split) this._splits.push(split)
      }

      for (const gap of normalized) {
        const marker = buildMarker(gap)
        const anchor = this._nodeAtOffset(gap.offset)
        this._scroll.domNode.insertBefore(marker, anchor)
        this._markers.push(marker)
      }
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
      && !this._splits.length
      && !this._signature
      && !this._containerWidthSnapshot
    ) {
      return
    }

    this._scroll.restoreCanonicalDomOrder()
    for (const marker of this._markers) marker.remove()
    this._markers = []

    for (let index = this._splits.length - 1; index >= 0; index--) {
      this._scroll.mergeLayoutTextSplit(this._splits[index])
    }
    this._splits = []
    this._signature = ''
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

  private _nodeAtOffset(offset: number): Node | null {
    if (offset <= 0) {
      return this._scroll.leaves[0]?.domNode
        ?? this._scroll.children.find(child => child.type === 'break')?.domNode
        ?? null
    }
    const leaf = this._scroll.leaves.find(
      candidate => this._scroll.offsetOf(candidate) >= offset,
    )
    return leaf?.domNode
      ?? this._scroll.children.find(child => child.type === 'break')?.domNode
      ?? null
  }
}

function normalizeGaps(
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

function buildMarker(gap: InlinePaginationGap): HTMLElement {
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

  const bandEnd = gap.backdropOffset + gap.backdropHeight
  marker.style.background = [
    'linear-gradient(to bottom',
    `var(--bc-page-sheet-bg, #fff) 0 ${gap.backdropOffset}px`,
    `var(--bc-pagination-backdrop-bg, #f3f4f6) ${gap.backdropOffset}px ${bandEnd}px`,
    `var(--bc-page-sheet-bg, #fff) ${bandEnd}px 100%)`,
  ].join(', ')
  return marker
}
