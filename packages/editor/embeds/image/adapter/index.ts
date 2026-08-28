import type {InlineEmbedAdapterContribution} from '../../../adapters/registry'
import {
  decodeAdapterProps,
} from '../../../adapters/generic'
import type {
  HtmlASTToDeltaMatcher,
  InlineDeltaToHtmlAdapterMatcher,
} from '../../../adapters/html-adapter/delta-converter'
import type {
  InlineDeltaToMarkdownAdapterMatcher,
  MarkdownASTToDeltaMatcher,
} from '../../../adapters/markdown-adapter/delta-converter'
import type {MarkdownAST} from '../../../adapters/markdown-adapter/type'
import type {DeltaInsertEmbed} from '../../../framework'
import {
  createInlineImageDelta,
  INLINE_IMAGE_EMBED_KEY,
  inlineImageEmbedConverter,
  type InlineImageWrapSide,
  readInlineImageDelta,
} from '..'

const INLINE_IMAGE_DIRECTIVE = 'bc-image'

type InlineImageDirective = MarkdownAST & {
  type: 'textDirective'
  name: typeof INLINE_IMAGE_DIRECTIVE
  attributes?: Record<string, string | null | undefined> | null
  children: MarkdownAST[]
}

const isInlineImageDirective = (
  ast: MarkdownAST,
): ast is InlineImageDirective => ast.type === 'textDirective' &&
  (ast as InlineImageDirective).name === INLINE_IMAGE_DIRECTIVE

const inlineImageAlt = (delta: DeltaInsertEmbed): string => {
  const alt = delta.attributes?.['alt']
  return typeof alt === 'string' && alt.trim()
    ? alt.slice(0, 256)
    : ''
}

const decodeInlineImageDirective = (
  directive: InlineImageDirective,
): DeltaInsertEmbed[] => {
  const decoded = decodeAdapterProps(directive.attributes?.['payload'])
  const src = decoded['src']
  if (typeof src !== 'string' || !src) return []
  const rawAttributes = decoded['attributes']
  const attributes = rawAttributes && typeof rawAttributes === 'object' &&
      !Array.isArray(rawAttributes)
    ? {...rawAttributes as Record<string, unknown>}
    : undefined
  return [{
    insert: {[INLINE_IMAGE_EMBED_KEY]: src},
    ...(attributes && Object.keys(attributes).length ? {attributes} : {}),
  } as DeltaInsertEmbed]
}

export const imageDeltaToHtmlAdapterMatcher: InlineDeltaToHtmlAdapterMatcher = {
  name: 'inline-image',
  match: delta => !!delta.insert
    && typeof delta.insert === 'object'
    && INLINE_IMAGE_EMBED_KEY in delta.insert,
  toAST: delta => {
    const {src, width, height, wrap, side, x, gap} =
      readInlineImageDelta(delta as DeltaInsertEmbed)
    return {
      type: 'element',
      tagName: 'img',
      properties: {
        className: ['bc-inline-image'],
        src,
        alt: '',
        ...(width === undefined ? {} : {width}),
        ...(height === undefined ? {} : {height}),
        ...(wrap ? {
          dataBcWrap: 'square',
          dataBcWrapSide: side,
          dataBcWrapX: x,
          ...(gap === undefined ? {} : {dataBcWrapGap: gap}),
        } : {}),
      },
      children: [],
    }
  },
}

export const htmlImageToDeltaMatcher: HtmlASTToDeltaMatcher = {
  name: 'inline-image',
  match: ast => ast.type === 'element' && ast.tagName === 'img',
  toDelta: ast => {
    if (ast.type !== 'element') return []
    const wrapSide = ast.properties?.['dataBcWrapSide']
    const delta = createInlineImageDelta(
      ast.properties?.['src'],
      ast.properties?.['width'] ?? ast.properties?.['dataWidth'],
      ast.properties?.['height'] ?? ast.properties?.['dataHeight'],
      ast.properties?.['dataBcWrap'] === 'square' ? {
        wrap: true,
        side: typeof wrapSide === 'string'
          ? wrapSide as InlineImageWrapSide
          : undefined,
        x: Number(ast.properties?.['dataBcWrapX']),
        gap: Number(ast.properties?.['dataBcWrapGap']),
      } : undefined,
    )
    return delta ? [delta] : []
  },
}

export const imageDeltaToMarkdownAdapterMatcher:
  InlineDeltaToMarkdownAdapterMatcher = {
    name: 'inline-image',
    match: delta => !!delta.insert
      && typeof delta.insert === 'object'
      && INLINE_IMAGE_EMBED_KEY in delta.insert,
    toAST: delta => {
      const embed = delta as DeltaInsertEmbed
      return {
        type: 'image',
        url: readInlineImageDelta(embed).src,
        alt: inlineImageAlt(embed),
      }
    },
  }

export const markdownImageToDeltaMatcher: MarkdownASTToDeltaMatcher = {
  name: 'inline-image',
  match: ast => ast.type === 'image' || isInlineImageDirective(ast),
  toDelta: ast => {
    if (isInlineImageDirective(ast)) {
      return decodeInlineImageDirective(ast)
    }
    if (!('url' in ast)) return []
    const delta = createInlineImageDelta(ast.url)
    return delta ? [delta] : []
  },
}

export const imageEmbedAdapters: InlineEmbedAdapterContribution = {
  key: INLINE_IMAGE_EMBED_KEY,
  createDomConverter: () => inlineImageEmbedConverter,
  html: {
    deltaToAst: [imageDeltaToHtmlAdapterMatcher],
    astToDelta: [htmlImageToDeltaMatcher],
  },
  markdown: {
    deltaToAst: [imageDeltaToMarkdownAdapterMatcher],
    astToDelta: [markdownImageToDeltaMatcher],
  },
}
