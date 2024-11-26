import { ChangeDetectionStrategy, Component } from "@angular/core";
import { EditableBlock } from "../../core";
@Component({
  selector: 'h2.editable-container',
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [``]
})
export class HeadingOneBlock extends EditableBlock {
  override placeholder = '一级标题'
}
