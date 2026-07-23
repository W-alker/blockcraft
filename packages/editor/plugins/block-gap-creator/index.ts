import {BlockNodeType, DocPlugin} from "../../framework";
import {closetBlockId, caretRangeFromPoint, isNativeInputTarget, resolveBlockGapSide, resolveGapSideFromRect} from "../../framework/utils";
import {fromEvent, Subscription} from "rxjs";
import {performanceTest} from "../../global";

/**
 * Resolves a blank-area click into a gap caret, a text caret, or an adjacent
 * block focus — without eagerly creating an empty paragraph. Three cases:
 *
 * - **(A) gap-eligible block host, outside its content box** → `setGapCursor(block, side)`.
 *   `side` is derived from the click position relative to the content-box rect.
 * - **(B) right of a text line (block padding, outside `.edit-container`)** →
 *   a text caret at that line's end via the feature-detected `caretRangeFromPoint`.
 * - **(C) root gutter / below all content** → nearest root child by Y; an editable
 *   neighbour gets a text caret (start/end), a void/container neighbour gets a gap caret.
 *
 * Typing on a gap caret materialises an adjacent paragraph (handled in the input
 * pipeline, P3) instead of this plugin inserting one up front.
 */
export class BlockGapCreatorPlugin extends DocPlugin {
  override name = 'block-gap-creator'

  private _subs: Subscription[] = []

  /** mousedown must land on root/block blank area AND movement < threshold to count as a plain gap click */
  private _downOnGap = false
  private _downHandled = false
  private _isMouseDown = false
  private _downX = 0
  private _downY = 0

  private static readonly _MOVE_THRESHOLD = 5

  init() {
    const root = this.doc.root
    const host = root.hostElement

    this._subs.push(
      this.doc.event.customListen(host, 'mousedown').subscribe((e) => {
        const evt = e as MouseEvent
        this._resetDownState()
        this._isMouseDown = true
        this._downX = evt.clientX
        this._downY = evt.clientY
        this._downOnGap = this._isPlainRootGapMouseDown(evt)

        if (this.doc.isReadonly) return
        if (!this._shouldResolveOnMouseDown(evt)) return

        if (!this._resolveBlankAreaSelection(evt.clientX, evt.clientY)) return
        evt.preventDefault()
        this._downHandled = true
        this._downOnGap = true
      })
    )

    this._subs.push(
      fromEvent<MouseEvent>(window, 'mousemove', {capture: true}).subscribe((evt) => {
        if (!this._isMouseDown || !this._downHandled) return
        if (!this._isDragLike(evt.clientX, evt.clientY)) return
        if (this._extendSelectionToPoint(evt.clientX, evt.clientY)) {
          evt.preventDefault()
        }
      })
    )

    this._subs.push(
      fromEvent<MouseEvent>(window, 'mouseup', {capture: true}).subscribe(() => {
        this._isMouseDown = false
        setTimeout(() => this._resetDownState())
      })
    )

    this._subs.push(
      this.doc.event.customListen(host, 'click').subscribe((e) => {
        const evt = e as MouseEvent
        if (this.doc.isReadonly) return

        if (this._downHandled) {
          evt.preventDefault()
          this._resetDownState()
          return
        }

        // mousedown must have started on the gap itself. This is a fallback for
        // cases where the mousedown path did not resolve a blank-area target.
        if (!this._downOnGap) return
        // click target must also be on the gap
        if (evt.target !== host) return
        // reject drag-like movements (cross-block selection, etc.)
        if (this._isDragLike(evt.clientX, evt.clientY)) {
          return
        }

        evt.preventDefault()
        this._resolveBlankAreaSelection(evt.clientX, evt.clientY)
      })
    )
  }

  private _resetDownState(): void {
    this._downOnGap = false
    this._downHandled = false
    this._isMouseDown = false
  }

  private _isDragLike(x: number, y: number): boolean {
    const dx = x - this._downX
    const dy = y - this._downY
    return dx * dx + dy * dy > BlockGapCreatorPlugin._MOVE_THRESHOLD * BlockGapCreatorPlugin._MOVE_THRESHOLD
  }

