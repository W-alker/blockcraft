import {KeyBindingHandler} from "./index";

export const onCtrlZ: KeyBindingHandler = function (e: KeyboardEvent) {
  e.preventDefault()
  if (e.shiftKey) this.controller.redo()
  else this.controller.undo()
}
