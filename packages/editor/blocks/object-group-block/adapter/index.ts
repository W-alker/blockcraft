import {BlockNodeType} from '../../../framework'
import type {BlockAdapterContribution} from '../../../adapters/registry'
import {createGenericMarkdownBlockMatcher} from '../../../adapters/generic'
import {objectGroupBlockHtmlAdapterMatcher} from './html'

export const objectGroupBlockAdapters: BlockAdapterContribution = {
  id: 'object-group',
  flavours: ['object-group'],
  html: [objectGroupBlockHtmlAdapterMatcher],
  markdown: [createGenericMarkdownBlockMatcher({
    flavour: 'object-group',
    nodeType: BlockNodeType.block,
    markdownDirective: true,
  })],
}

export {objectGroupBlockHtmlAdapterMatcher}
