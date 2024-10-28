import {ChangeDetectionStrategy, Component} from "@angular/core";
import {EditableBlock} from "../../core";

@Component({
  selector: 'h5.editable-container',
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
      :host {
        font-size: 1.2em;
        line-height: 1.2em;
      }
  `]
})
export class HeadingFourBlock extends EditableBlock{

}
