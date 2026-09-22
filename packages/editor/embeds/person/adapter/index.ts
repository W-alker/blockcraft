import {createInlineDirectiveAdapterContribution} from '../../../adapters/generic'
import {INLINE_PERSON_EMBED_KEY, createInlinePersonEmbedConverter, formatInlinePersonDelta} from '..'

export const personEmbedAdapters = createInlineDirectiveAdapterContribution({
  key: INLINE_PERSON_EMBED_KEY,
  createDomConverter: createInlinePersonEmbedConverter,
  displayText: formatInlinePersonDelta,
})
