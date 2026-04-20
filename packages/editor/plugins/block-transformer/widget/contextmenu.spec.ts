import {ElementRef} from "@angular/core";
import {BlockTransformContextMenu} from "./contextmenu";

describe('BlockTransformContextMenu keyboard navigation', () => {
  function createComponent(selection: any) {
    const cdr = {
      detectChanges: jasmine.createSpy('detectChanges'),
      markForCheck: jasmine.createSpy('markForCheck')
    }
    const component = new BlockTransformContextMenu(
      cdr as any,
      new ElementRef(document.createElement('div')),
      {
        onDestroy: jasmine.createSpy('onDestroy')
      } as any
    )

    component.list = [{
      flavour: 'paragraph',
      type: 'block',
      metadata: {label: 'Paragraph'}
    }] as any
    component.activeBlock = {id: 'block-1'} as any
    component.doc = {
      event: {
        status: {isComposing: false}
      },
      selection: {
        value: selection,
        recalculate: jasmine.createSpy('recalculate').and.callFake(() => ({value: selection}))
      }
    } as any

    return {component, cdr}
  }

  it('handles ArrowDown while the selection stays on the active block', () => {
    const {component} = createComponent({
      collapsed: true,
      start: {type: 'text'},
      firstBlock: {id: 'block-1'}
    })
    spyOn(component, 'selectDown')

    const preventDefault = jasmine.createSpy('preventDefault')
    const stopPropagation = jasmine.createSpy('stopPropagation')

    ;(component as any).handleRootKeydown({
      key: 'ArrowDown',
      preventDefault,
      stopPropagation
    } as unknown as KeyboardEvent)

    expect(preventDefault).toHaveBeenCalled()
    expect(stopPropagation).toHaveBeenCalled()
    expect(component.selectDown).toHaveBeenCalled()
  })

  it('ignores ArrowDown once the selection leaves the active block', () => {
    const {component} = createComponent({
      collapsed: true,
      start: {type: 'text'},
      firstBlock: {id: 'block-2'}
    })
    spyOn(component, 'selectDown')

    const preventDefault = jasmine.createSpy('preventDefault')
    const stopPropagation = jasmine.createSpy('stopPropagation')

    ;(component as any).handleRootKeydown({
      key: 'ArrowDown',
      preventDefault,
      stopPropagation
    } as unknown as KeyboardEvent)

    expect(preventDefault).not.toHaveBeenCalled()
    expect(stopPropagation).not.toHaveBeenCalled()
    expect(component.selectDown).not.toHaveBeenCalled()
  })
})
