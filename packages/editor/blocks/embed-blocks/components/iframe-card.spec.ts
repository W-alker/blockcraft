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
})
