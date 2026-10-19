import {TestBed} from '@angular/core/testing'
import {InlineObjectToolbarComponent, INLINE_OBJECT_LAYOUT_OPTIONS} from './inline-object-toolbar.component'

describe('InlineObjectToolbarComponent', () => {
  it('keeps four-sided wrapping as one action for every inline object', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [InlineObjectToolbarComponent],
    }).createComponent(InlineObjectToolbarComponent)
    fixture.componentRef.setInput('layout', 'wrap')
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelectorAll(
      'bc-float-toolbar-item[name="inline-wrap-side"]',
    ).length).toBe(0)
  })

  it('filters unsupported block layouts while preserving active state and shared actions', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [InlineObjectToolbarComponent],
    }).createComponent(InlineObjectToolbarComponent)
    fixture.componentRef.setInput('label', '')
    fixture.componentRef.setInput('layout', 'top-bottom')
    fixture.componentRef.setInput('layoutOptions', INLINE_OBJECT_LAYOUT_OPTIONS.filter(
      option => ['inline', 'wrap', 'top-bottom'].includes(option.value),
    ))
    fixture.detectChanges()
    const host: HTMLElement = fixture.nativeElement
    expect(host.querySelectorAll('bc-float-toolbar-item').length).toBe(3)
    expect(host.querySelector('[aria-label="上下型"]')?.classList.contains('active')).toBe(true)
    expect(host.querySelector('.bc-inline-object-toolbar__type')).toBeNull()
    expect(host.querySelector('.bc-float-toolbar__divider')).toBeNull()
    const emit = spyOn(fixture.componentInstance.onItemClicked, 'emit')
    host.querySelector<HTMLElement>('[aria-label="四周型环绕"]')!.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}))
    expect(emit).toHaveBeenCalledWith(jasmine.objectContaining({name: 'object-layout', value: 'wrap'}))

    fixture.componentRef.setInput('layoutOptions', INLINE_OBJECT_LAYOUT_OPTIONS)
    fixture.componentRef.setInput('label', '形状')
    fixture.detectChanges()
    expect(host.querySelectorAll('bc-float-toolbar-item').length).toBe(5)
    expect(host.querySelector('.bc-inline-object-toolbar__type')?.textContent).toBe('形状')
    expect(host.querySelector('.bc-float-toolbar__divider')).not.toBeNull()
  })
})
