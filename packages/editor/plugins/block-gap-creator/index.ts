import {BlockNodeType, DocPlugin} from "../../framework";
import {closetBlockId, caretRangeFromPoint, resolveGapSideFromRect} from "../../framework/utils";
import {Subscription} from "rxjs";

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

  /** mousedown must land on root gap AND movement < threshold to count as a gap click */
  private _downOnGap = false
  private _downX = 0
  private _downY = 0

  private static readonly _MOVE_THRESHOLD = 5

  init() {
    const root = this.doc.root
    const host = root.hostElement

    // Track whether mousedown started on the gap (not inside a block)
    this._subs.push(
      this.doc.event.customListen(host, 'mousedown').subscribe((e) => {
        const evt = e as MouseEvent
        this._downOnGap = evt.target === host
        this._downX = evt.clientX
        this._downY = evt.clientY
      })
    )

    this._subs.push(
      this.doc.event.customListen(host, 'click').subscribe((e) => {
        const evt = e as MouseEvent
        if (this.doc.isReadonly) return
        // mousedown must have started on the gap itself
        if (!this._downOnGap) return
        // click target must also be on the gap
        if (evt.target !== host) return
        // reject drag-like movements (cross-block selection, etc.)
        const dx = evt.clientX - this._downX
        const dy = evt.clientY - this._downY
        if (dx * dx + dy * dy > BlockGapCreatorPlugin._MOVE_THRESHOLD * BlockGapCreatorPlugin._MOVE_THRESHOLD) return

        evt.preventDefault()

        // The block the pointer is vertically level with, resolved purely from
        // child rects. This works in the SIDE gutter, where the click target is
        // the root host and `elementFromPoint` can't see the block beside it.
        const row = this._resolveRowBlockByPoint(evt.clientX, evt.clientY)

        // Case (A0): side gutter level with a gap-eligible (void/container) block
        // → that block's gap. Resolved BEFORE the text-line probe so a tall void
        // block's gap wins over a far adjacent paragraph that `caretRangeFromPoint`
        // would otherwise clamp the caret to.
        if (row && row.gutter && this._isGapEligible(row.block)) {
          this.doc.selection.setGapCursor(row.block, row.side)
          return
        }

        // Case (B): text line caret (editable row in its side padding, or right of
        // a wrapped line).
        if (this._tryTextLineEndCaret(evt.clientX, evt.clientY)) return

        // Case (A): elementFromPoint lands on a gap-eligible block host, outside
        // its content box (a block with inner padding that reaches the pointer).
        const clickedElement = document.elementFromPoint(evt.clientX, evt.clientY)
        const blockId = clickedElement ? closetBlockId(clickedElement) : null
        const clickedBlock = blockId ? this._safeGetBlock(blockId) : null
        if (clickedBlock && this._isGapEligible(clickedBlock)) {
          const side = this._resolveSideFromClickRect(clickedBlock, evt.clientX, evt.clientY)
          if (side) {
            this.doc.selection.setGapCursor(clickedBlock, side)
            return
          }
        }

        // Case (A2): side gutter level with an EDITABLE block that Case B didn't
        // resolve → text caret at the near end (left gutter → start, right → end).
        if (row && row.gutter && this.doc.isEditable(row.block)) {
          this.doc.selection.setCursorAtBlock(row.block, row.side === 'before')
          return
        }

        // Case (C): root gutter / below all content — find nearest root child by Y
        const {above, below} = this._findAdjacentBlocks(evt.clientX, evt.clientY)
        if (!above && !below) return

        // If the block above the gap is editable, focus at its end
        if (above && this.doc.isEditable(above)) {
          this.doc.selection.setCursorAtBlock(above, false)
          return
        }

        // If the block below the gap is editable, focus at its beginning
        if (below && this.doc.isEditable(below)) {
          this.doc.selection.setCursorAtBlock(below, true)
          return
        }

        // Both non-editable: gap-after on the block above (if gap-eligible),
        // else gap-before on the block below.
        if (above && this._isGapEligible(above)) {
          this.doc.selection.setGapCursor(above, 'after')
        } else if (below && this._isGapEligible(below)) {
          this.doc.selection.setGapCursor(below, 'before')
        }
      })
    )
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
   * host rect. Returns null for an in-content click.
   */
  private _resolveSideFromClickRect(block: BlockCraft.BlockComponent, x: number, y: number): 'before' | 'after' | null {
    const anchorEl = block.hostElement
    return resolveGapSideFromRect(anchorEl.getBoundingClientRect(), x, y)
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
    const children = this.doc.root.getChildrenBlocks()
    for (const block of children) {
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

    // Fallback: click is below all blocks → treat the last child as "above".
    if (!below && !above) {
      const lastChild = this.doc.root.lastChildren
      if (lastChild) return {above: lastChild, below: null}
    }

    return {above, below}
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
