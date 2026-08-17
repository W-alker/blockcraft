import {TestBed} from '@angular/core/testing'
import {BcOrderedMarkerPickerComponent} from './ordered-marker-picker'

describe('BcOrderedMarkerPickerComponent', () => {
  it('renders the automatic option and all marker presets', async () => {
    await TestBed.configureTestingModule({
      imports: [BcOrderedMarkerPickerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(BcOrderedMarkerPickerComponent)
    fixture.componentRef.setInput('current', 'a2')
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelectorAll('.ordered-marker-picker__option').length)
      .toBe(12)
    expect(fixture.nativeElement.querySelector('.ordered-marker-picker__auto')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('.ordered-marker-picker__option.is-active')
      ?.getAttribute('aria-label')).toBe('大写字母')
  })

  it('emits null for the automatic depth-cycle option', async () => {
    await TestBed.configureTestingModule({
      imports: [BcOrderedMarkerPickerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(BcOrderedMarkerPickerComponent)
    const values: Array<string | null> = []
    fixture.componentInstance.pick.subscribe(value => values.push(value))
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    host.querySelector<HTMLButtonElement>('.ordered-marker-picker__auto')!.click()
    expect(values).toEqual([null])
  })
})
