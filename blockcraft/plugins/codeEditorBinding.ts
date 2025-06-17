import {BindHotKey, DeltaOperation, DocPlugin, STR_LINE_BREAK, STR_TAB, UIEventStateContext} from "../framework";
import {getLinesByRange} from "../global";

export class CodeInlineEditorBinding extends DocPlugin {

  @BindHotKey({key: 'Enter', shiftKey: null}, {flavour: 'code'})
  @BindHotKey({key: 'Enter', shiftKey: null}, {flavour: 'mermaid-textarea'})
  handleEnterKey(context: UIEventStateContext) {
    if (this.doc.isReadonly) return
    const state = context.get('keyboardState')
    const {from, to, raw} = state.selection
    if (state.raw.shiftKey) {

    }
    if (to || from.type !== 'text') return false
    context.preventDefault()
    const block = from.block
    if (from.length !== 0) {
      block.deleteText(from.index, from.length)
    }
    const currLine = block.textContent().slice(0, from.index).split(STR_LINE_BREAK).at(-1)
    const tabs = (currLine?.split(STR_TAB).length || 1) - 1
    const deltas: DeltaOperation[] = [
      {retain: from.index},
      {insert: STR_LINE_BREAK + (tabs ? STR_TAB.repeat(tabs) : '')},
    ]
    block.applyDeltaOperations(deltas)
    block.setInlineRange(from.index + 1 + tabs)
    return true
  }

  @BindHotKey({key: 'Tab', shiftKey: null}, {flavour: 'code'})
  @BindHotKey({key: 'Tab', shiftKey: null}, {flavour: 'mermaid-textarea'})
  handleTabKey(context: UIEventStateContext) {
    if (this.doc.isReadonly) return
    const state = context.get('keyboardState')
    const {from, to, raw} = state.selection
    if (to || from.type !== 'text') return false
    context.preventDefault()
    const block = from.block

    // collapsed
    if (from.length === 0) {
      if (!state.raw.shiftKey) {
        block.insertText(from.index, STR_TAB)
        block.setInlineRange(from.index + STR_TAB.length)
        return true
      }

      if (from.index === 0) return true
      const prevStr = block.textContent().at(from.index - 1)
      prevStr === STR_TAB && block.deleteText(from.index - 1, 1)
      return true
    }

    const lines = getLinesByRange(block.textContent(), from.index, from.index + from.length)
    let before = lines.before.reduce((prev, curr) => prev + curr.length, 0)
    const deltas: DeltaOperation[] = []

    if (!state.raw.shiftKey) {
      deltas.push({retain: before}, {insert: STR_TAB})
      for (let i = 1; i < lines.current.length; i++) {
        deltas.push({retain: lines.current[i - 1].length}, {insert: STR_TAB})
      }
    } else {
      for (let i = 0; i < lines.current.length; i++) {
        const line = lines.current[i]
        const startStr = line[0]
        if (startStr === STR_TAB) {
          deltas.push({retain: before}, {delete: 1})
          before = -1
        }
        before += line.length
      }
    }

    if (!deltas.length) return true
    block.applyDeltaOperations(deltas)
    this.doc.selection.recalculate()
    return true
  }

  init(): void {
  }

  destroy(): void {
  }

}
