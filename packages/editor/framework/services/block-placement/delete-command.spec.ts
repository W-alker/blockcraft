import {BehaviorSubject, Subject} from 'rxjs'
import {
  BlockReadonlyError,
  BlockReadonlyOperation,
} from '../../doc/block-readonly.types'
import {BlockPlacementManager} from '../block-placement.manager'
import {
  deleteAbsolutePlacementObject,
  deleteAbsolutePlacementObjects,
} from './delete-command'

function makeDeleteHarness(options: {
  inLayout?: boolean
  inGroup?: boolean
  readonly?: boolean
} = {}) {
  const inLayout = options.inLayout ?? true
  const inGroup = options.inGroup ?? false
  const selection = {
    isInSameBlock: true,
    anchor: {blockId: 'shape-1', type: 'selected'},
    head: {blockId: 'shape-1', type: 'selected'},
  }
  const assertRemovable = jasmine.createSpy('assertRemovable')
  if (options.readonly) {
    assertRemovable.and.throwError(new BlockReadonlyError({
      operation: BlockReadonlyOperation.Delete,
      blockIds: ['shape-1'],
      source: {kind: 'self', blockId: 'shape-1'},
    }))
  }
  const captureSelectionBeforeChange =
    jasmine.createSpy('captureSelectionBeforeChange')
  const deleteBlocks = jasmine.createSpy('deleteBlocks')
    .and.returnValue([{index: 0, length: 1}])
  const blur = jasmine.createSpy('blur')
  const model = {
    exists: (id: string) => ['layout', 'group', 'shape-1'].includes(id),
    getParentId: (id: string) => id === 'shape-1'
      ? inGroup ? 'group' : inLayout ? 'layout' : 'root'
      : 'root',
    getFlavour: (id: string) => id === 'layout'
      ? 'placement-layout'
      : id === 'group'
        ? 'object-group'
        : 'shape',
    getProps: (id: string) =>
      id === 'shape-1' ? {position: {x: 12, y: 24}} : {},
    indexInParent: (id: string) => id === 'shape-1' ? 0 : -1,
  }
  const doc = {
    model,
    schemas: {
      get: () => ({
        metadata: {placement: {modes: ['relative', 'absolute']}},
      }),
    },
    readonlyManager: {assertRemovable},
    selection: {value: selection, blur},
    crud: {
      undoManager: {captureSelectionBeforeChange},
      deleteBlocks,
    },
  } as any

  return {
    doc,
    selection,
    assertRemovable,
    captureSelectionBeforeChange,
    deleteBlocks,
    blur,
  }
}

describe('deleteAbsolutePlacementObject', () => {
  it('force-deletes the last absolute object and blurs its stale selection', () => {
    const h = makeDeleteHarness()

    expect(deleteAbsolutePlacementObject(h.doc, 'shape-1', 'input')).toBeTrue()

    expect(h.assertRemovable).toHaveBeenCalledOnceWith(
      ['shape-1'],
      BlockReadonlyOperation.Delete,
      'input',
    )
    expect(h.captureSelectionBeforeChange).toHaveBeenCalledTimes(1)
    expect(h.deleteBlocks).toHaveBeenCalledOnceWith('layout', 0, 1, true)
    expect(h.blur).toHaveBeenCalledTimes(1)
  })

  it('leaves relative blocks on the ordinary deletion path', () => {
    const h = makeDeleteHarness({inLayout: false})

    expect(deleteAbsolutePlacementObject(h.doc, 'shape-1', 'menu')).toBeFalse()

    expect(h.assertRemovable).not.toHaveBeenCalled()
    expect(h.captureSelectionBeforeChange).not.toHaveBeenCalled()
    expect(h.deleteBlocks).not.toHaveBeenCalled()
    expect(h.blur).not.toHaveBeenCalled()
  })

  it('deletes a group member through the same absolute-object command', () => {
    const h = makeDeleteHarness({inGroup: true})

    expect(deleteAbsolutePlacementObject(h.doc, 'shape-1', 'input')).toBeTrue()

    expect(h.deleteBlocks).toHaveBeenCalledOnceWith('group', 0, 1, true)
    expect(h.blur).toHaveBeenCalledTimes(1)
  })

  it('deletes a contiguous multi-object selection in one undo step', () => {
    const h = makeDeleteHarness()
    const ids = ['shape-1', 'word-art-2']
    h.doc.model.exists = (id: string) => ['layout', ...ids].includes(id)
    h.doc.model.getParentId = (id: string) => ids.includes(id)
      ? 'layout'
      : 'root'
    h.doc.model.getFlavour = (id: string) => id === 'layout'
      ? 'placement-layout'
      : id === 'shape-1'
        ? 'shape'
        : 'word-art'
    h.doc.model.indexInParent = (id: string) => ids.indexOf(id)
    h.doc.selection.value = {
      anchor: {blockId: 'layout', type: 'boundary', index: 0},
      head: {blockId: 'layout', type: 'boundary', index: 2},
      getBoundarySelectedChildIds: () => ids,
    }

    expect(deleteAbsolutePlacementObjects(h.doc, ids, 'input')).toBeTrue()

    expect(h.assertRemovable).toHaveBeenCalledOnceWith(
      ids,
      BlockReadonlyOperation.Delete,
      'input',
    )
    expect(h.captureSelectionBeforeChange).toHaveBeenCalledTimes(1)
    expect(h.deleteBlocks).toHaveBeenCalledOnceWith('layout', 0, 2, true)
    expect(h.blur).toHaveBeenCalledTimes(1)
  })

  it('rejects readonly deletion before capturing an undo selection', () => {
    const h = makeDeleteHarness({readonly: true})

    expect(() =>
      deleteAbsolutePlacementObject(h.doc, 'shape-1', 'input'),
    ).toThrowError(BlockReadonlyError)

    expect(h.captureSelectionBeforeChange).not.toHaveBeenCalled()
    expect(h.deleteBlocks).not.toHaveBeenCalled()
    expect(h.blur).not.toHaveBeenCalled()
  })
})

