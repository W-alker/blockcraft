import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output} from "@angular/core";
import {
  BcFloatToolbarComponent,
  BcFloatToolbarItemComponent,
  BcOverlayTriggerDirective,
  ColorGroup,
  ColorPickerComponent
} from "../../../components";
import {NgForOf, NgIf} from "@angular/common";
import {TableCellBlockComponent} from "../table-cell.block";
import {TableRowBlockComponent} from "../table-row.block";
import {TableCellBlockModel} from "../index";
import {ORIGIN_SKIP_SYNC} from "../../../framework";
import {mergeTableCells, unMergeTableCell} from "../callback";
import {NzDropDownDirective, NzDropdownMenuComponent} from "ng-zorro-antd/dropdown";
import {NzTooltipDirective} from "ng-zorro-antd/tooltip";

interface CellToolbarItem {
  name: string,
  value?: any,
  icon: string,
  text?: string
}

const HORIZON_ALIGN_LIST: CellToolbarItem[] = [
  {name: 'textAlign', value: undefined, icon: 'bc_zuoduiqi', text: '左对齐'},
  {name: 'textAlign', value: 'center', icon: 'bc_juzhongduiqi', text: '居中对齐'},
  {name: 'textAlign', value: 'right', icon: 'bc_youduiqi', text: '右对齐'}
]
const VERTICAL_ALIGN_LIST: CellToolbarItem[] = [
  {name: 'verticalAlign', value: 'top', icon: 'bc_dingbuduiqi', text: '顶部对齐'},
  {name: 'verticalAlign', value: 'middle', icon: 'bc_juzhongduiqi1', text: '垂直对齐'},
  {name: 'verticalAlign', value: 'bottom', icon: 'bc_dibuduiqi', text: '底部对齐'}
]

@Component({
  selector: 'cell-toolbar',
  template: `
    <bc-float-toolbar (onItemClick)="onItemClicked($event)">
      <bc-float-toolbar-item icon="bc_hebingdanyuange1" name="merge" value="true"
                             [nz-tooltip]="isMerged ? '解除合并' : '合并单元格'"
                             [active]="isMerged"/>
      <bc-float-toolbar-item *ngIf="showOptions.showRowHead" title="设置标题行" [active]="table.props.rowHead"
                             icon="bc_biaotihang" name="rowHead" value="true"/>
      <bc-float-toolbar-item *ngIf="showOptions.showColHead" title="设置标题列" [active]="table.props.colHead"
                             icon="bc_biaotilie" name="colHead" value="true"/>

      <span class="bc-float-toolbar__divider"></span>

      <bc-float-toolbar-item icon="bc_zuoduiqi" [expandable]="true" nz-dropdown [nzDropdownMenu]="alignFloatBar" [(nzVisible)]="dropdownVisibleMap.alignFloatBar"
                             nzPlacement="bottomCenter" [class.active]="dropdownVisibleMap.alignFloatBar"/>

      <bc-float-toolbar-item icon="bc_sepan" nz-dropdown [nzDropdownMenu]="colorPicker" [(nzVisible)]="dropdownVisibleMap.colorPicker"
                             nzPlacement="bottomCenter" [class.active]="dropdownVisibleMap.colorPicker"/>

      <bc-float-toolbar-item *ngIf="showOptions.showDelete" icon="bc_shanchu-2" name="delete" value="true"/>
    </bc-float-toolbar>

    <nz-dropdown-menu #alignFloatBar="nzDropdownMenu">
      <bc-float-toolbar [direction]="'column'" (onItemClick)="onItemClicked($event)">

        <bc-float-toolbar-item *ngFor="let item of HORIZON_ALIGN_LIST" [name]="item.name"
                               [active]="textAlign === item.value"
                               [value]="item.value" [icon]="item.icon">{{ item.text }}
        </bc-float-toolbar-item>
        <span class="bc-float-toolbar__divider"></span>
        <bc-float-toolbar-item *ngFor="let item of VERTICAL_ALIGN_LIST" [name]="item.name"
                               [active]="verticalAlign === item.value"
                               [value]="item.value" [icon]="item.icon">{{ item.text }}
        </bc-float-toolbar-item>

      </bc-float-toolbar>
    </nz-dropdown-menu>
    <!--    <ng-template #alignFloatBar>-->

    <!--    </ng-template>-->

    <nz-dropdown-menu #colorPicker="nzDropdownMenu">
      <bc-color-picker (colorPicked)="onColorPicked($event)" [activeColors]="activeColors"></bc-color-picker>
    </nz-dropdown-menu>

    <!--    <ng-template #colorPicker>-->
    <!--    </ng-template>-->
  `,
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    BcOverlayTriggerDirective,
    ColorPickerComponent,
    NgForOf,
    NgIf,
    NzDropdownMenuComponent,
    NzDropDownDirective,
    NzTooltipDirective
  ],
  styles: [`
    bc-float-toolbar-item[name="delete"]:hover {
      color: var(--bc-error-color);
      background: var(--bc-error-background-color);
    }
  `],
  standalone: true,
})
export class CellToolbarComponent {
  private _options: { type: 'col' | 'row' | 'cells', index?: number, count?: number } = {type: 'cells'}
  @Input()
  set options(options: typeof this._options) {
    this.showOptions = {
      showDelete: options.type !== 'cells',
      showRowHead: options.type === 'row' && options.index === 0,
      showColHead: options.type === 'col' && options.index === 0,
    }
    this._options = options
  }

