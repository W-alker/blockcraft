import {
  INLINE_MENTION_EMBED_KEY,
  createInlineMentionEmbedConverter,
} from '.'

describe('inline mention embed', () => {
  it('renders the referenced entity metadata and round-trips the legacy shape', () => {
    const converter = createInlineMentionEmbedConverter()
    const view = converter.toView({
      insert: {[INLINE_MENTION_EMBED_KEY]: '@Ada'},
      attributes: {
        mentionId: 'user-42',
        mentionType: 'user',
      },
    })

    expect(view.tagName).toBe('SPAN')
    expect(view.textContent).toBe('@Ada')
    expect(view.getAttribute('data-mention-id')).toBe('user-42')
    expect(view.getAttribute('data-mention-type')).toBe('user')
    expect(converter.toDelta(view)).toEqual({
      insert: {[INLINE_MENTION_EMBED_KEY]: '@Ada'},
      attributes: {
        mentionId: 'user-42',
        mentionType: 'user',
      },
    })
  })

  it('accepts canonical data attributes when rebuilding existing content', () => {
    const converter = createInlineMentionEmbedConverter()
    const view = converter.toView({
      insert: {[INLINE_MENTION_EMBED_KEY]: '@设计组'},
      attributes: {
        'd:mentionId': 'team-design',
        'd:mentionType': 'team',
      },
    })

    expect(view.dataset['mentionId']).toBe('team-design')
    expect(view.dataset['mentionType']).toBe('team')
    expect(converter.toDelta(view)).toEqual({
      insert: {[INLINE_MENTION_EMBED_KEY]: '@设计组'},
      attributes: {
        mentionId: 'team-design',
        mentionType: 'team',
      },
    })
  })

  it('creates a fresh converter for every document surface', () => {
    expect(createInlineMentionEmbedConverter())
      .not.toBe(createInlineMentionEmbedConverter())
  })
})
