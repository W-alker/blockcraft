import {Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";

@Component({
  selector: 'div.divider-block',
  template: `
    <div class="divide-line" contenteditable="false"></div>
  `,
  standalone: true
})
export class DividerBlockComponent extends BaseBlockComponent {
}


