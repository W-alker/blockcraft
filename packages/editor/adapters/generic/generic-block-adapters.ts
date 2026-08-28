import type {Element} from 'hast'
import type {Paragraph, Text} from 'mdast'
import {
  BlockNodeType,
  generateId,
  type DeltaInsert,
  type IBlockSnapshot,
} from '../../framework'
import type {BlockHtmlAdapterMatcher} from '../html-adapter/block-adapter'
import type {BlockMarkdownAdapterMatcher} from '../markdown-adapter/block-adapter'
import type {MarkdownAST} from '../markdown-adapter/type'
import {
  DEFAULT_MARKDOWN_ADAPTER_PROFILE,
  MARKDOWN_ADAPTER_PROFILE_CONFIG,
  type BlockAdapterContribution,
  type MarkdownAdapterProfile,
  type MarkdownSyntaxDescriptor,
} from '../registry'
import {HastUtils} from '../utils'
import {
  createMarkdownPropsNode,
  isMarkdownPropsNode,
  readMarkdownPropsNode,
} from './markdown-props'
import {decodeAdapterProps, encodeAdapterProps} from './props-codec'

type DirectiveNode = MarkdownAST & {
  type: 'containerDirective' | 'leafDirective'
  name: string
  attributes?: Record<string, string | null | undefined> | null
  children: MarkdownAST[]
}

export interface GenericBlockAdapterOptions {
  readonly id?: string
  readonly flavour: string
  readonly nodeType: BlockNodeType
  readonly htmlTag?: string
  readonly markdownName?: string
  /**
   * Opts this flavour into private BlockCraft directive export in the hybrid
   * and blockcraft profiles. Keep false when ordinary Markdown can carry the
   * user-facing meaning.
   */
  readonly markdownDirective?: boolean
  readonly defaultProps?: Readonly<Record<string, unknown>>
  readonly portableText?: (snapshot: IBlockSnapshot) => string
  /** Optional model/help wording for the generated private directive. */
  readonly markdownSyntax?: Partial<Pick<
    MarkdownSyntaxDescriptor,
    'title' | 'description' | 'example'
  >>
}

function property(
  element: Element,
  key: string,
): unknown {
  return element.properties?.[key]
    ?? element.properties?.[key.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())]
}

function createSnapshot(
  options: GenericBlockAdapterOptions,
  props: Record<string, unknown>,
  children: IBlockSnapshot[] | DeltaInsert[],
): IBlockSnapshot {
  return {
    id: generateId(),
    flavour: options.flavour,
    nodeType: options.nodeType,
    props: {...options.defaultProps, ...props},
    meta: {},
    children,
  } as unknown as IBlockSnapshot
}

function profile(context: {configs?: Map<string, string>}): MarkdownAdapterProfile {
  const configured = context.configs?.get(MARKDOWN_ADAPTER_PROFILE_CONFIG)
  return configured === 'portable'
    || configured === 'hybrid'
    || configured === 'blockcraft'
    ? configured
    : DEFAULT_MARKDOWN_ADAPTER_PROFILE
}

function textParagraph(value: string): Paragraph {
  return {
    type: 'paragraph',
    children: [{type: 'text', value} satisfies Text],
  }
}

export function createGenericHtmlBlockMatcher(
  options: GenericBlockAdapterOptions,
): BlockHtmlAdapterMatcher {
  const tagName = options.htmlTag
    ?? (options.nodeType === BlockNodeType.void ? 'figure' : 'section')
  return {
    priority: 100,
    consumes: true,
    toMatch: o => HastUtils.isElement(o.node)
      && property(o.node, 'data-bc-block') === options.flavour,
    fromMatch: o => o.node.flavour === options.flavour,
    toBlockSnapshot: {
      enter: (o, context) => {
        if (!HastUtils.isElement(o.node)) return
        const props = decodeAdapterProps(property(o.node, 'data-bc-props'))
        if (options.nodeType === BlockNodeType.editable) {
          const deltas = context.deltaConverter.astToDelta(o.node)
          context.walkerContext
            .openNode(createSnapshot(options, props, deltas), 'children')
            .closeNode()
          context.walkerContext.skipAllChildren()
          return
        }
        const snapshot = createSnapshot(options, props, [])
        context.walkerContext.openNode(snapshot, 'children')
        if (options.nodeType === BlockNodeType.void) {
          context.walkerContext.closeNode().skipAllChildren()
        } else {
          context.walkerContext.setNodeContext('generic-html:opened', true)
        }
      },
      leave: (_, context) => {
        if (context.walkerContext.getNodeContext('generic-html:opened')) {
          context.walkerContext.closeNode()
        }
      },
    },
    fromBlockSnapshot: {
      enter: (o, context) => {
        const encoded = encodeAdapterProps(o.node.props)
        const node: Element = {
          type: 'element',
          tagName,
          properties: {
            dataBcBlock: options.flavour,
            ...(encoded ? {dataBcProps: encoded} : {}),
          },
          children: options.nodeType === BlockNodeType.editable
            ? context.deltaConverter.deltaToAST(o.node.children as DeltaInsert[])
            : [],
        }
        context.walkerContext.openNode(node, 'children')
        if (options.nodeType === BlockNodeType.block) {
          context.walkerContext.setNodeContext('generic-html:opened', true)
        } else {
          context.walkerContext.closeNode()
        }
      },
      leave: (_, context) => {
        if (context.walkerContext.getNodeContext('generic-html:opened')) {
          context.walkerContext.closeNode()
        }
      },
    },
  }
}

