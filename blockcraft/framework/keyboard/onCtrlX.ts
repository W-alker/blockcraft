import {KeyBindingHandler} from "./index";

export const onCtrlX: KeyBindingHandler = function (e) {
  e.preventDefault()
  this.controller.clipboard.cut()
}
