import {EditableBlock, IKeyEventHandler} from "@core";
import {replaceSelectionInView, setRange} from "@core/utils";

export const onCtrlA: IKeyEventHandler = (e, controller) => {
  const focusingBlockId = controller.getFocusingBlockId()
  if (!focusingBlockId) return
  const focusingBlock = controller.getBlockRef(focusingBlockId) as EditableBlock
  const el = focusingBlock.containerEle
  const range = setRange({start: 0, end: el.textContent!.length}, el)
  replaceSelectionInView(range)
}
