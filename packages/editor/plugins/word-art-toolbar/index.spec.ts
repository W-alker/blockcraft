import {TestBed} from '@angular/core/testing'
import {Subject} from 'rxjs'
import {WordArtToolbarPlugin} from './index'
import {WordArtTransformOverlayComponent} from './word-art-transform-overlay.component'
import {WordArtToolbarComponent} from './word-art-toolbar.component'

describe('WordArtToolbarPlugin', () => {
  it('enters editing from whole-object selection on Enter', () => {
    const enterEditing = jasmine.createSpy('enterEditing')
    const plugin = new WordArtToolbarPlugin()
    const preventDefault = jasmine.createSpy('preventDefault')
    const context = {
      get: () => ({
        selection: {
          isInSameBlock: true,
          anchor: {type: 'selected'},
          head: {type: 'selected'},
          firstBlock: {flavour: 'word-art', enterEditing},
        },
      }),
      preventDefault,
    } as any

    expect(plugin.onEnterEditing(context)).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(enterEditing).toHaveBeenCalled()
  })

  it('returns editing to whole-object selection on Escape', () => {
    const block = {flavour: 'word-art'}
    const selectBlock = jasmine.createSpy('selectBlock')
    const plugin = new WordArtToolbarPlugin()
    ;(plugin as any).doc = {selection: {selectBlock}}
    const preventDefault = jasmine.createSpy('preventDefault')
    const context = {
      get: () => ({
        selection: {
          isInSameBlock: true,
          anchor: {type: 'text'},
          head: {type: 'text'},
          firstBlock: block,
        },
      }),
      preventDefault,
    } as any

    expect(plugin.onEscapeEditing(context)).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(selectBlock).toHaveBeenCalledOnceWith(block)
  })

  it('enters editing immediately from the text surface without arming drag', () => {
    const plugin = new WordArtToolbarPlugin()
    const enterEditing = jasmine.createSpy('enterEditing')
    const startAbsoluteDrag = jasmine.createSpy('startDrag')
    const startRelativeDrag = jasmine.createSpy('startDrag')
    const selectBlock = jasmine.createSpy('selectBlock')
    const hostElement = document.createElement('div')
    const surface = document.createElement('div')
    surface.className = 'word-art-block__surface'
    const editor = document.createElement('div')
    editor.className = 'word-art-block__editor'
    surface.appendChild(editor)
    hostElement.appendChild(surface)
    document.body.appendChild(hostElement)
    const block = {
      id: 'word-art-click',
      flavour: 'word-art',
      enterEditing,
      hostElement,
    } as any
    ;(plugin as any).doc = {
      selection: {selectBlock},
      readonlyManager: {isReadonly: () => false},
      placement: {
        getState: () => ({mode: 'absolute'}),
        startDrag: startAbsoluteDrag,
      },
      dragController: {
        state: 'idle',
        startDrag: startRelativeDrag,
      },
    }
    spyOn<any>(plugin, '_resolvePointerBlock').and.returnValue(block)
    spyOn<any>(plugin, '_isEditingBlock').and.returnValue(false)
    spyOn<any>(plugin, '_openOverlays')
    const event = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 22,
      bubbles: true,
      cancelable: true,
    })
    editor.dispatchEvent(event)
    const preventDefault = spyOn(event, 'preventDefault').and.callThrough()
    const stopPropagation = spyOn(event, 'stopPropagation').and.callThrough()

    ;(plugin as any)._onPointerDown(event)

    expect(enterEditing).toHaveBeenCalledTimes(1)
    expect(selectBlock).not.toHaveBeenCalled()
    expect(startAbsoluteDrag).not.toHaveBeenCalled()
    expect(startRelativeDrag).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(stopPropagation).not.toHaveBeenCalled()
    hostElement.remove()
  })

  it('keeps normal text clicks native after editing is active', () => {
    const plugin = new WordArtToolbarPlugin()
    const enterEditing = jasmine.createSpy('enterEditing')
    const hostElement = document.createElement('div')
    const surface = document.createElement('div')
    surface.className = 'word-art-block__surface'
    const editor = document.createElement('div')
    editor.className = 'word-art-block__editor'
    surface.appendChild(editor)
    hostElement.appendChild(surface)
    document.body.appendChild(hostElement)
    const block = {
      id: 'word-art-editing',
      flavour: 'word-art',
      enterEditing,
      hostElement,
    } as any
    ;(plugin as any).doc = {
      readonlyManager: {isReadonly: () => false},
    }
    spyOn<any>(plugin, '_resolvePointerBlock').and.returnValue(block)
    spyOn<any>(plugin, '_isEditingBlock').and.returnValue(true)
    const event = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 26,
      bubbles: true,
      cancelable: true,
    })
    editor.dispatchEvent(event)
    ;(plugin as any)._onPointerDown(event)

    expect(enterEditing).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBeFalse()
    hostElement.remove()
  })

  it('focuses text from blank surface space without arming drag', () => {
    const plugin = new WordArtToolbarPlugin()
    const enterEditing = jasmine.createSpy('enterEditing')
    const startAbsoluteDrag = jasmine.createSpy('startDrag')
    const startRelativeDrag = jasmine.createSpy('startDrag')
    const hostElement = document.createElement('div')
    const surface = document.createElement('div')
    surface.className = 'word-art-block__surface'
    hostElement.appendChild(surface)
    document.body.appendChild(hostElement)
    const block = {
      id: 'word-art-blank',
      flavour: 'word-art',
      enterEditing,
      hostElement,
    } as any
    ;(plugin as any).doc = {
      readonlyManager: {isReadonly: () => false},
      placement: {
        getState: () => ({mode: 'absolute'}),
        startDrag: startAbsoluteDrag,
      },
      dragController: {
        state: 'idle',
        startDrag: startRelativeDrag,
      },
    }
    spyOn<any>(plugin, '_resolvePointerBlock').and.returnValue(block)
    spyOn<any>(plugin, '_isEditingBlock').and.returnValue(false)
    spyOn<any>(plugin, '_openOverlays')
    const event = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 23,
      bubbles: true,
      cancelable: true,
    })
    surface.dispatchEvent(event)
    const preventDefault = spyOn(event, 'preventDefault').and.callThrough()
    const stopPropagation = spyOn(event, 'stopPropagation').and.callThrough()

    ;(plugin as any)._onPointerDown(event)

    expect(enterEditing).toHaveBeenCalledTimes(1)
    expect(startAbsoluteDrag).not.toHaveBeenCalled()
    expect(startRelativeDrag).not.toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(stopPropagation).toHaveBeenCalledTimes(1)
    hostElement.remove()
  })

  it('starts absolute movement only from an invisible border edge', () => {
    const plugin = new WordArtToolbarPlugin()
    const enterEditing = jasmine.createSpy('enterEditing')
    const startDrag = jasmine.createSpy('startDrag')
    const selectBlock = jasmine.createSpy('selectBlock')
    const hostElement = document.createElement('div')
    const surface = document.createElement('div')
    surface.className = 'word-art-block__surface'
    const resizer = document.createElement('shape-resizer')
    const edge = document.createElement('span')
    edge.className = 'shape-resizer__move-edge'
    resizer.appendChild(edge)
    surface.appendChild(resizer)
    hostElement.appendChild(surface)
    document.body.appendChild(hostElement)
    const block = {
      id: 'word-art-absolute',
      flavour: 'word-art',
      enterEditing,
      hostElement,
    } as any
    ;(plugin as any).doc = {
      selection: {selectBlock},
      readonlyManager: {isReadonly: () => false},
      placement: {
        getState: () => ({mode: 'absolute'}),
        startDrag,
      },
      dragController: {state: 'idle'},
    }
    spyOn<any>(plugin, '_resolvePointerBlock').and.returnValue(block)
    spyOn<any>(plugin, '_openOverlays')
    const event = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 24,
      bubbles: true,
      cancelable: true,
    })
    edge.dispatchEvent(event)
    ;(plugin as any)._onPointerDown(event)

    expect(enterEditing).not.toHaveBeenCalled()
    expect(selectBlock).toHaveBeenCalledOnceWith(block)
    expect(startDrag).toHaveBeenCalledOnceWith(event, block)
    expect(event.defaultPrevented).toBeTrue()
    hostElement.remove()
  })

  it('keeps relative reorder drag on the border edge', () => {
    const plugin = new WordArtToolbarPlugin()
    const enterEditing = jasmine.createSpy('enterEditing')
    const selectBlock = jasmine.createSpy('selectBlock')
    const startRelativeDrag = jasmine.createSpy('startDrag')
    const hostElement = document.createElement('div')
    const surface = document.createElement('div')
    surface.className = 'word-art-block__surface'
    const resizer = document.createElement('shape-resizer')
    const edge = document.createElement('span')
    edge.className = 'shape-resizer__move-edge'
    resizer.appendChild(edge)
    surface.appendChild(resizer)
    hostElement.appendChild(surface)
    document.body.appendChild(hostElement)
    const block = {
      id: 'word-art-relative',
      flavour: 'word-art',
      enterEditing,
      hostElement,
    } as any
    ;(plugin as any).doc = {
      selection: {selectBlock},
      readonlyManager: {isReadonly: () => false},
      placement: {
        getState: () => ({mode: 'relative'}),
      },
      dragController: {
        state: 'idle',
        startDrag: startRelativeDrag,
      },
    }
    spyOn<any>(plugin, '_resolvePointerBlock').and.returnValue(block)
    spyOn<any>(plugin, '_openOverlays')
    const event = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 25,
      bubbles: true,
      cancelable: true,
    })
    edge.dispatchEvent(event)
    ;(plugin as any)._onPointerDown(event)

    expect(selectBlock).toHaveBeenCalledOnceWith(block)
    expect(startRelativeDrag).toHaveBeenCalledOnceWith(
      event,
      {kind: 'origin-block', blockId: block.id},
      {ghostLabel: '艺术字'},
    )
    expect(enterEditing).not.toHaveBeenCalled()
    hostElement.remove()
  })

  it('creates only the toolbar overlay because transforms live in the block', () => {
    const plugin = new WordArtToolbarPlugin()
    const action = new Subject<any>()
    const onPropsChange = new Subject<void>()
    const onDestroy$ = new Subject<boolean>()
    const overlayRef = jasmine.createSpyObj('OverlayRef', [
      'dispose',
      'updatePosition',
    ])
    const componentRef = {
      setInput: jasmine.createSpy('setInput'),
      instance: {
        action,
        cdr: jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']),
      },
    }
    const createConnectedOverlay = jasmine
      .createSpy('createConnectedOverlay')
      .and.returnValue({overlayRef, componentRef})
    const hostElement = document.createElement('div')
    const resizer = document.createElement('shape-resizer')
    hostElement.appendChild(resizer)
    document.body.append(hostElement)
    const block = {
      id: 'word-art-1',
      hostElement,
      onPropsChange,
      onDestroy$,
    } as any
    ;(plugin as any).doc = {
      overlayService: {createConnectedOverlay},
      scrollContainer: null,
    }
    ;(plugin as any)._openOverlays(block)

    expect(createConnectedOverlay).toHaveBeenCalledTimes(1)
    expect(createConnectedOverlay.calls.mostRecent().args[0].component).toBe(
      WordArtToolbarComponent,
    )
    expect(componentRef.setInput).toHaveBeenCalledOnceWith(
      'wordArtBlock',
      block,
    )
    expect(resizer.style.display).toBe('block')

    plugin.closeOverlays()
    expect(resizer.style.display).toBe('')
    action.complete()
    onPropsChange.complete()
    onDestroy$.complete()
    hostElement.remove()
  })

  it('keeps the toolbar through the pointer-to-input focus transition', () => {
    const plugin = new WordArtToolbarPlugin()
    const overlayElement = document.createElement('div')
    const input = document.createElement('input')
    overlayElement.appendChild(input)
    document.body.appendChild(overlayElement)
    const dispose = jasmine.createSpy('dispose')
    ;(plugin as any).doc = {isReadonly: false}
    ;(plugin as any)._toolbarRef = {overlayElement, dispose}
    ;(plugin as any)._activeBlockId = 'word-art-1'

    const pointerDown = new PointerEvent('pointerdown', {
      button: 0,
      bubbles: true,
    })
    input.dispatchEvent(pointerDown)
    ;(plugin as any)._onPointerDown(pointerDown)
    ;(plugin as any)._onSelectionChange(null)

    expect(dispose).not.toHaveBeenCalled()

    input.focus()
    ;(plugin as any)._endToolbarPointerInteraction()
    ;(plugin as any)._onSelectionChange(null)

    expect(document.activeElement).toBe(input)
    expect(dispose).not.toHaveBeenCalled()

    plugin.closeOverlays()
    overlayElement.remove()
  })

  it('closes the toolbar when the pointer leaves its owned interaction', () => {
    const plugin = new WordArtToolbarPlugin()
    const overlayElement = document.createElement('div')
    const input = document.createElement('input')
    overlayElement.appendChild(input)
    document.body.appendChild(overlayElement)
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const dispose = jasmine.createSpy('dispose')
    ;(plugin as any).doc = {isReadonly: false}
    ;(plugin as any)._toolbarRef = {overlayElement, dispose}
    ;(plugin as any)._activeBlockId = 'word-art-1'

    input.focus()
    const pointerDown = new PointerEvent('pointerdown', {
      button: 0,
      bubbles: true,
    })
    outside.dispatchEvent(pointerDown)
    ;(plugin as any)._onPointerDown(pointerDown)

    expect(dispose).toHaveBeenCalledTimes(1)
    expect((plugin as any)._activeBlockId).toBeUndefined()

    outside.remove()
    overlayElement.remove()
  })

  it('force-deletes absolute word art through the placement command', () => {
    const hostElement = document.createElement('div')
    document.body.appendChild(hostElement)
    const block = {
      id: 'word-art-absolute',
      flavour: 'word-art',
      hostElement,
    }
    const deleteBlocks = jasmine
      .createSpy('deleteBlocks')
      .and.returnValue([{index: 0, length: 1}])
    const chain = jasmine.createSpy('chain')
    const blur = jasmine.createSpy('blur')
    const plugin = new WordArtToolbarPlugin()
    ;(plugin as any).doc = {
      model: {
        exists: () => true,
        getParentId: () => 'layout',
        getFlavour: (id: string) =>
          id === 'layout' ? 'placement-layout' : 'word-art',
        getProps: () => ({
          placement: {mode: 'absolute', x: 10, y: 20},
        }),
        indexInParent: () => 0,
      },
      schemas: {
        get: () => ({
          metadata: {placement: {modes: ['relative', 'absolute']}},
        }),
      },
      readonlyManager: {
        isReadonly: () => false,
        assertRemovable: jasmine.createSpy('assertRemovable'),
      },
      selection: {
        value: {
          anchor: {blockId: block.id},
          head: {blockId: block.id},
        },
        blur,
      },
      crud: {
        undoManager: {
          captureSelectionBeforeChange: jasmine.createSpy(
            'captureSelectionBeforeChange',
          ),
        },
        deleteBlocks,
      },
      chain,
    }
    spyOn(plugin, 'closeOverlays')
    ;(plugin as any)._handleAction(block, {name: 'delete'})

    expect(deleteBlocks).toHaveBeenCalledOnceWith('layout', 0, 1, true)
    expect(blur).toHaveBeenCalledTimes(1)
    expect(chain).not.toHaveBeenCalled()
    expect(plugin.closeOverlays).toHaveBeenCalledTimes(1)

    hostElement.remove()
  })

  it('reuses the eight-handle object transform affordance', async () => {
    await TestBed.configureTestingModule({
      imports: [WordArtTransformOverlayComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(WordArtTransformOverlayComponent)
    const surface = document.createElement('div')
    fixture.componentRef.setInput('wordArtBlock', {
      surfaceElement: surface,
      placementContainer: document.createElement('div'),
      surfaceTransform: '',
      wordArtProps: {width: 320, height: 96, rotation: 0},
    })
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    expect(host.querySelectorAll('.shape-resizer__handle').length).toBe(8)
    expect(
      host.querySelector('.shape-resizer__rotate')?.getAttribute('aria-label'),
    ).toBe('旋转艺术字')

    fixture.destroy()
    TestBed.resetTestingModule()
  })
})
