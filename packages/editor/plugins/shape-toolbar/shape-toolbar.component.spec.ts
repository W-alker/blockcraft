import {ChangeDetectorRef} from '@angular/core'
import {By} from '@angular/platform-browser'
import {TestBed} from '@angular/core/testing'
import {CsTooltipDirective} from '@cses/ui'
import {ShapeToolbarComponent, ShapeToolbarAction, ShapeToolbarPanel} from './shape-toolbar.component'

describe('ShapeToolbarComponent', () => {
  function createComponent(
    mode: 'relative' | 'absolute' = 'relative',
    grouped = false,
  ) {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>(
      'ChangeDetectorRef',
      ['markForCheck'],
    )
    const component = new ShapeToolbarComponent(cdr)
    component.shapeBlock = {
      props: {
        shapeType: 'rectangle',
        fillColor: '#93C5FD',
        fillOpacity: 1,
        strokeColor: '#2563EB',
        strokeWidth: 2,
        strokeStyle: 'solid',
        textColor: '#0F172A',
        shapeTextAlign: 'center',
        verticalAlign: 'middle',
      },
      doc: {
        placement: {
          getObjectLayout: () => mode === 'absolute' ? 'over' : 'top-bottom',
          getState: () => ({
            mode,
            x: 0,
            y: 0,
            layer: 'over',
          }),
          canMoveForward: () => true,
          canMoveBackward: () => false,
          canAlignObjectsToPlane: () => true,
          isInObjectGroup: () => grouped,
        },
      },
    } as any
    return component
  }

  it('offers inline and square-wrap layouts together with block layouts', () => {
    const component = createComponent()

    expect(component.layoutOptions.map(item => item.value)).toEqual([
      'inline',
      'wrap',
      'top-bottom',
      'under',
      'over',
    ])
    expect(component.objectLayout).toBe('top-bottom')
  })

  it('emits one typed action for each style control', () => {
    const component = createComponent()
    const actions: ShapeToolbarAction[] = []
    component.action.subscribe(action => actions.push(action))

    component.emitNumber('fill-opacity', {
      target: {value: '0.6'},
    } as any)
    component.setStrokeColor('#FF0000')
    component.setStrokeColor(null)
    component.setStrokeWidth(6)
    component.setStrokeStyle('dashed')
    // 与当前线型相同的选择不重复发动作
    component.setStrokeStyle('solid')

    expect(actions).toEqual([
      {name: 'fill-opacity', value: 0.6},
      {name: 'stroke-color', value: '#FF0000'},
      {name: 'stroke-width', value: 6},
      {name: 'stroke-style', value: 'dashed'},
    ])
  })

  it('emits one atomic fill-style action from the fill panel', () => {
    const component = createComponent()
    const actions: ShapeToolbarAction[] = []
    component.action.subscribe(action => actions.push(action))

    component.onFillChange({
      fillType: 'linear-gradient',
      gradientAngle: 160,
      gradientColors: ['#26405E', '#58402E'],
      gradientStops: [0, 1],
    })
    component.onFillChange({fillType: 'solid', fillColor: '#FF0000'})

    expect(actions).toEqual([
      {
        name: 'fill-style',
        value: {
          fillType: 'linear-gradient',
          gradientAngle: 160,
          gradientColors: ['#26405E', '#58402E'],
          gradientStops: [0, 1],
        },
      },
      {name: 'fill-style', value: {fillType: 'solid', fillColor: '#FF0000'}},
    ])
  })

  it('toggles rail panels and reports size changes for repositioning', () => {
    const component = createComponent()
    const panels: Array<ShapeToolbarPanel | null> = []
    component.panelChange.subscribe(panel => panels.push(panel))

    component.togglePanel('style')
    component.togglePanel('style')
    component.togglePanel('layout')
    component.closePanel()

    expect(panels).toEqual(['style', null, 'layout', null])
    expect(component.activePanel).toBeNull()
  })

  it('renders a collapsed rail with layout, style and delete entries', async () => {
    await TestBed.configureTestingModule({
      imports: [ShapeToolbarComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(ShapeToolbarComponent)
    fixture.componentInstance.shapeBlock = createComponent().shapeBlock
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    expect(host.querySelector('.shape-toolbar__panel')).toBeNull()
    expect(host.querySelector('select')).toBeNull()
    expect(host.querySelector('bc-shape-picker')).toBeNull()
    const tooltipTitles = fixture.debugElement
      .queryAll(By.directive(CsTooltipDirective))
      .map(debugElement =>
        debugElement.injector.get(CsTooltipDirective).csTooltip(),
      )
    expect(tooltipTitles).toEqual(['布局选项', '形状样式', '删除形状'])

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('renders fill, opacity and outline controls inside the style panel', async () => {
    await TestBed.configureTestingModule({
      imports: [ShapeToolbarComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(ShapeToolbarComponent)
    fixture.componentInstance.shapeBlock = createComponent().shapeBlock
    fixture.componentInstance.activePanel = 'style'
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    expect(host.querySelector('bc-shape-fill-panel')).not.toBeNull()
    expect(host.querySelector('cs-color-picker')).not.toBeNull()
    expect(host.querySelectorAll(
      '[aria-label="轮廓粗细"] .shape-toolbar__option',
    ).length).toBe(6)
    expect(host.querySelectorAll(
      '[aria-label="轮廓线型"] .shape-toolbar__option',
    ).length).toBe(2)

    const range = host.querySelector<HTMLInputElement>(
      '.shape-toolbar__range input[type="range"]',
    )
    expect(range).not.toBeNull()
    expect(range!.style.getPropertyValue('--shape-range-progress')).toBe('100%')
    range!.value = '0.4'
    range!.dispatchEvent(new Event('input'))
    expect(range!.style.getPropertyValue('--shape-range-progress')).toBe('40%')

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('renders stack and page-alignment controls only for free absolute shapes', async () => {
    await TestBed.configureTestingModule({
      imports: [ShapeToolbarComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(ShapeToolbarComponent)
    fixture.componentInstance.shapeBlock = createComponent('absolute').shapeBlock
    fixture.componentInstance.activePanel = 'layout'
    const actions: ShapeToolbarAction[] = []
    fixture.componentInstance.action.subscribe(action => actions.push(action))
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>(
      '.shape-toolbar__stack-actions button',
    ))
    const forward = buttons.find(b => b.textContent!.includes('上移一层'))
    const backward = buttons.find(b => b.textContent!.includes('下移一层'))
    expect(forward?.querySelector('.bc_cengji-shangyi')).not.toBeNull()
    expect(backward?.querySelector('.bc_cengji-xiayi')).not.toBeNull()
    // 禁用态的具体呈现属于 cs-button；这里断言组件闸门。
    expect(fixture.componentInstance.canMoveForward).toBeTrue()
    expect(fixture.componentInstance.canMoveBackward).toBeFalse()
    forward!.click()
    expect(actions).toContain({name: 'move-forward'})
    expect(host.querySelectorAll(
      '.shape-toolbar__plane-align-actions button',
    ).length).toBe(3)

    // 相对流内形状：布局面板保留环绕，但无排列/页面对齐
    fixture.componentRef.setInput(
      'shapeBlock',
      createComponent('relative').shapeBlock,
    )
    fixture.detectChanges()
    expect(host.querySelector('.shape-toolbar__stack-actions')).toBeNull()
    expect(host.querySelector('.shape-toolbar__plane-align-actions')).toBeNull()
    expect(host.querySelectorAll('.shape-toolbar__layout-option').length).toBe(5)

    // 组内形状：整个布局入口与面板都不出现
    fixture.componentRef.setInput(
      'shapeBlock',
      createComponent('absolute', true).shapeBlock,
    )
    fixture.detectChanges()
    expect(host.querySelector('.shape-toolbar__panel')).toBeNull()
    expect(host.querySelector('[aria-label="布局选项"]')).toBeNull()

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('emits page alignment from the layout panel options', () => {
    const component = createComponent('absolute')
    const actions: ShapeToolbarAction[] = []
    component.action.subscribe(action => actions.push(action))

    component.selectPlaneAlign('right')

    expect(actions).toEqual([{name: 'plane-align', value: 'right'}])
    expect(component.planeAlignOptions.map(item => item.value)).toEqual([
      'left',
      'horizontal-center',
      'right',
    ])
  })
})
