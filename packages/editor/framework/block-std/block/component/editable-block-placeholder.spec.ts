import { EditableBlockComponent } from "./editable-block"
import type { BlockPlaceholderConfig } from "../../schema/block-schema"
import type { ISelectionPoint } from "../../../modules/selection/types"
import { BehaviorSubject, Subject } from "rxjs"
import { EventEmitter } from "@angular/core"

/**
 * Build a minimal stub that satisfies the methods/properties used by the
 * placeholder paths. We bypass Angular's DI because this is a pure logic test.
 */
function makeStub(opts: {
  id?: string
  textLength?: number
  heading?: number
  placeholderConfig?: BlockPlaceholderConfig
} = {}): EditableBlockComponent<any> {
  const host = document.createElement('p')
  document.body.appendChild(host)
  const stub = Object.create(EditableBlockComponent.prototype) as any
  stub.hostElement = host
  Object.defineProperty(stub, 'id', { value: opts.id ?? 'b1' })
  Object.defineProperty(stub, 'textLength', { value: opts.textLength ?? 0, configurable: true })
  stub._props = { heading: opts.heading }
  Object.defineProperty(stub, 'props', { get: () => stub._props })
  stub._placeholderConfig = opts.placeholderConfig
  stub._lastAppliedPlaceholder = ''
  stub._isFocused = false
  return stub as EditableBlockComponent<any>
}

function makeTextPoint(blockId: string): ISelectionPoint {
  const point: any = { blockId, type: 'text', offset: 0 }
  Object.defineProperty(point, 'block', { value: null })
  return point as ISelectionPoint
}

describe('EditableBlockComponent placeholder methods', () => {
  let stub: any
  let host: HTMLElement

  afterEach(() => {
    if (host) host.remove()
  })

  describe('_isSelfFocused', () => {
    it('returns false when selection is null', () => {
      stub = makeStub({ id: 'b1' })
      host = stub.hostElement
      expect(stub._isSelfFocused(null)).toBe(false)
    })

    it('returns false when selection point is "selected" type', () => {
      stub = makeStub({ id: 'b1' })
      host = stub.hostElement
      const sel = { start: { type: 'selected', blockId: 'b1' } } as any
      expect(stub._isSelfFocused(sel)).toBe(false)
    })

    it('returns false when text selection points at a different block', () => {
      stub = makeStub({ id: 'b1' })
      host = stub.hostElement
      const sel = { start: makeTextPoint('b2') } as any
      expect(stub._isSelfFocused(sel)).toBe(false)
    })

    it('returns true when text selection points at this block by id', () => {
      stub = makeStub({ id: 'b1' })
      host = stub.hostElement
      const sel = { start: makeTextPoint('b1') } as any
      expect(stub._isSelfFocused(sel)).toBe(true)
    })
  })

  describe('_syncPlaceholderState', () => {
    it('does nothing when not focused', () => {
      stub = makeStub({ placeholderConfig: 'P' })
      host = stub.hostElement
      stub._isFocused = false
      stub._syncPlaceholderState()
      expect(host.hasAttribute('data-placeholder')).toBe(false)
      expect(host.classList.contains('empty')).toBe(false)
    })

    it('does nothing when focused but text is non-empty', () => {
      stub = makeStub({ textLength: 3, placeholderConfig: 'P' })
      host = stub.hostElement
      stub._isFocused = true
      stub._syncPlaceholderState()
      expect(host.hasAttribute('data-placeholder')).toBe(false)
      expect(host.classList.contains('empty')).toBe(false)
    })

    it('writes data-placeholder + .empty when focused, empty, and config present', () => {
      stub = makeStub({ placeholderConfig: 'Type something' })
      host = stub.hostElement
      stub._isFocused = true
      stub._syncPlaceholderState()
      expect(host.getAttribute('data-placeholder')).toBe('Type something')
      expect(host.classList.contains('empty')).toBe(true)
    })

    it('does not write when config is undefined even if focused and empty', () => {
      stub = makeStub({ placeholderConfig: undefined })
      host = stub.hostElement
      stub._isFocused = true
      stub._syncPlaceholderState()
      expect(host.hasAttribute('data-placeholder')).toBe(false)
      expect(host.classList.contains('empty')).toBe(false)
    })

    it('resolves heading text when config is object with heading map', () => {
      stub = makeStub({
        heading: 1,
        placeholderConfig: { default: 'D', heading: { 1: 'H1' } },
      })
      host = stub.hostElement
      stub._isFocused = true
      stub._syncPlaceholderState()
      expect(host.getAttribute('data-placeholder')).toBe('H1')
    })

    it('is idempotent — second call with same state does not re-write', () => {
      stub = makeStub({ placeholderConfig: 'P' })
      host = stub.hostElement
      stub._isFocused = true
      stub._syncPlaceholderState()

      const spy = spyOn(host, 'setAttribute').and.callThrough()
      stub._syncPlaceholderState()
      expect(spy).not.toHaveBeenCalled()
    })

    it('clears attribute + class when transitioning from empty to non-empty', () => {
      stub = makeStub({ placeholderConfig: 'P' })
      host = stub.hostElement
      stub._isFocused = true
      stub._syncPlaceholderState()
      expect(host.classList.contains('empty')).toBe(true)

      Object.defineProperty(stub, 'textLength', { value: 5, configurable: true })
      stub._syncPlaceholderState()
      expect(host.hasAttribute('data-placeholder')).toBe(false)
      expect(host.classList.contains('empty')).toBe(false)
    })
  })
})

