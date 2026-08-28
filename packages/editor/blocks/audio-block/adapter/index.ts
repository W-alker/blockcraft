import type {BlockAdapterContribution} from '../../../adapters/registry'
import {
  mediaBlockHtmlAdapterMatcher,
  mediaBlockMarkdownAdapterMatcher,
} from '../../video-block/adapter'

export const audioBlockAdapters: BlockAdapterContribution = {
  id: 'audio',
  flavours: ['audio'],
  html: [mediaBlockHtmlAdapterMatcher],
  markdown: [mediaBlockMarkdownAdapterMatcher],
  markdownSyntax: [{
    id: 'block:audio',
    title: 'Audio link',
    description: 'Use a readable standard link with the audio title hint so BlockCraft reconstructs an audio block.',
    kind: 'link',
    example: '[Audio](https://example.com/audio.mp3 "blockcraft:audio")',
  }],
}
