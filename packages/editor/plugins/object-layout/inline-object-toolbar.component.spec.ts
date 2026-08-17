import {TestBed} from '@angular/core/testing'
import {InlineObjectToolbarComponent} from './inline-object-toolbar.component'

describe('InlineObjectToolbarComponent', () => {
  it('keeps four-sided wrapping as one action for every inline object', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [InlineObjectToolbarComponent],
    }).createComponent(InlineObjectToolbarComponent)
    fixture.componentRef.setInput('layout', 'wrap')
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelectorAll(
      'bc-float-toolbar-item[name="inline-wrap-side"]',
    ).length).toBe(0)
  })
})
