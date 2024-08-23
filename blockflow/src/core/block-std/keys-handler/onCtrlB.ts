import {Controller, formatKeyHandler} from "@core";

export const onCtrlB = (e: KeyboardEvent, controller: Controller) => {
  formatKeyHandler({'a:bold': true}, e, controller)
}
