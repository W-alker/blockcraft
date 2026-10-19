import {BlockNodeType} from '../../../framework'
import {createGenericBlockAdapterContribution} from '../../../adapters/generic'

export const pageDividerBlockAdapters = createGenericBlockAdapterContribution({
  flavour: 'page-divider',
  nodeType: BlockNodeType.void,
  htmlTag: 'hr',
  markdownDirective: true,
  portableText: () => '分页符',
})
