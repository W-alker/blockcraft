import { ChangeDetectionStrategy, Component } from "@angular/core";
import { EditableBlock } from "../../core";

@Component({
  selector: 'h5.editable-container',
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [``]
})
export class HeadingFourBlock extends EditableBlock {

}
