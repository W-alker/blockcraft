import {copyHandler, IKeyEventHandler} from "@core";

export const onCtrlC: IKeyEventHandler = (e, controller) => {
  e.preventDefault()
  copyHandler(controller)
}
