import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlock} from "../../core";

@Component({
  selector: 'div.bf-divider',
  template: `<div></div>`,
  styles: [`
      :host {
        padding: 8px 0 7px;
      }
      :host > div{
        height: 1px;
        background-color: #E6E6E6;
      }
  `],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DividerBlock extends BaseBlock{
}
