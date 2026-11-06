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
    if (!this._selectionResult) {
      try {
        this._selectionResult = this.doc.selection.recalculate(false, {isComposing: true})
      } catch {
        this._selectionResult = {value: null}
      }
    }
    return this._selectionResult
  }

  get selection() {
    return this.selectionResult.value
  }

  get next() {
    return this.selectionResult.next
  }

  requireSelection() {
    const selection = this.selection
    if (!selection || selection.start.type !== 'text') {
      throw new BlockCraftError(ErrorCode.InlineEditorError, `Invalid inputRange`)
    }
    return selection
  }

  getFallbackPoint(text = this.text): ITextCursorPoint | null {
    const selection = this.selection
    if (!selection || selection.start.type !== 'text') return null

    try {
      const block = selection.firstBlock as any
      const index = selection.start.offset
      return {
        block,
        index: isEmbedAdjacentPosition(block.textDeltas(), index) ? index : Math.max(0, index - text.length)
      }
    } catch {
      return null
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
