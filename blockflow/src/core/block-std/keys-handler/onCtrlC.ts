import {IKeyEventHandler} from "./keyEventBus";

export const onCtrlC: IKeyEventHandler = (e, controller) => {
  e.preventDefault()
  controller.clipboard.copy()
}
