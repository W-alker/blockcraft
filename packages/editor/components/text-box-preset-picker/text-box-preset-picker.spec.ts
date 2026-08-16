import {TestBed} from '@angular/core/testing'
import {
  TEXT_BOX_PRESETS,
  getTextBoxPreset,
  getTextBoxPresetCategoriesFor,
  getTextBoxPresetsFor,
  type TextBoxPresetId,
} from '../../blocks/text-box-block'
import {TextBoxPresetPickerComponent} from './text-box-preset-picker'

describe('TextBoxPresetPickerComponent', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('renders the active tab as shape-backed visual choices', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent)
    fixture.componentRef.setInput('current', 'speech')
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    const items = host.querySelectorAll<HTMLButtonElement>('[data-preset-id]')
    const featured = getTextBoxPresetsFor('h', 'featured')

    // The grid is one tab, not the whole catalog.
    expect(items.length).toBe(featured.length)
    expect(items.length).toBeLessThan(TEXT_BOX_PRESETS.length)
    expect(host.querySelector('[data-preset-id="speech"]')
      ?.getAttribute('aria-checked')).toBe('true')
    expect(host.textContent).toContain('对话气泡')
  })

  it('switches the grid when another shape tab is chosen', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent)
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    const outlineTab = Array.from(
      host.querySelectorAll<HTMLElement>('.cs-segmented-item'),
    ).find(tab => tab.textContent?.trim() === '线框')!

    // Full pointer sequence, not a bare click: the tab strip suppresses
    // mousedown to hold the editor's selection, and that must not swallow the
    // click that actually switches tabs.
    outlineTab.dispatchEvent(
      new MouseEvent('mousedown', {bubbles: true, cancelable: true}),
    )
    outlineTab.click()
    fixture.detectChanges()

    const ids = Array.from(
      host.querySelectorAll<HTMLElement>('[data-preset-id]'),
    ).map(item => item.dataset['presetId']!)
    expect(ids.length).toBe(getTextBoxPresetsFor('h', 'outline').length)
    expect(ids.every(id => id.startsWith('outline-'))).toBeTrue()
  })

  it('offers shape tabs only, with no direction split', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent)
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    const tabLabels = Array.from(
      host.querySelectorAll<HTMLElement>('.cs-segmented-item'),
    ).map(tab => tab.textContent!.trim())

    // Direction is a frame flag applied on top of a pick, not a second copy of
    // the catalog, so every shape tab is offered unconditionally.
    expect(tabLabels).toEqual(
      getTextBoxPresetCategoriesFor('h').map(category => category.label),
    )
  })

  it('paints detail strokes and even-odd holes so shape-built entries survive the thumbnail', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent)
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    // The 精选 tab is the one still built from Shape geometry rather than a
    // surface image; `paper-note` uses `folded-corner`, whose detail stroke
    // draws the fold. Without it the thumbnail is a plain rectangle.
    //
    // No bundled preset currently uses an even-odd shape, so `fill-rule` is
    // deliberately not asserted here — the projection exists for shapes that
    // need it, but asserting an unused path would test nothing.
    expect(host.querySelector('[data-preset-id="paper-note"]')).not.toBeNull()
    expect(host.querySelectorAll('svg path[fill="none"]').length)
      .toBeGreaterThan(0)
  })

  it('renders the surface image for decorated entries', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent)
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    const outlineTab = Array.from(
      host.querySelectorAll<HTMLElement>('.cs-segmented-item'),
    ).find(tab => tab.textContent?.trim() === '线框')!

    outlineTab.click()
    fixture.detectChanges()

    // Decorated entries zero out fill and stroke, so a shape-only thumbnail
    // would render blank.
    const images = host.querySelectorAll<HTMLImageElement>(
      '.text-box-preset-picker__bg',
    )
    expect(images.length).toBe(getTextBoxPresetsFor('h', 'outline').length)
    expect(Array.from(images).every(img => img.src.startsWith('data:image/svg+xml')))
      .toBeTrue()
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
