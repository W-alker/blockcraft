import {TestBed} from '@angular/core/testing'
import {IframeCardComponent} from './iframe-card'

describe('IframeCardComponent', () => {
  it('renders with an Angular-safe static iframe sandbox', () => {
    TestBed.configureTestingModule({imports: [IframeCardComponent]})
    const fixture = TestBed.createComponent(IframeCardComponent)
    fixture.componentRef.setInput('props', {url: 'https://example.com'})

    expect(() => fixture.detectChanges()).not.toThrow()

    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    const flags = iframe.getAttribute('sandbox')?.split(' ') ?? []
    expect(flags).toContain('allow-scripts')
    expect(flags).toContain('allow-same-origin')
    expect(flags).not.toContain('allow-presentation')
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
