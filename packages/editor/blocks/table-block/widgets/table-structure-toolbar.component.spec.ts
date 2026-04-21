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
      addRow: jasmine.createSpy('addRow'),
      addColumn: jasmine.createSpy('addColumn'),
      deleteRows: jasmine.createSpy('deleteRows'),
      deleteColumns: jasmine.createSpy('deleteColumns'),
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

  it('inserts before the selected row', () => {
    const component = createComponent()

    component.insertRowBefore(new MouseEvent('mousedown'))

    expect(component.table.addRow).toHaveBeenCalledWith(2)
  })

  it('inserts after the selected row', () => {
    const component = createComponent({ rowCount: 2 })

    component.insertRowAfter(new MouseEvent('mousedown'))

    expect(component.table.addRow).toHaveBeenCalledWith(4)
  })

  it('deletes the selected column range', () => {
    const component = createComponent()

    component.deleteCol(new MouseEvent('mousedown'))

    expect(component.table.deleteColumns).toHaveBeenCalledWith(1, 3)
  })

  it('inserts after the selected column range', () => {
    const component = createComponent({ colCount: 2 })

    component.insertColAfter(new MouseEvent('mousedown'))

    expect(component.table.addColumn).toHaveBeenCalledWith(3)
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
