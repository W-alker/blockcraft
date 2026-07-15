import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {TableCellBlockModel} from "./index";

@Component({
  selector: 'td.table-cell-block',
  template: `
    <div class="table-cell__children-wrapper children-render-container"
         [attr.data-align]="props.textAlign">
      <!--      <ng-container #childrenContainer></ng-container>-->
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.vertical-align]': 'props.verticalAlign',
    '[style.color]': 'props.color',
    '[style.background-color]': 'props.backColor',
    '[attr.rowspan]': 'pgRowspan',
    '[attr.colspan]': 'pgColspan',
    '[style.display]': 'pgDisplay',
  }
})
export class TableCellBlockComponent extends BaseBlockComponent<TableCellBlockModel> {

  /**
   * 分页视图层覆盖（仅屏幕分页拆分跨页合并单元格时用，不写 Yjs/model）。
   * 把竖向合并单元格在跨页边界拆成两段：源单元格 rowspan 缩到本页、续段单元格 un-hide 接续下页。
   * 只覆盖给定的键，其余回落到 model props。`null` = 清除覆盖、完全用 props。
   */
  private _pgRender: { rowspan?: number | null; colspan?: number | null; display?: string | null } | null = null

  setPaginationRender(render: { rowspan?: number | null; colspan?: number | null; display?: string | null } | null): void {
    this._pgRender = render
    // 同步落 DOM：host binding `[attr.rowspan]`/`[style.display]` 走 Angular CD（异步），
    // 但分页测量需要「清掉拆分覆盖后**立刻**量自然几何」——CD 未跑时 getBoundingClientRect 读到的还是
    // 旧（已拆分）布局 → 测量反馈环、合并单元格跨页疯狂抖动。这里直接同步写 DOM（值仍取自 pg* getter，
    // 与 binding 同源，下次 CD 复算同值不冲突），让 getPaginationGeometry 的 clear→measure→restore 即时生效。
    const el = this.hostElement
    if (el) {
      const rs = this.pgRowspan
      if (rs != null) el.setAttribute('rowspan', String(rs)); else el.removeAttribute('rowspan')
      const cs = this.pgColspan
      if (cs != null) el.setAttribute('colspan', String(cs)); else el.removeAttribute('colspan')
      el.style.display = this.pgDisplay != null ? String(this.pgDisplay) : ''
    }
    this.changeDetectorRef.markForCheck()
  }

  get pgRowspan() {
    return this._pgRender && this._pgRender.rowspan !== undefined ? this._pgRender.rowspan : this.props.rowspan
  }
  get pgColspan() {
    return this._pgRender && this._pgRender.colspan !== undefined ? this._pgRender.colspan : this.props.colspan
  }
  get pgDisplay() {
    return this._pgRender && this._pgRender.display !== undefined ? this._pgRender.display : this.props.display
  }

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
