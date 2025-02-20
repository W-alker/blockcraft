import {formatKeyHandler} from "./formatKeyHandler";
import {KeyBindingHandler} from "./index";

export const onCtrlU: KeyBindingHandler = function (e) {
  e.preventDefault()
  formatKeyHandler({'a:underline': true}, this.controller)
}
