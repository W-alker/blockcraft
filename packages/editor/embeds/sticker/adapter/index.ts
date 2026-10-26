import type {InlineEmbedAdapterContribution} from '../../../adapters/registry'
import {createInlineDirectiveAdapterContribution, createInlineObjectHtmlMatchers} from '../../../adapters/generic'
import type {DeltaInsertEmbed} from '../../../framework'
import {
  INLINE_STICKER_EMBED_KEY,
  createInlineStickerDelta,
  createInlineStickerEmbedConverter,
  readInlineStickerDelta,
} from '..'

const html = createInlineObjectHtmlMatchers({
  key: INLINE_STICKER_EMBED_KEY,
  kind: 'sticker',
  read: delta => ({...readInlineStickerDelta(delta), text: []}),
  displayText: () => '贴纸',
  fromPayload: (payload, attributes) => {
    const data = readInlineStickerDelta({
      insert: {[INLINE_STICKER_EMBED_KEY]: payload}, attributes,
    } as DeltaInsertEmbed)
    return createInlineStickerDelta(data.props, data, data)
  },
})

const directive = createInlineDirectiveAdapterContribution({
  key: INLINE_STICKER_EMBED_KEY,
  adapterName: 'inline-object',
  createDomConverter: createInlineStickerEmbedConverter,
  displayText: () => '贴纸',
})

export const stickerEmbedAdapters: InlineEmbedAdapterContribution = {
  ...directive,
  html: {deltaToAst: [html.deltaToAst], astToDelta: [html.astToDelta]},
}
