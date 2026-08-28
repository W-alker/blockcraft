import type {BlockAdapterContribution} from '../../../adapters/registry'
import {mediaBlockHtmlAdapterMatcher} from './html'
import {mediaBlockMarkdownAdapterMatcher} from './markdown'

export const videoBlockAdapters: BlockAdapterContribution = {
  id: 'video',
  flavours: ['video'],
  html: [mediaBlockHtmlAdapterMatcher],
  markdown: [mediaBlockMarkdownAdapterMatcher],
  markdownSyntax: [{
    id: 'block:video',
    title: 'Video link',
    description: 'Use a readable standard link with the video title hint so BlockCraft reconstructs a video block. Do not add presentation metadata.',
    kind: 'link',
    example: '[Video](https://example.com/video.mp4 "blockcraft:video")',
  }],
}

export {mediaBlockHtmlAdapterMatcher, mediaBlockMarkdownAdapterMatcher}
