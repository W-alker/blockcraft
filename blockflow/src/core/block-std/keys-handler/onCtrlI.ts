import {IKeyEventHandler} from "./keyEventBus";
import {formatKeyHandler} from "./formatKeyHandler";

export const onCtrlI: IKeyEventHandler = (e, controller) => {
  formatKeyHandler({'a:italic': true}, e, controller)
}
