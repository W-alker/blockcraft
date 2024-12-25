import {IKeyEventHandler} from "./keyEventBus";
import {formatKeyHandler} from "./formatKeyHandler";

export const onCtrlU: IKeyEventHandler = (e, controller) => {
  e.preventDefault()
  formatKeyHandler({'a:underline': true}, controller)
}
