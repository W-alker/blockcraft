import type {Element, ElementContent} from 'hast'
import {
  BlockNodeType,
  generateId,
  type IBlockSnapshot,
} from '../../framework'
import type {BlockHtmlAdapterMatcher} from '../html-adapter/block-adapter'
import {HastUtils} from '../utils'
import {
  decodeAdapterProps,
  encodeAdapterProps,
  sanitizeAdapterProps,
} from './props-codec'

export interface EmbedBlockHtmlAdapterOptions {
  readonly label?: string | ((snapshot: IBlockSnapshot) => string)
  readonly defaultProps?: Readonly<Record<string, unknown>>
  readonly titleProp?: string
  readonly htmlTag?: string
}

function property(element: Element, key: string): unknown {
  return element.properties?.[key]
    ?? element.properties?.[key.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())]
}

function safeUrl(value: unknown): string {
  const sanitized = sanitizeAdapterProps({url: value})['url']
  return typeof sanitized === 'string' ? sanitized : ''
}

function labelFor(
  snapshot: IBlockSnapshot,
  options: EmbedBlockHtmlAdapterOptions,
  url: string,
): string {
  if (typeof options.label === 'function') return options.label(snapshot)
  if (typeof options.label === 'string') return options.label
  const title = snapshot.props['title']
  return typeof title === 'string' && title.trim() ? title : url
}

/**
 * Lossless BlockCraft HTML envelope plus a readable ordinary anchor.
 *
 * Import only claims the explicit `data-bc-block` envelope. This prevents a
 * normal document link from being silently promoted to a card/iframe Block.
 */
export function createEmbedBlockHtmlAdapterMatcher(
  flavour: string,
  options: EmbedBlockHtmlAdapterOptions = {},
): BlockHtmlAdapterMatcher {
  return {
    priority: 200,
    consumes: true,
    toMatch: o => HastUtils.isElement(o.node)
      && property(o.node, 'data-bc-block') === flavour,
    fromMatch: o => o.node.flavour === flavour,
    toBlockSnapshot: {
      enter: (o, context) => {
        if (!HastUtils.isElement(o.node)) return
        const decoded = decodeAdapterProps(property(o.node, 'data-bc-props'))
        const anchor = HastUtils.querySelector(o.node, 'a')
        const url = safeUrl(decoded['url'] ?? anchor?.properties?.['href'])
        if (!url) {
          context.walkerContext.skipAllChildren()
          return
        }

        const props: Record<string, unknown> = {
          ...(options.defaultProps ?? {}),
          ...decoded,
          url,
        }
        if (options.titleProp && props[options.titleProp] == null && anchor) {
          const text = HastUtils.getTextContent(anchor).trim()
          const genericLabel = typeof options.label === 'string' ? options.label : ''
          if (text && text !== url && text !== genericLabel) {
            props[options.titleProp] = text
          }
        }

        context.walkerContext
          .openNode({
            id: generateId(),
            flavour,
            nodeType: BlockNodeType.void,
            props,
            meta: {},
            children: [],
          } as unknown as IBlockSnapshot, 'children')
          .closeNode()
        context.walkerContext.skipAllChildren()
      },
    },
    fromBlockSnapshot: {
      enter: (o, context) => {
        const props = sanitizeAdapterProps(o.node.props)
        const url = safeUrl(props['url'])
        const label = labelFor(o.node, options, url) || url
        const encoded = encodeAdapterProps(props)
        const children: ElementContent[] = url
          ? [{
              type: 'element',
              tagName: 'a',
              properties: {href: url},
              children: [{type: 'text', value: label}],
            }]
          : label
            ? [{type: 'text', value: label}]
            : []

        context.walkerContext
          .openNode({
            type: 'element',
            tagName: options.htmlTag ?? 'figure',
            properties: {
              dataBcBlock: flavour,
              ...(encoded ? {dataBcProps: encoded} : {}),
            },
            children,
          }, 'children')
          .closeNode()
      },
    },
  }
}
