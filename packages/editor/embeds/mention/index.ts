import type {EmbedConverter} from '../../framework/block-std/inline'

export const INLINE_MENTION_EMBED_KEY = 'mention'

/** Creates one converter instance for a document/surface. */
export function createInlineMentionEmbedConverter(): EmbedConverter {
  return {
    toView: embed => {
      const span = document.createElement('span')
      span.textContent = String(embed.insert[INLINE_MENTION_EMBED_KEY] ?? '')
      const attrs = embed.attributes ?? {}
      span.setAttribute(
        'data-mention-id',
        String(attrs['mentionId'] ?? attrs['d:mentionId'] ?? ''),
      )
      span.setAttribute(
        'data-mention-type',
        String(attrs['mentionType'] ?? attrs['d:mentionType'] ?? ''),
      )
      return span
    },
    toDelta: element => ({
      insert: {
        [INLINE_MENTION_EMBED_KEY]: element.textContent ?? '',
      },
      attributes: {
        mentionId: element.getAttribute('data-mention-id') ?? '',
        mentionType: element.getAttribute('data-mention-type') ?? '',
      },
    }),
  }
}
