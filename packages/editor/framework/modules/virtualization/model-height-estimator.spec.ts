import {BlockNodeType} from '../../block-std'
import {
  estimateModelBlockHeight,
  estimateModelBlockHeightDetails,
  modelHeightEstimateAffectedByContentChange,
} from './model-height-estimator'

describe('estimateModelBlockHeight', () => {
  it('uses persisted wr/ar for media without reading DOM', () => {
    const doc = createDoc({
      image: {
        flavour: 'image',
        nodeType: BlockNodeType.void,
        props: {wr: 50, ar: 2},
        children: [],
      },
    })
    doc.objectSizing.resolve.and.returnValue({
      width: 400,
      height: 200,
      wr: 50,
      ar: 2,
      source: 'ratio',
      exact: true,
    })

    expect(estimateModelBlockHeight(doc as any, 'image')).toBe(200)
  })

  it('uses inline image dimensions and clamps them to root content width', () => {
    const doc = createDoc({
      paragraph: {
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {},
        children: [],
        deltas: [{
          insert: {image: 'image.png'},
          attributes: {width: 1200, height: 600},
        }],
      },
    })
    doc.objectSizing.resolve.and.returnValue(null)
    doc.objectSizing.rootContentWidth = 600

    expect(estimateModelBlockHeight(doc as any, 'paragraph')).toBe(300)
  })

  it('uses the shared 4:3 fallback for unsized inline images', () => {
    const doc = createDoc({
      paragraph: {
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {},
        children: [],
        deltas: [{insert: {image: 'image.png'}}],
      },
    })
    doc.objectSizing.resolve.and.returnValue(null)

    expect(estimateModelBlockHeight(doc as any, 'paragraph')).toBe(240)
  })

  it('reserves wrapped image height plus its square-wrap gap', () => {
    const doc = createDoc({
      paragraph: {
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {},
        children: [],
        deltas: [{
          insert: {image: 'image.png'},
          attributes: {
            width: 160,
            height: 120,
            wrap: true,
            side: 'right',
            x: 0,
            gap: 12,
          },
        }],
      },
    })
    doc.objectSizing.resolve.and.returnValue(null)
    doc.objectSizing.rootContentWidth = 400

    expect(estimateModelBlockHeight(doc as any, 'paragraph')).toBe(132)
  })

  it('accounts for extra text lines in the constrained wrapped side', () => {
    const doc = createDoc({
      paragraph: {
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {},
        children: [],
        deltas: [
          {insert: '字'.repeat(200)},
          {
            insert: {image: 'image.png'},
            attributes: {
              width: 160,
              height: 100,
              wrap: true,
              side: 'right',
              x: 0,
              gap: 12,
            },
          },
        ],
      },
    })
    doc.objectSizing.resolve.and.returnValue(null)
    doc.objectSizing.rootContentWidth = 400

    expect(estimateModelBlockHeight(doc as any, 'paragraph')).toBe(144)
  })

  it('uses the wider interval for auto side estimation', () => {
    const doc = createDoc({
      paragraph: {
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {},
        children: [],
        deltas: [
          {insert: '字'.repeat(120)},
          {
            insert: {image: 'image.png'},
            attributes: {
              width: 100,
              height: 96,
              wrap: true,
              side: 'auto',
              x: 0.6,
              gap: 12,
            },
          },
        ],
      },
    })
    doc.objectSizing.resolve.and.returnValue(null)
    doc.objectSizing.rootContentWidth = 400

    expect(estimateModelBlockHeight(doc as any, 'paragraph')).toBe(120)
  })

  it('clamps oversized wrapped images to the root content width', () => {
    const doc = createDoc({
      paragraph: {
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {},
        children: [],
        deltas: [{
          insert: {image: 'image.png'},
          attributes: {
            width: 1200,
            height: 600,
            wrap: true,
            side: 'auto',
            x: 0.5,
            gap: 12,
          },
        }],
      },
    })
    doc.objectSizing.resolve.and.returnValue(null)
    doc.objectSizing.rootContentWidth = 600

    expect(estimateModelBlockHeight(doc as any, 'paragraph')).toBe(312)
  })

  it('keeps invalid wrap flags on the ordinary inline estimate path', () => {
    const doc = createDoc({
      paragraph: {
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {},
        children: [],
        deltas: [{
          insert: {image: 'image.png'},
          attributes: {
            width: 160,
            height: 120,
            wrap: 'square',
            side: 'diagonal',
            x: Number.NaN,
            gap: -4,
          },
        }],
      },
    })
    doc.objectSizing.resolve.and.returnValue(null)
    doc.objectSizing.rootContentWidth = 400

    expect(estimateModelBlockHeight(doc as any, 'paragraph')).toBe(120)
  })

  it('estimates a table from its direct physical row heights', () => {
    const doc = createDoc({
      table: block('table', BlockNodeType.block, {}, ['row-1', 'row-2']),
      'row-1': block('table-row', BlockNodeType.block, {height: 72}),
      'row-2': block('table-row', BlockNodeType.block, {height: 48}),
    })

    expect(estimateModelBlockHeightDetails(doc as any, 'table')).toEqual({
      height: 120,
      modelDriven: true,
    })
  })

  it('uses configured row fallback and keeps the configured table estimate as a floor', () => {
    const doc = createDoc({
      table: block('table', BlockNodeType.block, {}, ['row-1', 'row-2']),
      'row-1': block('table-row', BlockNodeType.block, {height: 0}),
      'row-2': block('table-row', BlockNodeType.block, {height: Number.NaN}),
    })

    expect(estimateModelBlockHeight(doc as any, 'table', {
      estimatedHeights: {
        table: 100,
        'table-row': 40,
      },
    })).toBe(100)
  })

  it('falls back for empty or malformed tables and ignores non-row children', () => {
    const empty = createDoc({
      table: block('table', BlockNodeType.block),
    })
    expect(estimateModelBlockHeightDetails(empty as any, 'table', {
      estimatedHeights: {table: 240},
    })).toEqual({height: 240, modelDriven: false})

    const malformed = createDoc({
      table: block('table', BlockNodeType.block, {}, ['paragraph', 'row']),
      paragraph: block('paragraph', BlockNodeType.editable),
      row: block('table-row', BlockNodeType.block, {height: 80}),
    })
    expect(estimateModelBlockHeight(malformed as any, 'table')).toBe(80)
  })

  it('scans only direct rows for a 3000-row table estimate', () => {
    const rowIds = Array.from({length: 3000}, (_, index) => `row-${index}`)
    const blocks = Object.fromEntries([
      ['table', block('table', BlockNodeType.block, {}, rowIds)],
      ...rowIds.map(id => [id, block('table-row', BlockNodeType.block, {height: 60}, [`cell-${id}`])]),
    ])
    const doc = createDoc(blocks)
    const childrenReads = spyOn(doc.model, 'getChildrenIds').and.callThrough()

    expect(estimateModelBlockHeight(doc as any, 'table')).toBe(180000)
    expect(childrenReads).toHaveBeenCalledOnceWith('table')
  })

  it('refreshes table estimates only for table/direct-row props changes', () => {
    const doc = createDoc({
      table: block('table', BlockNodeType.block, {}, ['row']),
      row: block('table-row', BlockNodeType.block, {height: 60}, ['cell']),
      cell: block('table-cell', BlockNodeType.block, {}, ['paragraph']),
      paragraph: block('paragraph', BlockNodeType.editable),
    })

    expect(modelHeightEstimateAffectedByContentChange(doc as any, 'table', {
      blockIds: ['paragraph'],
      kinds: ['text'],
      origin: null,
      local: true,
      isUndoRedo: false,
    })).toBeFalse()
    expect(modelHeightEstimateAffectedByContentChange(doc as any, 'table', {
      blockIds: ['cell'],
      kinds: ['props'],
      origin: null,
      local: true,
      isUndoRedo: false,
    })).toBeFalse()
    expect(modelHeightEstimateAffectedByContentChange(doc as any, 'table', {
      blockIds: ['table'],
      kinds: ['props'],
      origin: null,
      local: true,
      isUndoRedo: false,
    })).toBeTrue()
    expect(modelHeightEstimateAffectedByContentChange(doc as any, 'table', {
      blockIds: ['row'],
      kinds: ['props'],
      origin: null,
      local: true,
      isUndoRedo: false,
    })).toBeTrue()
  })
})

function block(
  flavour: string,
  nodeType: BlockNodeType,
  props: Record<string, unknown> = {},
  children: string[] = [],
) {
  return {flavour, nodeType, props, children}
}

function createDoc(
  blocks: Record<string, {
    flavour: string
    nodeType: BlockNodeType
    props: Record<string, unknown>
    children: string[]
    deltas?: any[]
  }>,
) {
  return {
    model: {
      getFlavour: (id: string) => blocks[id]?.flavour,
      getNodeType: (id: string) => blocks[id]?.nodeType,
      getProps: (id: string) => blocks[id]?.props,
      getChildrenIds: (id: string) => blocks[id]?.children ?? [],
      getParentId: (id: string) => Object.entries(blocks)
        .find(([, value]) => value.children.includes(id))?.[0] ?? null,
      getTextDeltas: (id: string) => blocks[id]?.deltas,
    },
    objectSizing: {
      rootContentWidth: 800,
      resolve: jasmine.createSpy('resolve'),
    },
  }
}
