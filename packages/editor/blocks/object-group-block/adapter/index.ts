import {BlockNodeType} from '../../../framework'
import type {BlockAdapterContribution} from '../../../adapters/registry'
import {
  createGenericMarkdownBlockMatcher,
  createGenericMarkdownSyntaxDescriptor,
} from '../../../adapters/generic'
import {objectGroupBlockHtmlAdapterMatcher} from './html'

const markdownOptions = {
  flavour: 'object-group' as const,
  nodeType: BlockNodeType.block,
  markdownDirective: true,
}

export const objectGroupBlockAdapters: BlockAdapterContribution = {
  id: 'object-group',
  flavours: ['object-group'],
  html: [objectGroupBlockHtmlAdapterMatcher],
  markdown: [createGenericMarkdownBlockMatcher(markdownOptions)],
  markdownSyntax: [createGenericMarkdownSyntaxDescriptor(markdownOptions)!],
}

export {objectGroupBlockHtmlAdapterMatcher}
