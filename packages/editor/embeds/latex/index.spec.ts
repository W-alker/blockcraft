import {
  INLINE_LATEX_EMBED_KEY,
  createInlineLatexEmbedConverter,
} from '.'

describe('inline LaTeX embed', () => {
  it('renders MathML while retaining the source expression for serialization', () => {
    const converter = createInlineLatexEmbedConverter()
    const view = converter.toView({
      insert: {[INLINE_LATEX_EMBED_KEY]: 'E=mc^2'},
    })

    expect(view.tagName).toBe('SPAN')
    expect(view.classList.contains('inline-formula')).toBeTrue()
    expect(view.dataset['latex']).toBe('E=mc^2')
    expect(view.querySelector('math')).not.toBeNull()
    expect(converter.toDelta(view)).toEqual({
      insert: {[INLINE_LATEX_EMBED_KEY]: 'E=mc^2'},
      attributes: {
        'a:class': 'inline-formula',
        'd:latex': 'E=mc^2',
      },
    })
  })

  it('serializes data-latex instead of rendered presentation text', () => {
    const converter = createInlineLatexEmbedConverter()
    const view = document.createElement('span')
    view.className = 'inline-formula'
    view.dataset['latex'] = '\\frac{1}{2}'
    view.textContent = 'rendered fallback'

    expect(converter.toDelta(view)).toEqual({
      insert: {[INLINE_LATEX_EMBED_KEY]: '\\frac{1}{2}'},
      attributes: {
        'a:class': 'inline-formula',
        'd:latex': '\\frac{1}{2}',
      },
    })
  })

  it('creates a fresh converter for every document surface', () => {
    expect(createInlineLatexEmbedConverter())
      .not.toBe(createInlineLatexEmbedConverter())
  })
})
