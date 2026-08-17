import {BlockNodeType} from '../../block-std'
import {
  estimateModelBlockHeight,
  estimateModelBlockHeightDetails,
  modelHeightEstimateAffectedByContentChange,
  shouldApplyModelHeightEstimate,
} from './model-height-estimator'

describe('estimateModelBlockHeight', () => {
  it('applies model and fallback estimates according to measurement provenance', () => {
    const modelEstimate = {height: 240, modelDriven: true}
    const fallbackEstimate = {height: 48, modelDriven: false}

    expect(shouldApplyModelHeightEstimate(modelEstimate, {
      previousModelDriven: false,
      hasMeasuredHeight: true,
      measurementFresh: true,
    })).toBeTrue()
    expect(shouldApplyModelHeightEstimate(fallbackEstimate, {
      previousModelDriven: false,
      hasMeasuredHeight: false,
      measurementFresh: false,
    })).toBeTrue()
    expect(shouldApplyModelHeightEstimate(fallbackEstimate, {
      previousModelDriven: true,
      hasMeasuredHeight: true,
      measurementFresh: true,
    })).toBeFalse()
    expect(shouldApplyModelHeightEstimate(fallbackEstimate, {
      previousModelDriven: true,
      hasMeasuredHeight: true,
      measurementFresh: false,
    })).toBeTrue()
    expect(shouldApplyModelHeightEstimate(fallbackEstimate, {
      previousModelDriven: false,
      hasMeasuredHeight: true,
      measurementFresh: false,
    })).toBeFalse()
  })

  it('lets a custom Schema estimate height from persisted props', () => {
    const estimator = jasmine.createSpy('estimateHeight')
      .and.callFake(({props, layoutMode}) =>
        layoutMode === 'paginated' ? 0 : props['height'])
    const doc = createDoc({
      widget: block('custom-widget', BlockNodeType.void, {height: 640}),
    }, {
      'custom-widget': estimator,
    })

    expect(estimateModelBlockHeightDetails(doc as any, 'widget', {
      layoutMode: 'flow',
    })).toEqual({height: 640, modelDriven: true})
    expect(estimateModelBlockHeightDetails(doc as any, 'widget', {
      layoutMode: 'paginated',
    })).toEqual({height: 0, modelDriven: true})
    expect(estimator.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      blockId: 'widget',
      flavour: 'custom-widget',
      nodeType: BlockNodeType.void,
      props: {height: 640},
      childIds: [],
      layoutMode: 'paginated',
      fallbackHeight: 48,
      rootContentWidth: 800,
      baseFontSize: 16,
      lineHeight: 24,
    }))
  })

  it('lets a custom container estimate only the child heights it owns', () => {
    const doc = createDoc({
      container: block('custom-container', BlockNodeType.block, {}, [
        'first',
        'second',
      ]),
      first: block('paragraph', BlockNodeType.editable),
      second: block('paragraph', BlockNodeType.editable),
    }, {
      'custom-container': ({childIds, estimateChildHeight}: {
        childIds: readonly string[]
        estimateChildHeight: (childId: string) => number
      }) =>
        childIds.reduce(
          (height: number, childId: string) =>
            height + estimateChildHeight(childId),
          12,
        ),
    })

    expect(estimateModelBlockHeightDetails(doc as any, 'container')).toEqual({
      height: 108,
      modelDriven: true,
    })
  })

  it('falls back when a custom Schema returns an invalid height or throws', () => {
    const invalid = createDoc({
      widget: block('invalid-widget', BlockNodeType.void),
    }, {
      'invalid-widget': () => Number.NaN,
    })
    expect(estimateModelBlockHeightDetails(invalid as any, 'widget', {
      estimatedHeights: {'invalid-widget': 72},
    })).toEqual({height: 72, modelDriven: false})

    const failed = createDoc({
      widget: block('failed-widget', BlockNodeType.void),
    }, {
      'failed-widget': () => {
        throw new Error('estimate failed')
      },
    })
    expect(estimateModelBlockHeight(failed as any, 'widget')).toBe(48)
    expect(failed.logger.warn).toHaveBeenCalled()
  })

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

  it('uses paragraph spacing and line height as model facts', () => {
    const doc = createDoc({
      root: block('root', BlockNodeType.root, {}, ['first', 'second']),
      first: block('paragraph', BlockNodeType.editable, {
        lh: 2,
        psa: 6,
        pis: 72,
        pti: 24,
      }),
      second: block('paragraph', BlockNodeType.editable, {psb: 12}),
    })
    doc.model.getTextLength = (id: string) => id === 'first' ? 200 : 0
    doc.objectSizing.rootContentWidth = 400

    const estimate = estimateModelBlockHeightDetails(doc as any, 'first')

    expect(estimate.modelDriven).toBeTrue()
    // Four 32px lines plus max(6pt after, 12pt before) = 16 CSS px.
    expect(estimate.height).toBe(144)
  })

  it('multiplies model-only line height and wrapping width by pfs', () => {
    const doc = createDoc({
      paragraph: {
        ...block('paragraph', BlockNodeType.editable, {pfs: 2}),
        deltas: [{insert: 'a'.repeat(200)}],
      },
    })
    doc.objectSizing.rootContentWidth = 400

    const estimate = estimateModelBlockHeightDetails(doc as any, 'paragraph')

    // Eight wrapped lines at the doubled 48px line height.
    expect(estimate).toEqual({height: 384, modelDriven: true})
  })

  it('keeps explicit before and after spacing on a final paragraph', () => {
    const doc = createDoc({
      root: block('root', BlockNodeType.root, {}, ['paragraph']),
      paragraph: block('paragraph', BlockNodeType.editable, {
        psb: 6,
        psa: 12,
      }),
    })

    const estimate = estimateModelBlockHeightDetails(doc as any, 'paragraph')

    expect(estimate.modelDriven).toBeTrue()
    // 38px fallback content + 8px before + 16px after.
    expect(estimate.height).toBe(62)
  })

  it('reserves model height for wrapped inline shapes and WordArt', () => {
    const shapeDoc = createDoc({
      paragraph: {
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {},
        children: [],
        deltas: [{
          insert: {shape: '{}'},
          attributes: {
            width: 180,
            height: 120,
            wrap: true,
            side: 'right',
            x: 0,
            gap: 12,
          },
        }],
      },
    })
    const wordArtDoc = createDoc({
      paragraph: {
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {},
        children: [],
        deltas: [{
          insert: {'word-art': '{}'},
          attributes: {width: 260, height: 84},
        }],
      },
    })
    shapeDoc.objectSizing.resolve.and.returnValue(null)
    shapeDoc.objectSizing.rootContentWidth = 600
    wordArtDoc.objectSizing.resolve.and.returnValue(null)
    wordArtDoc.objectSizing.rootContentWidth = 600

    expect(estimateModelBlockHeight(shapeDoc as any, 'paragraph'))
      .toBeGreaterThanOrEqual(132)
    expect(estimateModelBlockHeight(wordArtDoc as any, 'paragraph'))
      .toBeGreaterThanOrEqual(84)
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

  it('uses both readable intervals for centered auto-wrap estimation', () => {
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
              x: 0.375,
              gap: 12,
            },
          },
        ],
      },
    })
    doc.objectSizing.resolve.and.returnValue(null)
    doc.objectSizing.rootContentWidth = 400

    expect(estimateModelBlockHeight(doc as any, 'paragraph')).toBe(108)
  })

  it('ignores stale side metadata when estimating a wrapped shape', () => {
    const doc = createDoc({
      paragraph: {
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {},
        children: [],
        deltas: [
          {insert: '字'.repeat(120)},
          {
            insert: {shape: '{}'},
            attributes: {
              width: 100,
              height: 96,
              wrap: true,
              side: 'left',
              x: 0.1,
              gap: 12,
            },
          },
        ],
      },
    })
    doc.objectSizing.resolve.and.returnValue(null)
    doc.objectSizing.rootContentWidth = 400

    expect(estimateModelBlockHeight(doc as any, 'paragraph')).toBe(108)
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

  it('ignores legacy row height props in the dual-layout estimate', () => {
    const doc = createDoc({
      table: block('table', BlockNodeType.block, {}, ['row-1', 'row-2']),
      'row-1': block('table-row', BlockNodeType.block, {height: 720}),
      'row-2': block('table-row', BlockNodeType.block, {height: 4}),
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
    expect(estimateModelBlockHeight(malformed as any, 'table')).toBe(60)
  })

  it('estimates narrow-cell wrapping from text length and column width', () => {
    const doc = createDoc({
      table: block('table', BlockNodeType.block, {colWidths: [100]}, ['row']),
      row: block('table-row', BlockNodeType.block, {height: 999}, ['cell']),
      cell: block('table-cell', BlockNodeType.block, {}, ['paragraph']),
      paragraph: {
        ...block('paragraph', BlockNodeType.editable),
        deltas: [{insert: '中'.repeat(30)}],
      },
    })

    expect(estimateModelBlockHeight(doc as any, 'table')).toBe(144)
  })

  it('derives glyph width and line height from document layout metrics', () => {
    const doc = createDoc({
      table: block('table', BlockNodeType.block, {colWidths: [100]}, ['row']),
      row: block('table-row', BlockNodeType.block, {}, ['cell']),
      cell: block('table-cell', BlockNodeType.block, {}, ['paragraph']),
      paragraph: {
        ...block('paragraph', BlockNodeType.editable),
        deltas: [{insert: 'a'.repeat(30)}],
      },
    })
    doc.layoutMetrics.baseFontSize = 32
    doc.layoutMetrics.lineHeight = 48

    expect(estimateModelBlockHeight(doc as any, 'table')).toBe(456)
  })

  it('uses colspan width and rowspan coverage for merged-cell content', () => {
    const doc = createDoc({
      table: block('table', BlockNodeType.block, {colWidths: [100, 100]}, [
        'row-1',
        'row-2',
      ]),
      'row-1': block('table-row', BlockNodeType.block, {}, [
        'master',
        'covered-1',
      ]),
      'row-2': block('table-row', BlockNodeType.block, {}, [
        'covered-2',
        'covered-3',
      ]),
      master: block('table-cell', BlockNodeType.block, {
        colspan: 2,
        rowspan: 2,
      }, ['paragraph']),
      'covered-1': block('table-cell', BlockNodeType.block, {display: 'none'}),
      'covered-2': block('table-cell', BlockNodeType.block, {display: 'none'}),
      'covered-3': block('table-cell', BlockNodeType.block, {display: 'none'}),
      paragraph: {
        ...block('paragraph', BlockNodeType.editable),
        deltas: [{insert: '中'.repeat(100)}],
      },
    })

    // 200px colspan - 16px horizontal padding = 184px content width. The
    // model-only path uses a conservative 12px average glyph width.
    expect(estimateModelBlockHeight(doc as any, 'table')).toBe(192)
  })

  it('uses O(1) text length for very long cell content without materializing deltas', () => {
    const doc = createDoc({
      table: block('table', BlockNodeType.block, {colWidths: [100]}, ['row']),
      row: block('table-row', BlockNodeType.block, {}, ['cell']),
      cell: block('table-cell', BlockNodeType.block, {}, ['paragraph']),
      paragraph: {
        ...block('paragraph', BlockNodeType.editable),
        deltas: [{insert: '中'.repeat(100_000)}],
      },
    })
    const lengthReads = spyOn(doc.model, 'getTextLength').and.callThrough()
    const deltaReads = spyOn(doc.model, 'getTextDeltas').and.callThrough()

    expect(estimateModelBlockHeight(doc as any, 'table'))
      .toBeGreaterThan(300_000)
    expect(lengthReads).toHaveBeenCalledOnceWith('paragraph')
    expect(deltaReads).not.toHaveBeenCalled()
  })

  it('bounds nested content reads for a 3000-row table estimate', () => {
    const rowIds = Array.from({length: 3000}, (_, index) => `row-${index}`)
    const blocks = Object.fromEntries([
      ['table', block('table', BlockNodeType.block, {}, rowIds)],
      ...rowIds.map(id => [id, block('table-row', BlockNodeType.block, {height: 60}, [`cell-${id}`])]),
    ])
    const doc = createDoc(blocks)
    const childrenReads = spyOn(doc.model, 'getChildrenIds').and.callThrough()

    expect(estimateModelBlockHeight(doc as any, 'table')).toBe(180000)
    expect(childrenReads.calls.count()).toBeLessThanOrEqual(97)
    expect(childrenReads).toHaveBeenCalledWith('table')
  })

  it('refreshes table estimates for descendant props but not nested text', () => {
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
    })).toBeTrue()
    expect(modelHeightEstimateAffectedByContentChange(doc as any, 'table', {
      blockIds: ['paragraph'],
      kinds: ['props'],
      origin: null,
      local: true,
      isUndoRedo: false,
    })).toBeTrue()
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
  estimators: Record<string, (context: any) => number | undefined> = {},
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
      getTextLength: (id: string) => (blocks[id]?.deltas ?? [])
        .reduce((length, delta) => length + (
          typeof delta.insert === 'string' ? delta.insert.length : 1
        ), 0),
    },
    objectSizing: {
      rootContentWidth: 800,
      resolve: jasmine.createSpy('resolve'),
    },
    layoutMetrics: {
      baseFontSize: 16,
      lineHeight: 24,
    },
    schemas: {
      get: (flavour: string) => estimators[flavour]
        ? {metadata: {virtualization: {estimateHeight: estimators[flavour]}}}
        : null,
    },
    logger: {
      warn: jasmine.createSpy('warn'),
    },
  }
}
