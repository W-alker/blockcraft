import {BlockModel, Controller, EditableBlock, IEditableBlockModel, IKeyEventHandler} from "@core";

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
      for (let i = from; i <= to; i++) {
        const bm = controller.rootModel[i] as BlockModel<IEditableBlockModel>
        if (bm.nodeType !== 'editable') continue;
        e.shiftKey ? bm.setProps('indent', (bm.props.indent || 0) - 1)
          : bm.setProps('indent', (bm.props.indent || 0) + 1)
      }
    })
    return
  } else {
    const {blockId} = curRange
    const bRef = controller.getBlockRef(blockId) as EditableBlock
    controller.transact(() => {
      e.shiftKey ? bRef.setProps('indent', (bRef.props.indent || 0) - 1)
        : bRef.setProps('indent', (bRef.props.indent || 0) + 1)
    })
  }

}