  private _shouldResolveOnMouseDown(evt: MouseEvent): boolean {
    if (!this._isPlainMouseDown(evt)) return false
    if (isNativeInputTarget(evt.target)) return false

    const target = evt.target
    if (!(target instanceof Node)) return false
    if (target === this.doc.root.hostElement) return true
    if (this._isInBlockGapAnchor(target)) return true

    const blockId = closetBlockId(target)
    const block = blockId ? this._safeGetBlock(blockId) : null
    if (!block || !this._isGapEligible(block)) return false
    return this._resolveSideFromClickRect(block, evt.clientX, evt.clientY) !== null
  }

  private _isPlainRootGapMouseDown(evt: MouseEvent): boolean {
    return this._isPlainMouseDown(evt) && evt.target === this.doc.root.hostElement
  }

  private _isPlainMouseDown(evt: MouseEvent): boolean {
    if (evt.button !== 0 || evt.detail > 1) return false
    return !evt.shiftKey && !evt.altKey && !evt.ctrlKey && !evt.metaKey
  }

  private _extendSelectionToPoint(x: number, y: number): boolean {
    const range = caretRangeFromPoint(x, y)
    if (!range) return false
    if (!this._isRangeInsideRoot(range)) return false

    const selection = document.getSelection()
    if (!selection?.rangeCount || typeof selection.extend !== 'function') return false

    try {
      selection.extend(range.startContainer, range.startOffset)
      this.doc.selection.recalculate()
      return true
    } catch {
      return false
    }
  }

  private _isRangeInsideRoot(range: Range): boolean {
    const root = this.doc.root.hostElement
    return range.startContainer !== root && root.contains(range.startContainer)
  }

  @performanceTest()
  private _resolveBlankAreaSelection(x: number, y: number): boolean {
    const clickedElement = document.elementFromPoint(x, y)
    const clickedGapSide = clickedElement ? resolveBlockGapSide(clickedElement) : null
    if (clickedElement && clickedGapSide) {
      const blockId = closetBlockId(clickedElement)
      const block = blockId ? this._safeGetBlock(blockId) : null
      if (block && this._isGapEligible(block)) {
        this.doc.selection.setGapCursor(block, clickedGapSide)
        return true
      }
    }

    // The block the pointer is vertically level with, resolved purely from
    // child rects. This works in the SIDE gutter, where the click target is
    // the root host and `elementFromPoint` can't see the block beside it.
    const row = this._resolveRowBlockByPoint(x, y)

    if (row?.gutter) {
      if (this._isGapEligible(row.block)) {
        this.doc.selection.setGapCursor(row.block, row.side)
        return true
      }
      if (this.doc.isEditable(row.block)) {
        this.doc.selection.setCursorAtBlock(row.block, row.side === 'before', false)
        return true
      }
    }

    // Case (B): text line caret (editable row in its side padding, or right of
    // a wrapped line).
    if (this._tryTextLineEndCaret(x, y)) return true

    // Case (A): elementFromPoint lands on a gap-eligible block host, outside
    // its content box (a block with inner padding that reaches the pointer).
    const blockId = clickedElement ? closetBlockId(clickedElement) : null
    const clickedBlock = blockId ? this._safeGetBlock(blockId) : null
    if (clickedBlock && this._isGapEligible(clickedBlock)) {
      const side = this._resolveSideFromClickRect(clickedBlock, x, y)
      if (side) {
        this.doc.selection.setGapCursor(clickedBlock, side)
        return true
      }
    }

    // Case (C): root gutter / below all content — find nearest root child by Y
    const {above, below} = this._findAdjacentBlocks(x, y)
    if (!above && !below) return false

    // If the block above the gap is editable, focus at its end
    if (above && this.doc.isEditable(above)) {
      this.doc.selection.setCursorAtBlock(above, false, false)
      return true
    }

    // If the block below the gap is editable, focus at its beginning
    if (below && this.doc.isEditable(below)) {
      this.doc.selection.setCursorAtBlock(below, true, false)
      return true
    }

    // Both non-editable: gap-after on the block above (if gap-eligible),
    // else gap-before on the block below.
    if (above && this._isGapEligible(above)) {
      this.doc.selection.setGapCursor(above, 'after')
      return true
    }
    if (below && this._isGapEligible(below)) {
      this.doc.selection.setGapCursor(below, 'before')
      return true
    }
    return false
  }

