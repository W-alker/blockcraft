import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {TableCellBlockModel} from "./index";

@Component({
  selector: 'td.table-cell-block',
  template: `
    <div class="table-cell__children-wrapper" [style.align-items]="props.textAlign" [style.text-align]="props.textAlign">
      <ng-container #childrenContainer></ng-container>
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.vertical-align]': 'props.verticalAlign',
    '[style.color]': 'props.color',
    '[style.background-color]': 'props.backColor',
    '[attr.rowspan]': 'props.rowspan',
    '[attr.colspan]': 'props.colspan',
    '[style.display]': 'props.display',
  }
})
export class TableCellBlockComponent extends BaseBlockComponent<TableCellBlockModel> {

  async clearContent() {
    if (this.props.display === 'none' || !this.hasContent) return
    const np = this.doc.schemas.createSnapshot('paragraph', [])
    this.doc.crud.insertBlocks(this.id, 0, [np])
    this.doc.crud.deleteBlocks(this.id, 1, this.childrenLength)
  }

  get hasContent() {
    return this.childrenLength > 1 || this.firstChildren?.flavour !== 'paragraph' || this.firstChildren?.textContent()
  }

}
