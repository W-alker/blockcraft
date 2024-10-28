import {ChangeDetectionStrategy, Component} from "@angular/core";
import {EditableBlock} from "../../core";
@Component({
  selector: 'h3.editable-container',
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
      :host {
        font-size: 1.6em;
        line-height: 1.6em;
      }
  `]
})
export class HeadingTwoBlock extends EditableBlock {
}
