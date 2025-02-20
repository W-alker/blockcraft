import {BlockModel} from "../../yjs";
import {DeltaOperation, IEditableBlockModel} from "../../types";
import {OrderedListBlock} from "../../../blocks";
import {KeyBindingHandler} from "./index";
import {EditableBlock} from "../../block-std";

export const onTab: KeyBindingHandler = function (e: KeyboardEvent) {
  e.preventDefault()
  const curRange = this.controller.selection.getSelection()!
  if (curRange.isAtRoot) {
    const {rootRange} = curRange
    if (!rootRange) return
    let from = 0, to = 0
    from = rootRange.start
    to = rootRange.end
    let ordered: BlockModel | null = null
    for (let i = from; i < to; i++) {
      const bm = this.controller.rootModel[i] as BlockModel<IEditableBlockModel>
      if (bm.nodeType !== 'editable') continue;
      ordered === null && bm.flavour === 'ordered-list' && (ordered = bm)
      if (e.shiftKey) {
        if (bm.props.indent === 0) continue
        bm.setProp('indent', (bm.props.indent || 1) - 1)
      } else {
        bm.setProp('indent', (bm.props.indent || 0) + 1)
      }
    }
    ordered && this.controller.updateOrderAround(ordered as any)
  } else {

    const {blockId} = curRange
    const bRef = this.controller.getBlockRef(blockId) as EditableBlock

    if (this.controller.activeElement?.classList.contains('bf-multi-line')) {
      if (curRange.blockRange.start === curRange.blockRange.end) {
        if (e.shiftKey) return
        bRef.applyDelta([
          {retain: curRange.blockRange.start},
          {insert: '  '}
        ])
        return
      }

      const deltas: DeltaOperation[] = []
      const text = bRef.getTextContent()
      let i = curRange.blockRange.start
      const dividerPos: number[] = []
      while (i < curRange.blockRange.end) {
        if (text[i] === '\n') {
          dividerPos.push(i + 1)
        }
        i++
      }
      if (dividerPos[0] > curRange.blockRange.start || !dividerPos.length) {
        // 前一个换行符之后或者首个字符
        const prev = text.slice(0, dividerPos[0] - 1).lastIndexOf('\n')
        dividerPos.unshift(prev > 0 ? prev + 1 : 0)
      }

      dividerPos.forEach((pos, index) => {
        deltas.push({retain: index > 0 ? pos - dividerPos[index - 1] : pos})
        deltas.push({insert: '\u3000'})
      })

      bRef.applyDelta(deltas, false)
      requestAnimationFrame(() => {
        bRef.setSelection(curRange.blockRange.start + 1, curRange.blockRange.end + dividerPos.length)
      })
      return;
    }

    if (e.shiftKey) {
      if (bRef.model.props.indent === 0) return
      bRef.model.setProp('indent', (bRef.model.props.indent || 1) - 1)
    } else {
      bRef.model.setProp('indent', (bRef.model.props.indent || 0) + 1)
    }
    bRef instanceof OrderedListBlock && this.controller.updateOrderAround(bRef.model)
  }
}
