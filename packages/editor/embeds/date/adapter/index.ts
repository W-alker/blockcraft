import {createInlineDirectiveAdapterContribution} from '../../../adapters/generic'
import type {DeltaInsertEmbed} from '../../../framework'
import {
  INLINE_DATE_EMBED_KEY,
  createInlineDateEmbedConverter,
  formatInlineDateValue,
  readInlineDateDelta,
} from '..'

export const dateEmbedAdapters = createInlineDirectiveAdapterContribution({
  key: INLINE_DATE_EMBED_KEY,
  createDomConverter: createInlineDateEmbedConverter,
  displayText: (delta: DeltaInsertEmbed) => {
    const value = readInlineDateDelta(delta)
    return formatInlineDateValue(value.value, value.format)
  },
})
