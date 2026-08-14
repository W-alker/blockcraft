import {Subject} from 'rxjs'
import {fakeAsync, tick} from '@angular/core/testing'
import {TextBoxToolbarPlugin} from './index'
import {TextBoxToolbarComponent} from './text-box-toolbar.component'

describe('TextBoxToolbarPlugin', () => {
  it('opens the object toolbar only for whole text-box selection', () => {
    const plugin = new TextBoxToolbarPlugin()
    const openToolbar = spyOn<any>(plugin, '_openToolbar')
    const closeToolbar = spyOn(plugin, 'closeToolbar')
    const block = makeBlock()
    ;(plugin as any).doc = {
      isReadonly: false,
      model: {exists: () => true},
      readonlyManager: {isReadonly: () => false},
    }

    ;(plugin as any)._onSelectionChange({
      isInSameBlock: true,
      anchor: {type: 'selected', blockId: block.id, block},
      head: {type: 'selected', blockId: block.id, block},
      firstBlock: block,
      firstBlockId: block.id,
      lastBlockId: block.id,
      commonParent: 'root',
    })

    expect(openToolbar).toHaveBeenCalledOnceWith(block)
    expect(closeToolbar).not.toHaveBeenCalled()
  })

  it('enters the first editable descendant on Enter', () => {
    const plugin = new TextBoxToolbarPlugin()
    const setCursorAtBlock = jasmine.createSpy('setCursorAtBlock')
    const block = makeBlock()
    document.body.appendChild(block.hostElement)
    ;(plugin as any).doc = {
      getBlockById: () => block,
      readonlyManager: {isReadonly: () => false},
      model: {
        getChildrenIds: (id: string) => id === block.id
          ? ['nested', 'paragraph-1']
          : id === 'nested'
            ? ['paragraph-0']
            : [],
        getNodeType: (id: string) => id.startsWith('paragraph')
          ? 'editable'
          : 'block',
      },
      selection: {setCursorAtBlock},
    }
    const preventDefault = jasmine.createSpy('preventDefault')
    const context = keyboardContext({
      isInSameBlock: true,
      anchor: {type: 'selected'},
      head: {type: 'selected'},
      firstBlock: block,
    }, preventDefault)

    expect(plugin.onEnterEditing(context)).toBeTrue()
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(setCursorAtBlock).toHaveBeenCalledOnceWith('paragraph-0', true)
    block.hostElement.remove()
  })

  it('selects the parent text box on Escape from a direct text child', () => {
    const plugin = new TextBoxToolbarPlugin()
    const parent = makeBlock()
    document.body.appendChild(parent.hostElement)
    const child = {flavour: 'paragraph', parentBlock: parent}
    const selectBlock = jasmine.createSpy('selectBlock')
    ;(plugin as any).doc = {selection: {selectBlock}}
    const preventDefault = jasmine.createSpy('preventDefault')
    const context = keyboardContext({
      isInSameBlock: true,
      anchor: {type: 'text'},
      head: {type: 'text'},
      firstBlock: child,
    }, preventDefault)

    expect(plugin.onDirectChildEscape(context)).toBeTrue()
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(selectBlock).toHaveBeenCalledOnceWith(parent)
    parent.hostElement.remove()
  })

  it('does not claim Escape from a nested grandchild', () => {
    const plugin = new TextBoxToolbarPlugin()
    const parent = makeBlock()
    const nested = {flavour: 'callout', parentBlock: parent}
    const child = {flavour: 'paragraph', parentBlock: nested}
    const selectBlock = jasmine.createSpy('selectBlock')
    ;(plugin as any).doc = {selection: {selectBlock}}
    const context = keyboardContext({
      isInSameBlock: true,
      anchor: {type: 'text'},
      head: {type: 'text'},
      firstBlock: child,
    })

    expect(plugin.onDirectChildEscape(context)).toBeUndefined()
    expect(selectBlock).not.toHaveBeenCalled()
  })

  it('enters editing on double click without starting a move', () => {
    const plugin = new TextBoxToolbarPlugin()
    const block = makeBlock()
    block.hostElement.dataset['bcTextBox'] = 'true'
    const paragraph = document.createElement('p')
    paragraph.dataset['blockId'] = 'paragraph-1'
    block.hostElement.appendChild(paragraph)
    document.body.appendChild(block.hostElement)
    ;(plugin as any).doc = {
      getBlockById: () => block,
      root: {hostElement: block.hostElement},
      readonlyManager: {isReadonly: () => false},
      model: {
        getChildrenIds: (id: string) => id === block.id ? ['paragraph-1'] : [],
        getNodeType: (id: string) => id === 'paragraph-1' ? 'editable' : 'block',
      },
      selection: {setCursorAtBlock: jasmine.createSpy('setCursorAtBlock')},
    }
    const enter = spyOn<any>(plugin, '_enterFirstEditable').and.returnValue(true)
    const event = new MouseEvent('dblclick', {button: 0, cancelable: true})
    Object.defineProperty(event, 'target', {value: paragraph})

    ;(plugin as any)._onDoubleClick(event)

    expect(enter).toHaveBeenCalledOnceWith(block)
    expect(event.defaultPrevented).toBeTrue()
    block.hostElement.remove()
  })

  it('starts movement only from the shared resizer border edge', () => {
    const plugin = new TextBoxToolbarPlugin()
    const block = makeBlock()
    const resizer = document.createElement('shape-resizer')
    const edge = document.createElement('span')
    edge.className = 'shape-resizer__move-edge'
    resizer.appendChild(edge)
    block.hostElement.appendChild(resizer)
    document.body.appendChild(block.hostElement)
    const selectBlock = jasmine.createSpy('selectBlock')
    const startDrag = jasmine.createSpy('startDrag')
    ;(plugin as any).doc = {
      root: {hostElement: block.hostElement},
      getBlockById: () => block,
      selection: {selectBlock},
      readonlyManager: {isReadonly: () => false},
      placement: {
        getState: () => ({mode: 'absolute'}),
        startDrag,
      },
    }
    spyOn<any>(plugin, '_openToolbar')
    const event = new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 1,
      cancelable: true,
    })
    Object.defineProperty(event, 'target', {value: edge})

    ;(plugin as any)._onPointerDown(event)

    expect(selectBlock).toHaveBeenCalledOnceWith(block)
    expect(startDrag).toHaveBeenCalledOnceWith(event, block)
    expect(event.defaultPrevented).toBeTrue()
    block.hostElement.remove()
  })

  it('normalizes semantic single-key and multi-key appearance patches', () => {
    const plugin = new TextBoxToolbarPlugin()
    const block = makeBlock()
    document.body.appendChild(block.hostElement)
    ;(plugin as any).doc = {
      getBlockById: () => block,
      readonlyManager: {isReadonly: () => false},
    }

    ;(plugin as any)._handleAction(block, {
      name: 'update-props',
      value: {p: [12, 24, 12, 24]},
    })
    ;(plugin as any)._handleAction(block, {
      name: 'update-props',
      value: {
        sh: 'rounded-speech-bubble',
        fo: 2,
        bw: -3,
        bs: 'dashed',
        wa: null,
      },
    })

    expect(block.updateProps.calls.allArgs()).toEqual([
      [{p: [12, 24]}],
      [{
        sh: 'rounded-speech-bubble',
        fo: 1,
        bw: 0,
        bs: 'dashed',
        wa: null,
      }],
    ])
    block.hostElement.remove()
  })

  it('creates a block-owned overlay and refreshes it on props/panel changes', fakeAsync(() => {
    const plugin = new TextBoxToolbarPlugin()
    const block = makeBlock()
    document.body.appendChild(block.hostElement)
    const action = new Subject<any>()
    const panelChange = new Subject<any>()
    const overlayRef = jasmine.createSpyObj('OverlayRef', [
      'dispose',
      'updatePosition',
      'getConfig',
    ])
    overlayRef.getConfig.and.returnValue({positionStrategy: null})
    const componentRef = {
      setInput: jasmine.createSpy('setInput'),
      instance: {
        action,
        panelChange,
        cdr: jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']),
      },
    }
    const createConnectedOverlay = jasmine
      .createSpy('createConnectedOverlay')
      .and.returnValue({overlayRef, componentRef})
    ;(plugin as any).doc = {
      overlayService: {createConnectedOverlay},
      scrollContainer: null,
    }

    ;(plugin as any)._openToolbar(block)
    block.onPropsChange.next()
    panelChange.next('shape')
    tick(17)

    expect(createConnectedOverlay.calls.mostRecent().args[0].target).toBe(block)
    expect(createConnectedOverlay.calls.mostRecent().args[0].component).toBe(
      TextBoxToolbarComponent,
    )
    expect(createConnectedOverlay.calls.mostRecent().args[0].positions[0])
      .toEqual(jasmine.objectContaining({
        originX: 'end',
        originY: 'center',
        overlayX: 'start',
        overlayY: 'center',
        offsetX: 10,
      }))
    expect(componentRef.setInput).toHaveBeenCalledOnceWith('textBoxBlock', block)
    expect(componentRef.instance.cdr.markForCheck).toHaveBeenCalledTimes(1)
    expect(overlayRef.updatePosition).toHaveBeenCalledTimes(2)

    plugin.closeToolbar()
    block.hostElement.remove()
  }))

  it('owns only CSES child overlays opened from the active toolbar', () => {
    const plugin = new TextBoxToolbarPlugin()
    const toolbar = document.createElement('div')
    const picker = document.createElement('cs-color-picker')
    picker.className = 'cs-color-picker-open'
    const select = document.createElement('cs-select')
    select.className = 'cs-select-open'
    toolbar.append(picker, select)
    ;(plugin as any)._toolbarRef = {overlayElement: toolbar}

    const colorPane = document.createElement('div')
    colorPane.className = 'cs-color-picker-overlay-pane'
    const colorPanel = document.createElement('div')
    colorPanel.className = 'cs-color-picker-panel'
    colorPane.appendChild(colorPanel)

    const selectPane = document.createElement('div')
    selectPane.className = 'cs-select-panel'
    const selectPanel = document.createElement('div')
    selectPanel.className = 'cs-select-dropdown'
    selectPane.appendChild(selectPanel)

    expect((plugin as any)._isToolbarTarget(colorPanel)).toBeTrue()
    expect((plugin as any)._isToolbarTarget(selectPanel)).toBeTrue()

    picker.classList.remove('cs-color-picker-open')
    select.classList.remove('cs-select-open')
    expect((plugin as any)._isToolbarTarget(colorPanel)).toBeFalse()
    expect((plugin as any)._isToolbarTarget(selectPanel)).toBeFalse()
  })

  it('keeps the toolbar when Escape focuses the root with the text box selected', () => {
    const plugin = new TextBoxToolbarPlugin()
    const root = document.createElement('div')
    const block = makeBlock()
    root.appendChild(block.hostElement)
    document.body.appendChild(root)
    const toolbar = document.createElement('div')
    ;(plugin as any)._toolbarRef = {overlayElement: toolbar}
    ;(plugin as any)._activeBlockId = block.id
    ;(plugin as any)._activeBlockHost = block.hostElement
    ;(plugin as any).doc = {
      root: {hostElement: root},
      selection: {
        value: {
          isInSameBlock: true,
          anchor: {type: 'selected'},
          head: {type: 'selected'},
          firstBlock: block,
        },
      },
    }
    const closeToolbar = spyOn(plugin, 'closeToolbar')
    const event = new FocusEvent('focusin')
    Object.defineProperty(event, 'target', {value: root})

    ;(plugin as any)._onFocusIn(event)

    expect(closeToolbar).not.toHaveBeenCalled()
    root.remove()
  })

  it('closes the toolbar when root focus no longer owns the text-box selection', () => {
    const plugin = new TextBoxToolbarPlugin()
    const root = document.createElement('div')
    const block = makeBlock()
    root.appendChild(block.hostElement)
    document.body.appendChild(root)
    const toolbar = document.createElement('div')
    ;(plugin as any)._toolbarRef = {overlayElement: toolbar}
    ;(plugin as any)._activeBlockId = block.id
    ;(plugin as any)._activeBlockHost = block.hostElement
    ;(plugin as any).doc = {
      root: {hostElement: root},
      selection: {
        value: {
          isInSameBlock: true,
          anchor: {type: 'text'},
          head: {type: 'text'},
          firstBlock: {id: 'paragraph-1', flavour: 'paragraph'},
        },
      },
    }
    const closeToolbar = spyOn(plugin, 'closeToolbar')
    const event = new FocusEvent('focusin')
    Object.defineProperty(event, 'target', {value: root})

    ;(plugin as any)._onFocusIn(event)

    expect(closeToolbar).toHaveBeenCalledTimes(1)
    root.remove()
  })
})

function makeBlock() {
  const hostElement = document.createElement('div')
  hostElement.dataset['blockId'] = 'text-box-1'
  return {
    id: 'text-box-1',
    flavour: 'text-box',
    props: {},
    hostElement,
    updateProps: jasmine.createSpy('updateProps'),
    onPropsChange: new Subject<void>(),
    onDestroy$: new Subject<boolean>(),
  }
}

function keyboardContext(
  selection: Record<string, unknown>,
  preventDefault = jasmine.createSpy('preventDefault'),
) {
  return {
    get: () => ({selection}),
    preventDefault,
  } as any
}
