import {BlockNodeType} from '../../../framework'
import type {BlockAdapterContribution} from '../../../adapters/registry'
import {createGenericMarkdownBlockMatcher} from '../../../adapters/generic'
import {renderUnitBlockHtmlAdapterMatcher} from './html'

export const renderUnitBlockAdapters: BlockAdapterContribution = {
  id: 'render-unit',
  flavours: ['render-unit'],
  html: [renderUnitBlockHtmlAdapterMatcher],
  markdown: [createGenericMarkdownBlockMatcher({
    flavour: 'render-unit',
    nodeType: BlockNodeType.block,
    markdownDirective: true,
  })],
}

export {renderUnitBlockHtmlAdapterMatcher}
