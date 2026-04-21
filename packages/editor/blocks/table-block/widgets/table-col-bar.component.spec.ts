import { TestBed } from '@angular/core/testing'
import { TableColBarComponent } from './table-col-bar.component'

describe('TableColBarComponent', () => {
  it('emits hoveredHandleChange on enter and leave', () => {
    const fixture = TestBed.configureTestingModule({ imports: [TableColBarComponent] })
      .createComponent(TableColBarComponent)
    const emitted: Array<number | null> = []

    fixture.componentInstance.colWidths = [120, 140]
    fixture.componentInstance.hoveredHandleChange.subscribe(value => emitted.push(value))

    fixture.componentInstance.onHandleEnter(0)
    fixture.componentInstance.onHandleLeave()

    expect(emitted).toEqual([0, null])
  })
})
