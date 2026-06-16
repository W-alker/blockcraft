import { ChangeDetectorRef } from '@angular/core'
import { TableStructureToolbarComponent } from './table-structure-toolbar.component'

describe('TableStructureToolbarComponent', () => {
  function createComponent(overrides: Partial<{
    rowIndex: number
    rowCount: number
    colIndex: number
    colCount: number
    cells: Array<{ props: any }>
  }> = {}) {
    const cdr = { markForCheck: jasmine.createSpy('markForCheck') } as unknown as ChangeDetectorRef
    const component = new TableStructureToolbarComponent(cdr)
    const cells = overrides.cells ?? []
    component.table = {
      // 结构动作经协同安全的 menu* 入口委托（索引按锚点在 table.block 内重算）
      menuAddRowAbove: jasmine.createSpy('menuAddRowAbove'),
      menuAddRowBelow: jasmine.createSpy('menuAddRowBelow'),
      menuDeleteRows: jasmine.createSpy('menuDeleteRows').and.returnValue(2),
      menuAddColumnLeft: jasmine.createSpy('menuAddColumnLeft'),
      menuAddColumnRight: jasmine.createSpy('menuAddColumnRight'),
      menuDeleteColumns: jasmine.createSpy('menuDeleteColumns').and.returnValue(1),
      refreshTableMenuFromSelection: jasmine.createSpy('refreshTableMenuFromSelection'),
      onRowBarSelected: jasmine.createSpy('onRowBarSelected'),
      onColBarSelected: jasmine.createSpy('onColBarSelected'),
      getCellsMatrixByCoordinates: jasmine.createSpy('getCellsMatrixByCoordinates').and.returnValue([cells]),
      rowLength: 4,
      colLength: 5,
    } as unknown as BlockCraft.IBlockComponents['table']
    component.rowIndex = overrides.rowIndex ?? 2
    component.rowCount = overrides.rowCount ?? 1
    component.colIndex = overrides.colIndex ?? 1
    component.colCount = overrides.colCount ?? 3
    return component
  }

  // 工具栏只负责委托到协同安全的 menu* 入口；真正的行/列索引由 table.block 在
  // 点击瞬间按抓拍的锚点 ID 重算（见 table.block.ts 菜单动作一节）。因此这里断言
  // “委托到正确的菜单动作”，而非旧的“按快照下标直接调 addRow/deleteColumns”。
  it('inserts before the selected row', () => {
    const component = createComponent()

    component.insertRowBefore(new MouseEvent('mousedown'))

    expect(component.table.menuAddRowAbove).toHaveBeenCalled()
  })

  it('inserts after the selected row', () => {
    const component = createComponent({ rowCount: 2 })

    component.insertRowAfter(new MouseEvent('mousedown'))

    expect(component.table.menuAddRowBelow).toHaveBeenCalled()
  })

  it('deletes the selected column range', () => {
    const component = createComponent()

    component.deleteCol(new MouseEvent('mousedown'))

    expect(component.table.menuDeleteColumns).toHaveBeenCalled()
  })

  it('inserts after the selected column range', () => {
    const component = createComponent({ colCount: 2 })

    component.insertColAfter(new MouseEvent('mousedown'))

    expect(component.table.menuAddColumnRight).toHaveBeenCalled()
  })

  it('marks merge available when multiple cells are selected', () => {
    const component = createComponent({
      cells: [
        { props: { display: '', color: null, backColor: null } },
        { props: { display: '', color: null, backColor: null } },
      ],
    })

    component.ngOnInit()

    expect((component as any).canToggleMerge).toBeTrue()
    expect((component as any).isMerged).toBeFalse()
  })

  it('detects merged state when only one visible cell remains in the range', () => {
    const component = createComponent({
      cells: [
        { props: { display: '', color: null, backColor: null } },
        { props: { display: 'none', color: null, backColor: null } },
        { props: { display: 'none', color: null, backColor: null } },
      ],
    })

    component.ngOnInit()

    expect((component as any).canToggleMerge).toBeTrue()
    expect((component as any).isMerged).toBeTrue()
  })

  it('hides merge button for a single-cell selection', () => {
    const component = createComponent({
      cells: [{ props: { display: '', color: null, backColor: null } }],
    })

    component.ngOnInit()

    expect((component as any).canToggleMerge).toBeFalse()
  })

  it('prevents focus loss on host mousedown', () => {
    const component = createComponent()
    const event = new MouseEvent('mousedown', { cancelable: true })

    component.onHostMouseDown(event)

    expect(event.defaultPrevented).toBeTrue()
  })
})
