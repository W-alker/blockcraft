import {fakeAsync, flushMicrotasks} from "@angular/core/testing";
import {BlockTransformerPlugin} from "./index";
import {blockTransforms} from './const'

describe('BlockTransformerPlugin ordered continuation', () => {
  it('reads virtual root siblings from the model without materializing every component', () => {
    const orderedTransform = blockTransforms.find(transform => transform.flavour === 'ordered')!
    const parent = {
      getChildrenBlocks: jasmine.createSpy('getChildrenBlocks').and.throwError(
        'offscreen sibling component is not mounted',
      ),
    }
    const from = {
      id: 'current',
      flavour: 'paragraph',
      props: {depth: 0, heading: 0},
      parentBlock: parent,
      textDeltas: () => [{insert: '1. current'}],
    }
    const replacement = {
      id: 'replacement',
      flavour: 'ordered',
      props: {} as Record<string, unknown>,
    }
    const chain = {
      replaceWithSnapshots: jasmine.createSpy('replaceWithSnapshots'),
      nextTick: jasmine.createSpy('nextTick'),
      selectOrSetCursorAtBlock: jasmine.createSpy('selectOrSetCursorAtBlock'),
      recalculateSelection: jasmine.createSpy('recalculateSelection'),
      run: jasmine.createSpy('run'),
    }
    Object.values(chain).forEach(spy => spy.and.returnValue(chain))
    const doc = {
      model: {
        getParentId: (blockId: string) => blockId === 'current' ? 'root' : null,
        getChildrenIds: () => ['offscreen-ordered', 'current'],
        getFlavour: (blockId: string) => blockId === 'offscreen-ordered' ? 'ordered' : 'paragraph',
        getProps: (blockId: string) => blockId === 'offscreen-ordered'
          ? {depth: 0, heading: 0, order: 7}
          : from.props,
      },
      schemas: {
        createSnapshot: jasmine.createSpy('createSnapshot').and.returnValue(replacement),
      },
      chain: () => chain,
    }

    expect(() => orderedTransform.onConvert!(doc as any, from as any, '1. ')).not.toThrow()

    expect(parent.getChildrenBlocks).not.toHaveBeenCalled()
    expect(replacement.props['order']).toBe(7)
    expect(chain.replaceWithSnapshots).toHaveBeenCalledOnceWith('current', [replacement])
  })
})

