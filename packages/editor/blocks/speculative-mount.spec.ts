import {BlockquoteBlockSchema} from './blockquote-block'
import {BulletBlockSchema} from './bullet-block'
import {CaptionBlockSchema} from './caption-block'
import {OrderedBlockSchema} from './ordered-block'
import {ParagraphBlockSchema} from './paragraph-block'
import {TodoBlockSchema} from './todo-block'

describe('speculative-safe built-in block schemas', () => {
  it('opts the audited text block views into speculative mounting', () => {
    const schemas = [
      ParagraphBlockSchema,
      OrderedBlockSchema,
      BulletBlockSchema,
      TodoBlockSchema,
      BlockquoteBlockSchema,
      CaptionBlockSchema,
    ]

    expect(schemas.map(schema => schema.metadata.virtualization?.speculativeMount))
      .toEqual(['safe', 'safe', 'safe', 'safe', 'safe', 'safe'])
  })
})
