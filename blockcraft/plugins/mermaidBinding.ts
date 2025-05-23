import {BindHotKey, DocPlugin, STR_LINE_BREAK, STR_TAB} from "../framework";
import {UIEventStateContext} from "../framework";

export class MermaidBlocKeyBinding extends DocPlugin {

  @BindHotKey({key: 'Enter', shiftKey: null}, {flavour: 'mermaid-textarea'})
  handleEnterKey(context: UIEventStateContext) {
    if (this.doc.isReadonly) return
    const state = context.get('keyboardState')
    const sel = state.selection
    if (sel.to || sel.from.type !== 'text') return
    context.preventDefault()
    const block = sel.from.block
    if (sel.from.length) {
      block.deleteText(sel.from.index, sel.from.length)
    }
    block.insertText(sel.from.index, STR_LINE_BREAK)
    block.setInlineRange(sel.from.index + STR_LINE_BREAK.length)
    return true
  }

  @BindHotKey({key: 'Tab', shiftKey: null}, {flavour: 'mermaid-textarea'})
  handleTabKey(context: UIEventStateContext) {
    if (this.doc.isReadonly) return
    const state = context.get('keyboardState')
    const {from, to, raw} = state.selection
    if (to || from.type !== 'text') return false
    context.preventDefault()
    const block = from.block
    if (from.length) {
      block.deleteText(from.index, from.length)
    }
    block.insertText(from.index, STR_TAB)
    block.setInlineRange(from.index + STR_TAB.length)
    return true
  }

  init() {
  }

  destroy() {
  }
}
