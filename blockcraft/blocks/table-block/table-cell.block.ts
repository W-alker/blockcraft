import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent, ORIGIN_SKIP_SYNC} from "../../framework";
import {TableCellBlockModel} from "./index";

@Component({
  selector: 'td.table-cell-block',
  template: `
    <div class="table-cell__children-wrapper">
      <ng-container #childrenContainer></ng-container>
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.vertical-align]': 'props.verticalAlign',
    '[style.text-align]': 'props.textAlign',
    '[style.color]': 'props.color',
    '[style.background-color]': 'props.backColor',
    '[attr.rowspan]': 'props.rowspan',
    '[attr.colspan]': 'props.colspan',
    '[style.display]': 'props.display',
  }
})
export class TableCellBlockComponent extends BaseBlockComponent<TableCellBlockModel> {

  clearContent() {
    if (this.props.display === 'none' || !this.hasContent) return
    this.doc.crud.transact(async () => {
      const np = this.doc.schemas.createSnapshot('paragraph', [])
      await this.doc.crud.insertBlocks(this.id, 0, [np])
      this.doc.crud.deleteBlocks(this.id, 1, this.childrenLength)
    }, ORIGIN_SKIP_SYNC)
  }

  get hasContent() {
    return this.childrenLength > 1 || this.firstChildren?.textContent()
  }

}
