import {ChangeDetectionStrategy, Component} from "@angular/core";
import {EditableBlock} from "../../core";
@Component({
  selector: 'h2.editable-container',
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
      :host {
        font-size: 1.8em;
        line-height: 1.8em;
      }
  `]
})
export class HeadingOneBlock extends EditableBlock{

}
