import { ChangeDetectionStrategy, Component } from "@angular/core";
import { EditableBlock } from "../../core";
@Component({
  selector: 'h3.editable-container',
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [``]
})
export class HeadingTwoBlock extends EditableBlock {
}
