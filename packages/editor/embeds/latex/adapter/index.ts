import type {InlineEmbedAdapterContribution} from '../../../adapters/registry'
import type {
  HtmlASTToDeltaMatcher,
  InlineDeltaToHtmlAdapterMatcher,
} from '../../../adapters/html-adapter/delta-converter'
import type {
  InlineDeltaToMarkdownAdapterMatcher,
  MarkdownASTToDeltaMatcher,
} from '../../../adapters/markdown-adapter/delta-converter'
import {INLINE_LATEX_EMBED_KEY, createInlineLatexEmbedConverter} from '..'

export const latexDeltaToHtmlAdapterMatcher: InlineDeltaToHtmlAdapterMatcher = {
  name: 'latex',
  match: delta => !!delta.insert
    && typeof delta.insert === 'object'
    && INLINE_LATEX_EMBED_KEY in delta.insert,
  toAST: delta => {
    const latex = String(delta.insert && typeof delta.insert === 'object'
      ? delta.insert[INLINE_LATEX_EMBED_KEY] ?? ''
      : '')
    return {
      type: 'element',
      tagName: 'code',
      properties: {className: ['math', 'math-inline'], dataLatex: latex},
      children: [{type: 'text', value: latex}],
    }
  },
}

export const htmlMathInlineToDeltaMatcher: HtmlASTToDeltaMatcher = {
  name: 'math-inline',
  match: ast => ast.type === 'element' && (
    (ast.tagName === 'code'
      && Array.isArray(ast.properties?.['className'])
      && (ast.properties['className'] as string[]).includes('math'))
    || (ast.tagName === 'span'
      && Array.isArray(ast.properties?.['className'])
      && (ast.properties['className'] as string[])
        .some(value => value === 'katex' || value === 'math-inline'))
  ),
  toDelta: (ast, context) => {
    if (ast.type !== 'element') return []
    const latex = String(ast.properties?.['dataLatex'] ?? '')
    if (latex) return [{insert: {[INLINE_LATEX_EMBED_KEY]: latex}}]
    const text = ast.children.flatMap(child =>
      context.toDelta(child, {trim: false}),
    ).map(delta => String(delta.insert ?? '')).join('')
    return text ? [{insert: {[INLINE_LATEX_EMBED_KEY]: text}}] : []
  },
}

export const latexDeltaToMarkdownAdapterMatcher:
  InlineDeltaToMarkdownAdapterMatcher = {
    name: 'inlineLatex',
    match: delta => !!delta.insert
      && typeof delta.insert === 'object'
      && INLINE_LATEX_EMBED_KEY in delta.insert,
    toAST: delta => ({
      type: 'inlineMath',
      value: String(delta.insert && typeof delta.insert === 'object'
        ? delta.insert[INLINE_LATEX_EMBED_KEY] ?? ''
        : ''),
    }),
  }

export const markdownInlineMathToDeltaMatcher: MarkdownASTToDeltaMatcher = {
  name: 'inlineMath',
  match: ast => ast.type === 'inlineMath',
  toDelta: ast => 'value' in ast
    ? [{insert: {[INLINE_LATEX_EMBED_KEY]: ast.value}}]
    : [],
}

export const latexEmbedAdapters: InlineEmbedAdapterContribution = {
  key: INLINE_LATEX_EMBED_KEY,
  createDomConverter: createInlineLatexEmbedConverter,
  html: {
    deltaToAst: [latexDeltaToHtmlAdapterMatcher],
    astToDelta: [htmlMathInlineToDeltaMatcher],
  },
  markdown: {
    deltaToAst: [latexDeltaToMarkdownAdapterMatcher],
    astToDelta: [markdownInlineMathToDeltaMatcher],
  },
}