  protected showOptions = {
    showDelete: false,
    showRowHead: false,
    showColHead: false
  }

  protected activeColors: Record<string, string | null> = {}

  protected verticalAlign: string | null = null
  protected textAlign?: string

  dropdownVisibleMap = {
    alignFloatBar: false,
    colorPicker: false
  }

  @Input({required: true})
  doc!: BlockCraft.Doc

  @Input({required: true})
  table!: BlockCraft.IBlockComponents['table']

  @Output()
  onClose$ = new EventEmitter<void>()

  @Output()
  onDestroy = new EventEmitter<void>()

  @Output()
  onPositionChanged = new EventEmitter()

  protected isMerged = false

  constructor(private changeDetectorRef: ChangeDetectorRef) {
  }

  private _selectedCells: BlockCraft.IBlockComponents['table-cell'][] = []

  ngOnInit() {
    const coordinates = this.table.getSelectedCoordinates()
    if (!coordinates) {
      this.onClose$.emit()
      return
    }
    const cells = this.table.getCellsMatrixByCoordinates(coordinates.start, coordinates.end).flat(1)
    this._selectedCells = cells
    this._setIsMerged()

    const firstCell = cells[0]
    // 比对颜色
    let commonColor = firstCell.props.color ?? null
    let commonBackColor = firstCell.props.backColor ?? null
    // 比对居中
    let commonVerticalAlign = firstCell.props.verticalAlign
    let commonTextAlign = firstCell.props.textAlign
    for (let i = 1; i < cells.length; i++) {
      const cell = cells[i]
      if (cell.props.color !== commonColor) commonColor = null
      if (cell.props.backColor !== commonBackColor) commonBackColor = null
      // @ts-expect-error
      if (cell.props.verticalAlign !== commonVerticalAlign) commonVerticalAlign = null
      // @ts-expect-error
      if (cell.props.textAlign !== commonTextAlign) commonTextAlign = null
    }
    this.activeColors = {
      color: commonColor,
      backColor: commonBackColor
    }
    this.verticalAlign = commonVerticalAlign
    this.textAlign = commonTextAlign
  }

  private _setIsMerged() {
    if (this._options.type === 'cells') {
      let cnt = 0
      for (const cell of this._selectedCells) {
        if (cell.props.display === 'none') continue
        cnt++
        if (cnt > 1) break
      }
      this.isMerged = cnt === 1
    } else {
      this.isMerged = this._selectedCells.some(v => v.props.colspan || v.props.rowspan || v.props.display === 'none')
    }
  }

  onColorPicked(obj: { type: string, color: string | null, group: ColorGroup }) {
    this.setSelectedDescendantsProps(obj.type, obj.color)
    this.activeColors = {
      ...this.activeColors,
      [obj.type]: obj.color
    }
  }

  onItemClicked(item: BcFloatToolbarItemComponent) {
    switch (item.name) {
      case 'textAlign':
        this.setSelectedDescendantsProps('textAlign', item.value)
        this.textAlign = item.value
        break
      case 'verticalAlign':
        this.setSelectedDescendantsProps('verticalAlign', item.value)
        this.verticalAlign = item.value
        break
      case 'merge':
        this.isMerged ? this.unMergeCell() : this.mergeCells()
        break
      case 'delete':
        switch (this._options.type) {
          case 'col':
            this.table.deleteColumns(this._options.index!, this._options.count)
            break
          case 'row':
            this.table.deleteRows(this._options.index!, this._options.count)
            break
        }
        this.onClose$.emit()
        break
      case 'colHead':
        this.table.updateProps({colHead: !this.table.props.colHead})
        break
      case 'rowHead':
        this.table.updateProps({rowHead: !this.table.props.rowHead})
        break
    }

  }

  ngOnDestroy() {
    this.onDestroy.emit()
  }

  setSelectedDescendantsProps(prop: keyof TableCellBlockModel['props'], value: any) {
    this._selectedCells.forEach(block => {
      block.updateProps({[prop]: value})
    })
  }

  private mergeCells() {
    if (this.isMerged) return
    const coordinates = this.table.getSelectedCoordinates()
    if (!coordinates) return
    mergeTableCells.call(this.table, coordinates.start, coordinates.end)
    this.isMerged = true
    this.onClose$.emit()
  }

  private unMergeCell() {
    if (this._options.type === 'cells') {
      this._setIsMerged()
      if (!this.isMerged) return
      unMergeTableCell.call(this.table, this._selectedCells[0])
    } else {
      // 调整后的范围内全部设置非合并状态
      const coordinates = this.table.getSelectedCoordinates()
      if (!coordinates) return
      const adjustedSelection = this.table.confirmSelection(coordinates.start, coordinates.end)
      const cells = this.table.getCellsMatrixByCoordinates(adjustedSelection.start, adjustedSelection.end).flat(1)
      this.doc.crud.transact(() => {

        cells.forEach(block => {

          if (!block.childrenLength) {
            const p = this.doc.schemas.createSnapshot('paragraph', [])
            this.doc.crud.insertBlocks(block.id, 0, [p])
          }

          block.updateProps({
            colspan: null,
            rowspan: null,
            display: null
          })
        })

      })

    }

    this.isMerged = false
    this.onClose$.emit()
  }

  protected readonly HORIZON_ALIGN_LIST = HORIZON_ALIGN_LIST
  protected readonly VERTICAL_ALIGN_LIST = VERTICAL_ALIGN_LIST
}
