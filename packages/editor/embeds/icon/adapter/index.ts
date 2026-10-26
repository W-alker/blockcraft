import {createInlineDirectiveAdapterContribution} from '../../../adapters/generic'
import {
  INLINE_ICON_EMBED_KEY,
  inlineIconEmbedConverter,
} from '..'

export const iconEmbedAdapters = createInlineDirectiveAdapterContribution({
  key: INLINE_ICON_EMBED_KEY,
  createDomConverter: () => inlineIconEmbedConverter,
})
