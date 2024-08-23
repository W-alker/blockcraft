import {formatKeyHandler, IKeyEventHandler} from "@core";

export const onCtrlU: IKeyEventHandler = (e, controller) => {
  formatKeyHandler({'a:underline': true}, e, controller)
}
