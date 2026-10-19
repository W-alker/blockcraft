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
  markdownSyntax: [{
    id: 'block:bookmark',
    title: 'Bookmark link',
    description: 'Use a standard link with the bookmark title hint when a bookmark card is intended.',
    kind: 'link',
    example: '[Reference](https://example.com "blockcraft:bookmark")',
  }],
}
