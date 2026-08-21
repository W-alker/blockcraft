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
          getConfig: () => ({positionStrategy: null}),
        },
        componentRef: {
          setInput: jasmine.createSpy('first.setInput'),
          instance: {
            action: new Subject<any>(),
            panelChange: new Subject<any>(),
            cdr: {markForCheck: jasmine.createSpy('first.markForCheck')},
          },
        },
      },
      {
        overlayRef: {
          dispose: jasmine.createSpy('second.dispose'),
          updatePosition: jasmine.createSpy('second.updatePosition'),
          getConfig: () => ({positionStrategy: null}),
        },
        componentRef: {
          setInput: jasmine.createSpy('second.setInput'),
          instance: {
            action: new Subject<any>(),
            panelChange: new Subject<any>(),
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

  it('keeps the toolbar while an owned panel degrades the shape selection', () => {
    const hostElement = document.createElement('div')
    document.body.appendChild(hostElement)
    const block = {id: 'shape-1', flavour: 'shape', hostElement}
    const otherBlock = {id: 'shape-2', flavour: 'shape', hostElement}
    const plugin = new ShapeToolbarPlugin()
    const closeToolbar = spyOn(plugin, 'closeToolbar')
    ;(plugin as any).doc = {
      isReadonly: false,
      readonlyManager: {isReadonly: () => false},
      getBlockById: (id: string) => id === 'shape-1' ? block : otherBlock,
    }
    ;(plugin as any)._toolbarRef = {overlayElement: document.createElement('div')}
    ;(plugin as any)._activeBlock = block
    const owns = spyOn(plugin as any, '_toolbarOwnsInteraction')
    // 取色器弹层打开后，native 重算把整块选中降级成同块 boundary 选区
    const degraded = {
      isInSameBlock: true,
      firstBlock: block,
      anchor: {blockId: 'shape-1', type: 'boundary', index: 0},
      head: {blockId: 'shape-1', type: 'boundary', index: 0},
    }

    owns.and.returnValue(true)
    ;(plugin as any)._onSelectionChange(degraded)
    ;(plugin as any)._onSelectionChange(null)
    expect(closeToolbar).not.toHaveBeenCalled()

    // 持有交互但选区已跑到别的形状：仍然关闭
    ;(plugin as any)._onSelectionChange({
      ...degraded,
      firstBlock: otherBlock,
      anchor: {blockId: 'shape-2', type: 'boundary', index: 0},
      head: {blockId: 'shape-2', type: 'boundary', index: 0},
    })
    expect(closeToolbar).toHaveBeenCalledTimes(1)

    // 不再持有交互：同块降级选区也关闭
    closeToolbar.calls.reset()
    owns.and.returnValue(false)
    ;(plugin as any)._onSelectionChange(degraded)
    expect(closeToolbar).toHaveBeenCalledTimes(1)

    hostElement.remove()
  })

  it('writes a fill-style change atomically through one updateProps call', () => {
    const hostElement = document.createElement('div')
    document.body.appendChild(hostElement)
    const block = {
      id: 'shape-1',
      flavour: 'shape',
      hostElement,
      updateProps: jasmine.createSpy('updateProps'),
    }
    const plugin = new ShapeToolbarPlugin()
    ;(plugin as any).doc = {readonlyManager: {isReadonly: () => false}}

    ;(plugin as any)._handleAction(block, {
      name: 'fill-style',
      value: {
        fillType: 'linear-gradient',
        gradientAngle: 160,
        gradientColors: ['#26405E', '#58402E'],
        gradientStops: [0, 1],
      },
    })
    expect(block.updateProps).toHaveBeenCalledOnceWith({
      fillType: 'linear-gradient',
      gradientAngle: 160,
      gradientColors: ['#26405E', '#58402E'],
      gradientStops: [0, 1],
    })

    block.updateProps.calls.reset()
    ;(plugin as any)._handleAction(block, {
      name: 'fill-style',
      value: {fillType: 'solid', fillColor: '#FF0000'},
    })
    expect(block.updateProps).toHaveBeenCalledOnceWith({
      fillType: 'solid',
      fillColor: '#FF0000',
    })

    hostElement.remove()
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
