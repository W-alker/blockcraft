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
  getChildrenBlocks: () => MockBlock[]
}

const waitForAutoOrder = async () => {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

const createOrderedBlock = (id: string, props: IBlockProps = {}): MockBlock => {
  const block = {
    id,
    flavour: 'ordered',
    nodeType: BlockNodeType.editable,
    props: {depth: 0, order: 0, ...props},
    parentBlock: null,
    updateProps: jasmine.createSpy(`updateProps:${id}`)
  } as MockBlock

  block.updateProps.and.callFake((patch: IBlockProps) => {
    Object.assign(block.props, patch)
  })

  return block
}

const createPluginHarness = () => {
  const onChildrenUpdate$ = new Subject<any>()
  const onPropsUpdate$ = new Subject<any>()
  const plugin = new OrderedBlockPlugin()
  const pluginWithDoc = plugin as unknown as {
    doc: {
      onChildrenUpdate$: Subject<any>
      onPropsUpdate$: Subject<any>
    }
  }

  pluginWithDoc.doc = {
    onChildrenUpdate$,
    onPropsUpdate$
  }

  plugin.init()

  return {
    onChildrenUpdate$,
    plugin
  }
}

const attachToParent = (blocks: MockBlock[]) => {
  const parent: MockParent = {
    getChildrenBlocks: () => blocks
  }

  blocks.forEach(block => {
    block.parentBlock = parent
  })
}

const triggerInserted = (onChildrenUpdate$: Subject<any>, block: MockBlock) => {
  onChildrenUpdate$.next({
    isUndoRedo: false,
    local: true,
    transactions: [{
      inserted: [block]
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
    attachToParent(blocks)

    triggerInserted(onChildrenUpdate$, blocks[2])

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
    attachToParent(blocks)

    triggerInserted(onChildrenUpdate$, blocks[2])

    await waitForAutoOrder()

    expect(blocks.map(block => block.props['order'])).toEqual([0, 0, 1])
    plugin.destroy()
  })
})
