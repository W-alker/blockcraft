import type {Link, Paragraph, PhrasingContent} from 'mdast'
import {
  BlockNodeType,
  generateId,
  type IBlockSnapshot,
} from '../../framework'
import type {BlockMarkdownAdapterMatcher} from '../markdown-adapter/block-adapter'
import type {MarkdownAST} from '../markdown-adapter/type'
import {
  decodeAdapterProps,
  sanitizeAdapterProps,
} from './props-codec'

type DirectiveNode = MarkdownAST & {
  type: 'containerDirective' | 'leafDirective'
  name: string
  attributes?: Record<string, string | null | undefined> | null
  children: MarkdownAST[]
}

export interface EmbedBlockMarkdownAdapterOptions {
  readonly label?: string | ((snapshot: IBlockSnapshot) => string)
  readonly defaultProps?: Readonly<Record<string, unknown>>
  readonly titleProp?: string
  readonly matchesUrl?: (url: string) => boolean
}

function safeUrl(value: unknown): string {
  const sanitized = sanitizeAdapterProps({url: value})['url']
  return typeof sanitized === 'string' ? sanitized : ''
}

function textContent(children: readonly PhrasingContent[]): string {
  return children.map(child => {
    if ('value' in child && typeof child.value === 'string') return child.value
    if ('children' in child) {
      return textContent(child.children as PhrasingContent[])
    }
    return ''
  }).join('')
}

function meaningfulChildren(node: Paragraph): PhrasingContent[] {
  return node.children.filter(child =>
    child.type !== 'text' || child.value.trim().length > 0,
  )
}

function linkFrom(
  node: MarkdownAST,
  flavour: string,
  matchesUrl?: (url: string) => boolean,
): Link | null {
  if (node.type !== 'paragraph') return null
  const children = meaningfulChildren(node)
  if (children.length !== 1 || children[0].type !== 'link') return null
  const link = children[0]
  const hint = link.title?.trim().toLowerCase()
  if (hint === `blockcraft:${flavour}`) return link
  return matchesUrl?.(link.url) ? link : null
}

function labelFor(
  snapshot: IBlockSnapshot,
  options: EmbedBlockMarkdownAdapterOptions,
  url: string,
): string {
  if (typeof options.label === 'function') return options.label(snapshot)
  if (typeof options.label === 'string') return options.label
  const title = snapshot.props['title']
  return typeof title === 'string' && title.trim() ? title : url
}

/**
 * Portable Markdown uses an ordinary link with a type hint in its title.
 * Both profiles keep link-like Blocks as ordinary links. The title hint is the
 * smallest interoperable type marker; presentation-only props stay outside
 * Markdown instead of being exposed as an opaque directive payload.
 */
export function createEmbedBlockMarkdownAdapterMatcher(
  flavour: string,
  options: EmbedBlockMarkdownAdapterOptions = {},
): BlockMarkdownAdapterMatcher {
  const directiveName = `bc-${flavour}`
  return {
    priority: 200,
    consumes: true,
    toMatch: o => (
      (o.node.type === 'containerDirective' || o.node.type === 'leafDirective')
      && (o.node as DirectiveNode).name === directiveName
    ) || !!linkFrom(o.node, flavour, options.matchesUrl),
    fromMatch: o => o.node.flavour === flavour,
    toBlockSnapshot: {
      enter: (o, context) => {
        let props: Record<string, unknown>
        if (o.node.type === 'containerDirective' || o.node.type === 'leafDirective') {
          props = {
            ...(options.defaultProps ?? {}),
            ...decodeAdapterProps(
              (o.node as DirectiveNode).attributes?.['props'],
            ),
          }
        } else {
          const link = linkFrom(o.node, flavour, options.matchesUrl)
          if (!link) return
          const url = safeUrl(link.url)
          if (!url) {
            context.walkerContext.skipAllChildren()
            return
          }
          props = {...(options.defaultProps ?? {}), url}
          if (options.titleProp) {
            const label = textContent(link.children).trim()
            const genericLabel = typeof options.label === 'string' ? options.label : ''
            if (label && label !== url && label !== genericLabel) {
              props[options.titleProp] = label
            }
          }
        }

        const url = safeUrl(props['url'])
        if (!url) {
          context.walkerContext.skipAllChildren()
          return
        }
        props['url'] = url
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
        if (!url) return
        context.walkerContext
          .openNode({
            type: 'paragraph',
            children: [{
              type: 'link',
              url,
              title: `blockcraft:${flavour}`,
              children: [{type: 'text', value: label}],
            }],
          } as Paragraph, 'children')
          .closeNode()
      },
    },
  }
}
