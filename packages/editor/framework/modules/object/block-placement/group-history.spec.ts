import * as Y from 'yjs'
import {Subject} from 'rxjs'
import {BlockPlacementGroupCoordinator} from './group.coordinator'
import {TEXT_BOX_OBJECT_FORMAT_CAPABILITY} from '../../../../blocks/text-box-block/text-box.types'
import {WORD_ART_OBJECT_FORMAT_CAPABILITY} from '../../../../blocks/word-art-block/word-art.types'

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
      schemas: {get: (kind: string) => ({metadata: {placement: {modes: ['absolute']},
        ...(kind === 'text-box' ? {objectFormat: TEXT_BOX_OBJECT_FORMAT_CAPABILITY} : {}),
        ...(kind === 'word-art' ? {objectFormat: WORD_ART_OBJECT_FORMAT_CAPABILITY} : {}),
      }})},
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
    return {yDoc, props, history, coordinator, block, onPropsUpdate$, readonlyIds, runtime}
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

  it('restores a resized group and every member in one undo/redo', () => {
    const h = setup()
    const before = h.props.toJSON()
    const group: any = {id: 'group', changeDetectorRef: {markForCheck() {}}}
    expect(h.coordinator.updateObjectGeometry(group, {width: 540, height: 270, position: '80 90'})).toBeTrue()
    const after = h.props.toJSON()
    expect(after['group']).toEqual({width: 540, height: 270, position: '80 90'})
    expect(after['member']).toEqual({width: 360, height: 150, rotation: 0, position: '0 0'})
    expect(after['sibling']).toEqual({width: 90, height: 90, rotation: 0, position: '450 180'})
    expect(h.history.undoStack.length).toBe(1)
    h.history.undo()
    expect(h.props.toJSON()).toEqual(before)
    h.history.redo()
    expect(h.props.toJSON()).toEqual(after)
    h.coordinator.destroy()
    h.yDoc.destroy()
  })

  it('commits a WordArt font, geometry and fixed mode together and restores all of them in one undo', () => {
    const h = setup('word-art')
    h.yDoc.transact(() => {
      h.props.get('member')!.set('textFont', '40px 700 italic')
      h.props.get('member')!.set('textAutoFit', 'resize-shape')
      h.props.get('member')!.set('textFit', 100)
    }, 'remote')
    const before = h.props.toJSON()
    const group: any = {id: 'group', changeDetectorRef: {markForCheck() {}}}
    expect(h.coordinator.updateObjectGeometry(group, {width: 540, height: 270})).toBeTrue()
    const after = h.props.toJSON()
    expect(after['member'].textFont).toBe('60px 700 italic')
    expect(after['member'].textAutoFit).toBe('none')
    expect(after['member'].width).toBe(360)
    expect(after['sibling'].textFont).toBeUndefined()
    expect(h.history.undoStack.length).toBe(1)
    h.history.undo()
    expect(h.props.toJSON()).toEqual(before)
    h.history.redo()
    expect(h.props.toJSON()).toEqual(after)
    h.coordinator.destroy()
    h.yDoc.destroy()
  })

  it('freezes the measured member frame with group geometry in one undo, including very small resizes', () => {
    const h = setup()
    h.yDoc.transact(() => {
      h.props.get('member')!.set('textAutoFit', 'resize-shape')
      h.props.get('member')!.set('textFit', 140)
    }, 'remote')
    const before = h.props.toJSON()
    const group: any = {id: 'group', changeDetectorRef: {markForCheck() {}}}
    expect(h.coordinator.updateObjectGeometry(group, {width: 360.02, height: 180})).toBeTrue()
    const after = h.props.toJSON()
    expect(after['member'].textAutoFit).toBe('none')
    expect(after['member'].textFit).toBeNull()
    expect(after['member'].height).toBe(140)
    expect(h.history.undoStack.length).toBe(1)
    h.history.undo()
    expect(h.props.toJSON()).toEqual(before)
    h.history.redo()
    expect(h.props.toJSON()).toEqual(after)
    h.coordinator.destroy()
    h.yDoc.destroy()
  })

  it('preserves auto-fit on no-op geometry updates and rejected locked resizes', () => {
    const h = setup()
    h.yDoc.transact(() => {
      h.props.get('member')!.set('textAutoFit', 'resize-shape')
      h.props.get('member')!.set('textFit', 100)
    }, 'remote')
    const group: any = {id: 'group', changeDetectorRef: {markForCheck() {}}}
    expect(h.coordinator.updateObjectGeometry(group, {width: 360, height: 180})).toBeTrue()
    expect(h.props.get('member')!.get('textAutoFit')).toBe('resize-shape')
    expect(h.props.get('member')!.get('textFit')).toBe(100)
    h.readonlyIds.add('member')
    expect(h.coordinator.updateObjectGeometry(group, {width: 540, height: 270})).toBeFalse()
    expect(h.props.get('member')!.get('textAutoFit')).toBe('resize-shape')
    h.coordinator.destroy()
    h.yDoc.destroy()
  })

  it('moves members together before fitting the group and restores the entire batch in one undo', () => {
    const h = setup()
    const before = h.props.toJSON()
    const sibling: any = {
      id: 'sibling',
      updateProps: (patch: Record<string, any>) => h.yDoc.transact(() => {
        Object.entries(patch).forEach(([key, value]) => h.props.get('sibling')!.set(key, value))
      }),
      changeDetectorRef: {markForCheck() {}},
    }
    expect(h.coordinator.updateObjectPositions([
      {block: h.block, position: {x: 50, y: 30}},
      {block: sibling, position: {x: 350, y: 150}},
    ])).toBeTrue()
    const after = h.props.toJSON()
    expect(after['group']).toEqual({...before['group'], position: '150 130'})
    expect(after['member']).toEqual(before['member'])
    expect(after['sibling']).toEqual(before['sibling'])
    expect(h.history.undoStack.length).toBe(1)
    h.history.undo()
    expect(h.props.toJSON()).toEqual(before)
    h.history.redo()
    expect(h.props.toJSON()).toEqual(after)
    h.coordinator.destroy()
    h.yDoc.destroy()
  })

  it('rejects a locked member before writing any part of a movement batch', () => {
    const h = setup()
    h.readonlyIds.add('sibling')
    const before = h.props.toJSON()
    expect(h.coordinator.updateObjectPositions([
      {block: h.block, position: {x: 50, y: 30}},
      {block: {id: 'sibling'} as any, position: {x: 350, y: 150}},
    ])).toBeFalse()
    expect(h.props.toJSON()).toEqual(before)
    expect(h.history.undoStack.length).toBe(0)
    h.coordinator.destroy()
    h.yDoc.destroy()
  })

  it('keeps a flow group origin fixed rather than cancelling member translation', () => {
    const h = setup()
    h.runtime.getPersistedState = () => ({mode: 'relative'})
    h.yDoc.transact(() => h.props.get('group')!.delete('position'), 'remote')
    const before = h.props.toJSON()
    const sibling: any = {
      id: 'sibling',
      updateProps: (patch: Record<string, any>) => h.yDoc.transact(() => {
        Object.entries(patch).forEach(([key, value]) => h.props.get('sibling')!.set(key, value))
      }),
      changeDetectorRef: {markForCheck() {}},
    }
    expect(h.coordinator.updateObjectPositions([
      {block: h.block, position: {x: 50, y: 30}},
      {block: sibling, position: {x: 350, y: 150}},
    ])).toBeTrue()
    expect(h.props.get('member')!.get('position')).toBe('50 30')
    expect(h.props.get('sibling')!.get('position')).toBe('350 150')
    expect(h.props.get('group')!.toJSON()).toEqual({width: 410, height: 210})
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
