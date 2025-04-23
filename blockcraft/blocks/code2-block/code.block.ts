import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {CodeBlockModel} from "./index";

@Component({
  selector: 'div.code-block',
  template: `
    <ng-container #childrenContainer></ng-container>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodeBlockComponent extends BaseBlockComponent<CodeBlockModel> {

}
