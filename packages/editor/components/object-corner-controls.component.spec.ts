import {ComponentFixture, TestBed} from '@angular/core/testing'
import {ObjectCornerControlsComponent} from './object-corner-controls.component'

describe('ObjectCornerControlsComponent', () => {
  let fixture: ComponentFixture<ObjectCornerControlsComponent>
  let container: HTMLElement
  let block: {isReadonly: boolean; doc: {selection: {selectBlock: jasmine.Spy}}}

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [ObjectCornerControlsComponent]}).compileComponents()
    fixture = TestBed.createComponent(ObjectCornerControlsComponent)
    block = {isReadonly: false, doc: {selection: {selectBlock: jasmine.createSpy('selectBlock')}}}
    fixture.componentRef.setInput('block', block)
    fixture.componentRef.setInput('label', '文本框')
    container = document.createElement('div')
    document.body.append(container)
    container.append(fixture.nativeElement)
    fixture.detectChanges()
  })

  afterEach(() => {
    fixture.destroy()
    container.remove()
    TestBed.resetTestingModule()
  })

  const corner = () => fixture.nativeElement.querySelector('[data-bc-object-corner="nw"]') as HTMLButtonElement
  const floatingHandle = () => fixture.nativeElement.querySelector('[data-bc-object-floating-handle]') as HTMLButtonElement

  it('keeps four named selection buttons outside editing and drag handling', () => {
    const host = fixture.nativeElement as HTMLElement
    expect(host.getAttribute('contenteditable')).toBe('false')
    expect(host.hasAttribute('data-bc-selection-interaction-ignore')).toBeTrue()
    expect(host.getAttribute('data-bc-print-exclude')).toBe('true')
    expect(host.querySelectorAll('[data-bc-object-corner]').length).toBe(4)
    expect(corner().getAttribute('aria-label')).toBe('左上角：选中文本框')
    for (const button of Array.from(host.querySelectorAll('button'))) {
      expect(button.hasAttribute('data-bc-object-select-handle')).toBeTrue()
      expect(button.hasAttribute('data-bc-nodrag')).toBeTrue()
      expect(button.hasAttribute('data-bc-object-drag-handle')).toBeFalse()
    }
    expect(host.querySelectorAll('[data-bc-object-entry-edge]').length).toBe(0)
    fixture.componentRef.setInput('movable', true)
    fixture.detectChanges()
    expect(host.querySelectorAll('[data-bc-object-entry-edge][data-bc-object-drag-handle]').length).toBe(4)
    expect(floatingHandle().hasAttribute('data-bc-object-drag-handle')).toBeTrue()
    expect(floatingHandle().hasAttribute('data-bc-nodrag')).toBeFalse()
    expect(floatingHandle().getAttribute('aria-label')).toBe('选中文本框并拖动')
  })

  it('delegates floating-handle pointer gestures to ObjectDrag without reselecting after a drag', () => {
    fixture.componentRef.setInput('movable', true)
    fixture.detectChanges()
    const bubbled = jasmine.createSpy('pointerdown')
    container.addEventListener('pointerdown', bubbled)
    const down = new PointerEvent('pointerdown', {button: 0, isPrimary: true, bubbles: true, cancelable: true})
    floatingHandle().dispatchEvent(down)
    expect(down.defaultPrevented).toBeFalse()
    expect(bubbled).toHaveBeenCalled()
    floatingHandle().dispatchEvent(new MouseEvent('click', {button: 0, detail: 1, bubbles: true, cancelable: true}))
    expect(block.doc.selection.selectBlock).not.toHaveBeenCalled()
    floatingHandle().dispatchEvent(new MouseEvent('click', {button: 0, detail: 0, bubbles: true, cancelable: true}))
    expect(block.doc.selection.selectBlock).toHaveBeenCalledOnceWith(block)
  })

  it('keeps a non-movable floating handle selection-only', () => {
    const down = new PointerEvent('pointerdown', {button: 0, isPrimary: true, cancelable: true})
    floatingHandle().dispatchEvent(down)
    expect(down.defaultPrevented).toBeTrue()
    floatingHandle().dispatchEvent(new MouseEvent('click', {button: 0, detail: 1, cancelable: true}))
    expect(block.doc.selection.selectBlock).toHaveBeenCalledOnceWith(block)
  })

  it('preserves the editing selection during pointer press and movement, selecting only on click', () => {
    const bubbled = jasmine.createSpy('bubbled')
    container.addEventListener('pointerdown', bubbled)
    const down = new PointerEvent('pointerdown', {button: 0, isPrimary: true, bubbles: true, cancelable: true})
    corner().dispatchEvent(down)
    corner().dispatchEvent(new PointerEvent('pointermove', {isPrimary: true, clientX: 50, clientY: 50, bubbles: true}))
    corner().dispatchEvent(new PointerEvent('pointerup', {button: 0, isPrimary: true, bubbles: true}))
    expect(down.defaultPrevented).toBeTrue()
    expect(bubbled).not.toHaveBeenCalled()
    expect(block.doc.selection.selectBlock).not.toHaveBeenCalled()
    const click = new MouseEvent('click', {button: 0, bubbles: true, cancelable: true})
    corner().dispatchEvent(click)
    expect(click.defaultPrevented).toBeTrue()
    expect(block.doc.selection.selectBlock).toHaveBeenCalledOnceWith(block)
  })

  it('does not consume secondary pointer presses or select from secondary clicks', () => {
    for (const properties of [{button: 2, isPrimary: true}, {button: 0, isPrimary: false}]) {
      const down = new PointerEvent('pointerdown', {...properties, bubbles: true, cancelable: true})
      corner().dispatchEvent(down)
      expect(down.defaultPrevented).toBeFalse()
    }
    corner().dispatchEvent(new MouseEvent('click', {button: 2, bubbles: true, cancelable: true}))
    expect(block.doc.selection.selectBlock).not.toHaveBeenCalled()
  })

  it('rejects selection when permissions change before the click', () => {
    corner().dispatchEvent(new PointerEvent('pointerdown', {button: 0, isPrimary: true, cancelable: true}))
    block.isReadonly = true
    corner().click()
    expect(block.doc.selection.selectBlock).not.toHaveBeenCalled()
  })

  for (const key of ['Enter', ' ']) {
    it(`retains native ${key === ' ' ? 'Space' : key} button activation without routing it to editor hotkeys`, () => {
      const bubbled = jasmine.createSpy('keydown')
      container.addEventListener('keydown', bubbled)
      const keydown = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true})
      corner().dispatchEvent(keydown)
      expect(keydown.defaultPrevented).toBeFalse()
      expect(bubbled).not.toHaveBeenCalled()
      expect(block.doc.selection.selectBlock).not.toHaveBeenCalled()
      // 浏览器键盘激活按钮发出 detail=0 的 click；不能依赖坐标或 pointerdown。
      corner().dispatchEvent(new MouseEvent('click', {button: 0, detail: 0, bubbles: true, cancelable: true}))
      expect(block.doc.selection.selectBlock).toHaveBeenCalledOnceWith(block)
    })
  }
})
