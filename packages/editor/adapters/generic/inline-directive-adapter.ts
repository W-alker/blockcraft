import type {Element} from 'hast'
import type {PhrasingContent} from 'mdast'
import type {DeltaInsert, DeltaInsertEmbed, EmbedConverter} from '../../framework'
import type {HtmlAST} from '../types'
import {
  MARKDOWN_ADAPTER_PROFILE_CONFIG,
  type InlineEmbedAdapterContribution,
} from '../registry'
import type {MarkdownAST} from '../markdown-adapter/type'
import {decodeAdapterProps, encodeAdapterProps} from './props-codec'

type TextDirective = PhrasingContent & {
  type: 'textDirective'
  name: string
  attributes?: Record<string, string | null | undefined> | null
  children: PhrasingContent[]
}

export interface InlineDirectiveAdapterOptions {
  readonly key: string
  readonly adapterName?: string
  readonly markdownName?: string
  readonly createDomConverter?: () => EmbedConverter
  readonly displayText?: (delta: DeltaInsertEmbed) => string
}

function embedPayload(
  key: string,
  delta: DeltaInsertEmbed,
): Record<string, unknown> {
  return {
    value: delta.insert[key],
    ...(delta.attributes ? {attributes: delta.attributes} : {}),
  }
}

function decodeEmbed(
  key: string,
  encoded: unknown,
  fallback = '',
): DeltaInsertEmbed {
  const decoded = decodeAdapterProps(encoded)
  const value = decoded['value']
  const attributes = decoded['attributes']
  return {
    insert: {
      [key]: typeof value === 'string'
        || typeof value === 'number'
        || typeof value === 'boolean'
        ? value
        : fallback,
    },
    ...(attributes && typeof attributes === 'object' && !Array.isArray(attributes)
      ? {attributes: attributes as DeltaInsertEmbed['attributes']}
      : {}),
  }
}

function isElement(ast: HtmlAST): ast is Element {
  return ast.type === 'element'
}

export function createInlineDirectiveAdapterContribution(
  options: InlineDirectiveAdapterOptions,
): InlineEmbedAdapterContribution {
  const markdownName = options.markdownName ?? `bc-${options.key}`
  const adapterName = options.adapterName ?? `inline-${options.key}`
  const displayText = options.displayText
    ?? ((delta: DeltaInsertEmbed) => String(delta.insert[options.key] ?? ''))
  return {
    key: options.key,
    createDomConverter: options.createDomConverter,
    html: {
      deltaToAst: [{
        name: adapterName,
        match: delta => !!delta.insert
          && typeof delta.insert === 'object'
          && options.key in delta.insert,
        toAST: delta => {
          const embed = delta as DeltaInsertEmbed
          const encoded = encodeAdapterProps(embedPayload(options.key, embed))
          return {
            type: 'element',
            tagName: 'span',
            properties: {
              dataBcInlineEmbed: options.key,
              ...(encoded ? {dataBcInlinePayload: encoded} : {}),
            },
            children: [{type: 'text', value: displayText(embed)}],
          }
        },
      }],
      astToDelta: [{
        name: adapterName,
        match: ast => isElement(ast)
          && ast.tagName === 'span'
          && ast.properties?.['dataBcInlineEmbed'] === options.key,
        toDelta: ast => {
          if (!isElement(ast)) return []
          const fallback = ast.children
            .filter(child => child.type === 'text')
            .map(child => child.value)
            .join('')
          return [decodeEmbed(
            options.key,
            ast.properties?.['dataBcInlinePayload'],
            fallback,
          )]
        },
      }],
    },
    markdown: {
      deltaToAst: [{
        name: adapterName,
        match: delta => !!delta.insert
          && typeof delta.insert === 'object'
          && options.key in delta.insert,
        toAST: (delta, context) => {
          const embed = delta as DeltaInsertEmbed
          const label = displayText(embed)
          if (context.configs.get(MARKDOWN_ADAPTER_PROFILE_CONFIG) !== 'blockcraft') {
            return {type: 'text', value: label}
          }
          const encoded = encodeAdapterProps(embedPayload(options.key, embed))
          return {
            type: 'textDirective',
            name: markdownName,
            attributes: encoded ? {payload: encoded} : {},
            children: label ? [{type: 'text', value: label}] : [],
          } as TextDirective
        },
      }],
      astToDelta: [{
        name: adapterName,
        match: ast => ast.type === 'textDirective'
          && (ast as TextDirective).name === markdownName,
        toDelta: ast => {
          const directive = ast as TextDirective
          const fallback = directive.children
            .filter(child => child.type === 'text')
            .map(child => child.value)
            .join('')
          return [decodeEmbed(
            options.key,
            directive.attributes?.['payload'],
            fallback,
          )]
        },
      }],
    },
  }
}
