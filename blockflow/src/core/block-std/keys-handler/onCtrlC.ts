import {IKeyEventHandler} from "./keyEventBus";

export const onCtrlC: IKeyEventHandler = (e, controller) => {
  e.preventDefault()
  document.execCommand('copy')
  // copyHandler(controller)
}
