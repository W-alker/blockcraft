import {NgZone} from '@angular/core'
import {Subject} from 'rxjs'
import {
  createInlineShapeDelta,
  createInlineWordArtDelta,
  type InlineObjectKind,
} from '../../blocks'
import {InlineObjectInteractionController} from './inline-object-interaction'

describe('InlineObjectInteractionController', () => {
  it('selects the one-character Embed in both selection models on click', () => {
    const root = document.createElement('div')
    const host = document.createElement('div')
    host.dataset['blockId'] = 'paragraph-1'
    const shell = document.createElement('span')
    shell.className = 'bc-inline-object-shell'
    shell.dataset['bcInlineObject'] = 'shape'
    const frame = document.createElement('span')
    frame.className = 'bc-inline-object-frame'
    frame.setAttribute('data-bc-inline-float-frame', '')
    shell.appendChild(frame)
    host.appendChild(shell)
    root.appendChild(host)
    document.body.appendChild(root)

    const setInlineRange = jasmine.createSpy('setInlineRange')
    const block = {
      id: 'paragraph-1',
      containerElement: host,
      runtime: {domPointToModel: () => 3},
      textDeltas: () => [
        {insert: 'abc'},
        createInlineShapeDelta({shapeType: 'star'}, [{insert: '重点'}]),
      ],
      setInlineRange,
    } as any
    const onItemClicked = new Subject<any>()
    const overlayRef = {
      overlayElement: document.createElement('div'),
      dispose: jasmine.createSpy('dispose'),
    }
    const doc = {
      root: {hostElement: root},
      getBlockById: () => block,
      isEditable: () => true,
      isReadonly: false,
      event: {status: {isComposing: false}},
      readonlyManager: {isReadonly: () => false},
      overlayService: {
        createConnectedOverlay: () => ({
          overlayRef,
          componentRef: {
            setInput: jasmine.createSpy('setInput'),
            instance: {onItemClicked},
          },
        }),
      },
    } as any
    const controller = new InlineObjectInteractionController(
      doc,
      'shape',
      () => undefined,
    )
    let event!: PointerEvent
    frame.addEventListener('pointerdown', value => event = value)
    frame.dispatchEvent(new PointerEvent('pointerdown', {
      button: 0,
      bubbles: true,
      cancelable: true,
      isPrimary: true,
    }))

    ;(controller as any)._onPointerDown(event)

    expect(setInlineRange).toHaveBeenCalledOnceWith(3, 1)
    expect(shell.classList.contains('bc-inline-object-shell--selected'))
      .toBeTrue()
    controller.destroy()
    onItemClicked.complete()
    root.remove()
  })

  for (const kind of ['shape', 'word-art'] as const) {
    for (const wrapped of [false, true]) {
      it(`drags a ${wrapped ? 'wrapped' : 'plain inline'} ${kind} Embed and commits its new anchor`, () => {
      const root = document.createElement('div')
      const host = document.createElement('div')
      host.dataset['blockId'] = 'paragraph-1'
      const text = document.createTextNode('abc')
      const shell = document.createElement('span')
      shell.className = 'bc-inline-object-shell'
      shell.dataset['bcInlineObject'] = kind
      const frame = document.createElement('span')
      frame.className = 'bc-inline-object-frame'
      frame.setAttribute('data-bc-inline-float-frame', '')
      shell.appendChild(frame)
      host.append(text, shell)
      root.appendChild(host)
      document.body.appendChild(root)

      const delta = kind === 'shape'
        ? createInlineShapeDelta(
            {shapeType: 'star'},
            [{insert: '重点'}],
            wrapped
              ? {wrap: true, side: 'auto', x: 0.2, gap: 12}
              : undefined,
          )
        : createInlineWordArtDelta(
            {fontSize: 48},
            [{insert: '艺术字'}],
            wrapped
              ? {wrap: true, side: 'auto', x: 0.2, gap: 12}
              : undefined,
          )
      const deltas = [{insert: 'abc'}, delta]
      const releaseLayoutFreeze = jasmine.createSpy('releaseLayoutFreeze')
      const releaseViewLease = jasmine.createSpy('releaseViewLease')
      const applyTextDelta = jasmine.createSpy('applyTextDelta')
      const setInlineRange = jasmine.createSpy('setInlineRange')
      const block = {
        id: 'paragraph-1',
        hostElement: host,
        containerElement: host,
        textLength: 4,
        runtime: {
          domPointToModel: (node: Node) => node === shell ? 3 : 1,
          acquireFloatLayoutFreeze: () => releaseLayoutFreeze,
        },
        textDeltas: () => deltas,
        setInlineRange,
      } as any
      const onItemClicked = new Subject<any>()
      const overlayRef = {
        overlayElement: document.createElement('div'),
        dispose: jasmine.createSpy('dispose'),
      }
      const doc = {
        root: {hostElement: root},
        getBlockById: () => block,
        isEditable: () => true,
        isPlainTextBlock: () => false,
        isReadonly: false,
        event: {status: {isComposing: false}},
        readonlyManager: {isReadonly: () => false},
        model: {exists: () => true},
        vm: {isMounted: () => true},
        virtualization: {
          acquireBlockViewLease: () => releaseViewLease,
        },
        injector: {
          get: (token: unknown) => token === NgZone
            ? {runOutsideAngular: (run: () => void) => run()}
            : null,
        },
        logger: {warn: jasmine.createSpy('warn')},
        crud: {
          transact: (run: () => void) => run(),
          applyTextDelta,
        },
        overlayService: {
          createConnectedOverlay: () => ({
            overlayRef,
            componentRef: {
              setInput: jasmine.createSpy('setInput'),
              instance: {onItemClicked},
            },
          }),
        },
      } as any
      Object.defineProperty(host, 'clientWidth', {
        configurable: true,
        value: 500,
      })
      root.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600)
      host.getBoundingClientRect = () => new DOMRect(0, 0, 500, 160)
      frame.getBoundingClientRect = () => new DOMRect(100, 20, 120, 80)
      const caretRange = document.createRange()
      caretRange.setStart(text, 1)
      caretRange.collapse(true)
      const caretSpy = spyOn(
        document as Document & {
          caretRangeFromPoint(x: number, y: number): Range | null
        },
        'caretRangeFromPoint',
      ).and.returnValue(caretRange)
      const controller = new InlineObjectInteractionController(
        doc,
        kind as InlineObjectKind,
        () => undefined,
      )
      let event!: PointerEvent
      frame.addEventListener('pointerdown', value => event = value)
      frame.dispatchEvent(new PointerEvent('pointerdown', {
        button: 0,
        bubbles: true,
        cancelable: true,
        isPrimary: true,
        clientX: 120,
        clientY: 40,
        pointerId: 7,
      }))

      ;(controller as any)._onPointerDown(event)
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientX: 220,
        clientY: 80,
        pointerId: 7,
      }))
      window.dispatchEvent(new PointerEvent('pointerup', {
        clientX: 220,
        clientY: 80,
        pointerId: 7,
      }))

      expect(setInlineRange).toHaveBeenCalledOnceWith(3, 1)
      expect(applyTextDelta).toHaveBeenCalledTimes(1)
      const operations = applyTextDelta.calls.mostRecent().args[1]
      expect(operations[0]).toEqual({retain: 1})
      expect(operations[1].insert).toEqual(delta.insert)
      if (wrapped) {
        expect(operations[1].attributes['wrap']).toBeTrue()
        expect(operations[1].attributes['x']).toBeGreaterThan(0.2)
        expect(operations[1].attributes['x']).toBeLessThanOrEqual(0.4)
      } else {
        expect(operations[1].attributes['wrap']).toBeUndefined()
        expect(operations[1].attributes['x']).toBeUndefined()
      }
      expect(releaseLayoutFreeze).toHaveBeenCalledTimes(1)
      expect(releaseViewLease).toHaveBeenCalledTimes(1)
      expect(document.querySelector(
        '[data-bc-inline-object-drag-proxy]',
      )).toBeNull()

      controller.destroy()
      caretSpy.and.callThrough()
      onItemClicked.complete()
      root.remove()
      })
    }
  }
})
