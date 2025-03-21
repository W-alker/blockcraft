import {BindHotKey, DocPlugin, STR_LINE_BREAK, STR_TAB} from "../framework";
import {CodeBlockComponent} from "../blocks/code-block/code.block";
import {BlockCraftError, ErrorCode} from "../global";
import {DeltaOperation} from "../framework/types";
import {UIEventStateContext} from "../framework/event/base";
// import {format} from "prettier";
// import * as prettierPluginBabel from 'prettier/plugins/babel'
// import * as prettierPluginEstree from "prettier/plugins/estree";
// import * as prettierPluginHtml from "prettier/plugins/html";
//
// const formatCode = async (text: string, rangeStart = 0, rangeEnd = text.length) => {
//   if (rangeStart === rangeEnd) return
//   let code = await format(text, {
//     rangeEnd, rangeStart,
//     parser: "babel",
//     plugins: [prettierPluginBabel, prettierPluginEstree, prettierPluginHtml],
//     endOfLine: "lf",
//     useTabs: true
//   })
//   code = code.replace(/\n$/, '')
//   return code
// }

export class CodeBlocKeyBinding extends DocPlugin {

  // 格式化热键
  // this.doc.event.bindHotkey(
  //   {key: ['F', 'f'], shiftKey: true, shortKey: true},
  //   context => {
  //     const state = context.get('keyboardState')
  //     const {from, to, raw} = state.selection
  //     if (from.type !== 'text' || !(from.block instanceof CodeBlockComponent)) return false
  //     context.preventDefault()
  //     const text = from.block.textContent()
  //     formatCode(text, from.index, from.index + from.length).then(code => {
  //       if (code === text) return
  //       from.block.applyDeltaOperation([{delete: text.length}, {insert: code}])
  //     })
  //     return true
  //   },
  //   {flavour: 'code'}
  // )

  @BindHotKey({key: 'Enter', shiftKey: null}, {flavour: 'code'})
  handleEnterKey(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {from, to, raw} = state.selection
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
    block.applyDeltaOperation(deltas)
    block.setInlineRange(from.index + 1 + tabs)
    return true
  }

  @BindHotKey({key: 'Tab', shiftKey: null}, {flavour: 'code'})
  handleTabKey(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {from, to, raw} = state.selection
    if (to || from.type !== 'text') return false
    context.preventDefault()
    const block = from.block
    if (!(block instanceof CodeBlockComponent))
      throw new BlockCraftError(ErrorCode.EventDispatcherError, 'Tab key pressed but block is not a code block')

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

    const lines = block.getLinesByRange(from.index, from.index + from.length)
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
    block.applyDeltaOperation(deltas)
    this.doc.selection.recalculate()
    return true
  }

  @BindHotKey({key: ['a', 'A'], shortKey: true}, {flavour: 'code'})
  handleCtrlA(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {from, to, raw} = state.selection
    if (from.type !== 'text') return
    context.preventDefault()
    from.block.setInlineRange(0, from.block.textLength)
    return true
  }

  override destroy() {
  }
}
