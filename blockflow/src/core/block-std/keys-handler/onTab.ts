import {Controller, IKeyEventHandler} from "@core";

export const onTab: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
  e.preventDefault()
  const curRange = controller.getSelection()!
  let from = 0, to = 0
  if (curRange.isAtRoot) {
    const {rootRange} = curRange
    if (!rootRange) return
    from = rootRange.start
    to = rootRange.end
  } else {
    const {blockId} = curRange
    from = to = controller.rootModel.findIndex(b => b.id === blockId)
  }
  controller.transact(() => {
    for (let i = from; i <= to; i++) {
      const bm = controller.rootModel[i]
      if (bm.nodeType !== 'editable') continue;
      e.shiftKey ? bm.meta.indent = (bm.meta.indent || 0) - 1
        : bm.meta.indent = (bm.meta.indent || 0) + 1
    }
  })
}
