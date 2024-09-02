import {Controller, formatKeyHandler, IKeyEventHandler} from "@core";

export const onCtrlB: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
  formatKeyHandler({'a:bold': true}, e, controller)
}
