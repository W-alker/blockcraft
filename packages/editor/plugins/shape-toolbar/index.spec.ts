import {ShapeToolbarPlugin} from './index'
import {Subject} from 'rxjs'

describe('ShapeToolbarPlugin', () => {
  it('rebinds the toolbar anchor and actions when another shape is selected', () => {
    const createBlock = (id: string) => {
      const hostElement = document.createElement('div')
      const shell = document.createElement('div')
      shell.className = 'shape-block__shell'
      hostElement.appendChild(shell)
      document.body.appendChild(hostElement)
      return {
        id,
        flavour: 'shape',
        hostElement,
        onPropsChange: new Subject<void>(),
        updateProps: jasmine.createSpy(`${id}.updateProps`),
      }
    }
    const firstBlock = createBlock('shape-1')
    const secondBlock = createBlock('shape-2')
    const overlays = [
      {
        overlayRef: {
          dispose: jasmine.createSpy('first.dispose'),
          updatePosition: jasmine.createSpy('first.updatePosition'),
        },
        componentRef: {
          setInput: jasmine.createSpy('first.setInput'),
          instance: {
            action: new Subject<any>(),
            cdr: {markForCheck: jasmine.createSpy('first.markForCheck')},
          },
        },
      },
      {
        overlayRef: {
          dispose: jasmine.createSpy('second.dispose'),
          updatePosition: jasmine.createSpy('second.updatePosition'),
        },
        componentRef: {
          setInput: jasmine.createSpy('second.setInput'),
          instance: {
            action: new Subject<any>(),
            cdr: {markForCheck: jasmine.createSpy('second.markForCheck')},
          },
        },
      },
    ]
    const createConnectedOverlay = jasmine
      .createSpy('createConnectedOverlay')
      .and.returnValues(...overlays)
    const plugin = new ShapeToolbarPlugin()
    ;(plugin as any).doc = {
      overlayService: {createConnectedOverlay},
      readonlyManager: {isReadonly: () => false},
      scrollContainer: null,
    }

    ;(plugin as any)._openToolbar(firstBlock)
    ;(plugin as any)._openToolbar(secondBlock)

    expect(overlays[0].overlayRef.dispose).toHaveBeenCalledTimes(1)
    expect(createConnectedOverlay.calls.argsFor(0)[0].target)
      .toBe(firstBlock.hostElement.firstElementChild)
    expect(createConnectedOverlay.calls.argsFor(1)[0].target)
      .toBe(secondBlock.hostElement.firstElementChild)
    expect(overlays[1].componentRef.setInput)
      .toHaveBeenCalledOnceWith('shapeBlock', secondBlock)

    overlays[1].componentRef.instance.action.next({
      name: 'fill-color',
      value: '#123456',
    })
    expect(firstBlock.updateProps).not.toHaveBeenCalled()
    expect(secondBlock.updateProps).toHaveBeenCalledOnceWith({
      fillColor: '#123456',
    })

    plugin.closeToolbar()
    firstBlock.hostElement.remove()
    secondBlock.hostElement.remove()
  })

  it('exits shape text editing to whole-shape selection on Escape', () => {
    const shapeHost = document.createElement('div')
    document.body.appendChild(shapeHost)
    const shapeBlock = {
      flavour: 'shape',
      hostElement: shapeHost,
    }
    const textBlock = {
      flavour: 'shape-text',
      parentBlock: shapeBlock,
    }
    const selectBlock = jasmine.createSpy('selectBlock')
    const plugin = new ShapeToolbarPlugin()
    ;(plugin as any).doc = {selection: {selectBlock}}
    const preventDefault = jasmine.createSpy('preventDefault')
    const context = {
      get: () => ({
        selection: {
          isInSameBlock: true,
          firstBlock: textBlock,
        },
      }),
      preventDefault,
    } as any

    expect(plugin.onShapeTextEscape(context)).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(selectBlock).toHaveBeenCalledOnceWith(shapeBlock)

    shapeHost.remove()
  })

  it('delegates stack actions to the placement manager', () => {
    const shapeHost = document.createElement('div')
    document.body.appendChild(shapeHost)
    const block = {
      id: 'shape-1',
      flavour: 'shape',
      hostElement: shapeHost,
      updateProps: jasmine.createSpy('updateProps'),
    }
    const moveForward = jasmine.createSpy('moveForward').and.returnValue(true)
    const moveBackward = jasmine.createSpy('moveBackward').and.returnValue(true)
    const plugin = new ShapeToolbarPlugin()
    ;(plugin as any).doc = {
      readonlyManager: {
        isReadonly: jasmine.createSpy('isReadonly').and.returnValue(false),
      },
      placement: {moveForward, moveBackward},
    }

    ;(plugin as any)._handleAction(block, {name: 'move-forward'})
    ;(plugin as any)._handleAction(block, {name: 'move-backward'})

    expect(moveForward).toHaveBeenCalledOnceWith(block)
    expect(moveBackward).toHaveBeenCalledOnceWith(block)
    expect(block.updateProps).not.toHaveBeenCalled()

    shapeHost.remove()
  })

  it('force-deletes an absolute shape through the placement command', () => {
    const shapeHost = document.createElement('div')
    document.body.appendChild(shapeHost)
    const block = {
      id: 'shape-absolute',
      flavour: 'shape',
      hostElement: shapeHost,
    }
    const deleteBlocks = jasmine.createSpy('deleteBlocks')
      .and.returnValue([{index: 0, length: 1}])
    const chain = jasmine.createSpy('chain')
    const blur = jasmine.createSpy('blur')
    const plugin = new ShapeToolbarPlugin()
    ;(plugin as any).doc = {
      model: {
        exists: () => true,
        getParentId: () => 'layout',
        getFlavour: (id: string) =>
          id === 'layout' ? 'placement-layout' : 'shape',
        getProps: () => ({
          position: {x: 10, y: 20},
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
          captureSelectionBeforeChange:
            jasmine.createSpy('captureSelectionBeforeChange'),
        },
        deleteBlocks,
      },
      chain,
    }
    spyOn(plugin, 'closeToolbar')

    ;(plugin as any)._handleAction(block, {name: 'delete'})

    expect(deleteBlocks).toHaveBeenCalledOnceWith('layout', 0, 1, true)
    expect(blur).toHaveBeenCalledTimes(1)
    expect(chain).not.toHaveBeenCalled()
    expect(plugin.closeToolbar).toHaveBeenCalledTimes(1)

    shapeHost.remove()
  })
})
