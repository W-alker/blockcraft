import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {CalloutBlockModel} from "./index";

@Component({
  selector: 'div.callout-block',
  template: `
    <span class="callout-block-prefix" contenteditable="false" >{{ props.prefix }}</span>
    <ng-container #childrenContainer></ng-container>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.background-color]': 'props.backColor',
    '[style.color]': 'props.color'
  }
})
export class CalloutBlockComponent extends BaseBlockComponent<CalloutBlockModel> {

}
