import type {BlockAdapterContribution} from '../../../adapters/registry'
import {
  createEmbedBlockHtmlAdapterMatcher,
  createEmbedBlockMarkdownAdapterMatcher,
} from '../../../adapters/generic'

export const bookmarkBlockHtmlAdapterMatcher =
  createEmbedBlockHtmlAdapterMatcher('bookmark', {titleProp: 'title'})
export const bookmarkBlockMarkdownAdapterMatcher =
  createEmbedBlockMarkdownAdapterMatcher('bookmark', {titleProp: 'title'})

export const bookmarkBlockAdapters: BlockAdapterContribution = {
  id: 'bookmark',
  flavours: ['bookmark'],
  html: [bookmarkBlockHtmlAdapterMatcher],
  markdown: [bookmarkBlockMarkdownAdapterMatcher],
}
