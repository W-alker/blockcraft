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

  addColumn(index: number, count: number = 1) {
    const newCols = new Array(count).fill(0).map(() => this.doc.schemas.createSnapshot('table-cell', []))
    this.doc.crud.insertBlocks(this.id, index, newCols)
  }

}
