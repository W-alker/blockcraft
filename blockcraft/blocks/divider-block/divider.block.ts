import {Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";

@Component({
  selector: 'div.divider-block',
  template: `
    <hr contenteditable="false" />
  `,
  standalone: true
})
export class DividerBlockComponent extends BaseBlockComponent {
}


