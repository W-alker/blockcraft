import {Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {CalloutBlockModel} from "./index";

@Component({
  selector: 'div.callout-block-block',
  template: `
    <ng-container #childrenContainer></ng-container>
  `,
  styles: [`
    :host {
      padding: 6px;
      background: #f8f9fa;
      border: #1890ff solid 1px;
    }
  `],
  standalone: true
})
export class CalloutBlockComponent extends BaseBlockComponent<CalloutBlockModel> {

}
