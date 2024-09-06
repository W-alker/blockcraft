import {ChangeDetectionStrategy, Component, HostBinding} from "@angular/core";
import {EditableBlock} from "@core";

@Component({
  selector: 'h3.editable-container',
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeadingThreeBlock extends EditableBlock{

}
