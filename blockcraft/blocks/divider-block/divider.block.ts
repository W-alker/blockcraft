import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {DividerBlockModel} from "./index";

@Component({
  selector: 'div.divider-block',
  template: `
    <div [class]="['divide-line', props.style]" [attr.data-size]="props.size"  contenteditable="false"></div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DividerBlockComponent extends BaseBlockComponent<DividerBlockModel> {
}


