import {ChangeDetectionStrategy, Component, HostBinding} from "@angular/core";
import {EditableBlock} from "@core";

@Component({
  selector: 'h1.editable-container',
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeadingOneBlock extends EditableBlock{

}
