import {ChangeDetectionStrategy, Component} from '@angular/core';
import {EditableBlock} from "../../core";

@Component({
  selector: 'p.editable-container',
  standalone: true,
  imports: [],
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
  :host {
    &.selected {
      background-color: var(--bf-selected);
    }
  }
  `]
})
export class ParagraphBlock extends EditableBlock {
}
