import {Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";

@Component({
  selector: 'div.divider-block',
  template: `
    <hr contenteditable="false" />
  `,
  styles: [`
    :host {
      padding: 1em 0;
      cursor: text;
    }
    hr {
      height: 1px;
      background-color: #000;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      font-size: 0;
    }
  `],
  standalone: true,
  host: {
    // '[attr.contenteditable]': 'false'
  }
})
export class DividerBlockComponent extends BaseBlockComponent {
}


