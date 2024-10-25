import {IKeyEventHandler} from "./keyEventBus";
import {Controller} from "../../controller";
import {BlockModel} from "../../yjs";
import {DeltaOperation, IEditableBlockModel} from "../../types";
import {EditableBlock} from "../components";
import {OrderedListBlock} from "../../../blocks";

export const onTab: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
  e.preventDefault()
  const curRange = controller.getSelection()!
  if (curRange.isAtRoot) {
    const {rootRange} = curRange
    if (!rootRange) return
    let from = 0, to = 0
    from = rootRange.start
    to = rootRange.end
    let ordered: BlockModel | null = null
    for (let i = from; i <= to; i++) {
      const bm = controller.rootModel[i] as BlockModel<IEditableBlockModel>
      if (bm.nodeType !== 'editable') continue;
      bm.flavour === 'ordered-list' && (ordered = bm)
      if (e.shiftKey) {
        if (bm.props.indent === 0) continue
        bm.setProp('indent', (bm.props.indent || 1) - 1)
      } else {
        bm.setProp('indent', (bm.props.indent || 0) + 1)
      }
    }
    ordered && controller.updateOrderAround(ordered as any)
  } else {

    const {blockId} = curRange
    const bRef = controller.getBlockRef(blockId) as EditableBlock

    if (controller.activeElement?.classList.contains('bf-multi-line')) {
      if (curRange.blockRange.start === curRange.blockRange.end) {
        if (e.shiftKey) return
        bRef.applyDelta([
          {retain: curRange.blockRange.start},
          {insert: '\u3000'}
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
      if (dividerPos[0] > curRange.blockRange.start) {
        // 前一个换行符之后或者首个字符
        const prev = text.slice(0, dividerPos[0] - 1).lastIndexOf('\n')
        dividerPos.unshift(prev > 0 ? prev + 1 : 0)
      }

      dividerPos.forEach((pos, index) => {
        deltas.push({retain: index > 0 ? pos - dividerPos[index - 1] : pos})
        deltas.push({insert: '\u3000'})
      })

      bRef.applyDelta(deltas)
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
    bRef instanceof OrderedListBlock && controller.updateOrderAround(bRef.model)
  }
}
