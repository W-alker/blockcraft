import {fakeAsync, tick} from '@angular/core/testing'
import {BehaviorSubject} from 'rxjs'
import {BlockPlacementInteractionController} from './interaction.controller'
import {BlockPlacementRuntime} from './runtime'

describe('Placement multi-object drag', () => {
  function setup() {
    const plane = document.createElement('div')
    document.body.append(plane)
    Object.defineProperty(plane, 'clientWidth', {value: 400})
    plane.getBoundingClientRect = () => ({width: 800, left: 0, top: 0}) as DOMRect
    const blocks = ['a', 'b'].map((id, index) => {
      const hostElement = document.createElement('div')
      plane.append(hostElement)
      return {
        id, flavour: 'shape', parentId: 'layout', hostElement,
        props: {position: `${index * 100} ${index * 50}`},
        changeDetectorRef: {detectChanges: jasmine.createSpy('detectChanges')},
      }
    })
    const json = {
      anchor: {type: 'boundary', blockId: 'layout', index: 0},
      head: {type: 'boundary', blockId: 'layout', index: 2},
      commonParent: 'layout',
    }
    const selection = {...json, getBoundarySelectedChildIds: () => ['a', 'b'], toJSON: () => json}
    const locked = new Set<string>()
    const removed = new Set<string>()
    const releaseLease = jasmine.createSpy('releaseLease')
    const commitOne = jasmine.createSpy('commitOne')
    const commitBatch = jasmine.createSpy('commitBatch').and.returnValue(true)
    const doc: any = {
      rootId: 'root', isReadonly: false,
      getBlockById: (id: string) => removed.has(id) ? null : blocks.find(block => block.id === id),
      model: {
        getParentId: (id: string) => blocks.find(block => block.id === id)?.parentId,
        getFlavour: (id: string) => id === 'layout' ? 'placement-layout' : 'shape',
      },
      schemas: {get: () => ({metadata: {placement: {modes: ['absolute']}}})},
      readonlyManager: {
        isReadonly: (block: string | {id: string}) => locked.has(typeof block === 'string' ? block : block.id),
        containsReadonly: () => false,
      },
      readonlySwitch$: new BehaviorSubject(false),
      dragController: {state: 'idle'},
      selection: {
        value: selection, blur: jasmine.createSpy('blur'), replay: jasmine.createSpy('replay'),
        setSuppressRecalculate: jasmine.createSpy('setSuppressRecalculate'),
      },
      virtualization: {acquireBlockViewLease: jasmine.createSpy('lease').and.returnValue(releaseLease)},
      ngZone: {runOutsideAngular: (fn: () => void) => fn()},
      crud: {undoManager: {stopCapturing: jasmine.createSpy('stopCapturing')}},
    }
    const controller = new BlockPlacementInteractionController(doc, new BlockPlacementRuntime(doc), commitOne, commitBatch)
    return {plane, blocks, selection, json, locked, removed, doc, releaseLease, commitOne, commitBatch, controller}
  }

  function pointer(type: string, x = 20, y = 20) {
    return new PointerEvent(type, {pointerId: 1, pointerType: 'mouse', button: 0,
      clientX: x, clientY: y, bubbles: true, cancelable: true})
  }

  it('previews every target once per frame and commits the measured-scale delta as one batch', fakeAsync(() => {
    const h = setup()
    try {
      expect(h.controller.startDrag(pointer('pointerdown'), h.blocks[1] as any)).toBeTrue()
      window.dispatchEvent(pointer('pointermove', 100, 60))
      window.dispatchEvent(pointer('pointermove', 120, 80))
      expect(h.blocks[0].hostElement.style.transform).toBe('')
      tick(17)
      h.blocks.forEach(block => expect(block.hostElement.style.transform).toContain('translate3d(50px, 30px'))
      expect(h.commitBatch).not.toHaveBeenCalled()
      expect(h.doc.selection.blur).not.toHaveBeenCalled()
      window.dispatchEvent(pointer('pointerup', 120, 80))
      expect(h.commitBatch).toHaveBeenCalledOnceWith([
        {block: h.blocks[0], position: {x: 50, y: 30}},
        {block: h.blocks[1], position: {x: 150, y: 80}},
      ])
      expect(h.commitOne).not.toHaveBeenCalled()
      expect(h.doc.virtualization.acquireBlockViewLease).toHaveBeenCalledOnceWith(['a', 'b'])
      expect(h.doc.selection.replay).toHaveBeenCalledOnceWith(h.json)
      expect(h.releaseLease).toHaveBeenCalledTimes(1)
      expect(h.doc.crud.undoManager.stopCapturing).toHaveBeenCalledTimes(2)
      h.blocks.forEach(block => expect(block.hostElement.style.transform).toBe(''))
    } finally {h.controller.destroy(); h.plane.remove()}
  }))

  for (const reason of ['removed', 'locked', 'reparented', 'position', 'Escape', 'pointercancel', 'blur', 'destroy']) {
    it(`cancels all previews without a partial commit when ${reason}`, fakeAsync(() => {
      const h = setup()
      try {
        h.controller.startDrag(pointer('pointerdown'), h.blocks[0] as any)
        window.dispatchEvent(pointer('pointermove', 120, 80))
        tick(17)
        if (reason === 'removed') h.removed.add('b')
        if (reason === 'locked') h.locked.add('b')
        if (reason === 'reparented') h.blocks[1].parentId = 'elsewhere'
        if (reason === 'position') h.blocks[1].props.position = '210 70'
        if (reason === 'Escape') {
          const escape = new KeyboardEvent('keydown', {key: 'Escape', cancelable: true})
          window.dispatchEvent(escape)
          expect(escape.defaultPrevented).toBeTrue()
        }
        if (reason === 'pointercancel') window.dispatchEvent(pointer('pointercancel'))
        if (reason === 'blur') window.dispatchEvent(new Event('blur'))
        if (reason === 'destroy') h.controller.destroy()
        window.dispatchEvent(pointer('pointerup', 120, 80))
        expect(h.commitBatch).not.toHaveBeenCalled()
        h.blocks.forEach(block => expect(block.hostElement.style.transform).toBe(''))
        expect(h.releaseLease).toHaveBeenCalledTimes(1)
        expect(h.doc.selection.setSuppressRecalculate).toHaveBeenCalledWith(false)
      } finally {h.controller.destroy(); h.plane.remove()}
    }))
  }
})
