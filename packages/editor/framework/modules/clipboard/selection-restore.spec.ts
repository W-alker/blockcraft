import {BlockNodeType} from '../../block-std'
import {BlockSelection} from '../selection'
import {ClipboardManager} from './index'
import {ClipboardDataType} from './types'

describe('ClipboardManager model-first selection restore', () => {
  const eventStub = () => ({add() {}, bindHotkey() {}})

  const waitFrame = () => new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve())
  })

  const createHarness = (text: string) => {
    const rootHost = document.createElement('div')
    rootHost.setAttribute('contenteditable', 'true')
    document.body.appendChild(rootHost)
    const blocks = new Map<string, any>()
    let block: any
    block = {
      id: 'p1',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      textLength: 5,
      hostElement: rootHost,
      plainTextOnly: false,
      replaceText: jasmine.createSpy('replaceText').and.callFake((_index: number, length: number, insert: string) => {
        block.textLength += insert.length - length
      }),
    }
    blocks.set(block.id, block)
    const selection = new BlockSelection(
      {blockId: block.id, type: 'text', offset: 2, block} as any,
      {blockId: block.id, type: 'text', offset: 2, block} as any,
      block.id,
      id => blocks.get(id),
      () => 0,
    )
    const setCursorAt = jasmine.createSpy('setCursorAt')
    const recalculate = jasmine.createSpy('recalculate')
    let snapshotSeq = 0
    const doc = {
      event: eventStub(),
      config: {},
      injector: {get: () => ({supportedAdapters: [], getAdapter: () => undefined})},
      logger: {warn: jasmine.createSpy('warn')},
      root: {hostElement: rootHost},
      isEditable: (candidate: any) => candidate?.nodeType === BlockNodeType.editable,
      selection: {
        value: selection,
        setCursorAt,
        recalculate,
      },
      schemas: {
        createSnapshot: jasmine.createSpy('createSnapshot').and.callFake((_flavour: string, args: any[]) => ({
          id: `p${++snapshotSeq + 1}`,
          flavour: 'paragraph',
          nodeType: BlockNodeType.editable,
          props: args[1] ?? {},
          meta: {},
          children: args[0] ?? [],
        })),
      },
      crud: {
        transact: jasmine.createSpy('transact').and.callFake((callback: () => void) => callback()),
        insertBlocksAfter: jasmine.createSpy('insertBlocksAfter').and.callFake((_anchor: any, snapshots: any[]) => snapshots.map(snapshot => {
          const insertedText = snapshot.children.map((op: any) => op.insert ?? '').join('')
          const inserted = {
            id: snapshot.id,
            flavour: 'paragraph',
            nodeType: BlockNodeType.editable,
            props: snapshot.props,
            textLength: insertedText.length,
            hostElement: rootHost,
          }
          blocks.set(inserted.id, inserted)
          return inserted
        })),
      },
      getBlockById: (id: string) => {
        const current = blocks.get(id)
        if (!current) throw new Error(`missing block: ${id}`)
        return current
      },
    }
    const manager = new ClipboardManager(doc as any)
    const state = {
      selection,
      dataTypes: [ClipboardDataType.TEXT],
      clipboardData: {getData: () => text},
      getData: (type: string) => type === ClipboardDataType.TEXT ? text : null,
    }
    const context = {
      preventDefault: jasmine.createSpy('preventDefault'),
      get: () => state,
    }

    return {block, blocks, context, doc, manager, recalculate, rootHost, setCursorAt}
  }

  afterEach(() => {
    document.querySelectorAll('[contenteditable="true"]').forEach(node => node.remove())
  })

  it('places the model cursor after a single-line plain-text paste', async () => {
    const {block, context, manager, recalculate, setCursorAt} = createHarness('xy')

    expect(await manager.onPaste(context as any)).toBeTrue()
    await waitFrame()

    expect(setCursorAt).toHaveBeenCalledWith(block, 4)
    expect(recalculate).not.toHaveBeenCalled()
  })

  it('places the model cursor at the end of the final block after a multiline paste', async () => {
    const {blocks, context, manager, recalculate, setCursorAt} = createHarness('x\nyz')

    expect(await manager.onPaste(context as any)).toBeTrue()
    await waitFrame()

    expect(setCursorAt).toHaveBeenCalledWith(blocks.get('p2'), 2)
    expect(recalculate).not.toHaveBeenCalled()
  })

  it('offers Markdown parsing when the clipboard only exposes markdown-like plain text', async () => {
    const {context, manager} = createHarness('# Heading')
    const region = {
      start: {blockId: 'p1', rel: null},
      end: {blockId: 'p1', rel: null},
    } as any
    spyOn(manager as any, '_captureRegion').and.returnValue(region)
    const events: any[] = []
    manager.pasteFormatData$.subscribe(event => events.push(event))

    expect(await manager.onPaste(context as any)).toBeTrue()

    expect(events).toEqual([
      null,
      jasmine.objectContaining({
        appliedType: 'plain-text',
        htmlSnapshot: null,
        plainText: '# Heading',
        markdownText: '# Heading',
        region,
        collapsed: true,
      }),
    ])
    expect((manager as any)._captureRegion).toHaveBeenCalledWith('p1', 2, 'p1', 11)
  })

  it('does not open a format session for ordinary plain text', async () => {
    const {context, manager} = createHarness('ordinary text')
    const events: any[] = []
    manager.pasteFormatData$.subscribe(event => events.push(event))

    expect(await manager.onPaste(context as any)).toBeTrue()

    expect(events).toEqual([null])
  })
})
