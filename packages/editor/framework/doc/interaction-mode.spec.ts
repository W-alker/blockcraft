import {BehaviorSubject} from 'rxjs'
import {DocumentInteractionMode} from './interaction-mode'
import {OBJECT_TOOLBAR_INTERACTION} from '../../plugins/object-format-toolbar/interaction-config'

describe('DocumentInteractionMode', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

  function setup(initial = 'mixed', interaction?: any) {
    const host = document.createElement('div')
    host.setAttribute('data-block-id', 'root')
    const frame = document.createElement('div')
    frame.setAttribute('data-block-id', 'box')
    const text = document.createElement('p')
    text.setAttribute('data-block-id', 'text')
    frame.append(text)
    host.append(frame)
    document.body.append(host)
    const blocks: Record<string, any> = {
      root: {id: 'root', hostElement: host},
      box: {id: 'box', parentId: 'root', flavour: 'text-box', hostElement: frame, isReadonly: false},
      text: {id: 'text', parentId: 'box', flavour: 'paragraph', hostElement: text, isReadonly: false},
    }
    let init!: (root: any) => void
    const selection: any = {value: null}
    selection.selectBlock = jasmine.createSpy('selectBlock').and.callFake((block: any) => {
      selection.value = {isInSameBlock: true, firstBlockId: block.id, anchor: {type: 'selected'}, getBoundarySelectedChildIds: () => null}
    })
    selection.setCursorAtBlock = jasmine.createSpy('setCursorAtBlock').and.callFake(() => {
      selection.value = {isInSameBlock: true, firstBlockId: 'text', anchor: {type: 'text'}}
    })
    selection.blur = jasmine.createSpy('blur')
    const doc: any = {
      config: {interactionMode: initial, interaction, plugins: [{interactionConfigs: [OBJECT_TOOLBAR_INTERACTION]}]}, rootId: 'root', isReadonly: false,
      afterInit: (callback: typeof init) => { init = callback },
      getBlockById: (id: string) => blocks[id],
      readonlySwitch$: new BehaviorSubject(false),
      ngZone: {runOutsideAngular: (fn: () => void) => fn()},
      event: {status: {isComposing: false}}, selection,
      placement: {state: 'idle', getState: () => ({mode: 'relative'}),
        getAbsoluteObjectSelectionIds: () => null, startDrag: jasmine.createSpy('absoluteDrag')},
      dragController: {state: 'idle', startDrag: jasmine.createSpy('flowDrag')},
    }
    const mode = new DocumentInteractionMode(doc)
    init({hostElement: host})
    cleanups.push(() => { mode.destroy(); host.remove() })
    return {mode, doc, blocks, host, frame, text, selection}
  }

  function down(target: Element) {
    const event = new PointerEvent('pointerdown', {button: 0, bubbles: true, cancelable: true})
    target.dispatchEvent(event)
    return event
  }

  it('mixed leaves existing input paths untouched', () => {
    const h = setup()
    expect(down(h.text).defaultPrevented).toBeFalse()
    expect(h.selection.selectBlock).not.toHaveBeenCalled()
  })

  it('keeps mode and selection local and rejects changes during composition or pointer gestures', () => {
    const h = setup()
    h.doc.event.status.isComposing = true
    expect(h.mode.set('design')).toBeFalse()
    h.doc.event.status.isComposing = false
    down(h.text)
    expect(h.mode.set('immersive')).toBeFalse()
    document.dispatchEvent(new PointerEvent('pointerup', {bubbles: true}))
    expect(h.mode.set('immersive')).toBeTrue()
    expect(h.selection.selectBlock).not.toHaveBeenCalled()
    expect(h.selection.blur).not.toHaveBeenCalled()
  })

  it('design preserves direct text, table and object-content editing', () => {
    const h = setup('design')
    expect(down(h.text).defaultPrevented).toBeFalse()
    expect(h.selection.selectBlock).not.toHaveBeenCalled()
    expect(h.doc.dragController.startDrag).not.toHaveBeenCalled()
    expect(h.doc.placement.startDrag).not.toHaveBeenCalled()
    const key = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true})
    h.text.dispatchEvent(key)
    expect(key.defaultPrevented).toBeFalse()
  })

  it('immersive consumes object controls but leaves text editing alone', () => {
    const h = setup('immersive')
    const control = document.createElement('shape-resizer')
    h.frame.append(control)
    expect(down(control).defaultPrevented).toBeTrue()
    expect(down(h.text).defaultPrevented).toBeFalse()
  })

  it('bypasses native forms and preserves IME keys', () => {
    const h = setup('design')
    const input = document.createElement('input')
    h.frame.append(input)
    expect(down(input).defaultPrevented).toBeFalse()
    down(h.text)
    const ime = new KeyboardEvent('keydown', {key: 'Enter', isComposing: true, bubbles: true, cancelable: true})
    h.text.dispatchEvent(ime)
    expect(ime.defaultPrevented).toBeFalse()
    expect(h.selection.setCursorAtBlock).not.toHaveBeenCalled()
  })

  it('suspends interaction overrides in readonly and restores them afterwards', () => {
    const h = setup('design')
    h.doc.isReadonly = true
    h.doc.readonlySwitch$.next(true)
    expect(h.host.getAttribute('data-bc-interaction-mode')).toBe('mixed')
    expect(down(h.text).defaultPrevented).toBeFalse()
    h.doc.isReadonly = false
    h.doc.readonlySwitch$.next(false)
    expect(h.mode.value).toBe('design')
    expect(h.host.getAttribute('data-bc-interaction-mode')).toBe('design')
    expect(down(h.text).defaultPrevented).toBeFalse()
  })

  it('removes capture listeners on destroy and isolates editor instances', () => {
    const first = setup('design'), second = setup('mixed')
    expect(down(second.text).defaultPrevented).toBeFalse()
    expect(first.selection.selectBlock).not.toHaveBeenCalled()
    first.mode.destroy()
    expect(down(first.text).defaultPrevented).toBeFalse()
    expect(first.mode.set('immersive')).toBeFalse()
  })
  it('atomically projects custom policy before notification without changing selection or preset', () => {
    const h = setup()
    const snapshots: any[] = []
    const subscription = h.mode.policyChanges$.subscribe(snapshot => {
      snapshots.push(snapshot)
      expect(h.host.getAttribute('data-bc-interaction-hover-controls')).toBe(String(snapshot.policy.native.hoverControls))
    })
    expect(h.mode.setOverrides({native: {hoverControls: true, moveExistingBlocks: false},
      plugins: {objectToolbar: {contentSelection: true}}})).toBeTrue()
    expect(h.mode.value).toBe('mixed')
    expect(snapshots.length).toBe(2)
    expect(h.mode.policy.native.layoutControls).toBeTrue()
    expect(h.selection.selectBlock).not.toHaveBeenCalled()
    expect(h.mode.set('mixed')).toBeTrue()
    expect(h.mode.overrides).toEqual({})
    expect(h.mode.policy.native.hoverControls).toBeFalse()
    subscription.unsubscribe()
  })

  it('rejects invalid or in-flight overrides atomically and isolates instances', () => {
    const first = setup('design'), second = setup('mixed')
    const before = first.mode.snapshot
    expect(first.mode.setOverrides({native: {hoverControls: 'false'}} as any)).toBeFalse()
    first.doc.event.status.isComposing = true
    expect(first.mode.setOverrides({native: {hoverControls: false}})).toBeFalse()
    first.doc.event.status.isComposing = false
    first.doc.placement.state = 'dragging'
    expect(first.mode.setOverrides({native: {hoverControls: false}})).toBeFalse()
    first.doc.placement.state = 'idle'
    down(first.text)
    expect(first.mode.setOverrides({native: {hoverControls: false}})).toBeFalse()
    document.dispatchEvent(new PointerEvent('pointercancel', {bubbles: true}))
    expect(first.mode.snapshot).toBe(before)
    expect(first.mode.setOverrides({native: {hoverControls: false}})).toBeTrue()
    expect(second.mode.overrides).toEqual({})
  })

  it('controls visibility independently of movement, restores readonly projection and cleans attributes', () => {
    const h = setup()
    const control = document.createElement('shape-resizer'); h.frame.append(control)
    h.mode.setOverrides({native: {moveExistingBlocks: false}})
    expect(down(control).defaultPrevented).toBeFalse()
    document.dispatchEvent(new PointerEvent('pointerup', {bubbles: true}))
    h.mode.setOverrides({native: {layoutControls: false, moveExistingBlocks: true}})
    expect(down(control).defaultPrevented).toBeTrue()
    h.doc.isReadonly = true; h.doc.readonlySwitch$.next(true)
    expect(h.host.getAttribute('data-bc-interaction-move-existing-blocks')).toBe('false')
    h.doc.isReadonly = false; h.doc.readonlySwitch$.next(false)
    expect(h.host.getAttribute('data-bc-interaction-move-existing-blocks')).toBe('true')
    h.mode.destroy()
    expect(h.host.hasAttribute('data-bc-interaction-layout-controls')).toBeFalse()
  })

  it('prefers configured preset over legacy mode, preserves overrides and rejects invalid set arguments', () => {
    const h = setup('immersive', {preset: 'design', overrides: {native: {hoverControls: false}}})
    expect(h.mode.value).toBe('design')
    expect(h.mode.policy.native.hoverControls).toBeFalse()
    expect(h.mode.set(undefined as any)).toBeFalse()
    expect(h.mode.set(null as any)).toBeFalse()
    expect(h.mode.value).toBe('design')
  })

})