describe('BlockPlacementManager absolute object deletion hotkeys', () => {
  it('binds Delete and Backspace to placement-layout and consumes deletion', () => {
    const h = makeDeleteHarness()
    const readonlySwitch$ = new BehaviorSubject(false)
    const onDestroy$ = new Subject<void>()
    const registrations: Array<{
      binding: Record<string, unknown>
      handler: BlockCraft.EventHandler
      options: {flavour?: string}
    }> = []
    h.doc.event = {
      bindHotkey: (
        binding: Record<string, unknown>,
        handler: BlockCraft.EventHandler,
        options: {flavour?: string},
      ) => {
        registrations.push({binding, handler, options})
        return () => {}
      },
    }
    h.doc.readonlySwitch$ = readonlySwitch$
    h.doc.onDestroy$ = onDestroy$
    h.doc.afterInit = () => {}
    h.doc.onChildrenUpdate$ = undefined
    h.doc.onPropsUpdate$ = undefined
    h.doc.ngZone = {runOutsideAngular: (fn: () => void) => fn()}

    const manager = new BlockPlacementManager(h.doc)

    expect(registrations.length).toBe(2)
    expect(registrations.map(item => item.binding['key']))
      .toEqual(['Backspace', 'Delete'])
    expect(registrations.every(item =>
      item.options.flavour === 'placement-layout',
    )).toBeTrue()

    const preventDefault = jasmine.createSpy('preventDefault')
    const result = registrations[1].handler({
      get: () => ({selection: h.selection}),
      preventDefault,
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(h.deleteBlocks).toHaveBeenCalledOnceWith('layout', 0, 1, true)
    expect(h.blur).toHaveBeenCalledTimes(1)

    manager.destroy()
    readonlySwitch$.complete()
    onDestroy$.complete()
  })

  it('consumes readonly Delete without mutating the document', () => {
    const h = makeDeleteHarness({readonly: true})
    const readonlySwitch$ = new BehaviorSubject(false)
    const onDestroy$ = new Subject<void>()
    const handlers: BlockCraft.EventHandler[] = []
    h.doc.event = {
      bindHotkey: (
        _binding: Record<string, unknown>,
        handler: BlockCraft.EventHandler,
      ) => {
        handlers.push(handler)
        return () => {}
      },
    }
    h.doc.readonlySwitch$ = readonlySwitch$
    h.doc.onDestroy$ = onDestroy$
    h.doc.afterInit = () => {}
    h.doc.ngZone = {runOutsideAngular: (fn: () => void) => fn()}

    const manager = new BlockPlacementManager(h.doc)
    const preventDefault = jasmine.createSpy('preventDefault')

    expect(handlers[1]({
      get: () => ({selection: h.selection}),
      preventDefault,
    } as any)).toBeTrue()
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(h.captureSelectionBeforeChange).not.toHaveBeenCalled()
    expect(h.deleteBlocks).not.toHaveBeenCalled()

    manager.destroy()
    readonlySwitch$.complete()
    onDestroy$.complete()
  })
})
