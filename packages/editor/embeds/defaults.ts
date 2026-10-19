import type {EmbedConverter} from '../framework/block-std/inline'
import {
  INLINE_ICON_EMBED_KEY,
  inlineIconEmbedConverter,
} from './icon'
import {
  INLINE_IMAGE_EMBED_KEY,
  inlineImageEmbedConverter,
} from './image'

/**
 * Installs the framework defaults while preserving the historical host-wins
 * rule for explicitly configured converters with the same key.
 */
export function withDefaultEmbedConverters(
  configured: [string, EmbedConverter][] = [],
): [string, EmbedConverter][] {
  return [...new Map<string, EmbedConverter>([
    [INLINE_IMAGE_EMBED_KEY, inlineImageEmbedConverter],
    [INLINE_ICON_EMBED_KEY, inlineIconEmbedConverter],
    ...configured,
  ])]
}
