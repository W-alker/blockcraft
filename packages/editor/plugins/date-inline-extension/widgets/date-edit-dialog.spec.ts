import {TestBed} from '@angular/core/testing'
import {OverlayContainer} from '@angular/cdk/overlay'
import {InlineDateEditDialog} from './date-edit-dialog'
import {INLINE_DATE_FORMATS} from '../../../embeds/date'

describe('InlineDateEditDialog format previews', () => {
  afterEach(() => TestBed.resetTestingModule())

  async function mount(value: string) {
    await TestBed.configureTestingModule({imports: [InlineDateEditDialog]}).compileComponents()
    const fixture = TestBed.createComponent(InlineDateEditDialog)
    fixture.componentRef.setInput('value', value)
    fixture.componentRef.setInput('format', 'YYYY-MM-DD HH:mm')
    fixture.detectChanges()
    await fixture.whenStable()
    return fixture
  }

  it('renders every dropdown label for an empty template value without materializing it', async () => {
    const fixture = await mount('')
    const update = spyOn(fixture.componentInstance.update, 'emit')
    const close = spyOn(fixture.componentInstance.close, 'emit')
    const trigger: HTMLElement = fixture.nativeElement.querySelector('cs-select')
    expect(trigger.textContent?.trim()).toMatch(/\d{4}-\d{2}-\d{2} · \d{2}:\d{2}/)
    trigger.querySelector<HTMLElement>('.cs-select-trigger')!.click()
    fixture.detectChanges()
    await fixture.whenStable()
    const options = TestBed.inject(OverlayContainer).getContainerElement()
      .querySelectorAll('.cs-select-option-label')
    expect(options.length).toBe(INLINE_DATE_FORMATS.length)
    for (const option of Array.from(options)) expect(option.textContent?.trim()).toBeTruthy()
    const buttons = fixture.nativeElement.querySelectorAll('button')
    buttons[buttons.length - 1].click()
    expect(update).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
  })

  it('keeps the frozen value and selected format when confirming a valid date', async () => {
    const fixture = await mount('2026-09-21T14:23')
    const update = spyOn(fixture.componentInstance.update, 'emit')
    expect(fixture.nativeElement.querySelector('cs-select').textContent)
      .toContain('2026-09-21 · 14:23')
    const buttons = fixture.nativeElement.querySelectorAll('button')
    buttons[buttons.length - 1].click()
    expect(update).toHaveBeenCalledWith({value: '2026-09-21T14:23', format: 'YYYY-MM-DD HH:mm'})
  })
})
