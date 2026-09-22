import * as Y from 'yjs'
import {Subject} from 'rxjs'
import {BlockPlacementGroupCoordinator} from './group.coordinator'

describe('Group geometry history', () => {
  function setup(flavour = 'text-box', grouped = true) {
    const yDoc = new Y.Doc()
    const props = yDoc.getMap<Y.Map<any>>('props')
    for (const [id, values] of Object.entries({
      group: {width: 360, height: 180, position: '100 100'},
      member: {width: 240, height: 100, rotation: 0, position: '0 0'},
      sibling: {width: 60, height: 60, rotation: 0, position: '300 120'},
    })) {
      props.set(id, new Y.Map<any>(Object.entries(values)))
    }
    const history = new Y.UndoManager(props, {trackedOrigins: new Set([null])})
    const onPropsUpdate$ = new Subject<any>()
    const readonlyIds = new Set<string>()
    const update = (id: string, patch: Record<string, any>) => yDoc.transact(() => {
      Object.entries(patch).forEach(([key, value]) => props.get(id)!.set(key, value))
    })
    const doc: any = {
      onPropsUpdate$,
      model: {
        getParentId: () => grouped ? 'group' : 'layout',
        getFlavour: (id: string) => id === 'member' ? flavour : 'shape',
      },
      schemas: {get: () => ({metadata: {placement: {modes: ['absolute']}}})},
      objectSizing: {rootContentWidth: 800, getCapability: () => null},
      crud: {
        getYBlock: (id: string) => ({get: () => props.get(id)}),
        updateBlockProps: update,
        transact: (fn: () => void, origin: unknown = null) => yDoc.transact(fn, origin),
      },
    }
    const runtime: any = {
      isReadonly: (block: string | {id: string}) => readonlyIds.has(typeof block === 'string' ? block : block.id),
      isObjectGroup: (id: string) => id === 'group',
      getLiveChildrenIds: () => ['member', 'sibling'],
      getPersistedState: () => ({mode: 'absolute'}),
    }
    const coordinator = new BlockPlacementGroupCoordinator(doc, runtime)
    const block: any = {
      id: 'member',
      updateProps: (patch: Record<string, any>) => update('member', patch),
      changeDetectorRef: {markForCheck() {}},
    }
    return {yDoc, props, history, coordinator, block, onPropsUpdate$, readonlyIds}
  }

  for (const flavour of ['text-box', 'shape', 'word-art']) {
    for (const patch of [{rotation: 90}, {width: 420, height: 200}]) {
      it(`${flavour} ${Object.keys(patch)[0]} restores member, sibling and group in one undo/redo`, () => {
        const h = setup(flavour)
        const before = h.props.toJSON()
        expect(h.coordinator.updateObjectGeometry(h.block, patch)).toBeTrue()
        const after = h.props.toJSON()
        expect(after).not.toEqual(before)
        expect(after['group']).not.toEqual(before['group'])
        expect(h.history.undoStack.length).toBe(1)
        h.history.undo()
        expect(h.props.toJSON()).toEqual(before)
        expect(h.history.undoStack.length).toBe(0)
        h.history.redo()
        expect(h.props.toJSON()).toEqual(after)
        h.coordinator.destroy()
        h.yDoc.destroy()
      })
    }
  }

  it('keeps standalone geometry edits undoable without touching group props', () => {
    const h = setup('text-box', false)
    const before = h.props.toJSON()
    h.coordinator.updateObjectGeometry(h.block, {rotation: 90})
    expect(h.props.get('group')!.toJSON()).toEqual(before['group'])
    h.history.undo()
    expect(h.props.toJSON()).toEqual(before)
    h.coordinator.destroy()
    h.yDoc.destroy()
  })

  it('keeps background reflow out of local history', async () => {
    const h = setup()
    const before = h.props.get('group')!.toJSON()
    h.yDoc.transact(() => h.props.get('member')!.set('rotation', 90), 'remote')
    h.onPropsUpdate$.next({
      origin: 'remote',
      transactions: [{block: h.block, changes: new Map([['rotation', {}]])}],
    })
    await Promise.resolve()
    expect(h.props.get('group')!.toJSON()).not.toEqual(before)
    expect(h.history.undoStack.length).toBe(0)
    h.coordinator.destroy()
    h.yDoc.destroy()
  })

  it('does not write or record edits to a readonly group', () => {
    const h = setup()
    h.readonlyIds.add('group')
    const before = h.props.toJSON()
    expect(h.coordinator.updateObjectGeometry(h.block, {rotation: 90})).toBeFalse()
    expect(h.props.toJSON()).toEqual(before)
    expect(h.history.undoStack.length).toBe(0)
    h.coordinator.destroy()
    h.yDoc.destroy()
  })
})
