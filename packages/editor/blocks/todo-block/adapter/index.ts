import type {BlockAdapterContribution} from '../../../adapters/registry'
import {
  listBlockAdapterMatcher,
  listBlockMarkdownAdapterMatcher,
} from '../../ordered-block/adapter'

export const todoBlockAdapters: BlockAdapterContribution = {
  id: 'todo',
  flavours: ['todo'],
  html: [listBlockAdapterMatcher],
  markdown: [listBlockMarkdownAdapterMatcher],
}
