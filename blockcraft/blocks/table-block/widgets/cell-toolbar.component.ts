import {ChangeDetectorRef, Component, EventEmitter, Input, Output} from "@angular/core";
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
      <bc-float-toolbar-item icon="bc_hebingdanyuange1" name="merge" value="true" title="合并单元格"
                             [active]="isMerged"/>
      <bc-float-toolbar-item *ngIf="showOptions.showRowHead" title="设置标题行" [active]="table.props.rowHead"
                             icon="bc_biaotihang" name="rowHead" value="true"/>
      <bc-float-toolbar-item *ngIf="showOptions.showColHead" title="设置标题列" [active]="table.props.colHead"
                             icon="bc_biaotilie" name="colHead" value="true"/>

      <span class="bc-float-toolbar__divider"></span>

      <bc-float-toolbar-item icon="bc_sepan" [bcOverlayTrigger]="colorPicker" position="bottom-left" [offsetY]="8"/>

      <bc-float-toolbar-item icon="bc_zuoduiqi" [expandable]="true"
                             [bcOverlayTrigger]="alignFloatBar" position="bottom-left" [offsetY]="8"/>

      @if (showOptions.showColAdder) {
        <span class="bf-float-toolbar__divider"></span>
        <bc-float-toolbar-item icon="bc_zuojiantou-jia" name="addCol" value="before"/>
        <bc-float-toolbar-item icon="bc_youjiantou-jia" name="addCol" value="after"/>
      }

      @if (showOptions.showRowAdder) {
        <span class="bf-float-toolbar__divider"></span>
        <bc-float-toolbar-item icon="bc_shangjiantou-jia" name="addRow" value="before"/>
        <bc-float-toolbar-item icon="bc_xiajiantou-jia" name="addRow" value="after"/>
      }

      <bc-float-toolbar-item *ngIf="showOptions.showDelete" icon="bc_shanchu-2" name="delete" value="true"/>
    </bc-float-toolbar>

    <ng-template #alignFloatBar>
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
    </ng-template>

    <ng-template #colorPicker>
      <color-picker (colorPicked)="onColorPicked($event)" [activeColors]="activeColors"></color-picker>
    </ng-template>
  `,
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    BcOverlayTriggerDirective,
    ColorPickerComponent,
    NgForOf,
    NgIf
  ],
  styles: [`
    bc-float-toolbar-item[name="delete"]:hover {
      color: var(--bc-error-color);
      background: var(--bc-error-background-color);
    }
  `],
  standalone: true
})
export class CellToolbarComponent {
  private _options: { type: 'col' | 'row' | 'cells', index?: number, count?: number } = {type: 'cells'}
  @Input()
  set options(options: typeof this._options) {
    this.showOptions = {
      showDelete: options.type !== 'cells',
      showRowHead: options.type === 'row' && options.index === 0,
      showColHead: options.type === 'col' && options.index === 0,
      showColAdder: options.type === 'col',
      showRowAdder: options.type === 'row'
    }
    this._options = options
  }

  protected showOptions = {
    showDelete: false,
    showRowHead: false,
    showColHead: false,
    showColAdder: false,
    showRowAdder: false
  }

  protected activeColors: Record<string, string | null> = {}

  protected verticalAlign: string | null = null
  protected textAlign?: string

  @Input({required: true})
  selectedCells: BlockCraft.IBlockComponents['table-cell'][] = []

  @Input({required: true})
  doc!: BlockCraft.Doc

  @Input({required: true})
  table!: BlockCraft.IBlockComponents['table']

  @Output()
  onDestroy = new EventEmitter<void>()

  @Output()
  onPositionChanged = new EventEmitter()

  protected isMerged = false

  constructor(private changeDetectorRef: ChangeDetectorRef) {
  }

  ngOnInit() {
    const firstCell = this.selectedCells[0]
    this.isMerged = this.selectedCells.length === 1 && !!(firstCell.props.colspan || firstCell.props.rowspan)

    // 比对颜色
    let commonColor = firstCell.props.color
    let commonBackColor = firstCell.props.backColor
    // 比对居中
    let commonVerticalAlign = firstCell.props.verticalAlign
    let commonTextAlign = firstCell.props.textAlign
    for (let i = 1; i < this.selectedCells.length; i++) {
      const cell = this.selectedCells[i]
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

  onColorPicked(obj: { type: string, color: string | null, group: ColorGroup }) {
    this.setSelectedDescendants(this.selectedCells, obj.type, obj.color)
    this.activeColors = {
      ...this.activeColors,
      [obj.type]: obj.color
    }
  }

  onItemClicked(item: BcFloatToolbarItemComponent) {
    switch (item.name) {
      case 'textAlign':
        this.setSelectedDescendants(this.selectedCells, 'textAlign', item.value)
        this.textAlign = item.value
        break
      case 'verticalAlign':
        this.setSelectedDescendants(this.selectedCells, 'verticalAlign', item.value)
        this.verticalAlign = item.value
        break
      case 'merge':
        this.isMerged ? this.unMergeCell() : this.mergeCells()
        break
      case 'delete':
        switch (this._options.type) {
          case 'col':
            this.table.deleteColumn(this._options.index!, this._options.count)
            break
          case 'row':
            this.table.deleteColumn(this.options.index!, this.options.count)
            break
          default:
            return
        }
        break
      case 'colHead':
        this.table.updateProps({colHead: !this.table.props.colHead})
        break
      case 'rowHead':
        this.table.updateProps({rowHead: !this.table.props.rowHead})
        break
      case 'addCol':
        this.table.addColumns(this._options.index! + (item.value === 'after' ? (this._options.count || 0) : 0))
        item.value === 'before' && (this._options.index! += 1)
        // @ts-expect-error
        this.table._activeColRange = [this._options.index!, this._options.index! + (this._options.count || 0) - 1]
        this.table.colBarComponent.changeDetectionRef.markForCheck()
        this.onPositionChanged.emit()
        break
      case 'addRow':
        this.table.addRows(this._options.index! + (item.value === 'after' ? (this._options.count || 0) : 0))
        item.value === 'before' && (this._options.index! += 1)
        // @ts-expect-error
        this.table._activeRowRange = [this._options.index!, this._options.index! + (this._options.count || 0) - 1]
        this.table.rowBarComponent.changeDetectionRef.markForCheck()
        break
    }

  }

  ngOnDestroy() {
    this.onDestroy.emit()
  }

  setSelectedDescendants(blocks: Array<TableCellBlockComponent | TableRowBlockComponent>, prop: keyof TableCellBlockModel['props'], value: any) {
    blocks.forEach(block => {
      block.updateProps({[prop]: value})
    })
  }

  private mergeCells() {
    const cells = this.selectedCells
    if (cells.length < 2) return
    const firstCell = cells[0]
    const lastCell = cells[cells.length - 1]
    const tableChildrenIds = this.table.childrenIds
    const firstRow = firstCell.parentBlock as TableRowBlockComponent
    const lastRow = lastCell.parentBlock as TableRowBlockComponent

    let firstCellIndex = firstCell.getIndexOfParent()
    let lastCellIndex = lastCell.getIndexOfParent()

    let firstRowIndex = tableChildrenIds.indexOf(firstRow.id)
    let lastRowIndex = tableChildrenIds.indexOf(lastRow.id)

    if (lastCell.props.colspan) {
      lastCellIndex += lastCell.props.colspan - 1
    }
    if (lastCell.props.rowspan) {
      lastRowIndex += lastCell.props.rowspan - 1
    }

    // console.log([firstRowIndex, firstCellIndex], [lastRowIndex, lastCellIndex], firstCell, lastCell )

    this.doc.crud.transact(() => {

      firstCell.updateProps({
        rowspan: lastRowIndex - firstRowIndex + 1,
        colspan: lastCellIndex - firstCellIndex + 1
      })

      for (let i = firstRowIndex; i <= lastRowIndex; i++) {
        const row = this.doc.getBlockById(tableChildrenIds[i]) as TableRowBlockComponent
        const rowCellIds = row.childrenIds

        const sliceIds = rowCellIds.slice(i == firstRowIndex ? firstCellIndex + 1 : firstCellIndex, lastCellIndex + 1)

        sliceIds.forEach(id => {
          const cell = this.doc.getBlockById(id) as TableCellBlockComponent
          if (cell.props.display === 'none' && cell.props.mergedBy === firstCell.id) return
          cell.updateProps({display: 'none', mergedBy: firstCell.id})
          if (cell.hasContent) {
            this.doc.crud.moveBlocks(cell.id, 0, cell.childrenLength, firstCell.id, firstCell.childrenLength)
          }
        })
      }

      this.isMerged = true
      this.doc.selection.selectBlock(firstCell)
    }, ORIGIN_SKIP_SYNC)

  }

  private unMergeCell() {
    const firstCell = this.selectedCells[0]
    const rowIdx = this.table.childrenIds.indexOf(firstCell.parentBlock!.id)
    const colIdx = firstCell.getIndexOfParent()
    this.doc.crud.transact(() => {

      const rowspan = firstCell.props.rowspan!
      const colspan = firstCell.props.colspan!

      for (let i = rowIdx; i < rowIdx + rowspan; i++) {
        const row = this.doc.getBlockById(this.table.childrenIds[i]) as TableRowBlockComponent
        for (let j = colIdx; j < colIdx + colspan; j++) {
          const cell = row.childrenIds[j]
          const cellBlock = this.doc.getBlockById(cell) as TableCellBlockComponent
          if (cellBlock.props.display !== 'none') continue

          if (!cellBlock.childrenLength) {
            const p = this.doc.schemas.createSnapshot('paragraph', [])
            this.doc.crud.insertBlocks(cellBlock.id, 0, [p])
          }

          if (cellBlock.props.colspan) {
            cellBlock.updateProps({colspan: null})
          }
          if (cellBlock.props.rowspan) {
            cellBlock.updateProps({rowspan: null})
          }

          cellBlock.updateProps({display: null})

          this.table.selectCell(cellBlock)
        }
      }

      firstCell.updateProps({colspan: null, rowspan: null})
      this.isMerged = false
      this.selectedCells = this.table.getSelectedCells()
    }, ORIGIN_SKIP_SYNC)
  }


  protected readonly HORIZON_ALIGN_LIST = HORIZON_ALIGN_LIST
  protected readonly VERTICAL_ALIGN_LIST = VERTICAL_ALIGN_LIST
}
