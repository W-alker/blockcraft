import type {BlockAdapterContribution} from '../../../adapters/registry'
import {
  tableBlockHtmlAdapterMatcher,
  tableCellBlockHtmlAdapterMatcher,
  tableRowBlockHtmlAdapterMatcher,
} from './html'
import {
  tableBlockMarkdownAdapterMatcher,
  tableCellBlockMarkdownAdapterMatcher,
  tableRowBlockMarkdownAdapterMatcher,
} from './markdown'

export const tableBlockAdapters: BlockAdapterContribution = {
  id: 'table-family',
  flavours: ['table', 'table-row', 'table-cell'],
  html: [
    tableBlockHtmlAdapterMatcher,
    tableRowBlockHtmlAdapterMatcher,
    tableCellBlockHtmlAdapterMatcher,
  ],
  markdown: [
    tableBlockMarkdownAdapterMatcher,
    tableRowBlockMarkdownAdapterMatcher,
    tableCellBlockMarkdownAdapterMatcher,
  ],
}

export {
  tableBlockHtmlAdapterMatcher,
  tableRowBlockHtmlAdapterMatcher,
  tableCellBlockHtmlAdapterMatcher,
  tableBlockMarkdownAdapterMatcher,
  tableRowBlockMarkdownAdapterMatcher,
  tableCellBlockMarkdownAdapterMatcher,
}
