import {UIEventState} from "../base";
import {isZeroSpace, ITextCursorPoint} from "../../../utils";
import {BlockCraftError, ErrorCode} from "../../../../global";

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
      index: isZeroSpace(selection.raw.startContainer) ? index : Math.max(0, index - text.length)
    }
  }

  resolveCommitPoint(fallback?: ITextCursorPoint | null) {
    const point = fallback || this.getFallbackPoint()
    return this.doc.inputManger.compositionSession.prepareCommit(point) || point || null
  }
}

declare global {
  interface BlockCraftUIEventState {
    compositionState: CompositionEventState;
  }
}
