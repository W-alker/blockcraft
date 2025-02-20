import {KeyBindingHandler} from "./index";

export const onCtrlC: KeyBindingHandler = function (e) {
  e.preventDefault()
  this.controller.clipboard.copy()
}
