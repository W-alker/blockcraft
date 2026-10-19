import * as Y from 'yjs'
import {BlockNodeType} from '../../block-std'
import {BlockSelection} from './blockSelection'
import {
  captureRelativeSelectionBookmark,
  remoteChangeAffectsRelativeSelectionBookmark,
  resolveRelativeSelectionBookmark,
  sameSelectionJSON,
} from './relative-bookmark'
import {
  lazyBoundaryPoint,
  lazyGapPoint,
  lazyPoint,
  lazyTableCellPoint,
} from './normalize'
import {ISelectionJSON, ISelectionPointJSON} from './types'

type TestBlock = {
  id: string
  flavour: string
  nodeType: BlockNodeType
  parentId: string | null
  parentBlock: TestBlock | null
  childrenIds: string[]
  childrenLength: number
  yBlock: Y.Map<any>
  yText: Y.Text
  textLength: number
  doc: any
}

describe('RelativeSelectionBookmark', () => {
  let yDoc: Y.Doc
  let blocks: Map<string, TestBlock>
  let doc: any

  beforeEach(() => {
    yDoc = new Y.Doc()
    blocks = new Map()
    doc = {
      yDoc,
      getBlockById: (id: string) => {
        const block = blocks.get(id)
        if (!block) throw new Error(`Block not found: ${id}`)
        return block
      },
      isEditable: (block: TestBlock) => block.nodeType === BlockNodeType.editable,
      schemas: {
        get: (flavour: string) => ({
          metadata: {
            selectionScope: flavour === 'root'
              ? 'document'
              : flavour === 'columns'
                ? 'columns'
                : 'transparent',
          },
        }),
      },
    }
  })

  afterEach(() => yDoc.destroy())

  const createBlock = (
    id: string,
    nodeType: BlockNodeType,
    parentId: string | null,
    options: {flavour?: string; text?: string; children?: string[]} = {},
  ) => {
    const yBlock = new Y.Map<any>()
    const yText = new Y.Text()
    const yChildren = new Y.Array<string>()
    yBlock.set('text', yText)
    yBlock.set('children', yChildren)
    yDoc.getMap('blocks').set(id, yBlock)
    if (options.text) yText.insert(0, options.text)
    if (options.children?.length) yChildren.insert(0, options.children)

    const block: TestBlock = {
      id,
      flavour: options.flavour ?? (nodeType === BlockNodeType.root ? 'root' : 'paragraph'),
      nodeType,
      parentId,
      parentBlock: null,
      childrenIds: options.children ?? [],
      childrenLength: options.children?.length ?? 0,
      yBlock,
      yText,
      textLength: yText.length,
      doc,
    }
    Object.defineProperties(block, {
      parentBlock: {
        get: () => parentId ? blocks.get(parentId) ?? null : null,
      },
      childrenIds: {
        get: () => (yBlock.get('children') as Y.Array<string>).toArray(),
      },
      childrenLength: {
        get: () => (yBlock.get('children') as Y.Array<string>).length,
      },
      yText: {
        get: () => yBlock.get('text') as Y.Text,
      },
      textLength: {
        get: () => (yBlock.get('text') as Y.Text).length,
      },
    })
    blocks.set(id, block)
    return block
  }

  const point = (json: ISelectionPointJSON) => {
    if (json.type === 'boundary') {
      return lazyBoundaryPoint(json.blockId, json.index ?? 0, doc.getBlockById)
    }
    if (json.type === 'gap') {
      return lazyGapPoint(json.blockId, json.side ?? 'before', doc.getBlockById)
    }
    if (json.type === 'table-cell') {
      return lazyTableCellPoint(json.blockId, json.tableId!, doc.getBlockById)
    }
    return lazyPoint(json as any, doc.getBlockById)
  }

  const selection = (json: ISelectionJSON) => new BlockSelection(
    point(json.anchor),
    point(json.head),
    json.commonParent,
    doc.getBlockById,
    (a, b) => {
      if (a === b) return 0
      const order = [...blocks.keys()]
      return order.indexOf(a) < order.indexOf(b)
        ? Node.DOCUMENT_POSITION_FOLLOWING
        : Node.DOCUMENT_POSITION_PRECEDING
    },
  )

  it('maps a text caret through an insertion at the same Y.Text position', () => {
    createBlock('root', BlockNodeType.root, null, {children: ['p1']})
    const p1 = createBlock('p1', BlockNodeType.editable, 'root', {text: 'ab'})
    const bookmark = captureRelativeSelectionBookmark(selection({
      anchor: {blockId: 'p1', type: 'text', offset: 1},
      head: {blockId: 'p1', type: 'text', offset: 1},
      commonParent: 'p1',
    }), doc)!

    p1.yText.insert(1, 'X')

    expect(resolveRelativeSelectionBookmark(bookmark, doc)).toEqual({
      anchor: {blockId: 'p1', type: 'text', offset: 2},
      head: {blockId: 'p1', type: 'text', offset: 2},
      commonParent: 'p1',
    })
  })

  it('preserves backward anchor and head while mapping both text endpoints', () => {
    createBlock('root', BlockNodeType.root, null, {children: ['p1']})
    const p1 = createBlock('p1', BlockNodeType.editable, 'root', {text: 'abcd'})
    const bookmark = captureRelativeSelectionBookmark(selection({
      anchor: {blockId: 'p1', type: 'text', offset: 4},
      head: {blockId: 'p1', type: 'text', offset: 1},
      commonParent: 'p1',
    }), doc)!

    p1.yText.insert(0, 'X')

    const resolved = resolveRelativeSelectionBookmark(bookmark, doc)!
    expect(resolved.anchor).toEqual({blockId: 'p1', type: 'text', offset: 5})
    expect(resolved.head).toEqual({blockId: 'p1', type: 'text', offset: 2})
  })

  it('maps a boundary through children insertion and keeps its container fallback index', () => {
    const root = createBlock('root', BlockNodeType.root, null, {children: ['p1', 'p2']})
    createBlock('p1', BlockNodeType.editable, 'root', {text: 'a'})
    createBlock('p2', BlockNodeType.editable, 'root', {text: 'b'})
    const bookmark = captureRelativeSelectionBookmark(selection({
      anchor: {blockId: 'root', type: 'boundary', index: 1},
      head: {blockId: 'root', type: 'boundary', index: 1},
      commonParent: 'root',
    }), doc)!

    ;(root.yBlock.get('children') as Y.Array<string>).insert(0, ['p0'])

    expect(resolveRelativeSelectionBookmark(bookmark, doc)?.anchor).toEqual({
      blockId: 'root', type: 'boundary', index: 2,
    })
  })

  it('round-trips selected, gap and table-cell points without DOM state', () => {
    createBlock('root', BlockNodeType.root, null, {children: ['divider', 'table']})
    createBlock('divider', BlockNodeType.void, 'root')
    createBlock('table', BlockNodeType.block, 'root', {children: ['row'], flavour: 'table'})
    createBlock('row', BlockNodeType.block, 'table', {children: ['cell'], flavour: 'table-row'})
    createBlock('cell', BlockNodeType.block, 'row', {flavour: 'table-cell'})

    const selected = captureRelativeSelectionBookmark(selection({
      anchor: {blockId: 'divider', type: 'selected'},
      head: {blockId: 'divider', type: 'selected'},
      commonParent: 'divider',
    }), doc)!
    const gap = captureRelativeSelectionBookmark(selection({
      anchor: {blockId: 'divider', type: 'gap', side: 'after'},
      head: {blockId: 'divider', type: 'gap', side: 'after'},
      commonParent: 'divider',
    }), doc)!
    const cell = captureRelativeSelectionBookmark(selection({
      anchor: {blockId: 'cell', type: 'table-cell', tableId: 'table'},
      head: {blockId: 'cell', type: 'table-cell', tableId: 'table'},
      commonParent: 'table',
    }), doc)!

    expect(resolveRelativeSelectionBookmark(selected, doc)).toEqual(selected.source)
    expect(resolveRelativeSelectionBookmark(gap, doc)).toEqual(gap.source)
    expect(resolveRelativeSelectionBookmark(cell, doc)).toEqual(cell.source)
  })

  it('recomputes commonParent and tracks endpoint ancestor dependencies', () => {
    createBlock('root', BlockNodeType.root, null, {children: ['columns']})
    createBlock('columns', BlockNodeType.block, 'root', {
      children: ['left', 'right'], flavour: 'columns',
    })
    createBlock('left', BlockNodeType.block, 'columns', {children: ['left-p'], flavour: 'column'})
    createBlock('right', BlockNodeType.block, 'columns', {children: ['right-p'], flavour: 'column'})
    createBlock('left-p', BlockNodeType.editable, 'left', {text: 'left'})
    createBlock('right-p', BlockNodeType.editable, 'right', {text: 'right'})
    const bookmark = captureRelativeSelectionBookmark(selection({
      anchor: {blockId: 'left-p', type: 'text', offset: 1},
      head: {blockId: 'right-p', type: 'text', offset: 2},
      commonParent: 'columns',
    }), doc)!

    expect(resolveRelativeSelectionBookmark(bookmark, doc)?.commonParent).toBe('columns')
    expect([...bookmark.dependencyBlockIds]).toEqual(jasmine.arrayContaining([
      'left-p', 'left', 'right-p', 'right', 'columns', 'root',
    ]))
  })

  it('returns null when an endpoint block no longer exists', () => {
    createBlock('root', BlockNodeType.root, null, {children: ['p1']})
    createBlock('p1', BlockNodeType.editable, 'root', {text: 'ab'})
    const bookmark = captureRelativeSelectionBookmark(selection({
      anchor: {blockId: 'p1', type: 'text', offset: 1},
      head: {blockId: 'p1', type: 'text', offset: 1},
      commonParent: 'p1',
    }), doc)!

    blocks.delete('p1')

    expect(resolveRelativeSelectionBookmark(bookmark, doc)).toBeNull()
  })

  it('treats a direct endpoint change as relevant', () => {
    createBlock('root', BlockNodeType.root, null, {children: ['p1']})
    createBlock('p1', BlockNodeType.editable, 'root', {text: 'ab'})
    const bookmark = captureRelativeSelectionBookmark(selection({
      anchor: {blockId: 'p1', type: 'text', offset: 1},
      head: {blockId: 'p1', type: 'text', offset: 1},
      commonParent: 'p1',
    }), doc)!

    expect(remoteChangeAffectsRelativeSelectionBookmark(
      bookmark,
      new Set(['p1']),
      doc,
    )).toBeTrue()
  })

  it('ignores an ancestor change when the endpoint path and index stay stable', () => {
    const root = createBlock('root', BlockNodeType.root, null, {children: ['p1']})
    createBlock('p1', BlockNodeType.editable, 'root', {text: 'ab'})
    const bookmark = captureRelativeSelectionBookmark(selection({
      anchor: {blockId: 'p1', type: 'text', offset: 1},
      head: {blockId: 'p1', type: 'text', offset: 1},
      commonParent: 'p1',
    }), doc)!

    createBlock('p2', BlockNodeType.editable, 'root', {text: 'cd'})
    ;(root.yBlock.get('children') as Y.Array<string>).insert(1, ['p2'])

    expect(remoteChangeAffectsRelativeSelectionBookmark(
      bookmark,
      new Set(['root']),
      doc,
    )).toBeFalse()
  })

  it('detects an ancestor change that moves an endpoint structurally', () => {
    const root = createBlock('root', BlockNodeType.root, null, {children: ['p1']})
    createBlock('p1', BlockNodeType.editable, 'root', {text: 'ab'})
    const bookmark = captureRelativeSelectionBookmark(selection({
      anchor: {blockId: 'p1', type: 'text', offset: 1},
      head: {blockId: 'p1', type: 'text', offset: 1},
      commonParent: 'p1',
    }), doc)!

    createBlock('p0', BlockNodeType.editable, 'root', {text: 'cd'})
    ;(root.yBlock.get('children') as Y.Array<string>).insert(0, ['p0'])

    expect(remoteChangeAffectsRelativeSelectionBookmark(
      bookmark,
      new Set(['root']),
      doc,
    )).toBeTrue()
  })

  it('treats a boundary container change as directly relevant', () => {
    createBlock('root', BlockNodeType.root, null, {children: ['p1']})
    createBlock('p1', BlockNodeType.editable, 'root', {text: 'ab'})
    const bookmark = captureRelativeSelectionBookmark(selection({
      anchor: {blockId: 'root', type: 'boundary', index: 1},
      head: {blockId: 'root', type: 'boundary', index: 1},
      commonParent: 'root',
    }), doc)!

    expect(remoteChangeAffectsRelativeSelectionBookmark(
      bookmark,
      new Set(['root']),
      doc,
    )).toBeTrue()
  })

  it('compares selection JSON including point-specific fields', () => {
    expect(sameSelectionJSON(
      {
        anchor: {blockId: 'divider', type: 'gap', side: 'before'},
        head: {blockId: 'divider', type: 'gap', side: 'before'},
        commonParent: 'divider',
      },
      {
        anchor: {blockId: 'divider', type: 'gap', side: 'after'},
        head: {blockId: 'divider', type: 'gap', side: 'after'},
        commonParent: 'divider',
      },
    )).toBeFalse()
  })
})
