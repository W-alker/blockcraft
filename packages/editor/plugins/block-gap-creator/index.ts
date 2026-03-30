import {BlockNodeType, DocPlugin} from "../../framework";
import {closetBlockId} from "../../framework/utils";
import {Subscription} from "rxjs";

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

        // Both non-editable: create an empty paragraph between them
        const p = this.doc.schemas.createSnapshot('paragraph', [])
        if (below) {
          this.doc.crud.insertBlocksBefore(below, [p])
        } else if (above) {
          this.doc.crud.insertBlocksAfter(above, [p])
        }
        this.doc.selection.setCursorAtBlock(p.id, true)
      })
    )
  }

  /**
   * Two-probe approach: find both adjacent blocks around the gap.
   * Gap between blocks is typically 8-16px, so a 20px probe is enough.
   */
  private _findAdjacentBlocks(x: number, y: number): { above: BlockCraft.BlockComponent | null; below: BlockCraft.BlockComponent | null } {
    const PROBE = 20
    const below = this._probeForBlock(x, y + PROBE)
    const above = this._probeForBlock(x, y - PROBE)

    // Fallback: click is below all blocks → treat last child as above
    if (!below && !above) {
      const lastChild = this.doc.root.lastChildren
      if (lastChild) return {above: lastChild, below: null}
    }

    return {above, below}
  }

  /** Find a root-level block at the given screen coordinates. */
  private _probeForBlock(x: number, y: number): BlockCraft.BlockComponent | null {
    const el = document.elementFromPoint(x, y)
    if (!el) return null
    const id = closetBlockId(el)
    if (!id) return null
    try {
      const block = this.doc.getBlockById(id)
      if (block.nodeType === BlockNodeType.root) return null
      // Only handle root-level children
      if (block.parentBlock?.nodeType !== BlockNodeType.root) return null
      return block
    } catch {
      return null
    }
  }

  destroy() {
    this._subs.forEach(s => s.unsubscribe())
  }
}
