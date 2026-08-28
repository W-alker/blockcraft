import type {BlockAdapterContribution} from '../../../adapters/registry'
import {wordArtBlockHtmlAdapterMatcher} from './html'
import {wordArtBlockMarkdownAdapterMatcher} from './markdown'

export const wordArtBlockAdapters: BlockAdapterContribution = {
  id: 'word-art',
  flavours: ['word-art'],
  html: [wordArtBlockHtmlAdapterMatcher],
  markdown: [wordArtBlockMarkdownAdapterMatcher],
}

export {wordArtBlockHtmlAdapterMatcher, wordArtBlockMarkdownAdapterMatcher}
