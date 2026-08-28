import type {BlockAdapterContribution} from '../../../adapters/registry'
import {
  listBlockAdapterMatcher,
  listBlockMarkdownAdapterMatcher,
} from '../../ordered-block/adapter'

export const bulletBlockAdapters: BlockAdapterContribution = {
  id: 'bullet',
  flavours: ['bullet'],
  html: [listBlockAdapterMatcher],
  markdown: [listBlockMarkdownAdapterMatcher],
}
