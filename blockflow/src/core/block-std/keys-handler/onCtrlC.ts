import {IKeyEventHandler} from "./keyEventBus";
import {copyHandler} from "../../helpers";

export const onCtrlC: IKeyEventHandler = (e, controller) => {
  e.preventDefault()
  copyHandler(controller)
}