  /**
   * Attempt to place a text caret at the end of a text line via caretRangeFromPoint.
   * Returns true if a caret was set (text-line scenario), false otherwise.
   */
  private _tryTextLineEndCaret(x: number, y: number): boolean {
    const range = caretRangeFromPoint(x, y)
    if (!range) return false

    // The range's container must live inside an editable block...
    const containerId = closetBlockId(range.startContainer)
    if (!containerId) return false

    const containerBlock = this._safeGetBlock(containerId)
    if (!containerBlock || !this.doc.isEditable(containerBlock)) return false

    // Case B is for the top-level text-line padding only. If caretRangeFromPoint
    // resolved into a NESTED block (e.g. a table cell), decline so Case C handles it.
    const parentType = containerBlock.parentBlock?.nodeType
    if (parentType !== undefined && parentType !== BlockNodeType.root) {
      return false
    }

    // ...and NOT inside a gap span (leading/trailing zero-space).
    if (this._isInBlockGapAnchor(range.startContainer)) return false

    const docSelection = document.getSelection()
    if (!docSelection) return false
    docSelection.removeAllRanges()
    docSelection.addRange(range)
    this.doc.selection.recalculate()
    return true
  }

  /**
   * Check if a node sits inside a block's leading or trailing gap span
   * (`data-block-zero-space`). Walks up to the owning block host and stops there.
   */
  private _isInBlockGapAnchor(node: Node): boolean {
    let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement
    while (el) {
      if (el.getAttribute('data-block-zero-space') === 'true') return true
      if (el.getAttribute('data-block-id')) break
      el = el.parentElement
    }
    return false
  }

  /** A block is gap-eligible when it is a non-leaf void or container block. */
  private _isGapEligible(block: BlockCraft.BlockComponent): boolean {
    const isLeaf = !!this.doc.schemas.get(block.flavour)?.metadata.isLeaf
    return !isLeaf && (block.nodeType === BlockNodeType.void || block.nodeType === BlockNodeType.block)
  }

  /**
   * Resolve 'before'/'after' from the click position relative to the block's
   * visual content rect. Returns null for an in-content click.
   */
  private _resolveSideFromClickRect(block: BlockCraft.BlockComponent, x: number, y: number): 'before' | 'after' | null {
    return resolveGapSideFromRect(this._getBlockContentRect(block), x, y)
  }

  private _getBlockContentRect(block: BlockCraft.BlockComponent): { top: number; bottom: number; left: number; right: number } {
    const explicitContent = block.hostElement.querySelector(':scope > .bc-block-content')
    if (explicitContent instanceof HTMLElement) {
      return explicitContent.getBoundingClientRect()
    }

    const contentChildren = Array
      .from(block.hostElement.children)
      .filter((child): child is HTMLElement =>
        child instanceof HTMLElement &&
        child.getAttribute('data-block-zero-space') !== 'true' &&
        !child.classList.contains('blockcraft-cursor')
      )

    if (!contentChildren.length) {
      return block.hostElement.getBoundingClientRect()
    }

    const rects = contentChildren.map(child => child.getBoundingClientRect())
    const first = rects[0]
    return rects.slice(1).reduce((acc, rect) => ({
      top: Math.min(acc.top, rect.top),
      bottom: Math.max(acc.bottom, rect.bottom),
      left: Math.min(acc.left, rect.left),
      right: Math.max(acc.right, rect.right),
    }), {
      top: first.top,
      bottom: first.bottom,
      left: first.left,
      right: first.right,
    })
  }

