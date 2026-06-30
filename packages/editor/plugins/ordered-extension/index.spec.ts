import {Subject} from "rxjs";
import {BlockNodeType, IBlockProps} from "../../framework";
import {OrderedBlockPlugin} from "./index";

type MockBlock = {
  id: string
  flavour: string
  nodeType: BlockNodeType
  props: IBlockProps
  parentBlock: MockParent | null
  updateProps: jasmine.Spy
}

type MockParent = {
  id: string
  flavour: string
  props: IBlockProps
  childrenLength: number
  getChildrenBlocks: () => MockBlock[]
  getChildrenByIndex: (index: number) => MockBlock
}

const waitForAutoOrder = async () => {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

const createBlock = (id: string, flavour = 'paragraph', props: IBlockProps = {}): MockBlock => {
  const block = {
    id,
    flavour,
    nodeType: BlockNodeType.editable,
    props: {depth: 0, ...props},
    parentBlock: null,
    updateProps: jasmine.createSpy(`updateProps:${id}`)
  } as MockBlock

  block.updateProps.and.callFake((patch: IBlockProps) => {
    Object.assign(block.props, patch)
  })

  return block
}

const createOrderedBlock = (id: string, props: IBlockProps = {}): MockBlock => {
  return createBlock(id, 'ordered', {order: 0, ...props})
}

const createPluginHarness = () => {
  const onChildrenUpdate$ = new Subject<any>()
  const onPropsUpdate$ = new Subject<any>()
  const plugin = new OrderedBlockPlugin()
  const pluginWithDoc = plugin as unknown as {
    doc: {
      onChildrenUpdate$: Subject<any>
      onPropsUpdate$: Subject<any>
      crud: {
        transact: (fn: () => void) => void
      }
    }
  }

  pluginWithDoc.doc = {
    onChildrenUpdate$,
    onPropsUpdate$,
    crud: {
      transact: (fn: () => void) => fn()
    }
  }

  plugin.init()

  return {
    onChildrenUpdate$,
    onPropsUpdate$,
    plugin
  }
}

const attachToParent = (blocks: MockBlock[]) => {
  const parent: MockParent = {
    id: 'parent',
    flavour: 'root',
    props: {},
    get childrenLength() {
      return blocks.length
    },
    getChildrenBlocks: () => blocks,
    getChildrenByIndex: (index: number) => blocks[index]
  }

  blocks.forEach(block => {
    block.parentBlock = parent
  })

  return parent
}

const triggerChildrenChanged = (onChildrenUpdate$: Subject<any>, parent: MockParent, patch: any) => {
  onChildrenUpdate$.next({
    isUndoRedo: false,
    local: true,
    transactions: [{
      block: parent,
      ...patch
    }]
  })
}

const triggerInserted = (onChildrenUpdate$: Subject<any>, parent: MockParent, block: MockBlock) => {
  triggerChildrenChanged(onChildrenUpdate$, parent, {inserted: [block]})
}

const triggerDeleted = (onChildrenUpdate$: Subject<any>, parent: MockParent, index: number, length = 1) => {
  triggerChildrenChanged(onChildrenUpdate$, parent, {deleted: [{index, length}]})
}

const triggerPropsChanged = (onPropsUpdate$: Subject<any>, block: MockBlock, changedKeys: string[]) => {
  onPropsUpdate$.next({
    isUndoRedo: false,
    local: true,
    transactions: [{
      block,
      changes: new Map(changedKeys.map(key => [key, {oldValue: undefined, action: 'update'}]))
    }]
  })
}

describe('OrderedBlockPlugin', () => {
  it('renumbers sibling ordered heading blocks with the same heading level', async () => {
    const {onChildrenUpdate$, plugin} = createPluginHarness()
    const blocks = [
      createOrderedBlock('ordered-1', {heading: 1}),
      createOrderedBlock('ordered-2', {heading: 1}),
      createOrderedBlock('ordered-3', {heading: 1})
    ]
    const parent = attachToParent(blocks)

    triggerInserted(onChildrenUpdate$, parent, blocks[2])

    await waitForAutoOrder()

    expect(blocks.map(block => block.props['order'])).toEqual([0, 1, 2])
    plugin.destroy()
  })

  it('does not let lower-level ordered headings split higher-level numbering', async () => {
    const {onChildrenUpdate$, plugin} = createPluginHarness()
    const blocks = [
      createOrderedBlock('ordered-1', {heading: 1}),
      createOrderedBlock('ordered-2', {heading: 2}),
      createOrderedBlock('ordered-3', {heading: 1})
    ]
    const parent = attachToParent(blocks)

    triggerInserted(onChildrenUpdate$, parent, blocks[2])

    await waitForAutoOrder()

    expect(blocks.map(block => block.props['order'])).toEqual([0, 0, 1])
    plugin.destroy()
  })

  it('renumbers following ordered blocks when one ordered heading changes', async () => {
    const {onPropsUpdate$, plugin} = createPluginHarness()
    const blocks = [
      createOrderedBlock('ordered-1', {heading: 1, order: 0}),
      createOrderedBlock('ordered-2', {heading: 2, order: 1}),
      createOrderedBlock('ordered-3', {heading: 1, order: 2})
    ]
    attachToParent(blocks)

    triggerPropsChanged(onPropsUpdate$, blocks[1], ['heading'])

    await waitForAutoOrder()

    expect(blocks.map(block => block.props['order'])).toEqual([0, 0, 1])
    plugin.destroy()
  })

  it('continues ordered numbering across non-ordered siblings at the same depth', async () => {
    const {onChildrenUpdate$, plugin} = createPluginHarness()
    const blocks = [
      createOrderedBlock('ordered-1', {order: 0}),
      createBlock('paragraph-1'),
      createOrderedBlock('ordered-2', {order: 0})
    ]
    const parent = attachToParent(blocks)

    triggerInserted(onChildrenUpdate$, parent, blocks[2])

    await waitForAutoOrder()

    expect([blocks[0].props['order'], blocks[2].props['order']]).toEqual([0, 1])
    plugin.destroy()
  })

  it('restarts nested ordered numbering after returning to a shallower depth', async () => {
    const {onChildrenUpdate$, plugin} = createPluginHarness()
    const blocks = [
      createOrderedBlock('ordered-1', {depth: 0, order: 0}),
      createOrderedBlock('ordered-1-1', {depth: 1, order: 0}),
      createOrderedBlock('ordered-1-2', {depth: 1, order: 0}),
      createOrderedBlock('ordered-2', {depth: 0, order: 0}),
      createOrderedBlock('ordered-2-1', {depth: 1, order: 9})
    ]
    const parent = attachToParent(blocks)

    triggerInserted(onChildrenUpdate$, parent, blocks[4])

    await waitForAutoOrder()

    expect(blocks.map(block => block.props['order'])).toEqual([0, 0, 1, 1, 0])
    plugin.destroy()
  })

  it('honors explicit start numbers and continues from them', async () => {
    const {onChildrenUpdate$, plugin} = createPluginHarness()
    const blocks = [
      createOrderedBlock('ordered-1', {order: 0}),
      createOrderedBlock('ordered-2', {start: 3, order: 0}),
      createOrderedBlock('ordered-3', {order: 0})
    ]
    const parent = attachToParent(blocks)

    triggerInserted(onChildrenUpdate$, parent, blocks[2])

    await waitForAutoOrder()

    expect(blocks.map(block => block.props['order'])).toEqual([0, 2, 3])
    plugin.destroy()
  })

  it('uses an explicit following start as a boundary for start-only changes', async () => {
    const {onPropsUpdate$, plugin} = createPluginHarness()
    const blocks = [
      createOrderedBlock('ordered-1', {order: 0}),
      createOrderedBlock('ordered-2', {start: 5, order: 4}),
      createOrderedBlock('ordered-3', {order: 5}),
      createOrderedBlock('ordered-4', {start: 20, order: 19}),
      createOrderedBlock('ordered-5', {order: 20})
    ]
    attachToParent(blocks)

    blocks.forEach(block => block.updateProps.calls.reset())
    blocks[1].props['start'] = 8
    triggerPropsChanged(onPropsUpdate$, blocks[1], ['start'])

    await waitForAutoOrder()

    expect(blocks.map(block => block.props['order'])).toEqual([0, 7, 8, 19, 20])
    expect(blocks[0].updateProps).not.toHaveBeenCalled()
    expect(blocks[3].updateProps).not.toHaveBeenCalled()
    expect(blocks[4].updateProps).not.toHaveBeenCalled()
    plugin.destroy()
  })

  it('renumbers remaining ordered siblings after deletion', async () => {
    const {onChildrenUpdate$, plugin} = createPluginHarness()
    const blocks = [
      createOrderedBlock('ordered-1', {order: 0}),
      createOrderedBlock('ordered-3', {order: 2})
    ]
    const parent = attachToParent(blocks)

    triggerDeleted(onChildrenUpdate$, parent, 1)

    await waitForAutoOrder()

    expect(blocks.map(block => block.props['order'])).toEqual([0, 1])
    plugin.destroy()
  })
})
