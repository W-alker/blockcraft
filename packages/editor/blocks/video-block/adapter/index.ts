import type {BlockAdapterContribution} from '../../../adapters/registry'
import {mediaBlockHtmlAdapterMatcher} from './html'
import {mediaBlockMarkdownAdapterMatcher} from './markdown'

export const videoBlockAdapters: BlockAdapterContribution = {
  id: 'video',
  flavours: ['video'],
  html: [mediaBlockHtmlAdapterMatcher],
  markdown: [mediaBlockMarkdownAdapterMatcher],
}

export {mediaBlockHtmlAdapterMatcher, mediaBlockMarkdownAdapterMatcher}
