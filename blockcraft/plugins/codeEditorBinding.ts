import {
  BindHotKey,
  DeltaOperation,
  DocPlugin, EventListen, ORIGIN_SKIP_SYNC,
  STR_LINE_BREAK,
  STR_TAB,
  UIEventStateContext
} from "../framework";
import {BlockCraftError, ErrorCode, getLinesByRange, nextTick} from "../global";

export class CodeInlineEditorBinding extends DocPlugin {

  @EventListen('compositionEnd', {flavour: 'code'})
  private _handleCompositionEnd(context: UIEventStateContext) {
    const ev = context.getDefaultEvent<CompositionEvent>()
    ev.preventDefault()

    const {value: sel, next} = this.doc.selection.recalculate(false, {isComposing: true})
    if (!sel || sel.from.type !== 'text') {
      throw new BlockCraftError(ErrorCode.InlineEditorError, `Invalid inputRange`)
    }
    const text = ev.data
    const {block, index} = sel.from
    block.yText.insert(index === 0 ? 0 : index - text.length, text)
    // TODO: 更好的中文输入法反显渲染. 目前看必须重新渲染，否则涉及到协同的情况很容易出错

    requestAnimationFrame(() => {
      block.setInlineRange(index === 0 ? text.length : index)
    })
    next?.()
    return true
  }

  @BindHotKey({key: 'Enter', shiftKey: null}, {flavour: 'code'})
  @BindHotKey({key: 'Enter', shiftKey: null}, {flavour: 'mermaid-textarea'})
  handleEnterKey(context: UIEventStateContext) {
    if (this.doc.isReadonly) return
    const state = context.get('keyboardState')
    const {from, to, raw} = state.selection
    if (to || from.type !== 'text') return false
    context.preventDefault()
    const block = from.block

    // 代码块强制换新行
    if (state.raw.shiftKey && from.block.flavour === 'code') {
      const splitText = block.textContent().slice(from.index + from.length)
      block.deleteText(from.index, block.textLength - from.index)
      const np = this.doc.schemas.createSnapshot('paragraph', [splitText, block.props])
      this.doc.crud.insertBlocksAfter(block, [np]).then(() => {
        nextTick().then(() => {
          this.doc.selection.setCursorAtBlock(np.id, true)
        })
      })
      return true
    }

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
    block.setInlineRange(from.index + STR_LINE_BREAK.length + tabs * STR_TAB.length)
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
