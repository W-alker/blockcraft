import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {TableRowBlockModel} from "./index";

@Component({
  selector: 'tr.table-row-block',
  template: `
    <ng-container #childrenContainer></ng-container>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // '[style.height.px]': 'props.height',
  }
})
export class TableRowBlockComponent extends BaseBlockComponent<TableRowBlockModel> {

}
