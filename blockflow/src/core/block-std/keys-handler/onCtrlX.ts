import {copyHandler, IKeyEventHandler} from "@core";

export const onCtrlX: IKeyEventHandler = (e, controller) => {
  e.preventDefault()
  copyHandler(controller, true)
}
