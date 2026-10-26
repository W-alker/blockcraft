import {
  createInlineDirectiveAdapterContribution,
  createInlineObjectHtmlMatchers,
} from '../../../adapters/generic'
import type {InlineEmbedAdapterContribution} from '../../../adapters/registry'
import type {DeltaInsertEmbed} from '../../../framework'
import {inlineObjectPlainText} from '../../../blocks/inline-object'
import {
  INLINE_WORD_ART_EMBED_KEY,
  createInlineWordArtDelta,
  createInlineWordArtEmbedConverter,
  readInlineWordArtDelta,
} from '..'

const directive = createInlineDirectiveAdapterContribution({
  key: INLINE_WORD_ART_EMBED_KEY,
  adapterName: 'inline-object',
  createDomConverter: createInlineWordArtEmbedConverter,
  displayText: (delta: DeltaInsertEmbed) =>
    inlineObjectPlainText(readInlineWordArtDelta(delta).text),
})

const html = createInlineObjectHtmlMatchers({
  key: INLINE_WORD_ART_EMBED_KEY,
  kind: 'word-art',
  read: readInlineWordArtDelta,
  displayText: inlineObjectPlainText,
  fromPayload: (payload, attributes) => {
    const data = readInlineWordArtDelta({
      insert: {[INLINE_WORD_ART_EMBED_KEY]: payload},
      attributes,
    } as DeltaInsertEmbed)
    return createInlineWordArtDelta(data.props, data.text, data)
  },
})

export const wordArtEmbedAdapters: InlineEmbedAdapterContribution = {
  ...directive,
  html: {
    deltaToAst: [html.deltaToAst],
    astToDelta: [html.astToDelta],
  },
}
