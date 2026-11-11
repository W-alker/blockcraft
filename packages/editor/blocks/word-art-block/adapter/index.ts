import type {BlockAdapterContribution} from '../../../adapters/registry'
import {wordArtBlockHtmlAdapterMatcher} from './html'
import {wordArtBlockMarkdownAdapterMatcher} from './markdown'

export const wordArtBlockAdapters: BlockAdapterContribution = {
  id: 'word-art',
  flavours: ['word-art'],
  html: [wordArtBlockHtmlAdapterMatcher],
  markdown: [wordArtBlockMarkdownAdapterMatcher],
  markdownSyntax: [{
    id: 'block:word-art',
    title: 'WordArt',
    description: 'Use the WordArt container only when the content must remain a typed visual text object. Keep its text readable in the body.',
    kind: 'container-directive',
    profiles: ['hybrid', 'blockcraft'],
    example: ':::bc-word-art\n\nReadable WordArt text.\n\n:::',
  }],
}

export {wordArtBlockHtmlAdapterMatcher, wordArtBlockMarkdownAdapterMatcher}
