import type {BlockAdapterContribution} from '../../../adapters/registry'
import {shapeBlockHtmlAdapterMatcher} from './html'
import {shapeBlockMarkdownAdapterMatcher} from './markdown'

export const shapeBlockAdapters: BlockAdapterContribution = {
  id: 'shape-family',
  flavours: ['shape', 'shape-text'],
  html: [shapeBlockHtmlAdapterMatcher],
  markdown: [shapeBlockMarkdownAdapterMatcher],
}

export {shapeBlockHtmlAdapterMatcher, shapeBlockMarkdownAdapterMatcher}