  /**
   * Resolve the root-level block whose vertical band contains `y` — the block the
   * pointer is level with when a click lands in the root's side gutter (where
   * `elementFromPoint` only sees the root host).
   *
   * - `side`: the left/right gutter maps to `before`/`after` via
   *   `resolveGapSideFromRect`; a hit with no horizontal side (x inside the box)
   *   falls back to the nearer vertical half.
   * - `gutter`: true when x is OUTSIDE the block horizontally (a genuine side-gutter
   *   click). False means x is within the block's box — callers should defer to the
   *   normal hit-test / text-caret path rather than force a side.
   *
   * Returns null when `y` sits in an inter-block margin or beyond the first/last
   * block — those are left to the adjacent-block fallback (Case C).
   */
  private _resolveRowBlockByPoint(x: number, y: number): { block: BlockCraft.BlockComponent; side: 'before' | 'after'; gutter: boolean } | null {
    for (const block of this._mountedRootBlocks()) {
      const rect = block.hostElement.getBoundingClientRect()
      if (rect.height === 0) continue
      if (y >= rect.top && y <= rect.bottom) {
        // y is within the band, so resolveGapSideFromRect returns non-null iff x is
        // left of / right of the box — i.e. exactly when the click is in the gutter.
        const horizontalSide = resolveGapSideFromRect(rect, x, y)
        const side = horizontalSide ?? (y < rect.top + rect.height / 2 ? 'before' : 'after')
        return {block, side, gutter: horizontalSide !== null}
      }
    }
    return null
  }

  /**
   * Two-probe approach: find both adjacent root-level blocks around the gap.
   * The gap between blocks is typically 8-16px, so a 20px probe is enough.
   */
  private _findAdjacentBlocks(x: number, y: number): { above: BlockCraft.BlockComponent | null; below: BlockCraft.BlockComponent | null } {
    const PROBE = 20
    const below = this._probeForBlock(x, y + PROBE)
    const above = this._probeForBlock(x, y - PROBE)

    if (below || above) return {above, below}

    // A sparse root can also contain offscreen selection/keep-alive views.
    // Model order is therefore not visual proximity; resolve the nearest
    // mounted rect on either side of the pointer instead.
    let nearestAbove: BlockCraft.BlockComponent | null = null
    let nearestBelow: BlockCraft.BlockComponent | null = null
    let nearestAboveBottom = Number.NEGATIVE_INFINITY
    let nearestBelowTop = Number.POSITIVE_INFINITY
    for (const block of this._mountedRootBlocks()) {
      const rect = block.hostElement.getBoundingClientRect()
      if (rect.height === 0) continue
      if (rect.bottom <= y && rect.bottom > nearestAboveBottom) {
        nearestAbove = block
        nearestAboveBottom = rect.bottom
      }
      if (rect.top >= y && rect.top < nearestBelowTop) {
        nearestBelow = block
        nearestBelowTop = rect.top
      }
    }

    return {above: nearestAbove, below: nearestBelow}
  }

  private _mountedRootBlocks(): BlockCraft.BlockComponent[] {
    return this.doc.vm.getMountedRootChildIds().flatMap(id => {
      const block = this.doc.vm.get(id)?.instance
      return block ? [block] : []
    })
  }

  /** Find a root-level block at the given viewport coordinates. */
  private _probeForBlock(x: number, y: number): BlockCraft.BlockComponent | null {
    const el = document.elementFromPoint(x, y)
    if (!el) return null
    const id = closetBlockId(el)
    if (!id) return null
    const block = this._safeGetBlock(id)
    if (!block) return null
    if (block.nodeType === BlockNodeType.root) return null
    // Only handle root-level children
    if (block.parentBlock?.nodeType !== BlockNodeType.root) return null
    return block
  }

  /** `getBlockById` throws for unknown ids; resolve to null instead. */
  private _safeGetBlock(id: string): BlockCraft.BlockComponent | null {
    try {
      return this.doc.getBlockById(id)
    } catch {
      return null
    }
  }

  destroy() {
    this._subs.forEach(s => s.unsubscribe())
    this._subs = []
  }
}
