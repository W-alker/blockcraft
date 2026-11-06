import type {BlockAdapterContribution} from '../../../adapters/registry'
import {listBlockAdapterMatcher} from './html'
import {listBlockMarkdownAdapterMatcher} from './markdown'

/** Ordered owns its contribution; sibling list flavours reuse this grammar. */
export const orderedBlockAdapters: BlockAdapterContribution = {
  id: 'ordered',
  flavours: ['ordered'],
  html: [listBlockAdapterMatcher],
  markdown: [listBlockMarkdownAdapterMatcher],
}

export {listBlockAdapterMatcher, listBlockMarkdownAdapterMatcher}
