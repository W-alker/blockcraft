import type {EmbedConverter} from '../../framework/block-std/inline'

export const INLINE_ICON_EMBED_KEY = 'icon'

/**
 * Renders the legacy one-length icon Delta used by document-library content.
 * The class string is intentionally preserved verbatim for iconfont
 * compatibility (for example `bc_icon bc_document`).
 */
export const inlineIconEmbedConverter: EmbedConverter = {
  toView: delta => {
    const icon = document.createElement('i')
    const className = String(delta.insert[INLINE_ICON_EMBED_KEY] ?? '')
    icon.className = className
    icon.setAttribute('data-icon', className)
    return icon
  },
  toDelta: element => ({
    insert: {
      [INLINE_ICON_EMBED_KEY]:
        element.getAttribute('data-icon') || element.className || '',
    },
  }),
}
