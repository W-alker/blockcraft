import {IKeyEventHandler} from "./keyEventBus";
import {Controller} from "../../controller";

export const onCtrlZ: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
  e.preventDefault()
  if(e.shiftKey) controller.redo()
  else controller.undo()
}
