import {ChangeDetectionStrategy, Component, HostBinding} from "@angular/core";
import {EditableBlock} from "@core";

@Component({
  selector: 'h2.editable-container',
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeadingTwoBlock extends EditableBlock {
}
