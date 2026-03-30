import {BlockNodeType, DocPlugin} from "../../framework";
import {closetBlockId} from "../../framework/utils";
import {Subscription} from "rxjs";

export class BlockGapCreatorPlugin extends DocPlugin {
  override name = 'block-gap-creator'

  private _sub?: Subscription

  init() {
    const root = this.doc.root
    this._sub = this.doc.event.customListen(root.hostElement, 'click').subscribe((e) => {
      const evt = e as MouseEvent
      if (this.doc.isReadonly) return
      // Only trigger when click lands on root container itself (the gap area)
      if (evt.target !== root.hostElement) return

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
    this._sub?.unsubscribe()
  }
}
