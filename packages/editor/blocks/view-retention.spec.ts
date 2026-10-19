import {AudioBlockSchema} from './audio-block'
import {EmbedBlockSchema} from './embed-blocks/embed-block'
import {FigmaEmbedBlockSchema} from './embed-blocks/figma-embed-block'
import {JuejinEmbedBlockSchema} from './embed-blocks/juejin-embed-block'
import {VideoBlockSchema} from './video-block'

describe('stateful built-in block view retention', () => {
  it('keeps iframe and media views alive after first materialization', () => {
    const schemas = [
      AudioBlockSchema,
      VideoBlockSchema,
      EmbedBlockSchema,
      FigmaEmbedBlockSchema,
      JuejinEmbedBlockSchema,
    ]

    expect(schemas.map(schema => schema.metadata.virtualization?.viewRetention)).toEqual([
      'keep-alive',
      'keep-alive',
      'keep-alive',
      'keep-alive',
      'keep-alive',
    ])
  })
})
