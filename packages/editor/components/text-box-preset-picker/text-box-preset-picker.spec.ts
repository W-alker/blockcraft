import {TestBed} from '@angular/core/testing'
import {
  TEXT_BOX_PRESETS,
  getTextBoxPreset,
  type TextBoxPresetId,
} from '../../blocks/text-box-block'
import {TextBoxPresetPickerComponent} from './text-box-preset-picker'

describe('TextBoxPresetPickerComponent', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('renders every catalog preset as a shape-backed visual choice', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent)
    fixture.componentRef.setInput('current', 'speech')
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    const items = host.querySelectorAll<HTMLButtonElement>('[data-preset-id]')

    expect(items.length).toBe(TEXT_BOX_PRESETS.length)
    expect(host.querySelector('[data-preset-id="speech"]')
      ?.getAttribute('aria-checked')).toBe('true')
    expect(host.querySelectorAll('svg path').length).toBe(TEXT_BOX_PRESETS.length)
    expect(host.textContent).toContain('对话气泡')
  })

  it('emits only the catalog id while the preset stores concrete props', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent)
    const picked: TextBoxPresetId[] = []
    fixture.componentInstance.pick.subscribe(value => picked.push(value))
    fixture.detectChanges()
    const button = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-preset-id="royal-banner"]')!

    button.click()

    expect(picked).toEqual(['royal-banner'])
    expect(getTextBoxPreset('royal-banner').props).toEqual(
      jasmine.objectContaining({sh: 'ribbon'}),
    )
    expect(getTextBoxPreset('royal-banner').props)
      .not.toEqual(jasmine.objectContaining({preset: 'royal-banner'}))
  })

  it('removes standalone popup chrome when embedded in a settings card', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent)
    fixture.componentRef.setInput('embedded', true)
    fixture.detectChanges()

    expect((fixture.nativeElement as HTMLElement).classList)
      .toContain('text-box-preset-picker-host--embedded')
  })
})
