import {Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {TableRowBlockModel} from "./index";

@Component({
  selector: 'tr.table-row-block',
  template: `
    <ng-container #childrenContainer></ng-container>
  `,
  standalone: true
})
export class TableRowBlockComponent extends BaseBlockComponent<TableRowBlockModel> {

}
