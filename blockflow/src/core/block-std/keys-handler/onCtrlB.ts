import {IKeyEventHandler} from "./keyEventBus";
import {Controller} from "../../controller";
import {formatKeyHandler} from "./formatKeyHandler";

export const onCtrlB: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
  formatKeyHandler({'a:bold': true}, e, controller)
}
