import {IKeyEventHandler} from "./keyEventBus";
import {copyHandler} from "../../helpers";

export const onCtrlX: IKeyEventHandler = (e, controller) => {
  e.preventDefault()
  copyHandler(controller, true)
}
