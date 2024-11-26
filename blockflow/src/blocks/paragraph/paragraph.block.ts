import {ChangeDetectionStrategy, Component} from '@angular/core';
import {EditableBlock} from "../../core";

@Component({
  selector: 'p.editable-container',
  standalone: true,
  imports: [],
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParagraphBlock extends EditableBlock {
}
