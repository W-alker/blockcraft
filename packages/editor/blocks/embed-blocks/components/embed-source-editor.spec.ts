import {TestBed} from '@angular/core/testing'
import {By} from '@angular/platform-browser'
import {CS_MODAL_DATA, CsButtonComponent, CsInputDirective} from '@cses/ui'
import {EmbedFrameCreator} from './embed-source-editor'
import {EmbedBlockSchema} from '../embed-block'
import {FigmaEmbedBlockSchema} from '../figma-embed-block'

describe('shared link paste popup', () => {
  it('prefills HTML file URLs without changing state after view initialization', () => {
    TestBed.configureTestingModule({imports: [EmbedFrameCreator]})
    const fixture = TestBed.createComponent(EmbedFrameCreator)
    fixture.componentRef.setInput('schema', EmbedBlockSchema)
    fixture.componentRef.setInput('initialUrl', 'https://example.com/report.html')
    expect(() => fixture.detectChanges()).not.toThrow()
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement
    expect(input.value).toBe('https://example.com/report.html')
    expect(button.matches(':disabled')).toBeFalse()
    expect(fixture.debugElement.query(By.directive(CsInputDirective))).not.toBeNull()
    expect(fixture.debugElement.query(By.directive(CsButtonComponent))).not.toBeNull()
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull()
    const submit = spyOn(fixture.componentInstance.onSubmit, 'emit')
    button.click()
    expect(submit).toHaveBeenCalledWith('https://example.com/report.html')
    fixture.destroy()
  })

  it('disables confirmation for raw HTML and active URL schemes', () => {
    TestBed.configureTestingModule({imports: [EmbedFrameCreator]})
    const fixture = TestBed.createComponent(EmbedFrameCreator)
    fixture.componentRef.setInput('schema', EmbedBlockSchema)
    fixture.detectChanges()
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement
    const submit = spyOn(fixture.componentInstance.onSubmit, 'emit')
    for (const value of ['<iframe src="https://example.com"></iframe>', 'javascript:alert(1)', 'data:text/html,hi']) {
      input.value = value
      input.dispatchEvent(new Event('input'))
      fixture.detectChanges()
      expect(button.matches(':disabled')).toBeTrue()
      expect(button.getAttribute('aria-disabled')).toBe('true')
      button.click()
      expect(submit).not.toHaveBeenCalled()
    }
    input.value = 'https://player.bilibili.com/player.html?bvid=BV1B7411m7LV'
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()
    expect(button.matches(':disabled')).toBeFalse()
    fixture.destroy()
  })

  it('retains validation for manually assembled legacy Figma creators', () => {
    TestBed.configureTestingModule({imports: [EmbedFrameCreator]})
    const fixture = TestBed.createComponent(EmbedFrameCreator)
    fixture.componentRef.setInput('schema', FigmaEmbedBlockSchema)
    fixture.componentRef.setInput('initialUrl', 'https://example.com/report.html')
    fixture.detectChanges()
    expect((fixture.nativeElement.querySelector('button') as HTMLButtonElement).matches(':disabled')).toBeTrue()
    fixture.destroy()
  })

  it('receives the same schema and prefilled URL through cses-ui modal data', () => {
    TestBed.configureTestingModule({imports: [EmbedFrameCreator], providers: [{
      provide: CS_MODAL_DATA, useValue: {schema: EmbedBlockSchema, initialUrl: 'https://example.com/demo.html'},
    }]})
    const fixture = TestBed.createComponent(EmbedFrameCreator)
    fixture.detectChanges()
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('https://example.com/demo.html')
    const submit = spyOn(fixture.componentInstance.onSubmit, 'emit')
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
    expect(submit).toHaveBeenCalledWith('https://example.com/demo.html')
    fixture.destroy()
  })
})
