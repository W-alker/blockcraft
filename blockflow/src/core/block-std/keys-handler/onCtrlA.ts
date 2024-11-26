import {IKeyEventHandler} from "./keyEventBus";
import {EditableBlock} from "../components";

export const onCtrlA: IKeyEventHandler = (e, controller) => {
  // e.preventDefault()
  // const focusingBlockId = controller.getFocusingBlockId()
  // if (!focusingBlockId) return
  // const focusingBlock = controller.getBlockRef(focusingBlockId) as EditableBlock
  // controller.setSelection(focusingBlock, 'start', 'end')
}