describe('BlockTransformerPlugin beforeInput', () => {
  function stubNextTick() {
    const scheduler = (window as any).scheduler

    if (scheduler?.yield) {
      spyOn(scheduler, 'yield').and.returnValue(Promise.resolve())
    } else if ('requestIdleCallback' in window) {
      spyOn(window as any, 'requestIdleCallback').and.callFake((cb: IdleRequestCallback) => {
        cb({didTimeout: false, timeRemaining: () => 0} as IdleDeadline)
        return 1
      })
    }
  }

  function createPlugin() {
    const block = {
      id: 'block',
      flavour: 'paragraph',
      textContent: () => ' ',
    }
    const plugin = new BlockTransformerPlugin()
    ;(plugin as any).doc = {
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => {
        const current = (plugin as any).doc.selection.value?.firstBlock
        if (current?.id === id) return current
        return id === block.id ? block : undefined
      }),
      schemas: {
        get: jasmine.createSpy('get').and.returnValue({metadata: {isLeaf: false}})
      },
      selection: {
        value: {
          collapsed: true,
          start: {type: 'text', offset: 0},
          firstBlock: block
        },
        recalculate: jasmine.createSpy('recalculate').and.callFake(() => ({
          value: (plugin as any).doc.selection.value
        }))
      }
    }
    return plugin as any
  }

  it('triggers markdown transform when Safari provides space through dataTransfer', fakeAsync(() => {
    const plugin = createPlugin()
    spyOn<any>(plugin, '_mdTransform').and.callFake(() => true)
    stubNextTick()

    plugin.onBeforeInput({
      getDefaultEvent: () => ({
        data: null,
        dataTransfer: {
          types: ['text/plain'],
          getData: () => ' '
        }
      })
    } as any)

    flushMicrotasks()

    expect(plugin._mdTransform).toHaveBeenCalled()
  }))

  it('triggers markdown transform from keyDown fallback when beforeInput text is missing', fakeAsync(() => {
    const plugin = createPlugin()
    spyOn<any>(plugin, '_mdTransform').and.callFake(() => true)
    stubNextTick()

    plugin.onKeyDown({
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {
              key: ' ',
              metaKey: false,
              ctrlKey: false,
              altKey: false
            }
          }
        }
        throw new Error(`Unexpected state ${name}`)
      }
    } as any)

    flushMicrotasks()

    expect(plugin._mdTransform).toHaveBeenCalled()
  }))

  it('opens the context menu when Safari provides slash through dataTransfer', fakeAsync(() => {
    const plugin = createPlugin()
    const block = {
      id: 'slash-block',
      flavour: 'paragraph',
      textContent: () => '/',
      textDeltas: () => [{insert: '/'}],
      textLength: 1,
      plainTextOnly: false,
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text', offset: 1},
      firstBlock: block
    }
    spyOn(plugin, 'openContextMenu')
    stubNextTick()

    plugin.onBeforeInput({
      getDefaultEvent: () => ({
        data: null,
        dataTransfer: {
          types: ['text/plain'],
          getData: () => '/'
        }
      })
    } as any)

    flushMicrotasks()

    expect(plugin.openContextMenu).toHaveBeenCalledWith(block, 0)
  }))

  it('opens the context menu from keyDown fallback when slash is typed', fakeAsync(() => {
    const plugin = createPlugin()
    const block = {
      id: 'slash-block',
      flavour: 'paragraph',
      textContent: () => '/',
      textDeltas: () => [{insert: '/'}],
      textLength: 1,
      plainTextOnly: false,
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text', offset: 1},
      firstBlock: block
    }
    spyOn(plugin, 'openContextMenu')
    stubNextTick()

    plugin.onKeyDown({
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {
              key: '/',
              metaKey: false,
              ctrlKey: false,
              altKey: false
            }
          }
        }
        throw new Error(`Unexpected state ${name}`)
      }
    } as any)

    flushMicrotasks()

    expect(plugin.openContextMenu).toHaveBeenCalledWith(block, 0)
  }))

  it('opens the slash menu at the current rich-text cursor instead of only on an empty paragraph', fakeAsync(() => {
    const plugin = createPlugin()
    const block = {
      id: 'rich-slash-block',
      flavour: 'ordered',
      textContent: () => 'before / after',
      textDeltas: () => [{insert: 'before / after'}],
      textLength: 14,
      plainTextOnly: false,
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text', offset: 8},
      firstBlock: block,
    }
    spyOn(plugin, 'openContextMenu')
    stubNextTick()

    plugin.onKeyDown({
      get: () => ({
        raw: {key: '/', metaKey: false, ctrlKey: false, altKey: false},
      }),
    } as any)
    flushMicrotasks()

    expect(plugin.openContextMenu).toHaveBeenCalledOnceWith(block, 7)
  }))

  it('lets a later beforeInput trigger replace an earlier keyDown trigger', fakeAsync(() => {
    const plugin = createPlugin()
    const block = {
      id: 'heading-block',
      flavour: 'paragraph',
      textContent: () => '# ',
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text', offset: 1},
      firstBlock: block
    }
    plugin.doc.selection.recalculate.and.callFake(() => ({
      value: plugin.doc.selection.value
    }))
    spyOn<any>(plugin, '_mdTransform').and.callFake(() => true)
    stubNextTick()

    block.textContent = () => '#'
    plugin.onKeyDown({
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {
              key: ' ',
              metaKey: false,
              ctrlKey: false,
              altKey: false
            }
          }
        }
        throw new Error(`Unexpected state ${name}`)
      }
    } as any)

    block.textContent = () => '# '
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text', offset: 1},
      firstBlock: block
    }
    plugin.onBeforeInput({
      getDefaultEvent: () => ({
        data: ' '
      })
    } as any)

    flushMicrotasks()

    expect(plugin._mdTransform).toHaveBeenCalled()
  }))

  it('does not run a queued input trigger after destroy', fakeAsync(() => {
    const plugin = createPlugin()
    spyOn<any>(plugin, '_mdTransform').and.callFake(() => true)
    stubNextTick()

    plugin.onKeyDown({
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {
              key: ' ',
              metaKey: false,
              ctrlKey: false,
              altKey: false
            }
          }
        }
        throw new Error(`Unexpected state ${name}`)
      }
    } as any)
    plugin.destroy()

    flushMicrotasks()

    expect(plugin._mdTransform).not.toHaveBeenCalled()
  }))

  it('does not open the slash context menu for a stale block', fakeAsync(() => {
    const plugin = createPlugin()
    const block = {
      id: 'stale-block',
      flavour: 'paragraph',
      textContent: () => '/',
      textDeltas: () => [{insert: '/'}],
      textLength: 1,
      plainTextOnly: false,
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text'},
      firstBlock: block
    }
    plugin.doc.getBlockById.and.throwError('missing')
    spyOn(plugin, 'openContextMenu')
    stubNextTick()

    plugin.onBeforeInput({
      getDefaultEvent: () => ({
        data: '/'
      })
    } as any)

    flushMicrotasks()

    expect(plugin.openContextMenu).not.toHaveBeenCalled()
  }))

  it('does not format heading for a stale selected block', () => {
    const plugin = createPlugin()
    const block = {
      id: 'stale-heading',
      flavour: 'paragraph',
      updateProps: jasmine.createSpy('updateProps'),
    }
    plugin.doc.getBlockById.and.throwError('missing')
    const preventDefault = jasmine.createSpy('preventDefault')

    plugin.formatHeading({
      preventDefault,
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {key: '1'},
            selection: {
              isInSameBlock: true,
              start: {type: 'text'},
              firstBlock: block,
            },
          }
        }
        throw new Error(`Unexpected state ${name}`)
      },
    } as any)

    expect(preventDefault).not.toHaveBeenCalled()
    expect(block.updateProps).not.toHaveBeenCalled()
  })

  it('does not run transform hotkeys for a stale selected block', () => {
    const plugin = new BlockTransformerPlugin([
      {
        flavour: 'bullet',
        description: 'Bullet',
        hotkey: {key: 'b'},
      } as any,
    ]) as any
    let hotkeyHandler!: (evt: any) => unknown
    const block = {
      id: 'stale-transform',
      flavour: 'paragraph',
    }
    plugin.doc = {
      getBlockById: jasmine.createSpy('getBlockById').and.throwError('missing'),
      schemas: {
        get: jasmine.createSpy('get').and.returnValue({metadata: {}}),
      },
      event: {
        bindHotkey: jasmine.createSpy('bindHotkey').and.callFake((_hotkey: any, handler: (evt: any) => unknown) => {
          hotkeyHandler = handler
        }),
      },
    }
    const transformEditableBlock = spyOn(BlockTransformerPlugin, 'transformEditableBlock')
    const preventDefault = jasmine.createSpy('preventDefault')

    plugin.init()
    const result = hotkeyHandler({
      preventDefault,
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            selection: {
              isInSameBlock: true,
              start: {type: 'text'},
              firstBlock: block,
            },
          }
        }
        throw new Error(`Unexpected state ${name}`)
      },
    })

    expect(result).toBeUndefined()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(transformEditableBlock).not.toHaveBeenCalled()
  })
})

