import type {BlockAdapterContribution} from '../../../adapters/registry'
import {
  paragraphBlockHtmlAdapterMatcher,
  paragraphBlockMarkdownAdapterMatcher,
} from '../../paragraph-block/adapter'

export const blockquoteBlockHtmlAdapterMatcher =
  paragraphBlockHtmlAdapterMatcher
export const blockquoteBlockMarkdownAdapterMatcher =
  paragraphBlockMarkdownAdapterMatcher

export const blockquoteBlockAdapters: BlockAdapterContribution = {
  id: 'blockquote',
  flavours: ['blockquote'],
  html: [blockquoteBlockHtmlAdapterMatcher],
  markdown: [blockquoteBlockMarkdownAdapterMatcher],
}
