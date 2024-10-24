import {IKeyEventHandler} from "./keyEventBus";
import {Controller} from "../../controller";

export const onCtrlV: IKeyEventHandler = (event: KeyboardEvent, controller: Controller) => {
  // empty handler, entrust to paste event
}
