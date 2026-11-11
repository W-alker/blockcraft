import {ChangeDetectorRef} from '@angular/core'
import {TestBed} from '@angular/core/testing'
import {By} from '@angular/platform-browser'
import {CsTooltipDirective} from '@cses/ui'
import {ImageToolbar} from './image.toolbar'
import {FloatingToolbarState} from '../../../components/floating-toolbar'

describe('ImageToolbar', () => {
  function makeBlock(
    mode: 'relative' | 'absolute',
    grouped = false,
    absoluteAllowed = true,
  ) {
    return {
      childrenLength: 0,
      props: {},
      doc: {
        placement: {
          supportsObjectLayout: (_block: unknown, layout: string) => !grouped &&
            (layout === 'inline' || layout === 'top-bottom' || absoluteAllowed),
          getObjectLayout: () => mode === 'absolute' ? 'over' : 'top-bottom',
          getState: () => ({
            mode,
            x: 0,
            y: 0,
            layer: 'over',
          }),
          canMoveForward: () => true,
          canMoveBackward: () => false,
          isInObjectGroup: () => grouped,
        },
      },
    } as any
  }

  it('exposes stack availability only for absolute images', () => {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>(
      'ChangeDetectorRef',
      ['markForCheck'],
    )
    const toolbar = new ImageToolbar(cdr)

    toolbar.imgBlock = makeBlock('relative')
    expect(toolbar.isAbsolute).toBeFalse()

    toolbar.imgBlock = makeBlock('absolute')
    expect(toolbar.isAbsolute).toBeTrue()
    expect(toolbar.canMoveForward).toBeTrue()
    expect(toolbar.canMoveBackward).toBeFalse()
  })

  it('shows the direct wrap action only for absolute images', async () => {
    await TestBed.configureTestingModule({
      imports: [ImageToolbar],
    }).compileComponents()
    const fixture = TestBed.createComponent(ImageToolbar)

    fixture.componentRef.setInput('imgBlock', makeBlock('relative'))
    fixture.componentInstance.popup.toggle('layout')
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('.bc_tuwenraopai')).toBeNull()

    fixture.componentRef.setInput('imgBlock', makeBlock('absolute'))
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('.bc_tuwenraopai')).not.toBeNull()

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('filters container layouts by placement capability and restores root options', async () => {
    await TestBed.configureTestingModule({imports: [ImageToolbar]}).compileComponents()
    const fixture = TestBed.createComponent(ImageToolbar)
    const labels = () => Array.from(fixture.nativeElement.querySelectorAll(
      'bc-float-toolbar-item[name="object-layout"]',
    ) as NodeListOf<HTMLElement>).map(item => item.closest('button')?.getAttribute('aria-label'))
    fixture.componentRef.setInput('imgBlock', makeBlock('relative', false, false))
    fixture.componentInstance.popup.toggle('layout')
    fixture.detectChanges()
    expect(labels()).toEqual(['嵌入型', '上下型'])
    fixture.componentRef.setInput('imgBlock', makeBlock('relative'))
    fixture.detectChanges()
    expect(labels()).toEqual(['嵌入型', '上下型', '衬于文字下方', '浮于文字上方'])
    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('renders the specified stack icons and disabled boundary', async () => {
    await TestBed.configureTestingModule({
      imports: [ImageToolbar],
    }).compileComponents()
    const fixture = TestBed.createComponent(ImageToolbar)
    fixture.componentInstance.imgBlock = makeBlock('absolute')
    fixture.componentInstance.extraItems = [{
      name: 'edit',
      icon: 'bc_bianji',
      label: '编辑图片',
    }]
    fixture.componentInstance.popup.toggle('layout')
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    const forward = host.querySelector<HTMLElement>(
      'bc-float-toolbar-item[name="move-forward"]',
    )
    const backward = host.querySelector<HTMLElement>(
      'bc-float-toolbar-item[name="move-backward"]',
    )

    expect(forward?.querySelector('.bc_cengji-shangyi')).not.toBeNull()
    expect(backward?.querySelector('.bc_cengji-xiayi')).not.toBeNull()
    expect(forward?.classList.contains('disabled')).toBeFalse()
    expect(backward?.classList.contains('disabled')).toBeTrue()
    expect(host.querySelector('[title]')).toBeNull()

    const tooltipTitles = fixture.debugElement.query(By.css(".object-format"))
      .queryAll(By.directive(CsTooltipDirective))
      .map(debugElement =>
        debugElement.injector.get(CsTooltipDirective).csTooltip(),
      )
    const expectedTitles = [
      '布局',
      '下载图片',
      '复制图片链接',
      '编辑图片',
      '嵌入型',
      '四周型环绕',
      '上下型',
      '衬于文字下方',
      '浮于文字上方',
      '上移一层',
      '下移一层',
    ]
    expect(tooltipTitles).toEqual(expectedTitles)
    expect(Array.from(host.querySelectorAll<HTMLElement>('.object-format button[aria-label]'))
      .map(element => element.getAttribute('aria-label')))
      .toEqual(expectedTitles)

    fixture.componentRef.setInput('imgBlock', makeBlock('absolute', true))
    fixture.detectChanges()
    expect(host.querySelector(
      'bc-float-toolbar-item[name="move-forward"]',
    )).toBeNull()
    expect(host.querySelector(
      'bc-float-toolbar-item[name="move-backward"]',
    )).toBeNull()
    expect(host.querySelector(
      'bc-float-toolbar-item[name="object-layout"]',
    )).toBeNull()

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('offers captions only in flow, including after layout changes', async () => {
    await TestBed.configureTestingModule({imports: [ImageToolbar]}).compileComponents()
    const fixture = TestBed.createComponent(ImageToolbar)
    const caption = () => fixture.nativeElement.querySelector(
      'bc-float-toolbar-item[name="caption"]',
    ) as HTMLElement | null

    fixture.componentRef.setInput('imgBlock', makeBlock('relative'))
    fixture.detectChanges()
    expect(caption()?.closest('button')?.getAttribute('aria-label')).toBe('添加图片标题')

    for (const grouped of [false, true]) {
      const block = makeBlock('absolute', grouped)
      block.childrenLength = 1
      fixture.componentRef.setInput('imgBlock', block)
      fixture.detectChanges()
      expect(caption()).toBeNull()
      expect(block.childrenLength).toBe(1)
    }

    const flowBlock = makeBlock('relative')
    flowBlock.childrenLength = 1
    fixture.componentRef.setInput('imgBlock', flowBlock)
    fixture.detectChanges()
    expect(caption()?.closest('button')?.getAttribute('aria-label')).toBe('取消图片标题')

    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('moves flow alignment into layout settings and removes it for floating and grouped images', async () => {
    await TestBed.configureTestingModule({imports: [ImageToolbar]}).compileComponents()
    const fixture = TestBed.createComponent(ImageToolbar)
    fixture.componentRef.setInput('imgBlock', makeBlock('relative'))
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    expect(host.querySelector('[name="align"]')).toBeNull()
    host.querySelector<HTMLButtonElement>('[aria-label="布局"]')!.click()
    fixture.detectChanges()
    expect(host.querySelectorAll('[name="align"]').length).toBe(3)
    const emit = spyOn(fixture.componentInstance.onItemClicked, 'emit')
    host.querySelector<HTMLButtonElement>('[aria-label="居中"]')!.click()
    expect(emit.calls.mostRecent().args[0]!.name).toBe('align')
    expect(emit.calls.mostRecent().args[0]!.value).toBe('center')
    fixture.componentRef.setInput('imgBlock', makeBlock('absolute'))
    fixture.detectChanges()
    expect(host.querySelector('[name="align"]')).toBeNull()
    fixture.componentRef.setInput('imgBlock', makeBlock('absolute', true))
    fixture.detectChanges()
    expect(host.querySelector('[aria-label="布局"]')).toBeNull()
    expect(host.querySelector('[name="align"]')).toBeNull()
  })

  it('reuses initial and live collapse state and preserves quick actions', async () => {
    await TestBed.configureTestingModule({imports: [ImageToolbar]}).compileComponents()
    const fixture = TestBed.createComponent(ImageToolbar)
    const state = new FloatingToolbarState({collapsed: true})
    fixture.componentRef.setInput('imgBlock', makeBlock('absolute'))
    fixture.componentRef.setInput('toolbarState', state)
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    expect(host.querySelector('[data-bc-image-format-toolbar]')).toBeNull()
    state.setCollapsed(false)
    fixture.detectChanges()
    const emit = spyOn(fixture.componentInstance.onItemClicked, 'emit')
    host.querySelector<HTMLButtonElement>('[aria-label="下载图片"]')!.click()
    expect(emit.calls.mostRecent().args[0]!.name).toBe('download')
    host.querySelector<HTMLButtonElement>('[aria-label="布局"]')!.click()
    fixture.detectChanges()
    expect(host.querySelector('.object-format__panel')).not.toBeNull()
    state.setCollapsed(true)
    fixture.detectChanges()
    state.setCollapsed(false)
    fixture.detectChanges()
    expect(host.querySelector('.object-format__panel')).toBeNull()
  })

})
