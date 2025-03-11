import {ChangeDetectionStrategy, Component} from "@angular/core";
import {EditableBlockComponent} from "../../framework";

@Component({
  selector: 'div.code-block',
  template: `
    <div class="edit-container"></div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodeBlockComponent extends EditableBlockComponent {

}
