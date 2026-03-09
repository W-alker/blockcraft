import {UIEventState} from "../base";

export interface KeyEventContext {
  // if the selection is collapsed
  collapsed: boolean
  // semantic selection kind
  selectionKind: BlockCraft.Selection['kind']
  // prefix text before the selection(Until the start of from block). If the selection from block is not editable, this will be null
  prefix: string | null
  // suffix text after the selection(Until the end of to block). If the selection to block is null or not editable, this will be null
  suffix: string | null
  // the block flavour of the selection
  flavour: string
  // the block id of the selection
  blockId: string
  // if the selection is in the same block
  isInSameBlock: boolean
}

export class KeyboardEventState extends UIEventState {
  composing: boolean

  raw: KeyboardEvent;

  context: KeyEventContext
  selection: BlockCraft.Selection

  override type = 'keyboardState';

  constructor({event, selection}: { event: KeyboardEvent, selection: BlockCraft.Selection }) {
    super(event);

    this.raw = event;
    this.composing = event.isComposing
    this.selection = selection

    const {from, to, collapsed, isInSameBlock} = selection
    this.context = {
      collapsed,
      selectionKind: selection.kind,
      flavour: from.block.flavour,
      blockId: from.block.id,
      isInSameBlock,
      prefix: from.type === 'text' ? from.block.textContent().substring(0, from.index) : null,
      suffix: to ? (to.type === 'text' ? to.block.textContent().substring(to.index) : null) : null
    }
  }
}

declare global {
  interface BlockCraftUIEventState {
    keyboardState: KeyboardEventState;
  }
}
