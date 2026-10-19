import type {EmbedConverter} from '../../framework'
import {
  INLINE_ICON_EMBED_KEY,
  inlineIconEmbedConverter,
} from '.'
import {withDefaultEmbedConverters} from '../defaults'

describe('inlineIconEmbedConverter', () => {
  it('round-trips the document-library icon class string', () => {
    const delta = {
      insert: {[INLINE_ICON_EMBED_KEY]: 'bc_icon bc_document'},
    }

    const view = inlineIconEmbedConverter.toView(delta)

    expect(view.tagName).toBe('I')
    expect(view.className).toBe('bc_icon bc_document')
    expect(view.getAttribute('data-icon')).toBe('bc_icon bc_document')
    expect(inlineIconEmbedConverter.toDelta(view)).toEqual(delta)
  })

  it('falls back to the element class when legacy DOM has no data-icon', () => {
    const view = document.createElement('i')
    view.className = 'bc_icon bc_task'

    expect(inlineIconEmbedConverter.toDelta(view)).toEqual({
      insert: {[INLINE_ICON_EMBED_KEY]: 'bc_icon bc_task'},
    })
  })

  it('is built in while preserving a configured same-key override', () => {
    const custom: EmbedConverter = {
      toView: () => document.createElement('span'),
      toDelta: () => ({insert: {[INLINE_ICON_EMBED_KEY]: 'custom'}}),
    }

    const defaults = new Map(withDefaultEmbedConverters())
    const overridden = new Map(withDefaultEmbedConverters([
      [INLINE_ICON_EMBED_KEY, custom],
    ]))

    expect(defaults.get(INLINE_ICON_EMBED_KEY)).toBe(inlineIconEmbedConverter)
    expect(overridden.get(INLINE_ICON_EMBED_KEY)).toBe(custom)
  })
})
