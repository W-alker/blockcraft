import {IKeyEventHandler} from "./keyEventBus";
import {formatKeyHandler} from "./formatKeyHandler";

export const onCtrlI: IKeyEventHandler = (e, controller) => {
  e.preventDefault()
  formatKeyHandler({'a:italic': true}, controller)
}
