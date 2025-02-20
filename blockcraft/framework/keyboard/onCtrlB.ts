import {formatKeyHandler} from "./formatKeyHandler";
import {KeyBindingHandler} from "./index";

export const onCtrlB: KeyBindingHandler = function (e: KeyboardEvent) {
  e.preventDefault()
  formatKeyHandler({'a:bold': true}, this.controller)
}
