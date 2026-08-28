import type {Code} from 'mdast'
import type {BlockMarkdownAdapterMatcher} from '../../../adapters/markdown-adapter/block-adapter'
import type {MarkdownAST} from '../../../adapters/markdown-adapter/type'
import {
  BlockNodeType,
  generateId,
  type DeltaInsert,
  type IBlockSnapshot,
} from '../../../framework'
import {deltaToString} from '../../../global'
import {isMermaidMarkdownLanguage} from './language'

function isMermaidFence(node: MarkdownAST): node is Code {
  return node.type === 'code' && isMermaidMarkdownLanguage(node.lang)
}

export const mermaidBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  priority: 300,
  consumes: true,
  toMatch: o => isMermaidFence(o.node),
  fromMatch: o => o.node.flavour === 'mermaid',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!isMermaidFence(o.node)) return

      context.walkerContext
        .openNode(
          {
            id: generateId(),
            flavour: 'mermaid',
            nodeType: BlockNodeType.block,
            props: {mode: 'graph'},
            meta: {},
            children: [],
          },
          'children',
        )
        .openNode(
          {
            id: generateId(),
            flavour: 'mermaid-textarea',
            nodeType: BlockNodeType.editable,
            props: {},
            meta: {},
            children: [{insert: o.node.value}],
          },
          'children',
        )
        .closeNode()
        .closeNode()
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const source = (o.node.children as IBlockSnapshot[]).find(
        child => child.flavour === 'mermaid-textarea',
      )
      const value = source
        ? deltaToString(source.children as DeltaInsert[])
        : ''

      context.walkerContext
        .openNode(
          {
            type: 'code',
            lang: 'mermaid',
            meta: null,
            value,
          },
          'children',
        )
        .closeNode()
        .skipAllChildren()
    },
  },
}
