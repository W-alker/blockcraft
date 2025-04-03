import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent, createBlockGapSpace} from "../../framework";
import {CalloutBlockModel} from "./index";

@Component({
  selector: 'div.callout-block',
  template: `
    <span class="callout-block-prefix" contenteditable="false">{{ props.prefix }}</span>
    <ng-container #childrenContainer></ng-container>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.background-color]': 'props.backColor',
    '[style.color]': 'props.color',
    '[style.border-color]': 'props.borderColor',
  }
})
export class CalloutBlockComponent extends BaseBlockComponent<CalloutBlockModel> {

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    // this.hostElement.prepend(createBlockGapSpace())
    // this.hostElement.appendChild(createBlockGapSpace())
  }
}
