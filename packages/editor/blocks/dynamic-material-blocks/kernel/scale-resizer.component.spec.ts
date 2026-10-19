import {TestBed} from '@angular/core/testing'
import {ScaleResizerComponent} from './scale-resizer.component'

describe('ScaleResizerComponent', () => {
  it('keeps its handles outside selection and placement picking', async () => {
    await TestBed.configureTestingModule({
      imports: [ScaleResizerComponent],
    }).compileComponents()

    const fixture = TestBed.createComponent(ScaleResizerComponent)
    const host = fixture.nativeElement as HTMLElement

    expect(host.hasAttribute('data-bc-nodrag')).toBeTrue()
    expect(host.hasAttribute('data-bc-selection-interaction-ignore')).toBeTrue()
    expect(host.hasAttribute('data-bc-placement-pick-ignore')).toBeTrue()

    fixture.destroy()
  })
})
