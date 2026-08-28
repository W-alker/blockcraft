import type {BlockAdapterContribution} from '../../../adapters/registry'
import {createTransparentBlockAdapterContribution} from '../../../adapters/generic'
import {rootBlockHtmlAdapterMatcher} from './html'

export const rootBlockAdapters: BlockAdapterContribution = {
  id: 'root',
  flavours: ['root'],
  html: [rootBlockHtmlAdapterMatcher],
  markdown: createTransparentBlockAdapterContribution(
    'root-markdown',
    ['root'],
  ).markdown,
}

export {rootBlockHtmlAdapterMatcher}
