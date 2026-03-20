import {UIEventState} from "../base";
import {ITextCursorPoint} from "../../../utils";
import {BlockCraftError, ErrorCode} from "../../../../global";
import {DeltaInsert} from "../../types";

export class CompositionEventState extends UIEventState {
  override type = 'compositionState';

  readonly raw: CompositionEvent
  readonly text: string

  private _selectionResult?: {
    value: BlockCraft.Selection | null
    next?: () => void
  }

  constructor(
    private readonly doc: BlockCraft.Doc,
    event: CompositionEvent
  ) {
    super(event)
    this.raw = event
    this.text = event.data || ''
  }

  get selectionResult() {
    return this._selectionResult ||= this.doc.selection.recalculate(false, {isComposing: true})
  }

  get selection() {
    return this.selectionResult.value
  }

  get next() {
    return this.selectionResult.next
  }

  requireSelection() {
    const selection = this.selection
    if (!selection || selection.from.type !== 'text') {
      throw new BlockCraftError(ErrorCode.InlineEditorError, `Invalid inputRange`)
    }
    return selection
  }

  getFallbackPoint(text = this.text): ITextCursorPoint | null {
    const selection = this.selection
    if (!selection || selection.from.type !== 'text') return null

    const {block, index} = selection.from
    return {
      block,
      index: isEmbedAdjacentPosition(block.textDeltas(), index) ? index : Math.max(0, index - text.length)
    }
  }

  resolveCommitPoint(fallback?: ITextCursorPoint | null) {
    const point = fallback || this.getFallbackPoint()
    return this.doc.inputManger.compositionSession.prepareCommit(point) || point || null
  }
}

/**
 * Check if a model position is adjacent to an embed (corresponds to a
 * zero-width-space node in the DOM).
 */
function isEmbedAdjacentPosition(deltas: DeltaInsert[], index: number): boolean {
  let pos = 0
  for (const d of deltas) {
    const len = typeof d.insert === 'string' ? d.insert.length : 1
    // cursor falls within or right after an embed
    if (pos <= index && index <= pos + len && typeof d.insert !== 'string') return true
    if (pos > index) break
    pos += len
  }
  return false
}

declare global {
  interface BlockCraftUIEventState {
    compositionState: CompositionEventState;
  }
}
