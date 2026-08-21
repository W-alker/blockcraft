import {ChangeDetectorRef} from '@angular/core'
import {TestBed} from '@angular/core/testing'
import {By} from '@angular/platform-browser'
import {
  getTextBoxPreset,
  normalizeTextBoxWordArtStyle,
  normalizeTextBoxProps,
} from '../../blocks/text-box-block'
import {TextBoxToolbarComponent, type TextBoxToolbarAction} from './text-box-toolbar.component'
import {TextBoxShapePanelComponent} from './text-box-shape-panel.component'
import {TextBoxTextPanelComponent} from './text-box-text-panel.component'

describe('TextBoxToolbarComponent', () => {
  function createComponent(
    props: Record<string, unknown> = {},
    mode: 'relative' | 'absolute' = 'relative',
    grouped = false,
  ) {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>(
      'ChangeDetectorRef',
      ['markForCheck'],
    )
    const component = new TextBoxToolbarComponent(cdr)
    component.textBoxBlock = {
      props,
      doc: {
        placement: {
          getObjectLayout: () => mode === 'absolute' ? 'over' : 'top-bottom',
          getState: () => ({mode, x: 0, y: 0, layer: 'over'}),
          canMoveForward: () => true,
          canMoveBackward: () => false,
          canAlignObjectsToPlane: () => true,
          isInObjectGroup: () => grouped,
        },
      },
    } as any
    return component
  }

  it('keeps the main toolbar semantic and offers only supported layouts', () => {
    const component = createComponent()

    expect(component.layoutOptions.map(option => option.value)).toEqual([
      'top-bottom',
      'under',
      'over',
    ])
    expect(component.shapeType).toBe('rectangle')
    expect(component.hasWordArt).toBeFalse()
  })

  it('switches one click-owned secondary panel without writing document data', () => {
    const component = createComponent()
    const panels: Array<string | null> = []
    const actions: TextBoxToolbarAction[] = []
    component.panelChange.subscribe(panel => panels.push(panel))
    component.action.subscribe(action => actions.push(action))

    component.togglePanel('layout')
    component.togglePanel('shape')
    component.togglePanel('shape')

    expect(panels).toEqual(['layout', 'shape', null])
    expect(component.activePanel).toBeNull()
    expect(actions).toEqual([])
  })

  it('renders a four-entry vertical rail and click-owned layout panel', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxToolbarComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxToolbarComponent)
    fixture.componentInstance.textBoxBlock = {
      props: {},
      doc: {
        placement: {
          getObjectLayout: () => 'top-bottom',
          getState: () => ({mode: 'relative'}),
          canMoveForward: () => false,
          canMoveBackward: () => false,
          canAlignObjectsToPlane: () => true,
        },
      },
    } as any
    fixture.detectChanges()

    const rail = fixture.nativeElement.querySelector(
      '.text-box-toolbar__rail',
    ) as HTMLElement
    const panelButtons = rail.querySelectorAll<HTMLButtonElement>(
      'button[aria-controls]',
    )
    expect(Array.from(panelButtons).map(button => button.ariaLabel)).toEqual([
      '布局选项',
      '文本框样式',
      '形状格式',
      '文字格式',
    ])
    expect(rail.querySelector('[aria-label="布局选项"] .bc_buju')).not.toBeNull()
    expect(rail.querySelector('.bc_duiqifangshi')).toBeNull()

    panelButtons[0]!.click()
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector(
      '#bc-text-box-layout-panel',
    )).not.toBeNull()
    expect(fixture.nativeElement.textContent).not.toContain('位置基准')
    expect(fixture.nativeElement.textContent).not.toContain('随文字移动')
    expect(fixture.nativeElement.textContent).not.toContain('固定在页面上')
    expect(fixture.nativeElement.querySelector(
      '.text-box-toolbar__anchor-options',
    )).toBeNull()
    fixture.destroy()
  })

  it('keeps every secondary settings card on the mini panel geometry', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxToolbarComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxToolbarComponent)
    fixture.componentInstance.textBoxBlock = {
      props: {},
      doc: {
        placement: {
          getObjectLayout: () => 'top-bottom',
          getState: () => ({mode: 'relative'}),
          canMoveForward: () => false,
          canMoveBackward: () => false,
          canAlignObjectsToPlane: () => true,
        },
      },
    } as any
    const host = fixture.nativeElement as HTMLElement
    const assertMiniSurface = (
      widthOwner: HTMLElement,
      scrollSurface: HTMLElement,
    ) => {
      expect(getComputedStyle(widthOwner).width).toBe('288px')
      expect(scrollSurface.clientWidth).toBeGreaterThan(0)
      expect(scrollSurface.scrollWidth).toBeLessThanOrEqual(
        scrollSurface.clientWidth,
      )
    }

    fixture.componentInstance.activePanel = 'layout'
    fixture.componentInstance.cdr.markForCheck()
    fixture.detectChanges()
    const layout = host.querySelector<HTMLElement>(
      '#bc-text-box-layout-panel',
    )!
    assertMiniSurface(layout, layout)

    fixture.componentInstance.activePanel = 'style'
    fixture.componentInstance.cdr.markForCheck()
    fixture.detectChanges()
    const style = host.querySelector<HTMLElement>(
      '#bc-text-box-style-panel',
    )!
    assertMiniSurface(style, style)
    const presetPicker = style.querySelector<HTMLElement>(
      '.text-box-preset-picker',
    )!
    expect(presetPicker.scrollWidth).toBeLessThanOrEqual(
      presetPicker.clientWidth,
    )

    fixture.componentInstance.activePanel = 'shape'
    fixture.componentInstance.cdr.markForCheck()
    fixture.detectChanges()
    const shapeHost = host.querySelector<HTMLElement>(
      'bc-text-box-shape-panel',
    )!
    const shapePanel = shapeHost.querySelector<HTMLElement>(
      '.text-box-shape-panel',
    )!
    const shapeDebug = fixture.debugElement.query(
      By.directive(TextBoxShapePanelComponent),
    )
    const shapeComponent = shapeDebug.componentInstance as
      TextBoxShapePanelComponent
    for (const section of ['shape', 'fill', 'outline']) {
      shapeComponent.setSection(section)
      shapeDebug.injector.get(ChangeDetectorRef).markForCheck()
      fixture.detectChanges()
      assertMiniSurface(shapeHost, shapePanel)
    }

    fixture.componentInstance.activePanel = 'text'
    fixture.componentInstance.cdr.markForCheck()
    fixture.detectChanges()
    const textHost = host.querySelector<HTMLElement>(
      'bc-text-box-text-panel',
    )!
    const textPanel = textHost.querySelector<HTMLElement>(
      '.text-box-text-panel',
    )!
    const textDebug = fixture.debugElement.query(
      By.directive(TextBoxTextPanelComponent),
    )
    const textComponent = textDebug.componentInstance as
      TextBoxTextPanelComponent
    for (const section of ['preset', 'font', 'fill', 'effects']) {
      textComponent.setSection(section)
      textDebug.injector.get(ChangeDetectorRef).markForCheck()
      fixture.detectChanges()
      assertMiniSurface(textHost, textPanel)
    }

    fixture.destroy()
  })

  it('hides the complete layout surface for a grouped text box', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxToolbarComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxToolbarComponent)
    fixture.componentInstance.textBoxBlock = createComponent(
      {},
      'absolute',
      true,
    ).textBoxBlock
    fixture.componentInstance.activePanel = 'layout'
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    expect(host.querySelector('[aria-label="布局选项"]')).toBeNull()
    expect(host.querySelector('#bc-text-box-layout-panel')).toBeNull()
    expect(host.querySelector('.text-box-toolbar__stack-actions')).toBeNull()
    expect(host.textContent).not.toContain('上移一层')
    expect(host.textContent).not.toContain('下移一层')

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('offers three inline page-alignment options in the absolute layout panel', async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxToolbarComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(TextBoxToolbarComponent)
    fixture.componentInstance.textBoxBlock =
      createComponent({}, 'absolute').textBoxBlock
    fixture.componentInstance.activePanel = 'layout'
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    const options = host.querySelectorAll<HTMLButtonElement>(
      '.text-box-toolbar__plane-align-actions ' +
        '.text-box-toolbar__plane-align-option',
    )
    expect(Array.from(options).map(option => option.textContent?.trim()))
      .toEqual(['靠左', '水平居中', '靠右'])
    expect(
      host.querySelectorAll('.text-box-toolbar__section-label')[2]!.textContent,
    ).toContain('页面对齐')

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('emits page alignment directly from an inline option', () => {
    const component = createComponent({}, 'absolute')
    const actions: TextBoxToolbarAction[] = []
    component.action.subscribe(action => actions.push(action))

    component.selectPlaneAlign('horizontal-center')

    expect(actions).toEqual([
      {name: 'plane-align', value: 'horizontal-center'},
    ])
    expect(component.planeAlignOptions.map(option => option.value)).toEqual([
      'left',
      'horizontal-center',
      'right',
    ])
  })

  it('applies one concrete style preset patch without persisting the preset id', () => {
    const component = createComponent()
    const actions: TextBoxToolbarAction[] = []
    component.action.subscribe(action => actions.push(action))

    component.applyPreset('classic', closeTrigger())

    expect(actions).toEqual([{
      name: 'update-props',
      value: {...getTextBoxPreset('classic').props},
    }])
    expect(actions[0]).not.toEqual(jasmine.objectContaining({preset: 'classic'}))
  })

  it('supports any text-owning shape and complete WordArt preset values', () => {
    const component = createComponent()
    const actions: TextBoxToolbarAction[] = []
    component.action.subscribe(action => actions.push(action))

    component.applyShape('cloud-callout', closeTrigger())
    component.applyWordArt('neon', closeTrigger())
    component.clearWordArt()

    expect(actions[0]).toEqual({
      name: 'update-props',
      value: {sh: 'cloud-callout'},
    })
    const second = actions[1]!
    const wordArt = second.name === 'update-props'
      ? normalizeTextBoxWordArtStyle(second.value.wa)
      : null
    expect(wordArt).toEqual(jasmine.objectContaining({
      fillType: 'solid',
      fillColor: '#F0ABFC',
      effect: 'none',
    }))
    expect(actions[2]).toEqual({
      name: 'update-props',
      value: {wa: null},
    })
  })

  it('commits shape slider drafts once and keeps the compact patch contract', () => {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>(
      'ChangeDetectorRef',
      ['markForCheck'],
    )
    const panel = new TextBoxShapePanelComponent(cdr)
    panel.props = normalizeTextBoxProps({fo: 1, bgo: 1})
    panel.textBoxBlock = {} as any
    panel.ngOnChanges()
    const patches: Record<string, unknown>[] = []
    panel.patch.subscribe(value => patches.push(value))

    panel.draftFillTransparency(20)
    panel.draftFillTransparency(35)
    panel.commitFillTransparency()
    panel.commitFillTransparency()

    expect(patches).toEqual([{fo: 0.65}])
  })

  it('applies picture fill through the host upload service without a raw URL field', async () => {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>(
      'ChangeDetectorRef',
      ['markForCheck'],
    )
    const panel = new TextBoxShapePanelComponent(cdr)
    panel.props = normalizeTextBoxProps({})
    const fileService = {
      isOverMaxSize: () => false,
      uploadImg: jasmine.createSpy('uploadImg')
        .and.resolveTo('https://cdn.example.com/text-box-paper.png'),
    }
    panel.textBoxBlock = {
      doc: {injector: {get: () => fileService}},
    } as any
    const patches: Record<string, unknown>[] = []
    panel.patch.subscribe(value => patches.push(value))
    const input = document.createElement('input')
    const file = new File(['image'], 'paper.png', {type: 'image/png'})
    Object.defineProperty(input, 'files', {value: [file]})

    await panel.uploadBackground({target: input} as unknown as Event)

    expect(fileService.uploadImg).toHaveBeenCalledOnceWith(
      file,
      jasmine.any(Function),
    )
    expect(patches).toEqual([{
      bgi: 'https://cdn.example.com/text-box-paper.png',
    }])
    expect(panel.backgroundStatus).toBe('图片已应用')
  })

  it('starts detailed text formatting from a neutral style and serializes once', () => {
    const panel = new TextBoxTextPanelComponent()
    const patches: Record<string, unknown>[] = []
    panel.patch.subscribe(value => patches.push(value))

    panel.setFontSize(22)
    panel.draftLetterSpacing(0.18)
    panel.draftLetterSpacing(0.24)
    panel.commitLetterSpacing()
    panel.commitLetterSpacing()

    expect(patches.length).toBe(2)
    const first = normalizeTextBoxWordArtStyle(patches[0]?.['wa'])
    const second = normalizeTextBoxWordArtStyle(patches[1]?.['wa'])
    expect(first).toEqual(jasmine.objectContaining({
      fontFamily: 'cjk-hei',
      fontSize: 22,
      fontWeight: 400,
      fillType: 'solid',
      effect: 'none',
    }))
    expect(second?.letterSpacingEm).toBe(0.24)
  })
})

function closeTrigger() {
  return jasmine.createSpyObj('BcOverlayTriggerDirective', ['closePanel']) as any
}
