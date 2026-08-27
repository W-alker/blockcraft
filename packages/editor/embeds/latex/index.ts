import katex from 'katex'
import {
  InlineManager,
  type EmbedConverter,
} from '../../framework/block-std/inline'

export const INLINE_LATEX_EMBED_KEY = 'latex'

/** Creates one converter instance for a document/surface. */
export function createInlineLatexEmbedConverter(): EmbedConverter {
  return {
    toView: embed => {
      const span = document.createElement('span')
      span.classList.add('inline-formula')
      const latex = String(embed.insert[INLINE_LATEX_EMBED_KEY] ?? '')
      span.setAttribute('data-latex', latex)
      try {
        katex.render(latex, span, {
          output: 'mathml',
          throwOnError: false,
        })
      } catch {
        span.textContent = latex
      }
      return span
    },
    toDelta: element => ({
      insert: {
        [INLINE_LATEX_EMBED_KEY]:
          element.getAttribute('data-latex') ??
          element.textContent ??
          '',
      },
      attributes: InlineManager.getAttrs(element),
    }),
  }
}
