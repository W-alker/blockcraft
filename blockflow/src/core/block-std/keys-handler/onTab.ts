import {BlockModel, Controller, EditableBlock, IEditableBlockModel, IKeyEventHandler, USER_CHANGE_SIGNAL} from "@core";
import {OrderedListBlock, updateOrderAround} from "@blocks";

export const onTab: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
  e.preventDefault()
  const curRange = controller.getSelection()!
  if (curRange.isAtRoot) {
    const {rootRange} = curRange
    if (!rootRange) return
    let from = 0, to = 0
    from = rootRange.start
    to = rootRange.end
    controller.transact(() => {
      let ordered: BlockModel | null = null
      for (let i = from; i <= to; i++) {
        const bm = controller.rootModel[i] as BlockModel<IEditableBlockModel>
        if (bm.nodeType !== 'editable') continue;
        bm.flavour === 'ordered-list' && (ordered = bm)
        e.shiftKey ? bm.setProp('indent', (bm.props.indent || 0) - 1)
          : bm.setProp('indent', (bm.props.indent || 0) + 1)
      }
      ordered && controller.updateOrderAround(ordered as any)
    }, USER_CHANGE_SIGNAL)
  } else {
    const {blockId} = curRange
    const bRef = controller.getBlockRef(blockId) as EditableBlock
    e.shiftKey ? bRef.setProp('indent', (bRef.props.indent || 0) - 1)
      : bRef.setProp('indent', (bRef.props.indent || 0) + 1)
    bRef instanceof OrderedListBlock && controller.updateOrderAround(bRef.model)
  }
}
