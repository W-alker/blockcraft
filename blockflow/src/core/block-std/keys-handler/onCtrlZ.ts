import {Controller} from "@core";

export const onCtrlZ = (e: KeyboardEvent, controller: Controller) => {
  e.preventDefault()
  if(e.shiftKey) controller.redo()
  else controller.undo()
}