describe('EditableBlockComponent placeholder subscriptions', () => {
  let stub: any
  let host: HTMLElement
  let selectionChange$: BehaviorSubject<any>
  let onTextChange: Subject<any>
  let onPropsChange: EventEmitter<any>
  let textLengthValue: number

  beforeEach(() => {
    host = document.createElement('p')
    document.body.appendChild(host)

    selectionChange$ = new BehaviorSubject<any>(null)
    onTextChange = new Subject<any>()
    onPropsChange = new EventEmitter<any>()
    textLengthValue = 0

    stub = Object.create(EditableBlockComponent.prototype)
    stub.hostElement = host
    Object.defineProperty(stub, 'id', { value: 'b1', configurable: true })
    Object.defineProperty(stub, 'flavour', { value: 'paragraph', configurable: true })
    stub._props = { heading: undefined }
    Object.defineProperty(stub, 'props', { get: () => stub._props })
    Object.defineProperty(stub, 'textLength', { get: () => textLengthValue })
    stub._placeholderConfig = { default: 'D', heading: { 1: 'H1' } }
    stub._lastAppliedPlaceholder = ''
    stub._isFocused = false
    stub.onTextChange = onTextChange
    stub.onPropsChange = onPropsChange
    stub.destroyRef = { onDestroy: (fn: () => void) => { stub._destroyFn = fn } }
    stub.doc = {
      schemas: {
        get: () => ({ metadata: { placeholder: stub._placeholderConfig } }),
      },
      selection: { selectionChange$ },
    }
  })

  afterEach(() => {
    host.remove()
    if (stub._destroyFn) stub._destroyFn()
  })

  it('writes placeholder when selection focuses the block on an empty state', () => {
    stub._initPlaceholderSubscriptions()
    selectionChange$.next({ start: { type: 'text', blockId: 'b1' } })

    expect(host.getAttribute('data-placeholder')).toBe('D')
    expect(host.classList.contains('empty')).toBe(true)
  })

  it('clears placeholder when text becomes non-empty', () => {
    stub._initPlaceholderSubscriptions()
    selectionChange$.next({ start: { type: 'text', blockId: 'b1' } })
    expect(host.classList.contains('empty')).toBe(true)

    textLengthValue = 1
    onTextChange.next({ op: [], tr: null as any })

    expect(host.hasAttribute('data-placeholder')).toBe(false)
    expect(host.classList.contains('empty')).toBe(false)
  })

  it('updates placeholder when heading prop changes while focused & empty', () => {
    stub._initPlaceholderSubscriptions()
    selectionChange$.next({ start: { type: 'text', blockId: 'b1' } })
    expect(host.getAttribute('data-placeholder')).toBe('D')

    stub._props = { heading: 1 }
    const propMap = new Map([['heading', { action: 'add', oldValue: {} }]])
    onPropsChange.emit(propMap)

    expect(host.getAttribute('data-placeholder')).toBe('H1')
  })

  it('ignores onPropsChange events that do not touch heading', () => {
    stub._initPlaceholderSubscriptions()
    selectionChange$.next({ start: { type: 'text', blockId: 'b1' } })
    const initial = host.getAttribute('data-placeholder')

    const setSpy = spyOn(host, 'setAttribute').and.callThrough()
    const removeSpy = spyOn(host, 'removeAttribute').and.callThrough()
    const propMap = new Map([['textAlign', { action: 'update', oldValue: {} }]])
    onPropsChange.emit(propMap)

    expect(host.getAttribute('data-placeholder')).toBe(initial)
    expect(setSpy).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('clears placeholder when selection moves to another block', () => {
    stub._initPlaceholderSubscriptions()
    selectionChange$.next({ start: { type: 'text', blockId: 'b1' } })
    expect(host.classList.contains('empty')).toBe(true)

    selectionChange$.next({ start: { type: 'text', blockId: 'b2' } })

    expect(host.hasAttribute('data-placeholder')).toBe(false)
    expect(host.classList.contains('empty')).toBe(false)
  })

  it('clears subscriptions on destroy and stops reacting to streams', () => {
    stub._initPlaceholderSubscriptions()
    selectionChange$.next({ start: { type: 'text', blockId: 'b1' } })
    expect(host.classList.contains('empty')).toBe(true)

    stub._destroyFn()

    // Reset DOM state then verify no further reactions
    host.removeAttribute('data-placeholder')
    host.classList.remove('empty')
    selectionChange$.next({ start: { type: 'text', blockId: 'b1' } })
    onTextChange.next({ op: [], tr: null as any })

    expect(host.hasAttribute('data-placeholder')).toBe(false)
    expect(host.classList.contains('empty')).toBe(false)
  })
})
