import {TestBed} from '@angular/core/testing'
import {IframeCardComponent} from './iframe-card'

describe('IframeCardComponent', () => {
  it('renders with an Angular-safe static iframe sandbox', () => {
    TestBed.configureTestingModule({imports: [IframeCardComponent]})
    const fixture = TestBed.createComponent(IframeCardComponent)
    fixture.componentRef.setInput('props', {url: 'https://example.com'})
    fixture.componentRef.setInput('brand', {icon: 'bc_wangluo', title: '网页'})

    expect(() => fixture.detectChanges()).not.toThrow()

    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    const flags = iframe.getAttribute('sandbox')?.split(' ') ?? []
    expect(flags).toContain('allow-scripts')
    expect(flags).toContain('allow-same-origin')
    expect(flags).not.toContain('allow-presentation')
    expect(fixture.nativeElement.querySelector('.iframe-brand, .iframe-link, a')).toBeNull()
    expect(fixture.nativeElement.textContent.trim()).toBe('')
  })

  it('removes both Safari iframe hit layers while the card is offscreen', () => {
    TestBed.configureTestingModule({imports: [IframeCardComponent]})
    const fixture = TestBed.createComponent(IframeCardComponent)
    fixture.componentRef.setInput('props', {url: 'https://example.com'})
    fixture.detectChanges()
    const component = fixture.componentInstance as any
    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    const mask = fixture.nativeElement.querySelector('.iframe-mask') as HTMLElement

    component._setSafariHitTesting(false)
    expect(iframe.style.pointerEvents).toBe('none')
    expect(mask.style.pointerEvents).toBe('none')

    component._setSafariHitTesting(true)
    expect(iframe.style.pointerEvents).toBe('')
    expect(mask.style.pointerEvents).toBe('')
  })
})

describe('IframeCard URL lifecycle', () => {
  it('isolates same-origin links and replaces the iframe when switching to an external URL', () => {
    TestBed.configureTestingModule({imports: [IframeCardComponent]})
    const fixture = TestBed.createComponent(IframeCardComponent)
    fixture.componentRef.setInput('props', {url: 'https://example.com/', height: 424})
    fixture.componentRef.setInput('url', window.location.origin + '/report.html')
    fixture.componentRef.setInput('isolateUrl', true)
    fixture.detectChanges()
    const htmlFrame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    expect(htmlFrame.sandbox.value).not.toContain('allow-same-origin')
    expect(htmlFrame.src).toBe(window.location.origin + '/report.html')
    expect(fixture.nativeElement.querySelector('.iframe-link')).toBeNull()
    fixture.componentRef.setInput('url', 'https://example.com/')
    fixture.componentRef.setInput('isolateUrl', false)
    fixture.componentRef.setInput('props', {url: 'https://example.com/'})
    fixture.detectChanges()
    const urlFrame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    expect(urlFrame).not.toBe(htmlFrame)
    expect(urlFrame.sandbox.value).toContain('allow-same-origin')
    expect(urlFrame.src).toBe('https://example.com/')
    fixture.destroy()
  })

  it('does not reload the iframe when only presentation props change', () => {
    TestBed.configureTestingModule({imports: [IframeCardComponent]})
    const fixture = TestBed.createComponent(IframeCardComponent)
    fixture.componentRef.setInput('props', {url: 'https://example.com/', height: 424})
    fixture.componentRef.setInput('url', 'https://example.com/')
    fixture.detectChanges()
    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    const setter = spyOnProperty(iframe, 'src', 'set').and.callThrough()
    fixture.componentRef.setInput('props', {url: 'https://example.com/', height: 500})
    fixture.detectChanges()
    expect(setter).not.toHaveBeenCalled()
    fixture.componentInstance.reload()
    expect(setter).toHaveBeenCalledTimes(1)
    fixture.destroy()
  })
})
