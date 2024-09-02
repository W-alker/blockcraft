import {Controller, IKeyEventHandler} from "@core";

export const onCtrlV: IKeyEventHandler = (event: KeyboardEvent, controller: Controller) => {
  // empty handler, entrust to paste event
}
