import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
} from '@angular/core'
import { NgForOf, NgIf } from '@angular/common'
import { NzTooltipDirective } from 'ng-zorro-antd/tooltip'
import { NzDropDownDirective, NzDropdownMenuComponent } from 'ng-zorro-antd/dropdown'
import { Subscription } from 'rxjs'
import { ColorGroup, ColorPickerComponent } from '../../../components'
import { nextTick } from '../../../global'
import { TableCellBlockModel } from '../index'
import { mergeTableCells, unMergeTableCell } from '../callback'

type TableCell = BlockCraft.IBlockComponents['table-cell']

interface AlignItem {
  name: 'textAlign' | 'verticalAlign'
  value: string | undefined
  icon: string
  text: string
}

const HORIZON_ALIGN_LIST: AlignItem[] = [
  { name: 'textAlign', value: undefined, icon: 'bc_zuoduiqi', text: '左对齐' },
  { name: 'textAlign', value: 'center', icon: 'bc_juzhongduiqi', text: '居中对齐' },
  { name: 'textAlign', value: 'right', icon: 'bc_youduiqi', text: '右对齐' },
]

const VERTICAL_ALIGN_LIST: AlignItem[] = [
  { name: 'verticalAlign', value: 'top', icon: 'bc_dingbuduiqi', text: '顶部对齐' },
  { name: 'verticalAlign', value: 'middle', icon: 'bc_juzhongduiqi1', text: '垂直对齐' },
  { name: 'verticalAlign', value: 'bottom', icon: 'bc_dibuduiqi', text: '底部对齐' },
]

export type TableSelectionKind = 'cell' | 'cells' | 'row' | 'col'

