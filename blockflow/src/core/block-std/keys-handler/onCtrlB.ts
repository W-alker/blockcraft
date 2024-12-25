import {IKeyEventHandler} from "./keyEventBus";
import {Controller} from "../../controller";
import {formatKeyHandler} from "./formatKeyHandler";

export const onCtrlB: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
  e.preventDefault()
  formatKeyHandler({'a:bold': true}, controller)
}
