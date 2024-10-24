import {IKeyEventHandler} from "./keyEventBus";
import {formatKeyHandler} from "./formatKeyHandler";

export const onCtrlU: IKeyEventHandler = (e, controller) => {
  formatKeyHandler({'a:underline': true}, e, controller)
}
