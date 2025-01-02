import {Component} from "@angular/core";
import {EditableBlock} from "../../core";

@Component({
  selector: 'blockquote.bf-multi-line.editable-container',
  template: ``,
  styles: [`
    :host {
      padding: 6px 8px;
      border-left: 4px solid #ccc;
      background: #f9f9f9;

      &.selected {
        background-color: var(--bf-selected);
      }
    }
  `],
  standalone: true,
})
export class BlockquoteBlock extends EditableBlock{

}
