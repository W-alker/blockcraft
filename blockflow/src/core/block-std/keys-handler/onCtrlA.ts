import {EditableBlock, IKeyEventHandler} from "@core";

export const onCtrlA: IKeyEventHandler = (e, controller) => {
  const focusingBlockId = controller.getFocusingBlockId()
  if (!focusingBlockId) return
  const focusingBlock = controller.getBlockRef(focusingBlockId) as EditableBlock
  controller.setSelection(focusingBlock, 'start', 'end')
}
