import { TestBed } from '@angular/core/testing'
import { TableRowBarComponent } from './table-row-bar.component'

describe('TableRowBarComponent', () => {
  it('emits hoveredHandleChange on enter and leave', () => {
    const fixture = TestBed.configureTestingModule({ imports: [TableRowBarComponent] })
      .createComponent(TableRowBarComponent)
    const emitted: Array<number | null> = []

    fixture.componentInstance.rowIds = ['r1', 'r2']
    fixture.componentInstance.rowHeightsRecord = { r1: 40, r2: 44 }
    fixture.componentInstance.hoveredHandleChange.subscribe(value => emitted.push(value))

    fixture.componentInstance.onHandleEnter(1)
    fixture.componentInstance.onHandleLeave()

    expect(emitted).toEqual([1, null])
  })
})
