import { DocInternalDragController, InternalDragState } from "./internal-drag.controller"

function makeMockDoc(): any {
  return {
    isReadonly: false,
    onDestroy$: { subscribe: () => ({ unsubscribe: () => {} }) },
    root: { hostElement: document.createElement('div') },
    getBlockById: () => null,
    schemas: { has: () => false, get: () => null },
    selection: { setSuppressRecalculate: jasmine.createSpy('setSuppressRecalculate') },
    dndService: {
      dragStatus$: { next: jasmine.createSpy('next'), value: 'end' },
      onSortBlock: jasmine.createSpy('onSortBlock'),
      onInsertNewBlock: jasmine.createSpy('onInsertNewBlock'),
    },
  }
}

function makePointerEvent(type: string, opts: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent(type, { pointerId: 1, clientX: 0, clientY: 0, button: 0, ...opts })
}

describe('DocInternalDragController state machine', () => {
  let ctrl: DocInternalDragController
  let target: HTMLElement
  let doc: ReturnType<typeof makeMockDoc>

  beforeEach(() => {
    doc = makeMockDoc()
    ctrl = new DocInternalDragController(doc)
    target = document.createElement('div')
    document.body.appendChild(target)
    document.body.appendChild(doc.root.hostElement)
  })

  afterEach(() => {
    doc.root.hostElement.remove()
    target.remove()
    ctrl.destroy()
  })

  it('starts in idle', () => {
    expect(ctrl.state).toBe('idle')
  })

  it('startDrag transitions idle → armed', () => {
    const evt = makePointerEvent('pointerdown')
    Object.defineProperty(evt, 'target', { value: target })
    ctrl.startDrag(evt, { kind: 'origin-block', blockId: 'b1' })
    expect(ctrl.state).toBe('armed')
  })

  it('cancel from armed returns to idle', () => {
    const evt = makePointerEvent('pointerdown')
    Object.defineProperty(evt, 'target', { value: target })
    ctrl.startDrag(evt, { kind: 'origin-block', blockId: 'b1' })
    ctrl.cancel()
    expect(ctrl.state).toBe('idle')
  })

  it('ignores second startDrag while not idle', () => {
    const evt1 = makePointerEvent('pointerdown', { pointerId: 1 })
    const evt2 = makePointerEvent('pointerdown', { pointerId: 2 })
    Object.defineProperty(evt1, 'target', { value: target })
    Object.defineProperty(evt2, 'target', { value: target })
    ctrl.startDrag(evt1, { kind: 'origin-block', blockId: 'b1' })
    ctrl.startDrag(evt2, { kind: 'origin-block', blockId: 'b2' })
    expect(ctrl.state).toBe('armed')
    // second startDrag should not overwrite activePointerId (still 1 from first call)
  })

  function dispatchPointerMove(el: HTMLElement, clientX: number, clientY: number, pointerId = 1, pointerType = 'mouse') {
    const evt = new PointerEvent('pointermove', { pointerId, clientX, clientY, pointerType, bubbles: true })
    el.dispatchEvent(evt)
  }

  it('armed → dragging when movement exceeds default mouse threshold (4px)', () => {
    const evt = makePointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse' })
    Object.defineProperty(evt, 'target', { value: target })
    ctrl.startDrag(evt, { kind: 'origin-block', blockId: 'b1' })

    dispatchPointerMove(target, 102, 102)
    expect(ctrl.state).toBe('armed')

    dispatchPointerMove(target, 104, 104)
    expect(ctrl.state).toBe('dragging')
  })

  it('uses 8px threshold for touch input', () => {
    const evt = makePointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
    Object.defineProperty(evt, 'target', { value: target })
    ctrl.startDrag(evt, { kind: 'origin-block', blockId: 'b1' })

    dispatchPointerMove(target, 105, 105, 1, 'touch')
    expect(ctrl.state).toBe('armed')

    dispatchPointerMove(target, 108, 108, 1, 'touch')
    expect(ctrl.state).toBe('dragging')
  })

  it('explicit movementThreshold overrides per-pointerType default', () => {
    const evt = makePointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse' })
    Object.defineProperty(evt, 'target', { value: target })
    ctrl.startDrag(evt, { kind: 'origin-block', blockId: 'b1' }, { movementThreshold: 20 })

    dispatchPointerMove(target, 110, 110)
    expect(ctrl.state).toBe('armed')

    dispatchPointerMove(target, 120, 120)
    expect(ctrl.state).toBe('dragging')
  })

  function dispatchPointerUp(el: HTMLElement, pointerId = 1) {
    el.dispatchEvent(new PointerEvent('pointerup', { pointerId, bubbles: true }))
  }

  function dispatchPointerCancel(el: HTMLElement, pointerId = 1) {
    el.dispatchEvent(new PointerEvent('pointercancel', { pointerId, bubbles: true }))
  }

  it('pointerup from armed returns to idle without commit', () => {
    const evt = makePointerEvent('pointerdown', { clientX: 100, clientY: 100 })
    Object.defineProperty(evt, 'target', { value: target })
    ctrl.startDrag(evt, { kind: 'origin-block', blockId: 'b1' })
    dispatchPointerUp(target)
    expect(ctrl.state).toBe('idle')
  })

  it('pointercancel from dragging returns to idle', () => {
    const evt = makePointerEvent('pointerdown', { clientX: 100, clientY: 100 })
    Object.defineProperty(evt, 'target', { value: target })
    ctrl.startDrag(evt, { kind: 'origin-block', blockId: 'b1' })
    dispatchPointerMove(target, 110, 110)
    expect(ctrl.state).toBe('dragging')
    dispatchPointerCancel(target)
    expect(ctrl.state).toBe('idle')
  })

  it('dropping state transitions to idle after pointerup', () => {
    const evt = makePointerEvent('pointerdown', { clientX: 100, clientY: 100 })
    Object.defineProperty(evt, 'target', { value: target })
    ctrl.startDrag(evt, { kind: 'origin-block', blockId: 'b1' })
    dispatchPointerMove(target, 110, 110)
    expect(ctrl.state).toBe('dragging')
    dispatchPointerUp(target)
    expect(ctrl.state).toBe('idle')
  })

  it('ESC keydown during dragging cancels', () => {
    const evt = makePointerEvent('pointerdown', { clientX: 100, clientY: 100 })
    Object.defineProperty(evt, 'target', { value: target })
    ctrl.startDrag(evt, { kind: 'origin-block', blockId: 'b1' })
    dispatchPointerMove(target, 110, 110)
    expect(ctrl.state).toBe('dragging')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(ctrl.state).toBe('idle')
  })

  it('window blur during dragging cancels', () => {
    const evt = makePointerEvent('pointerdown', { clientX: 100, clientY: 100 })
    Object.defineProperty(evt, 'target', { value: target })
    ctrl.startDrag(evt, { kind: 'origin-block', blockId: 'b1' })
    dispatchPointerMove(target, 110, 110)
    expect(ctrl.state).toBe('dragging')
    window.dispatchEvent(new Event('blur'))
    expect(ctrl.state).toBe('idle')
  })
})
