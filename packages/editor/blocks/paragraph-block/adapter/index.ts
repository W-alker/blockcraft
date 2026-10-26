import type {BlockAdapterContribution} from '../../../adapters/registry'
import {paragraphBlockHtmlAdapterMatcher} from './html'
import {paragraphBlockMarkdownAdapterMatcher} from './markdown'

/** Paragraph owns its contribution; blockquote reuses the same grammar matcher. */
export const paragraphBlockAdapters: BlockAdapterContribution = {
  id: 'paragraph',
  flavours: ['paragraph'],
  html: [paragraphBlockHtmlAdapterMatcher],
  markdown: [paragraphBlockMarkdownAdapterMatcher],
}

export {
  paragraphBlockHtmlAdapterMatcher,
  paragraphBlockMarkdownAdapterMatcher,
}
