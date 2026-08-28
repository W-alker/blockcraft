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
}
