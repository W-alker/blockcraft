import {Component} from "@angular/core";
import {EditableBlock} from "../../core";

@Component({
  selector: 'div.bullet-list.editable-container',
  template: ``,
  styles: [`
      :host {
          position: relative;
          padding-left: 1.2em;
      }

      :host::before {
          position: absolute;
          text-align: center;
          padding-left: .5em;
          left: 0;
          content: '●';
          color: var(--bf-anchor);
          font-size: .5em;
      }
  `],
  standalone: true,
})
export class BulletListBlock extends EditableBlock {

}
