import {ChangeDetectorRef} from '@angular/core'
import {By} from '@angular/platform-browser'
import {TestBed} from '@angular/core/testing'
import {NzTooltipDirective} from 'ng-zorro-antd/tooltip'
import {
  BcFloatToolbarItemComponent,
  BcOverlayTriggerDirective,
} from '../../components'
import {ShapeToolbarComponent, ShapeToolbarAction} from './shape-toolbar.component'

describe('ShapeToolbarComponent', () => {
  function createComponent(mode: 'relative' | 'absolute' = 'relative') {
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

    component.emitString('fill-color', {
      target: {value: '#FF0000'},
    } as any)
    component.emitNumber('fill-opacity', {
      target: {value: '0.6'},
    } as any)
    component.toggleStrokeStyle()
    const trigger = jasmine.createSpyObj<BcOverlayTriggerDirective>(
      'BcOverlayTriggerDirective',
      ['closePanel'],
    )
    component.selectStrokeWidth(
      {value: 6} as BcFloatToolbarItemComponent,
      trigger,
    )

    expect(actions).toEqual([
      {name: 'fill-color', value: '#FF0000'},
      {name: 'fill-opacity', value: 0.6},
      {name: 'stroke-style', value: 'dashed'},
      {name: 'stroke-width', value: 6},
    ])
    expect(trigger.closePanel).toHaveBeenCalledTimes(1)
  })

  it('exposes only the unified outline-width dropdown data', () => {
    const component = createComponent()

    expect(component.strokeWidthLabel).toBe('2 px')
    expect(component.strokeWidthOptions).toEqual([
      {value: 0, label: '无'},
      {value: 1, label: '1 px'},
      {value: 2, label: '2 px'},
      {value: 3, label: '3 px'},
      {value: 4, label: '4 px'},
      {value: 6, label: '6 px'},
    ])
    expect((component as any).shapeDefinitions).toBeUndefined()
    expect((component as any).textAlignItems).toBeUndefined()
  })

  it('renders no native select or text-format controls', async () => {
    await TestBed.configureTestingModule({
      imports: [ShapeToolbarComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(ShapeToolbarComponent)
    fixture.componentInstance.shapeBlock = createComponent().shapeBlock
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    expect(host.querySelector('select')).toBeNull()
    expect(host.querySelector('[aria-label="更改形状"]')).toBeNull()
    expect(host.querySelector('[aria-label="文字颜色"]')).toBeNull()
    expect(host.querySelector('[aria-label="文字左对齐"]')).toBeNull()
    expect(host.querySelector('[aria-label="垂直对齐"]')).toBeNull()
    expect(host.querySelector(
      'bc-float-toolbar-item[name="stroke-width"]',
    )).not.toBeNull()
    expect(host.querySelector(
      '[aria-label="形状填充"] .bc_tianchongyanse',
    )).not.toBeNull()
    expect(host.querySelector(
      'button[aria-label="实线/虚线"] .bc_xuxian',
    )).not.toBeNull()
    expect(host.querySelector('.shape-toolbar [title]')).toBeNull()

    const tooltipTitles = fixture.debugElement
      .queryAll(By.directive(NzTooltipDirective))
      .map(debugElement =>
        debugElement.injector.get(NzTooltipDirective).directiveTitle,
      )
    expect(tooltipTitles).toEqual([
      '形状填充',
      '填充透明度',
      '轮廓颜色',
      '轮廓粗细',
      '实线/虚线',
      '嵌入型',
      '四周型环绕',
      '上下型',
      '衬于文字下方',
      '浮于文字上方',
      '删除形状',
    ])

    const range = host.querySelector<HTMLInputElement>(
      '.shape-toolbar__range input[type="range"]',
    )
    expect(range).not.toBeNull()
    expect(range!.style.getPropertyValue('--shape-range-progress')).toBe('100%')
    range!.value = '0.4'
    range!.dispatchEvent(new Event('input'))
    expect(range!.style.getPropertyValue('--shape-range-progress')).toBe('40%')
    expect(host.querySelector('[aria-label="上移一层"]')).toBeNull()
    expect(host.querySelector('[aria-label="下移一层"]')).toBeNull()

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('renders stack controls only for absolute shapes', async () => {
    await TestBed.configureTestingModule({
      imports: [ShapeToolbarComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(ShapeToolbarComponent)
    fixture.componentInstance.shapeBlock = createComponent('absolute').shapeBlock
    const actions: ShapeToolbarAction[] = []
    fixture.componentInstance.action.subscribe(action => actions.push(action))
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    const forward = host.querySelector<HTMLButtonElement>(
      'button[aria-label="上移一层"]',
    )
    const backward = host.querySelector<HTMLButtonElement>(
      'button[aria-label="下移一层"]',
    )

    expect(forward?.querySelector('.bc_cengji-shangyi')).not.toBeNull()
    expect(backward?.querySelector('.bc_cengji-xiayi')).not.toBeNull()
    expect(forward?.disabled).toBeFalse()
    expect(backward?.disabled).toBeTrue()
    forward!.click()
    expect(actions).toContain({name: 'move-forward'})
    const tooltipTitles = fixture.debugElement
      .queryAll(By.directive(NzTooltipDirective))
      .map(debugElement =>
        debugElement.injector.get(NzTooltipDirective).directiveTitle,
      )
    expect(tooltipTitles).toContain('上移一层')
    expect(tooltipTitles).toContain('下移一层')
    expect(host.querySelector(
      '.shape-toolbar__tooltip-host[nz-tooltip] button:disabled',
    )).not.toBeNull()

    fixture.destroy()
    TestBed.resetTestingModule()
  })
})
