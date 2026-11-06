import {ComponentFixture, TestBed} from '@angular/core/testing'
import {ObjectEdgeControlsComponent} from './object-edge-controls.component'

describe('ObjectEdgeControlsComponent', () => {
  let fixture: ComponentFixture<ObjectEdgeControlsComponent>
  let block: {isReadonly: boolean; doc: {selection: {selectBlock: jasmine.Spy}}}
  const edge = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [ObjectEdgeControlsComponent]}).compileComponents()
    fixture = TestBed.createComponent(ObjectEdgeControlsComponent)
    block = {isReadonly: false, doc: {selection: {selectBlock: jasmine.createSpy('selectBlock')}}}
    fixture.componentRef.setInput('block', block)
    fixture.detectChanges()
  })

  afterEach(() => {
    fixture.destroy()
    TestBed.resetTestingModule()
  })

  it('leaves pointer gestures to the existing ObjectDrag handler without replaying a drop selection', () => {
    const down = new PointerEvent('pointerdown', {bubbles: true, cancelable: true, button: 0, isPrimary: true})
    edge().dispatchEvent(down)
    expect(down.defaultPrevented).toBeFalse()
    edge().dispatchEvent(new MouseEvent('click', {detail: 1, button: 0, cancelable: true}))
    expect(block.doc.selection.selectBlock).not.toHaveBeenCalled()
    for (const button of fixture.nativeElement.querySelectorAll('button')) {
      expect(button.hasAttribute('data-bc-object-drag-handle')).toBeTrue()
    }
  })

  for (const key of ['Enter', ' ']) {
    it(`selects through native ${key === ' ' ? 'Space' : key} activation without editing text`, () => {
      const bubbled = jasmine.createSpy('keydown')
      fixture.nativeElement.addEventListener('keydown', bubbled)
      const down = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true})
      edge().dispatchEvent(down)
      expect(down.defaultPrevented).toBeFalse()
      expect(bubbled).not.toHaveBeenCalled()
      edge().click()
      expect(block.doc.selection.selectBlock).toHaveBeenCalledOnceWith(block)
    })
  }

  it('does not select after readonly changes or through a secondary click', () => {
    edge().dispatchEvent(new MouseEvent('click', {detail: 0, button: 2}))
    block.isReadonly = true
    edge().click()
    expect(block.doc.selection.selectBlock).not.toHaveBeenCalled()
  })
})
