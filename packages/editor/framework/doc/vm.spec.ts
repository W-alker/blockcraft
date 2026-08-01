import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  Injector,
} from '@angular/core'
import {TestBed} from '@angular/core/testing'
import * as Y from 'yjs'
import {
  BaseBlockComponent,
  BlockNodeType,
  EditableBlockComponent,
  NativeBlockModel,
  SchemaManager,
  YBlock,
  native2YBlock,
} from '../block-std'
import {DocVM} from './vm'

@Component({
  selector: 'div.test-vm-root',
  template: '<div class="children-render-container"></div>',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestVMRootBlock extends BaseBlockComponent {}

@Component({
  selector: 'section.test-vm-container',
  template: '<div class="children-render-container"></div>',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestVMContainerBlock extends BaseBlockComponent {}

@Component({
  selector: 'div.test-vm-leaf',
  template: '',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestVMLeafBlock extends BaseBlockComponent {}

@Component({
  selector: 'p.test-vm-editable',
  template: '',
  standalone: true,
  host: {
    '[class.edit-container]': 'true',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestVMEditableBlock extends EditableBlockComponent {}

const schema = (
  flavour: string,
  nodeType: BlockNodeType,
  component: any,
): any => ({
  flavour,
  nodeType,
  component,
  createSnapshot: () => { throw new Error('not used') },
  metadata: {
    version: 1,
    label: flavour,
    includeChildren: ['*'],
  },
})

const model = (
  id: string,
  flavour: string,
  nodeType: BlockNodeType,
  children: NativeBlockModel['children'] = [],
): NativeBlockModel => ({
  id,
  flavour,
  nodeType,
  props: {},
  meta: {},
  children,
} as NativeBlockModel)

describe('DocVM sparse root mounts', () => {
  let vm: DocVM
  let yBlocks: Y.Map<YBlock>
  let doc: any

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        TestVMRootBlock,
        TestVMContainerBlock,
        TestVMLeafBlock,
        TestVMEditableBlock,
      ],
    })
    const yDoc = new Y.Doc()
    yBlocks = yDoc.getMap<YBlock>('blocks')
    ;[
      model('root', 'test-root', BlockNodeType.root, ['a', 'b']),
      model('a', 'test-container', BlockNodeType.block, ['a1']),
      model('a1', 'test-leaf', BlockNodeType.void),
      model('b', 'test-leaf', BlockNodeType.void),
      model('text', 'test-editable', BlockNodeType.editable, [{insert: 'hello'}]),
      model('target', 'test-container', BlockNodeType.block),
    ].forEach(value => yBlocks.set(value.id, native2YBlock(value)))

    const schemas = new SchemaManager([
      schema('test-root', BlockNodeType.root, TestVMRootBlock),
      schema('test-container', BlockNodeType.block, TestVMContainerBlock),
      schema('test-leaf', BlockNodeType.void, TestVMLeafBlock),
      schema('test-editable', BlockNodeType.editable, TestVMEditableBlock),
    ])
    doc = {
      injector: TestBed.inject(Injector),
      schemas,
      crud: {
        getYBlock: (id: string) => yBlocks.get(id),
      },
      model: {
        exists: (id: string) => {
          const visited = new Set<string>()
          const pending = ['root']
          while (pending.length) {
            const current = pending.pop()!
            if (visited.has(current)) continue
            visited.add(current)
            if (current === id) return true
            const children = yBlocks.get(current)?.get('children')
            if (children instanceof Y.Array) pending.push(...children.toArray())
          }
          return false
        },
        getParentId: (id: string) => {
          for (const [parentId, parent] of yBlocks.entries()) {
            const children = parent.get('children')
            if (children instanceof Y.Array && children.toArray().includes(id)) return parentId
          }
          return null
        },
        getChildrenIds: (id: string) => {
          const children = yBlocks.get(id)?.get('children')
          return children instanceof Y.Array
            ? children.toArray().filter(childId => yBlocks.has(childId))
            : []
        },
      },
      readonlyManager: {
        resolve: () => ({
          readonly: false,
          source: null,
          lockUserId: null,
          lockKind: null,
        }),
        isReadonly: () => false,
        isExplicitReadonly: () => false,
      },
      config: {embeds: []},
      event: {status: {isComposing: false}},
      isInitialized: true,
      isReadonly: false,
    }
    vm = new DocVM(doc)
    doc.vm = vm
    Object.defineProperty(doc, 'root', {
      get: () => vm.get('root')?.instance,
    })
  })

  afterEach(() => {
    vm.clear()
    TestBed.inject(ApplicationRef).tick()
  })

  it('creates only the root while preserving its model child ids', () => {
    const root = vm.createRootOnlyByYBlock(yBlocks.get('root')!)

    expect(root.instance.childrenIds).toEqual(['a', 'b'])
    expect(root.instance.childrenRenderRef?.length).toBe(0)
    expect(vm.has('a')).toBeFalse()
    expect(vm.has('b')).toBeFalse()
  })

  it('mounts every reachable root subtree when sparse root mode is disabled', () => {
    const root = vm.createRootOnlyByYBlock(yBlocks.get('root')!, {sparse: false})

    const children = vm.mountAllRootChildren()

    expect(vm.usesSparseRoot).toBeFalse()
    expect(children.map(child => child.instance.id)).toEqual(['a', 'b'])
    expect(root.instance.childrenRenderRef?.ids).toEqual(['a', 'b'])
    expect(vm.get('a')?.instance.parentId).toBe('root')
    expect(vm.get('a1')?.instance.parentId).toBe('a')
    expect(vm.get('b')?.instance.parentId).toBe('root')
  })

  it('reports dangling child refs while mounting a complete root view', () => {
    const rootChildren = yBlocks.get('root')!.get('children') as Y.Array<string>
    const nestedChildren = yBlocks.get('a')!.get('children') as Y.Array<string>
    rootChildren.insert(1, ['missing'])
    nestedChildren.insert(0, ['nested-missing'])
    vm.createRootOnlyByYBlock(yBlocks.get('root')!, {sparse: false})
    const missing: Array<{parentId: string; childId: string}> = []

    vm.mountAllRootChildren((parentId, childId) => {
      missing.push({parentId, childId})
    })

    expect(missing).toEqual([
      {parentId: 'root', childId: 'missing'},
      {parentId: 'a', childId: 'nested-missing'},
    ])
    expect(vm.getMountedRootChildIds()).toEqual(['a', 'b'])
    expect(vm.get('a')?.instance.childrenRenderRef?.ids).toEqual(['a1'])
  })

  it('ensures one complete root-child subtree without mounting it', () => {
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)

    const first = vm.ensureRootChildComponent('a')
    const second = vm.ensureRootChildComponent('a')

    expect(second).toBe(first)
    expect(vm.has('a1')).toBeTrue()
    expect(vm.isMounted('a')).toBeFalse()
    expect(vm.isMounted('a1')).toBeFalse()
    expect(doc.root.childrenRenderRef.length).toBe(0)
  })

  it('mounts sparse children in model order and reuses retained refs', () => {
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    const retained = vm.ensureRootChildComponent('a')

    vm.mountRootChild('b')
    vm.mountRootChild('a')

    const container = doc.root.childrenRenderRef.containerElement as HTMLElement
    expect(Array.from(container.children).map(element => element.getAttribute('data-block-id')))
      .toEqual(['a', 'b'])
    expect(vm.isMounted('a')).toBeTrue()
    expect(vm.isMounted('a1')).toBeTrue()

    vm.retainRootChild('a')
    expect(vm.get('a')).toBe(retained)
    expect(vm.isMounted('a')).toBeFalse()
    expect(vm.isMounted('a1')).toBeFalse()
    expect(Array.from(container.children).map(element => element.getAttribute('data-block-id')))
      .toEqual(['b'])

    expect(vm.mountRootChild('a')).toBe(retained)
    expect(Array.from(container.children).map(element => element.getAttribute('data-block-id')))
      .toEqual(['a', 'b'])
  })

  it('evicts a retained root subtree and rebuilds it from current Yjs on demand', () => {
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    const first = vm.mountRootChild('a')
    vm.retainRootChild('a')
    expect(vm.getRetainedRootChildIds()).toEqual(['a'])

    expect(vm.destroyRetainedRootChild('a')).toBeTrue()
    expect(vm.getRetainedRootChildIds()).toEqual([])
    expect(vm.has('a')).toBeFalse()
    expect(vm.has('a1')).toBeFalse()

    const rebuilt = vm.mountRootChild('a')
    expect(rebuilt).not.toBe(first)
    expect(vm.has('a1')).toBeTrue()
    expect(vm.isMounted('a')).toBeTrue()
  })

  it('reconciles sparse model indices without creating inserted siblings', () => {
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    vm.mountRootChild('a')
    vm.mountRootChild('b')
    const c = model('c', 'test-leaf', BlockNodeType.void)
    yBlocks.set('c', native2YBlock(c))
    ;(yBlocks.get('root')!.get('children') as Y.Array<string>).insert(1, ['c'])

    vm.applySparseRootChildrenDelta([{retain: 1}, {insert: ['c']}])

    expect(vm.has('c')).toBeFalse()
    vm.mountRootChild('c')
    const container = doc.root.childrenRenderRef.containerElement as HTMLElement
    expect(Array.from(container.children).map(element => element.getAttribute('data-block-id')))
      .toEqual(['a', 'c', 'b'])

    ;(yBlocks.get('root')!.get('children') as Y.Array<string>).delete(0, 1)
    vm.applySparseRootChildrenDelta([{delete: 1}])

    expect(vm.isMounted('a')).toBeFalse()
    expect(Array.from(container.children).map(element => element.getAttribute('data-block-id')))
      .toEqual(['c', 'b'])
  })

  it('reorders only moved sparse hosts so an unrelated native range stays alive', () => {
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    vm.mountRootChild('a')
    vm.mountRootChild('b')
    const c = model('c', 'test-leaf', BlockNodeType.void)
    yBlocks.set('c', native2YBlock(c))
    ;(yBlocks.get('root')!.get('children') as Y.Array<string>).insert(2, ['c'])
    vm.applySparseRootChildrenDelta([{retain: 2}, {insert: ['c']}])
    vm.mountRootChild('c')

    const rootHost = doc.root.hostElement as HTMLElement
    const container = doc.root.childrenRenderRef.containerElement as HTMLElement
    const stableHost = vm.get('a')!.instance.hostElement
    const text = document.createTextNode('stable')
    stableHost.append(text)
    document.body.append(rootHost)

    const selection = window.getSelection()!
    const range = document.createRange()
    range.setStart(text, 3)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    try {
      vm._reconcileSparseRootChildren(['c', 'a', 'b'])

      expect(Array.from(container.children).map(element => element.getAttribute('data-block-id')))
        .toEqual(['c', 'a', 'b'])
      expect(selection.rangeCount).toBe(1)
      expect(selection.anchorNode).toBe(text)
      expect(selection.anchorOffset).toBe(3)
      expect(selection.focusNode).toBe(text)
      expect(selection.focusOffset).toBe(3)
    } finally {
      selection.removeAllRanges()
      rootHost.remove()
    }
  })

  it('retries a sparse reorder from the actual DOM after a partial move fails', () => {
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    vm.mountRootChild('a')
    vm.mountRootChild('b')
    const c = model('c', 'test-leaf', BlockNodeType.void)
    yBlocks.set('c', native2YBlock(c))
    ;(yBlocks.get('root')!.get('children') as Y.Array<string>).insert(2, ['c'])
    vm.applySparseRootChildrenDelta([{retain: 2}, {insert: ['c']}])
    vm.mountRootChild('c')
    const container = doc.root.childrenRenderRef.containerElement as HTMLElement
    const insertBefore = container.insertBefore.bind(container)
    let insertions = 0
    spyOn(container, 'insertBefore').and.callFake((node, child) => {
      if (++insertions === 2) throw new Error('transient DOM move failure')
      return insertBefore(node, child)
    })

    expect(() => vm._reconcileSparseRootChildren(['c', 'b', 'a']))
      .toThrowError('transient DOM move failure')
    expect(Array.from(container.children).map(element => element.getAttribute('data-block-id')))
      .not.toEqual(['c', 'b', 'a'])

    expect(() => vm._reconcileSparseRootChildren(['c', 'b', 'a'])).not.toThrow()
    expect(Array.from(container.children).map(element => element.getAttribute('data-block-id')))
      .toEqual(['c', 'b', 'a'])
    expect(doc.root.childrenRenderRef.ids).toEqual(['c', 'b', 'a'])
  })

  it('prunes a retained root host reinserted outside sparse render ownership', () => {
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    const retained = vm.mountRootChild('a')
    vm.mountRootChild('b')
    const container = doc.root.childrenRenderRef.containerElement as HTMLElement

    vm.retainRootChild('a')
    container.append(retained.instance.hostElement)
    expect(retained.instance.hostElement.parentElement).toBe(container)

    vm._reconcileSparseRootChildren(['a', 'b'])

    expect(retained.instance.hostElement.parentElement).toBeNull()
    expect(vm.getRetainedRootChildIds()).toContain('a')
    expect(doc.root.childrenRenderRef.ids).toEqual(['b'])
  })

  it('defers moving a preserved sparse child until composition view settlement', () => {
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    vm.mountRootChild('a')
    vm.mountRootChild('b')
    const container = doc.root.childrenRenderRef.containerElement as HTMLElement
    const rootChildren = yBlocks.get('root')!.get('children') as Y.Array<string>
    rootChildren.delete(0, 1)
    rootChildren.insert(1, ['a'])

    vm.applySparseRootChildrenDelta(
      [{delete: 1}, {retain: 1}, {insert: ['a']}],
      {
        desiredIds: ['b', 'a'],
        preserveIds: new Set(['a']),
      },
    )

    expect(vm.hasDeferredSparseRootOrder).toBeTrue()
    expect(vm.isMounted('a')).toBeTrue()
    expect(Array.from(container.children).map(element => element.getAttribute('data-block-id')))
      .toEqual(['a', 'b'])

    expect(vm._flushDeferredSparseRootOrder()).toBeTrue()
    expect(vm.hasDeferredSparseRootOrder).toBeFalse()
    expect(Array.from(container.children).map(element => element.getAttribute('data-block-id')))
      .toEqual(['b', 'a'])
  })

  it('defers a full sparse-order repair that would move the composing root unit', () => {
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    vm.mountRootChild('a')
    vm.mountRootChild('b')
    doc.rootId = 'root'
    doc.inputManger = {
      compositionSession: {
        isActive: true,
        activeBlockId: 'a1',
      },
    }
    doc.event.status.isComposing = true
    doc.model = {
      exists: (id: string) => yBlocks.has(id),
      getPath: (id: string) => id === 'a1' ? ['root', 'a', 'a1'] : null,
    }
    const container = doc.root.childrenRenderRef.containerElement as HTMLElement

    vm._reconcileSparseRootChildren(['b', 'a'])

    expect(vm.hasDeferredSparseRootOrder).toBeTrue()
    expect(vm.isDeferredSparseRootChild('a')).toBeTrue()
    expect(Array.from(container.children).map(element => element.getAttribute('data-block-id')))
      .toEqual(['a', 'b'])

    vm._flushDeferredSparseRootOrder()
    expect(Array.from(container.children).map(element => element.getAttribute('data-block-id')))
      .toEqual(['b', 'a'])
  })

  it('does not defer sparse-root repair after native composition was cancelled', () => {
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    vm.mountRootChild('a')
    vm.mountRootChild('b')
    doc.rootId = 'root'
    doc.inputManger = {
      compositionSession: {
        isActive: true,
        activeBlockId: 'a1',
      },
    }
    doc.event.status.isComposing = false
    doc.model = {
      exists: (id: string) => yBlocks.has(id),
      getPath: (id: string) => id === 'a1' ? ['root', 'a', 'a1'] : null,
    }
    const container = doc.root.childrenRenderRef.containerElement as HTMLElement

    vm._reconcileSparseRootChildren(['b', 'a'])

    expect(vm.hasDeferredSparseRootOrder).toBeFalse()
    expect(Array.from(container.children).map(element => element.getAttribute('data-block-id')))
      .toEqual(['b', 'a'])
  })

  it('retains a mounted subtree after its container YBlock was deleted', () => {
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    vm.mountRootChild('a')
    ;(yBlocks.get('root')!.get('children') as Y.Array<string>).delete(0, 1)
    yBlocks.delete('a')

    expect(() => vm.applySparseRootChildrenDelta([{delete: 1}])).not.toThrow()
    expect(vm.isMounted('a')).toBeFalse()
    expect(vm.isMounted('a1')).toBeFalse()

    vm.deleteByIds(['a'])
    expect(vm.has('a')).toBeFalse()
    expect(vm.has('a1')).toBeFalse()
  })

  it('preserves a child moved back to root while deleting its obsolete container view', () => {
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    const container = vm.mountRootChild('a')
    vm.mountRootChild('b')
    const moved = vm.get('a1')!
    const rootChildren = yBlocks.get('root')!.get('children') as Y.Array<string>
    const containerChildren = yBlocks.get('a')!.get('children') as Y.Array<string>

    containerChildren.delete(0, 1)
    rootChildren.delete(0, 1)
    rootChildren.insert(0, ['a1'])
    yBlocks.delete('a')
    // Mirrors DocCRUD's model projection update before VM deletion cleanup.
    ;(doc.root as any)._childrenIds = ['a1', 'b']

    vm.deleteByIds(['a'])

    expect(vm.has('a')).toBeFalse()
    expect(vm.get('a1')).toBe(moved)
    expect(moved.instance.parentId).toBe('root')
    expect(moved.instance.isAttached).toBeFalse()
    expect(vm.getRetainedRootChildIds()).toContain('a1')
    expect(container.instance.hostElement.contains(moved.instance.hostElement)).toBeFalse()

    vm.applySparseRootChildrenDelta([{delete: 1}, {insert: ['a1']}])
    expect(() => vm.mountRootChild('a1')).not.toThrow()
    expect(doc.root.childrenRenderRef.ids).toEqual(['a1', 'b'])
    expect(vm.isMounted('a1')).toBeTrue()
  })

  it('reattaches a retained root text block when a mounted nested container adopts it', () => {
    const rootChildren = yBlocks.get('root')!.get('children') as Y.Array<string>
    rootChildren.delete(0, rootChildren.length)
    rootChildren.insert(0, ['text', 'target'])
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    const text = vm.mountRootChild('text')
    const target = vm.mountRootChild('target')

    expect(text.instance.hostElement.textContent).toContain('hello')

    rootChildren.delete(0, 1)
    ;(yBlocks.get('target')!.get('children') as Y.Array<string>).insert(0, ['text'])
    vm.applySparseRootChildrenDelta([{delete: 1}])
    expect(text.instance.isAttached).toBeFalse()

    vm.insert(target, 0, [text])

    expect(text.instance.parentId).toBe('target')
    expect(text.instance.isAttached).toBeTrue()
    expect(text.instance.hostElement.textContent).toContain('hello')
    expect(target.instance.childrenRenderRef?.ids).toEqual(['text'])
    expect(vm.getRetainedRootChildIds()).not.toContain('text')

    ;(yBlocks.get('target')!.get('children') as Y.Array<string>).delete(0, 1)
    rootChildren.insert(0, ['text'])
    target.instance.childrenRenderRef?.splice(0, 1)
    vm.applySparseRootChildrenDelta([{insert: ['text']}])
    vm.retainRootChild('text')

    expect(target.instance.hostElement.contains(text.instance.hostElement)).toBeFalse()
    expect(text.instance.parentId).toBe('root')
    expect(text.instance.isAttached).toBeFalse()
    expect(vm.getRetainedRootChildIds()).toContain('text')

    vm.mountRootChild('text')

    expect(text.instance.parentId).toBe('root')
    expect(text.instance.isAttached).toBeTrue()
    expect(text.instance.hostElement.textContent).toContain('hello')
    expect(doc.root.childrenRenderRef.ids).toContain('text')
    expect(target.instance.childrenRenderRef?.ids).toEqual([])
  })

  it('keeps an adopted text block retained until its offscreen target is mounted', () => {
    const rootChildren = yBlocks.get('root')!.get('children') as Y.Array<string>
    rootChildren.delete(0, rootChildren.length)
    rootChildren.insert(0, ['text', 'target'])
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    const text = vm.mountRootChild('text')
    const target = vm.mountRootChild('target')
    vm.retainRootChild('target')

    rootChildren.delete(0, 1)
    ;(yBlocks.get('target')!.get('children') as Y.Array<string>).insert(0, ['text'])
    vm.applySparseRootChildrenDelta([{delete: 1}])
    vm.insert(target, 0, [text])

    expect(target.instance.isAttached).toBeFalse()
    expect(text.instance.isAttached).toBeFalse()
    expect(text.instance.parentId).toBe('target')
    expect(vm.getRetainedRootChildIds()).toEqual(['target'])

    vm.mountRootChild('target')

    expect(target.instance.isAttached).toBeTrue()
    expect(text.instance.isAttached).toBeTrue()
    expect(text.instance.hostElement.textContent).toContain('hello')
  })

  it('adopts a retained root child when its previously uncreated target mounts', () => {
    const rootChildren = yBlocks.get('root')!.get('children') as Y.Array<string>
    rootChildren.delete(0, rootChildren.length)
    rootChildren.insert(0, ['text', 'target'])
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    const text = vm.mountRootChild('text')

    rootChildren.delete(0, 1)
    ;(yBlocks.get('target')!.get('children') as Y.Array<string>).insert(0, ['text'])
    vm.applySparseRootChildrenDelta([{delete: 1}])
    text.instance.parentId = 'target'
    vm.retainComponentSubtree(text)

    expect(vm.get('target')).toBeUndefined()
    expect(vm.getRetainedRootChildIds()).toContain('text')

    const target = vm.mountRootChild('target')

    expect(target.instance.childrenRenderRef?.ids).toEqual(['text'])
    expect(text.instance.parentId).toBe('target')
    expect(text.instance.isAttached).toBeTrue()
    expect(text.instance.hostElement.textContent).toContain('hello')
    expect(vm.getRetainedRootChildIds()).not.toContain('text')
  })

  it('rolls back a component that throws during its first lifecycle pass', () => {
    const rootChildren = yBlocks.get('root')!.get('children') as Y.Array<string>
    rootChildren.delete(0, rootChildren.length)
    rootChildren.insert(0, ['text'])
    vm.createRootOnlyByYBlock(yBlocks.get('root')!)
    doc.readonlyManager.resolve = () => {
      throw new Error('readonly resolution failed')
    }

    expect(() => vm.ensureRootChildComponent('text'))
      .toThrowError('readonly resolution failed')
    expect(vm.has('text')).toBeFalse()
    expect(vm.getRetainedRootChildIds()).not.toContain('text')
  })
})