@Component({
  selector: 'table-structure-toolbar',
  standalone: true,
  imports: [
    NgForOf,
    NgIf,
    NzTooltipDirective,
    NzDropDownDirective,
    NzDropdownMenuComponent,
    ColorPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'contenteditable': 'false',
  },
  template: `
    <div class="table-structure-toolbar">
      <ng-container *ngIf="showRowOps">
        <button type="button"
                class="table-structure-toolbar__item"
                nz-tooltip
                [nzTooltipTitle]="'在上方插入行'"
                (click)="insertRowBefore($event)">
          <i class="bc_icon bc_shangjiantou-jia"></i>
        </button>
        <button type="button"
                class="table-structure-toolbar__item"
                nz-tooltip
                [nzTooltipTitle]="'在下方插入行'"
                (click)="insertRowAfter($event)">
          <i class="bc_icon bc_xiajiantou-jia"></i>
        </button>
        <button type="button"
                class="table-structure-toolbar__item table-structure-toolbar__item--danger"
                nz-tooltip
                [nzTooltipTitle]="'删除当前行'"
                (click)="deleteRow($event)">
          <i class="bc_icon bc_shanchu-2"></i>
        </button>
      </ng-container>
      <span class="table-structure-toolbar__divider" *ngIf="showRowOps && showColOps"></span>
      <ng-container *ngIf="showColOps">
        <button type="button"
                class="table-structure-toolbar__item"
                nz-tooltip
                [nzTooltipTitle]="'在左侧插入列'"
                (click)="insertColBefore($event)">
          <i class="bc_icon bc_zuojiantou-jia"></i>
        </button>
        <button type="button"
                class="table-structure-toolbar__item"
                nz-tooltip
                [nzTooltipTitle]="'在右侧插入列'"
                (click)="insertColAfter($event)">
          <i class="bc_icon bc_youjiantou-jia"></i>
        </button>
        <button type="button"
                class="table-structure-toolbar__item table-structure-toolbar__item--danger"
                nz-tooltip
                [nzTooltipTitle]="'删除当前列'"
                (click)="deleteCol($event)">
          <i class="bc_icon bc_shanchu-2"></i>
        </button>
      </ng-container>

      <ng-container *ngIf="showHeaderRowToggle || showHeaderColToggle">
        <span class="table-structure-toolbar__divider"></span>
        <button *ngIf="showHeaderRowToggle"
                type="button"
                class="table-structure-toolbar__item"
                [class.active]="!!table.props.rowHead"
                nz-tooltip
                [nzTooltipTitle]="table.props.rowHead ? '取消标题行' : '设为标题行'"
                (click)="toggleHeaderRow($event)">
          <i class="bc_icon bc_biaotihang"></i>
        </button>
        <button *ngIf="showHeaderColToggle"
                type="button"
                class="table-structure-toolbar__item"
                [class.active]="!!table.props.colHead"
                nz-tooltip
                [nzTooltipTitle]="table.props.colHead ? '取消标题列' : '设为标题列'"
                (click)="toggleHeaderColumn($event)">
          <i class="bc_icon bc_biaotilie"></i>
        </button>
      </ng-container>

      <ng-container *ngIf="canToggleMerge">
        <span class="table-structure-toolbar__divider"></span>
        <button type="button"
                class="table-structure-toolbar__item"
                [class.active]="isMerged"
                nz-tooltip
                [nzTooltipTitle]="isMerged ? '解除合并' : '合并单元格'"
                (click)="toggleMerge($event)">
          <i class="bc_icon bc_hebingdanyuange1"></i>
        </button>
      </ng-container>

      <span class="table-structure-toolbar__divider"></span>
      <button type="button"
              class="table-structure-toolbar__item table-structure-toolbar__item--expandable"
              nz-dropdown
              [nzDropdownMenu]="alignMenu"
              nzPlacement="bottomCenter"
              [(nzVisible)]="dropdownVisibleMap.align"
              [class.active]="dropdownVisibleMap.align"
              nz-tooltip
              [nzTooltipTitle]="'对齐方式'"
              (click)="$event.preventDefault(); $event.stopPropagation()">
        <i class="bc_icon bc_zuoduiqi"></i>
        <i class="bc_icon bc_xiajaintou table-structure-toolbar__caret"></i>
      </button>
      <button type="button"
              class="table-structure-toolbar__item table-structure-toolbar__item--expandable"
              nz-dropdown
              [nzDropdownMenu]="colorMenu"
              nzPlacement="bottomCenter"
              [(nzVisible)]="dropdownVisibleMap.color"
              [class.active]="dropdownVisibleMap.color"
              nz-tooltip
              [nzTooltipTitle]="'颜色'"
              (click)="$event.preventDefault(); $event.stopPropagation()">
        <i class="bc_icon bc_sepan"></i>
        <i class="bc_icon bc_xiajaintou table-structure-toolbar__caret"></i>
      </button>

      <span class="table-structure-toolbar__divider"></span>
      <button type="button"
              class="table-structure-toolbar__item"
              [class.active]="isFullscreen"
              nz-tooltip
              [nzTooltipTitle]="isFullscreen ? '退出全屏' : '全屏'"
              (click)="toggleFullscreen($event)">
        <i class="bc_icon"
           [class.bc_arrow-expand]="!isFullscreen"
           [class.bc_x-circle-contained]="isFullscreen"></i>
      </button>
    </div>

    <nz-dropdown-menu #alignMenu="nzDropdownMenu">
      <div class="table-structure-toolbar__menu" (mousedown)="$event.preventDefault()">
        <button *ngFor="let item of HORIZON_ALIGN_LIST"
                type="button"
                class="table-structure-toolbar__item"
                [class.active]="textAlign === item.value"
                nz-tooltip
                [nzTooltipTitle]="item.text"
                (click)="onAlignPicked($event, item)">
          <i [class]="'bc_icon ' + item.icon"></i>
        </button>
        <span class="table-structure-toolbar__divider"></span>
        <button *ngFor="let item of VERTICAL_ALIGN_LIST"
                type="button"
                class="table-structure-toolbar__item"
                [class.active]="verticalAlign === item.value"
                nz-tooltip
                [nzTooltipTitle]="item.text"
                (click)="onAlignPicked($event, item)">
          <i [class]="'bc_icon ' + item.icon"></i>
        </button>
      </div>
    </nz-dropdown-menu>

    <nz-dropdown-menu #colorMenu="nzDropdownMenu">
      <div (mousedown)="$event.preventDefault()">
        <bc-color-picker [activeColors]="activeColors"
                         (colorPicked)="onColorPicked($event)"></bc-color-picker>
      </div>
    </nz-dropdown-menu>
  `,
  styles: [`
    :host {
      display: block;
    }

    .table-structure-toolbar {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      border: 1px solid var(--bc-float-toolbar-divider-color);
      border-radius: 12px;
      background: var(--bc-float-toolbar-bg);
      box-shadow: var(--bc-float-toolbar-shadow);
    }

    .table-structure-toolbar__item {
      border: 0;
      background: transparent;
      border-radius: 8px;
      color: inherit;
      cursor: pointer;
      display: inline-grid;
      grid-auto-flow: column;
      place-items: center;
      align-items: center;
      height: 32px;
      padding: 0 6px;
      min-width: 32px;
      gap: 2px;
    }

    .table-structure-toolbar__item > .bc_icon {
      font-size: 15px;
    }

    .table-structure-toolbar__item:hover,
    .table-structure-toolbar__item.active {
      background: var(--bc-float-toolbar-item-active-bg);
    }

    .table-structure-toolbar__item--danger:hover {
      color: var(--bc-error-color);
      background: var(--bc-error-background-color);
    }

    .table-structure-toolbar__item--expandable .table-structure-toolbar__caret {
      font-size: 10px;
      opacity: 0.7;
    }

    .table-structure-toolbar__divider {
      width: 1px;
      align-self: stretch;
      background: var(--bc-float-toolbar-divider-color);
    }

    .table-structure-toolbar__menu {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      border: 1px solid var(--bc-float-toolbar-divider-color);
      border-radius: 12px;
      background: var(--bc-float-toolbar-bg);
      box-shadow: var(--bc-float-toolbar-shadow);
    }
  `],
})
export class TableStructureToolbarComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) table!: BlockCraft.IBlockComponents['table']
  @Input({ required: true }) rowIndex!: number
  @Input() rowCount = 1
  @Input({ required: true }) colIndex!: number
  @Input() colCount = 1
  @Input() selectionKind: TableSelectionKind = 'cell'

  protected readonly HORIZON_ALIGN_LIST = HORIZON_ALIGN_LIST
  protected readonly VERTICAL_ALIGN_LIST = VERTICAL_ALIGN_LIST

  protected dropdownVisibleMap = { align: false, color: false }
  protected activeColors: Record<string, string | null> = {}
  protected textAlign: string | undefined = undefined
  protected verticalAlign: string | null = null
  protected isMerged = false
  protected canToggleMerge = false
  protected showRowOps = true
  protected showColOps = true
  protected showHeaderRowToggle = false
  protected showHeaderColToggle = false
  protected isFullscreen = false

  private _selectedCells: TableCell[] = []
  private _fullscreenSub?: Subscription

  constructor(private readonly cdr: ChangeDetectorRef) {}

  @HostListener('mousedown', ['$event'])
  onHostMouseDown(event: MouseEvent) {
    event.preventDefault()
  }

  ngOnInit() {
    this._syncCellState()
    // OnPush 下需要订阅状态流并 markForCheck，否则全屏切换后图标不会更新
    const stream$ = this.table?.isFullscreen$
    if (stream$) {
      this._fullscreenSub = stream$.subscribe(value => {
        this.isFullscreen = value
        this.cdr.markForCheck()
      })
    }
  }

  ngOnDestroy() {
    this._fullscreenSub?.unsubscribe()
  }

  ngOnChanges(changes: SimpleChanges) {
    if (
      changes['rowIndex'] || changes['rowCount']
      || changes['colIndex'] || changes['colCount']
      || changes['selectionKind']
    ) {
      this._syncCellState()
    }
  }

  toggleFullscreen(event: MouseEvent) {
    this._consume(event)
    this.table.toggleFullscreen()
  }

  private _syncCellState() {
    this.showRowOps = this.selectionKind !== 'col'
    this.showColOps = this.selectionKind !== 'row'

    const startRow = this.rowIndex
    const endRow = this.rowIndex + this.rowCount - 1
    const startCol = this.colIndex
    const endCol = this.colIndex + this.colCount - 1
    this.showHeaderRowToggle = startRow === 0
    this.showHeaderColToggle = startCol === 0
    const matrix = this.table.getCellsMatrixByCoordinates([startRow, startCol], [endRow, endCol])
    const cells = matrix.flat(1) as TableCell[]
    this._selectedCells = cells

    if (!cells.length) {
      this.canToggleMerge = false
      this.isMerged = false
      this.activeColors = {}
      this.textAlign = undefined
      this.verticalAlign = null
      this.cdr.markForCheck()
      return
    }

    const first = cells[0]
    const isSingleMergedCell = cells.length === 1 && (
      !!first.props.rowspan && first.props.rowspan > 1
      || !!first.props.colspan && first.props.colspan > 1
    )
    let commonColor: string | null = first.props.color ?? null
    let commonBackColor: string | null = first.props.backColor ?? null
    let commonVerticalAlign: string | null = (first.props as any).verticalAlign ?? null
    let commonTextAlign: string | undefined = (first.props as any).textAlign
    let visibleCount = 0

    for (const cell of cells) {
      if (cell.props.display !== 'none') visibleCount++
      if (cell.props.color !== commonColor) commonColor = null
      if (cell.props.backColor !== commonBackColor) commonBackColor = null
      const va = (cell.props as any).verticalAlign ?? null
      if (va !== commonVerticalAlign) commonVerticalAlign = null
      const ta = (cell.props as any).textAlign
      if (ta !== commonTextAlign) commonTextAlign = undefined
    }

    this.activeColors = { color: commonColor, backColor: commonBackColor }
    this.textAlign = commonTextAlign
    this.verticalAlign = commonVerticalAlign
    this.isMerged = isSingleMergedCell || (cells.length > 1 && visibleCount === 1)
    this.canToggleMerge = isSingleMergedCell || cells.length > 1
    this.cdr.markForCheck()
  }

  private _consume(event: Event) {
    event.preventDefault()
    event.stopPropagation()
  }

  insertRowBefore(event: MouseEvent) {
    this._consume(event)
    this.table.addRow(this.rowIndex)
    nextTick().then(() => this.table.refreshTableMenuFromSelection?.())
  }

  insertRowAfter(event: MouseEvent) {
    this._consume(event)
    this.table.addRow(this.rowIndex + this.rowCount)
    nextTick().then(() => this.table.refreshTableMenuFromSelection?.())
  }

  deleteRow(event: MouseEvent) {
    this._consume(event)
    this.table.deleteRows(this.rowIndex, this.rowCount)
    nextTick().then(() => {
      if (!this.table.rowLength) return
      const nextIndex = Math.min(this.rowIndex, this.table.rowLength - 1)
      this.table.onRowBarSelected([nextIndex, nextIndex])
    })
  }

  insertColBefore(event: MouseEvent) {
    this._consume(event)
    this.table.addColumn(this.colIndex)
    nextTick().then(() => this.table.refreshTableMenuFromSelection?.())
  }

  insertColAfter(event: MouseEvent) {
    this._consume(event)
    this.table.addColumn(this.colIndex + this.colCount)
    nextTick().then(() => this.table.refreshTableMenuFromSelection?.())
  }

  deleteCol(event: MouseEvent) {
    this._consume(event)
    this.table.deleteColumns(this.colIndex, this.colCount)
    nextTick().then(() => {
      if (!this.table.colLength) return
      const nextIndex = Math.min(this.colIndex, this.table.colLength - 1)
      this.table.onColBarSelected([nextIndex, nextIndex])
    })
  }

  toggleHeaderRow(event: MouseEvent) {
    this._consume(event)
    this.table.toggleHeaderRow()
    this.cdr.markForCheck()
    nextTick().then(() => this.table.refreshTableMenuFromSelection?.())
  }

  toggleHeaderColumn(event: MouseEvent) {
    this._consume(event)
    this.table.toggleHeaderColumn()
    this.cdr.markForCheck()
    nextTick().then(() => this.table.refreshTableMenuFromSelection?.())
  }

  toggleMerge(event: MouseEvent) {
    this._consume(event)
    if (!this.canToggleMerge) return
    if (this.isMerged) {
      const source = this._selectedCells.find(cell => cell.props.display !== 'none')
      if (source) unMergeTableCell.call(this.table, source)
    } else {
      const start = [this.rowIndex, this.colIndex]
      const end = [this.rowIndex + this.rowCount - 1, this.colIndex + this.colCount - 1]
      mergeTableCells.call(this.table, start, end)
    }
    this._syncCellState()
    nextTick().then(() => this.table.refreshTableMenuFromSelection?.())
  }

  onAlignPicked(event: MouseEvent, item: AlignItem) {
    this._consume(event)
    this._setCellsProp(item.name, item.value)
    if (item.name === 'textAlign') this.textAlign = item.value
    else this.verticalAlign = item.value ?? null
    this.dropdownVisibleMap.align = false
    this.cdr.markForCheck()
  }

  onColorPicked(obj: { type: string, color: string | null, group: ColorGroup }) {
    this._setCellsProp(obj.type as keyof TableCellBlockModel['props'], obj.color)
    this.activeColors = { ...this.activeColors, [obj.type]: obj.color }
    this.cdr.markForCheck()
  }

  private _setCellsProp(prop: keyof TableCellBlockModel['props'] | string, value: unknown) {
    this._selectedCells.forEach(cell => {
      cell.updateProps({ [prop]: value } as Partial<TableCellBlockModel['props']>)
    })
  }
}
