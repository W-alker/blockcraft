import type {BlockAdapterContribution} from '../../../adapters/registry'
import {codeBlockHtmlAdapterMatcher} from './html'
import {codeBlockMarkdownAdapterMatcher} from './markdown'

export const codeBlockAdapters: BlockAdapterContribution = {
  id: 'code',
  flavours: ['code'],
  html: [codeBlockHtmlAdapterMatcher],
  markdown: [codeBlockMarkdownAdapterMatcher],
}

export {codeBlockHtmlAdapterMatcher, codeBlockMarkdownAdapterMatcher}
