import {Component} from "@angular/core";
import {EditableBlock} from "@core";

@Component({
  selector: 'div.bullet-list',
  template: ``,
  styles: [`
      :host {
          position: relative;
          padding-left: 1em;
      }

      :host::before {
          position: absolute;
          top: 50%;
          left: 0;
          transform: translateY(-0.2em);
          content: '';
          width: .4em;
          height: .4em;
          border-radius: 50%;
          background-color: var(--bf-anchor);
          line-height: var(--bf-lh);
          margin-right: .6em;
      }
  `],
  standalone: true,
})
export class BulletListBlock extends EditableBlock {

}
