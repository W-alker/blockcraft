import {BlockNodeType} from '../../block-std'
import {estimateModelBlockHeight} from './model-height-estimator'

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
})

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
      getTextDeltas: (id: string) => blocks[id]?.deltas,
    },
    objectSizing: {
      rootContentWidth: 800,
      resolve: jasmine.createSpy('resolve'),
    },
  }
}
