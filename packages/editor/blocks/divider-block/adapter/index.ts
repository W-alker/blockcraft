import type {BlockAdapterContribution} from '../../../adapters/registry'
import {dividerBlockHtmlAdapterMatcher} from './html'
import {dividerBlockMarkdownAdapterMatcher} from './markdown'

export const dividerBlockAdapters: BlockAdapterContribution = {
  id: 'divider',
  flavours: ['divider'],
  html: [dividerBlockHtmlAdapterMatcher],
  markdown: [dividerBlockMarkdownAdapterMatcher],
}

export {dividerBlockHtmlAdapterMatcher, dividerBlockMarkdownAdapterMatcher}