export function createGenericMarkdownBlockMatcher(
  options: GenericBlockAdapterOptions,
): BlockMarkdownAdapterMatcher {
  const directiveName = options.markdownName ?? `bc-${options.flavour}`
  return {
    priority: 100,
    consumes: true,
    toMatch: o => (
      o.node.type === 'containerDirective' || o.node.type === 'leafDirective'
    ) && (o.node as DirectiveNode).name === directiveName,
    fromMatch: o => o.node.flavour === options.flavour,
    toBlockSnapshot: {
      enter: (o, context) => {
        const directive = o.node as DirectiveNode
        const props = readMarkdownPropsNode(directive.children[0])
        const content = isMarkdownPropsNode(directive.children[0])
          ? directive.children.slice(1)
          : directive.children
        if (options.nodeType === BlockNodeType.editable) {
          const deltas = content.flatMap(child =>
            context.deltaConverter.astToDelta(child),
          )
          context.walkerContext
            .openNode(createSnapshot(options, props, deltas), 'children')
            .closeNode()
          context.walkerContext.skipAllChildren()
          return
        }
        context.walkerContext.openNode(createSnapshot(options, props, []), 'children')
        if (options.nodeType === BlockNodeType.void) {
          context.walkerContext.closeNode().skipAllChildren()
        } else {
          if (content.length !== directive.children.length) {
            context.walkerContext.skipChildren(1)
          }
          context.walkerContext.setNodeContext('generic-markdown:opened', true)
        }
      },
      leave: (_, context) => {
        if (context.walkerContext.getNodeContext('generic-markdown:opened')) {
          context.walkerContext.closeNode()
        }
      },
    },
    fromBlockSnapshot: {
      enter: (o, context) => {
        if (
          profile(context) === 'portable'
          || options.markdownDirective !== true
        ) {
          if (options.nodeType === BlockNodeType.editable) {
            context.walkerContext
              .openNode({
                type: 'paragraph',
                children: context.deltaConverter.deltaToAST(
                  o.node.children as DeltaInsert[],
                ),
              } as MarkdownAST, 'children')
              .closeNode()
          } else if (options.nodeType === BlockNodeType.void) {
            const fallback = options.portableText?.(o.node) ?? ''
            if (fallback) {
              context.walkerContext
                .openNode(textParagraph(fallback) as MarkdownAST, 'children')
                .closeNode()
            }
          }
          return
        }
        const propsNode = createMarkdownPropsNode(o.node.props)
        const directive: DirectiveNode = {
          // Follow the generic-directives convention: a bodyless, prop-less
          // void Block is a leaf (`::`). Content or readable YAML metadata
          // requires a container (`:::`).
          type: options.nodeType === BlockNodeType.void && !propsNode
            ? 'leafDirective'
            : 'containerDirective',
          name: directiveName,
          attributes: {},
          children: [
            ...(propsNode ? [propsNode] : []),
            ...(options.nodeType === BlockNodeType.editable
              ? [{
                type: 'paragraph',
                children: context.deltaConverter.deltaToAST(
                  o.node.children as DeltaInsert[],
                ),
              } as MarkdownAST]
              : []),
          ],
        } as DirectiveNode
        context.walkerContext.openNode(directive, 'children')
        if (options.nodeType === BlockNodeType.block) {
          context.walkerContext.setNodeContext('generic-markdown:opened', true)
        } else {
          context.walkerContext.closeNode()
        }
      },
      leave: (_, context) => {
        if (context.walkerContext.getNodeContext('generic-markdown:opened')) {
          context.walkerContext.closeNode()
        }
      },
    },
  }
}

export function createGenericBlockAdapterContribution(
  options: GenericBlockAdapterOptions,
): BlockAdapterContribution {
  const syntax = createGenericMarkdownSyntaxDescriptor(options)
  return {
    id: options.id ?? options.flavour,
    flavours: [options.flavour],
    html: [createGenericHtmlBlockMatcher(options)],
    markdown: [createGenericMarkdownBlockMatcher(options)],
    markdownSyntax: syntax ? [syntax] : [],
  }
}

export function createGenericMarkdownSyntaxDescriptor(
  options: GenericBlockAdapterOptions,
): MarkdownSyntaxDescriptor | null {
  if (options.markdownDirective !== true) return null
  const directiveName = options.markdownName ?? `bc-${options.flavour}`
  return {
    id: `block:${options.flavour}`,
    title: options.markdownSyntax?.title ?? `${options.flavour} block`,
    description: options.markdownSyntax?.description
      ?? `Use this registered BlockCraft directive only when the ${options.flavour} block semantics are required. Keep its readable body as ordinary Markdown.`,
    kind: options.nodeType === BlockNodeType.void
      ? 'leaf-directive'
      : 'container-directive',
    profiles: ['hybrid', 'blockcraft'],
    example: options.markdownSyntax?.example
      ?? (options.nodeType === BlockNodeType.void
        ? `::${directiveName}`
        : `:::${directiveName}\n\nReadable Markdown content.\n\n:::`),
  }
}

/**
 * Explicit ownership marker for infrastructure/leaf flavours whose parent or
 * children own the portable representation. It deliberately emits no wrapper.
 */
export function createTransparentBlockAdapterContribution(
  id: string,
  flavours: readonly string[],
): BlockAdapterContribution {
  const flavourSet = new Set<string>(flavours)
  const html: BlockHtmlAdapterMatcher = {
    toMatch: () => false,
    fromMatch: o => flavourSet.has(o.node.flavour),
    toBlockSnapshot: {},
    fromBlockSnapshot: {},
  }
  const markdown: BlockMarkdownAdapterMatcher = {
    toMatch: () => false,
    fromMatch: o => flavourSet.has(o.node.flavour),
    toBlockSnapshot: {},
    fromBlockSnapshot: {},
  }
  return {id, flavours, html: [html], markdown: [markdown]}
}
