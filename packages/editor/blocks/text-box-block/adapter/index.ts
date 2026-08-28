import {BlockNodeType} from '../../../framework'
import type {BlockAdapterContribution} from '../../../adapters/registry'
import {createGenericMarkdownBlockMatcher} from '../../../adapters/generic'
import {textBoxBlockHtmlAdapterMatcher} from './html'

export const textBoxBlockAdapters: BlockAdapterContribution = {
  id: 'text-box',
  flavours: ['text-box'],
  html: [textBoxBlockHtmlAdapterMatcher],
  markdown: [createGenericMarkdownBlockMatcher({
    flavour: 'text-box',
    nodeType: BlockNodeType.block,
    markdownDirective: true,
  })],
}

export {textBoxBlockHtmlAdapterMatcher}
