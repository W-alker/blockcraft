import {IKeyEventHandler, formatKeyHandler} from "@core";

export const onCtrlI: IKeyEventHandler = (e, controller) => {
  formatKeyHandler({'a:italic': true}, e, controller)
}
