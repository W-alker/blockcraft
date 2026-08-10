import {ChangeDetectorRef} from '@angular/core'
import {TestBed} from '@angular/core/testing'
import {By} from '@angular/platform-browser'
import {CsTooltipDirective} from '@cses/ui'
import {ImageToolbar} from './image.toolbar'

describe('ImageToolbar', () => {
  function makeBlock(mode: 'relative' | 'absolute') {
    return {
      childrenLength: 0,
      props: {},
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
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('.bc_sizhouhuanrao')).toBeNull()

    fixture.componentRef.setInput('imgBlock', makeBlock('absolute'))
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('.bc_sizhouhuanrao')).not.toBeNull()

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

    const tooltipTitles = fixture.debugElement
      .queryAll(By.directive(CsTooltipDirective))
      .map(debugElement =>
        debugElement.injector.get(CsTooltipDirective).csTooltip(),
      )
    const expectedTitles = [
      '添加图片标题',
      '左对齐',
      '居中',
      '右对齐',
      '嵌入型',
      '四周型环绕',
      '上下型',
      '衬于文字下方',
      '浮于文字上方',
      '上移一层',
      '下移一层',
      '下载图片',
      '复制图片链接',
      '编辑图片',
    ]
    expect(tooltipTitles).toEqual(expectedTitles)
    expect(Array.from(host.querySelectorAll<HTMLElement>('[aria-label]'))
      .map(element => element.getAttribute('aria-label')))
      .toEqual(expectedTitles)

    fixture.destroy()
    TestBed.resetTestingModule()
  })
})
