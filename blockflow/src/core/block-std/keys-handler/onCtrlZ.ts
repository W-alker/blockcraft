import {Controller, IKeyEventHandler} from "@core";

export const onCtrlZ: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
  e.preventDefault()
  if(e.shiftKey) controller.redo()
  else controller.undo()
}
