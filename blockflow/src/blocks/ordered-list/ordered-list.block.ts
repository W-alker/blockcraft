import {Component} from "@angular/core";
import {EditableBlock} from "@core";

@Component({
  selector: 'div.ordered-list',
  template: ``,
  styles: [`
      :host {
      }
      :host::before {
        color: var(--bf-anchor);
      }
  `],
  standalone: true,
})
export class OrderedListBlock extends EditableBlock {
}
