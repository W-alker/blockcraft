import type {Paragraph} from 'mdast'
import {
  ShapeBlockSchema,
  ShapeTextBlockSchema,
  normalizeShapeSnapshotProps,
  type ShapeBlockProps,
} from '..'
import {
  createMarkdownPropsNode,
  isMarkdownPropsNode,
  readMarkdownPropsNode,
} from '../../../adapters/generic'
import type {BlockMarkdownAdapterMatcher} from '../../../adapters/markdown-adapter/block-adapter'
import type {MarkdownAST} from '../../../adapters/markdown-adapter/type'
import {
  DEFAULT_MARKDOWN_ADAPTER_PROFILE,
  MARKDOWN_ADAPTER_PROFILE_CONFIG,
} from '../../../adapters/registry'
import type {DeltaInsert, IBlockSnapshot} from '../../../framework'

const SHAPE_DIRECTIVE = 'bc-shape'
const SHAPE_TEXT_DIRECTIVE = 'bc-shape-text'

type ShapeDirective = MarkdownAST & {
  type: 'containerDirective' | 'leafDirective'
  name: typeof SHAPE_DIRECTIVE | typeof SHAPE_TEXT_DIRECTIVE
  attributes?: Record<string, string | null | undefined> | null
  children: MarkdownAST[]
}

const usesCustomDirectives = (
  context: {configs?: Map<string, string>},
): boolean => (
  context.configs?.get(MARKDOWN_ADAPTER_PROFILE_CONFIG)
  ?? DEFAULT_MARKDOWN_ADAPTER_PROFILE
) !== 'portable'

const textDelta = (snapshot: IBlockSnapshot): DeltaInsert[] => {
  if (snapshot.flavour === 'shape-text') {
    return snapshot.children as DeltaInsert[]
  }
  const child = snapshot.children[0] as IBlockSnapshot | undefined
  return child?.flavour === 'shape-text'
    ? child.children as DeltaInsert[]
    : []
}

const paragraph = (
  delta: DeltaInsert[],
  context: Parameters<
    NonNullable<BlockMarkdownAdapterMatcher['fromBlockSnapshot']['enter']>
  >[1],
): Paragraph => ({
  type: 'paragraph',
  children: context.deltaConverter.deltaToAST(delta),
})

/**
 * Shape owns its internal ShapeText Markdown representation. The parent
 * matcher skips that child after writing the envelope, so a normal shape is
 * never emitted twice. A standalone ShapeText still has an explicit recovery
 * directive for malformed/partial snapshots and adapter-level tooling.
 */
export const shapeBlockMarkdownAdapterMatcher:
  BlockMarkdownAdapterMatcher = {
    priority: 100,
    consumes: true,
    toMatch: o => (
      o.node.type === 'containerDirective' ||
      o.node.type === 'leafDirective'
    ) && (
      (o.node as ShapeDirective).name === SHAPE_DIRECTIVE ||
      (o.node as ShapeDirective).name === SHAPE_TEXT_DIRECTIVE
    ),
    fromMatch: o =>
      o.node.flavour === 'shape' || o.node.flavour === 'shape-text',
    toBlockSnapshot: {
      enter: (o, context) => {
        const directive = o.node as ShapeDirective
        const props = readMarkdownPropsNode(directive.children[0])
        const content = isMarkdownPropsNode(directive.children[0])
          ? directive.children.slice(1)
          : directive.children
        const delta = content.flatMap(child =>
          context.deltaConverter.astToDelta(child),
        )

        if (directive.name === SHAPE_TEXT_DIRECTIVE) {
          const snapshot = ShapeTextBlockSchema.createSnapshot(delta)
          context.walkerContext.openNode(snapshot).closeNode()
        } else {
          const normalizedProps = normalizeShapeSnapshotProps(
            props as Partial<ShapeBlockProps>,
          )
          const snapshot = ShapeBlockSchema.createSnapshot(
            normalizedProps.shape,
            delta,
          )
          snapshot.props = normalizedProps
          context.walkerContext.openNode(snapshot).closeNode()
        }
        context.walkerContext.skipAllChildren()
      },
    },
    fromBlockSnapshot: {
      enter: (o, context) => {
        const delta = textDelta(o.node)
        if (!usesCustomDirectives(context)) {
          context.walkerContext
            .openNode(paragraph(delta, context), 'children')
            .closeNode()
          context.walkerContext.skipAllChildren()
          return
        }

        const propsNode = createMarkdownPropsNode(o.node.props)
        const directive: ShapeDirective = {
          type: 'containerDirective',
          name: o.node.flavour === 'shape'
            ? SHAPE_DIRECTIVE
            : SHAPE_TEXT_DIRECTIVE,
          attributes: {},
          children: [
            ...(propsNode ? [propsNode] : []),
            paragraph(delta, context),
          ],
        } as ShapeDirective
        context.walkerContext
          .openNode(directive, 'children')
          .closeNode()
        context.walkerContext.skipAllChildren()
      },
    },
  }
