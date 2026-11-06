import type {Paragraph} from 'mdast'
import {
  WordArtBlockSchema,
  type WordArtBlockProps,
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
import type {DeltaInsert} from '../../../framework'

const WORD_ART_DIRECTIVE = 'bc-word-art'

type WordArtDirective = MarkdownAST & {
  type: 'containerDirective' | 'leafDirective'
  name: typeof WORD_ART_DIRECTIVE
  attributes?: Record<string, string | null | undefined> | null
  children: MarkdownAST[]
}

const usesCustomDirectives = (
  context: {configs?: Map<string, string>},
): boolean => (
  context.configs?.get(MARKDOWN_ADAPTER_PROFILE_CONFIG)
  ?? DEFAULT_MARKDOWN_ADAPTER_PROFILE
) !== 'portable'

const plainTextDelta = (value: DeltaInsert[]): DeltaInsert[] => {
  const result: DeltaInsert[] = []
  for (const item of value) {
    if (typeof item.insert === 'string') {
      if (item.insert) result.push({insert: item.insert})
      continue
    }
    if (item.insert?.['break']) result.push({insert: {break: '\n'}})
  }
  return result
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

export const wordArtBlockMarkdownAdapterMatcher:
  BlockMarkdownAdapterMatcher = {
    priority: 100,
    consumes: true,
    toMatch: o => (
      o.node.type === 'containerDirective' ||
      o.node.type === 'leafDirective'
    ) && (o.node as WordArtDirective).name === WORD_ART_DIRECTIVE,
    fromMatch: o => o.node.flavour === 'word-art',
    toBlockSnapshot: {
      enter: (o, context) => {
        const directive = o.node as WordArtDirective
        const props = readMarkdownPropsNode(directive.children[0])
        const content = isMarkdownPropsNode(directive.children[0])
          ? directive.children.slice(1)
          : directive.children
        const delta = plainTextDelta(content.flatMap(child =>
          context.deltaConverter.astToDelta(child),
        ))
        const snapshot = WordArtBlockSchema.createSnapshot(
          delta,
          props as Partial<WordArtBlockProps>,
        )
        context.walkerContext.openNode(snapshot).closeNode()
        context.walkerContext.skipAllChildren()
      },
    },
    fromBlockSnapshot: {
      enter: (o, context) => {
        const delta = plainTextDelta(o.node.children as DeltaInsert[])
        if (!usesCustomDirectives(context)) {
          context.walkerContext
            .openNode(paragraph(delta, context), 'children')
            .closeNode()
          context.walkerContext.skipAllChildren()
          return
        }

        const propsNode = createMarkdownPropsNode(o.node.props)
        const directive: WordArtDirective = {
          type: 'containerDirective',
          name: WORD_ART_DIRECTIVE,
          attributes: {},
          children: [
            ...(propsNode ? [propsNode] : []),
            paragraph(delta, context),
          ],
        } as WordArtDirective
        context.walkerContext
          .openNode(directive, 'children')
          .closeNode()
        context.walkerContext.skipAllChildren()
      },
    },
  }
