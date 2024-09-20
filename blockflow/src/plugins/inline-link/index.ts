import {Controller, IPlugin} from "@core";
import {fromEvent} from "rxjs";

export class InlineLinkPlugin implements IPlugin {
  name = 'inline-link';
  version = 1.0;

  init(c: Controller) {
    fromEvent(c.rootElement, 'click').subscribe((e: MouseEvent) => {
      const target = e.target as HTMLElement

    })
  }


}
