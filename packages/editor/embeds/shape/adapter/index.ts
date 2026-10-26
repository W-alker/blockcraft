import type {InlineEmbedAdapterContribution} from '../../../adapters/registry'
import {
  createInlineDirectiveAdapterContribution,
  createInlineObjectHtmlMatchers,
} from '../../../adapters/generic'
import type {DeltaInsertEmbed} from '../../../framework'
import {inlineObjectPlainText} from '../../../blocks/inline-object'
import {
  INLINE_SHAPE_EMBED_KEY,
  createInlineShapeDelta,
  createInlineShapeEmbedConverter,
  readInlineShapeDelta,
} from '..'

const html = createInlineObjectHtmlMatchers({
  key: INLINE_SHAPE_EMBED_KEY,
  kind: 'shape',
  read: readInlineShapeDelta,
  displayText: inlineObjectPlainText,
  fromPayload: (payload, attributes) => {
    const data = readInlineShapeDelta({
      insert: {[INLINE_SHAPE_EMBED_KEY]: payload},
      attributes,
    } as DeltaInsertEmbed)
    return createInlineShapeDelta(data.props, data.text, data)
  },
})

const directive = createInlineDirectiveAdapterContribution({
  key: INLINE_SHAPE_EMBED_KEY,
  adapterName: 'inline-object',
  createDomConverter: createInlineShapeEmbedConverter,
  displayText: (delta: DeltaInsertEmbed) =>
    inlineObjectPlainText(readInlineShapeDelta(delta).text),
})

export const shapeEmbedAdapters: InlineEmbedAdapterContribution = {
  ...directive,
  html: {
    deltaToAst: [html.deltaToAst],
    astToDelta: [html.astToDelta],
  },
}