describe('BlockTransformerPlugin slash execution', () => {
  it('splits formatted text around an inserted block and removes only the slash query', async () => {
    const plugin = new BlockTransformerPlugin() as any
    const block = {
      id: 'source',
      flavour: 'paragraph',
      parentId: 'root',
      props: {depth: 2, align: 'left'},
      textDeltas: () => [
        {insert: 'before ', attributes: {bold: true}},
        {insert: '/table'},
        {insert: ' after', attributes: {italic: true}},
      ],
    }
    const created: any[] = []
    const chain = {
      replaceWithSnapshots: jasmine.createSpy('replaceWithSnapshots'),
      nextTick: jasmine.createSpy('nextTick'),
      selectOrSetCursorAtBlock: jasmine.createSpy('selectOrSetCursorAtBlock'),
      recalculateSelection: jasmine.createSpy('recalculateSelection'),
      run: jasmine.createSpy('run').and.resolveTo(undefined),
    }
    Object.values(chain).forEach(value => {
      if (jasmine.isSpy(value) && value !== chain.run) value.and.returnValue(chain)
    })
    plugin.doc = {
      getBlockById: () => block,
      isReadonly: false,
      canInsertChild: () => true,
      schemas: {
        createSnapshot: jasmine.createSpy('createSnapshot').and.callFake((flavour: string, params: any[]) => {
          const snapshot = {id: `snapshot-${created.length}`, flavour, children: params[0], props: {...params[1]}}
          created.push(snapshot)
          return snapshot
        }),
      },
      chain: () => chain,
    }
    const range = {
      consume: () => ({block, index: 7, length: 6}),
    }

    await plugin.insertBlockAtQuery({block}, 'table', [{rows: 2}], range)

    expect(created.map(snapshot => snapshot.flavour)).toEqual(['paragraph', 'table', 'paragraph'])
    expect(created[0].children).toEqual([{insert: 'before ', attributes: {bold: true}}])
    expect(created[1].props.depth).toBe(2)
    expect(created[2].children).toEqual([{insert: ' after', attributes: {italic: true}}])
    expect(chain.replaceWithSnapshots).toHaveBeenCalledOnceWith('source', created)
    expect(chain.selectOrSetCursorAtBlock).toHaveBeenCalledOnceWith('snapshot-1', true)
  })

  it('replaces a slash range through one model delta operation', fakeAsync(() => {
    const plugin = new BlockTransformerPlugin() as any
    const scheduler = (window as any).scheduler
    if (scheduler?.yield) {
      spyOn(scheduler, 'yield').and.returnValue(Promise.resolve())
    }
    const block = {
      id: 'source',
      applyDeltaOperations: jasmine.createSpy('applyDeltaOperations'),
    }
    plugin.doc = {
      getBlockById: () => block,
      isReadonly: false,
      selection: {setCursorAt: jasmine.createSpy('setCursorAt')},
    }
    const range = {
      consume: jasmine.createSpy('consume').and.returnValue({block, index: 3, length: 6}),
    }

    expect(plugin.replaceCommandRange(range, [{insert: '😀'}])).toBeTrue()
    flushMicrotasks()

    expect(block.applyDeltaOperations).toHaveBeenCalledOnceWith([
      {retain: 3},
      {delete: 6},
      {insert: '😀'},
    ])
    expect(plugin.doc.selection.setCursorAt).toHaveBeenCalledOnceWith(block, 5)
  }))
})

