import {ChangeDetectionStrategy, Component} from "@angular/core";
import {EditableBlock} from "@core";

@Component({
  selector: 'h1',
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeadingOneBlock extends EditableBlock{
}
