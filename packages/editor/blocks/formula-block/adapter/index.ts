import type {BlockAdapterContribution} from '../../../adapters/registry'
import {formulaBlockHtmlAdapterMatcher} from './html'
import {formulaBlockMarkdownAdapterMatcher} from './markdown'

export const formulaBlockAdapters: BlockAdapterContribution = {
  id: 'formula',
  flavours: ['formula'],
  html: [formulaBlockHtmlAdapterMatcher],
  markdown: [formulaBlockMarkdownAdapterMatcher],
}

export {formulaBlockHtmlAdapterMatcher, formulaBlockMarkdownAdapterMatcher}
