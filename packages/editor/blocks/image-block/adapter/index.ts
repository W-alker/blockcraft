import type {BlockAdapterContribution} from '../../../adapters/registry'
import {imageBlockHtmlAdapterMatcher} from './html'
import {imageBlockMarkdownAdapterMatcher} from './markdown'

export const imageBlockAdapters: BlockAdapterContribution = {
  id: 'image',
  flavours: ['image'],
  html: [imageBlockHtmlAdapterMatcher],
  markdown: [imageBlockMarkdownAdapterMatcher],
}

export {imageBlockHtmlAdapterMatcher, imageBlockMarkdownAdapterMatcher}
