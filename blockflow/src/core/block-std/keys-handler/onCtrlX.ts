import {IKeyEventHandler} from "./keyEventBus";

export const onCtrlX: IKeyEventHandler = (e, controller) => {
  e.preventDefault()
  controller.clipboard.cut()
}
