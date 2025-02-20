import {formatKeyHandler} from "./formatKeyHandler";
import {KeyBindingHandler} from "./index";

export const onCtrlI: KeyBindingHandler = function (e) {
  e.preventDefault()
  formatKeyHandler({'a:italic': true}, this.controller)
}
