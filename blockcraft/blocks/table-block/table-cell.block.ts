import {Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {TableCellBlockModel} from "./index";

@Component({
  selector: 'td.table-cell-block',
  template: `
    <ng-container #childrenContainer></ng-container>
  `,
  standalone: true
})
export class TableCellBlockComponent extends BaseBlockComponent<TableCellBlockModel> {

}
