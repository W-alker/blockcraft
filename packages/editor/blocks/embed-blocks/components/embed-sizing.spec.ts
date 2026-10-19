import {BlockNodeType} from '../../../framework'
import {estimateModelBlockHeightDetails} from '../../../framework/modules/virtualization/model-height-estimator'
import {EmbedBlockSchema} from '../embed-block'
import {FigmaEmbedBlockSchema} from '../figma-embed-block'
import {JuejinEmbedBlockSchema} from '../juejin-embed-block'
import {estimateEmbedFrameHeight, resolveEmbedFrameSize} from './embed-sizing'

describe('embed object sizing', () => {
  it('uses the same wr/ar contract for rendering and offscreen height projection', () => {
    const props = {wr: 50, ar: 2, width: 640, height: 424}
    expect(resolveEmbedFrameSize(props, 800)).toEqual({width: '400px', height: 'auto', aspectRatio: '2'})
    expect(resolveEmbedFrameSize(props)).toEqual({width: '50%', height: 'auto', aspectRatio: '2'})
    expect(estimateEmbedFrameHeight(props, 800)).toBe(200)
    expect(estimateEmbedFrameHeight(props, 600)).toBe(150)
    expect(estimateEmbedFrameHeight({height: 424}, 800)).toBe(424)
    expect(resolveEmbedFrameSize({width: 640, height: 424}, 800)).toEqual({width: '640px', height: '424px', aspectRatio: ''})
    expect(resolveEmbedFrameSize({height: 424}, 800)).toEqual({width: '100%', height: '424px', aspectRatio: ''})
  })

  it('registers ratio sizes and pure height estimates for new and legacy schemas', () => {
    for (const schema of [EmbedBlockSchema, FigmaEmbedBlockSchema, JuejinEmbedBlockSchema]) {
      const snapshot = schema.createSnapshot!('https://www.figma.com/design/abcdefghijklmnopqrstuvwx/Test')
      expect(snapshot.props).toEqual(jasmine.objectContaining({wr: 100, ar: 16 / 9}))
      expect(snapshot.props['width']).toBeUndefined()
      expect(snapshot.props['height']).toBeUndefined()
      const doc = {
        model: {
          getFlavour: () => schema.flavour, getNodeType: () => BlockNodeType.void,
          getProps: () => snapshot.props, getChildrenIds: () => [], getParentId: () => null,
        },
        schemas: {get: () => schema},
        objectSizing: {rootContentWidth: 800},
        layoutMetrics: {baseFontSize: 16, lineHeight: 24},
      }
      expect(estimateModelBlockHeightDetails(doc as any, snapshot.id)).toEqual({height: 450, modelDriven: true})
      snapshot.props = {url: 'https://example.com/', width: null, height: 424}
      expect(estimateModelBlockHeightDetails(doc as any, snapshot.id)).toEqual({height: 424, modelDriven: true})
    }
  })
})