describe('BlockTransformerPlugin external slash commands', () => {
  function command(id: string, label: string) {
    return {
      id,
      label,
      keywords: ['external'],
      run: jasmine.createSpy(`run:${id}:${label}`),
    }
  }

  it('supports runtime registration, stable-id override, and scoped disposal', () => {
    const original = command('host:insert-ticket', '插入工单')
    const override = command('host:insert-ticket', '插入新版工单')
    const plugin = new BlockTransformerPlugin({commands: [original]})

    const disposeOverride = plugin.registerCommand(override)
    expect(plugin.commands).toEqual([override])

    disposeOverride()
    expect(plugin.commands).toEqual([original])

    expect(plugin.unregisterCommand(original.id)).toBeTrue()
    expect(plugin.commands).toEqual([])
  })

  it('disposes a batch without removing a newer registration from another owner', () => {
    const plugin = new BlockTransformerPlugin()
    const batchCommand = command('host:shared', '批量注册')
    const disposeBatch = plugin.registerCommands([batchCommand])
    const newerCommand = command('host:shared', '后注册')
    plugin.registerCommand(newerCommand)

    disposeBatch()

    expect(plugin.commands).toEqual([newerCommand])
  })

  it('routes editor keyboard events to the active menu exactly once', () => {
    const plugin = new BlockTransformerPlugin() as any
    const activeMenu = {
      handleEditorKey: jasmine.createSpy('handleEditorKey').and.returnValue(true),
    }
    plugin.activeMenu = activeMenu
    const preventDefault = jasmine.createSpy('preventDefault')
    const stopPropagation = jasmine.createSpy('stopPropagation')
    const stopImmediatePropagation = jasmine.createSpy('stopImmediatePropagation')

    const handled = plugin.onKeyDown({
      preventDefault,
      get: () => ({
        raw: {
          key: 'ArrowDown',
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          stopPropagation,
          stopImmediatePropagation,
        },
      }),
    } as any)

    expect(handled).toBeTrue()
    expect(activeMenu.handleEditorKey).toHaveBeenCalledOnceWith('ArrowDown')
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(stopPropagation).toHaveBeenCalledTimes(1)
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1)
  })

  it('uses a transform description as a menu-only override and keeps hints separate', () => {
    const schema = {
      flavour: 'callout',
      nodeType: 'block',
      metadata: {
        label: '高亮块',
        description: 'Schema 简介',
      },
    }
    const plugin = new BlockTransformerPlugin({
      transformList: [{
        flavour: 'callout',
        description: '宿主覆盖简介',
        searchAlias: 'gl',
        markdown: /^!\s$/,
        markdownHint: '! + 空格',
        hotkey: {key: 'q', shortKey: true, shiftKey: true},
      }],
    }) as any
    plugin.doc = {
      canInsertChild: () => true,
      plugins: [],
      schemas: {
        getSchemaList: () => [schema],
        get: () => undefined,
      },
    }

    const item = plugin.buildMenuItems({parentId: 'root'})
      .find((candidate: any) => candidate.flavour === 'callout')

    expect(item).toEqual(jasmine.objectContaining({
      description: '宿主覆盖简介',
      markdownHint: '! + 空格',
      shortcutHint: jasmine.any(String),
      searchHint: '/gl',
    }))
    expect(schema.metadata.description).toBe('Schema 简介')
    expect(item.description).not.toContain('Markdown')
  })
})
