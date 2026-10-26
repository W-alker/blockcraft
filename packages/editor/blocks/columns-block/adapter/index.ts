import {BlockNodeType} from '../../../framework'
import type {BlockAdapterContribution} from '../../../adapters/registry'
import {
  createGenericHtmlBlockMatcher,
  createGenericMarkdownBlockMatcher,
  createGenericMarkdownSyntaxDescriptor,
} from '../../../adapters/generic'

const columns = {
  flavour: 'columns' as const,
  nodeType: BlockNodeType.block,
  htmlTag: 'section',
  markdownDirective: true,
}
const column = {
  flavour: 'column' as const,
  nodeType: BlockNodeType.block,
  htmlTag: 'div',
  markdownDirective: true,
}

export const columnsBlockAdapters: BlockAdapterContribution = {
  id: 'columns-family',
  flavours: ['columns', 'column'],
  html: [
    createGenericHtmlBlockMatcher(columns),
    createGenericHtmlBlockMatcher(column),
  ],
  markdown: [
    createGenericMarkdownBlockMatcher(columns),
    createGenericMarkdownBlockMatcher(column),
  ],
  markdownSyntax: [
    createGenericMarkdownSyntaxDescriptor(columns)!,
    createGenericMarkdownSyntaxDescriptor(column)!,
  ],
}
