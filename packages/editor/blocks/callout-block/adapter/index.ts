import {BlockNodeType} from '../../../framework'
import {createGenericBlockAdapterContribution} from '../../../adapters/generic'

export const calloutBlockAdapters = createGenericBlockAdapterContribution({
  flavour: 'callout',
  nodeType: BlockNodeType.block,
  htmlTag: 'aside',
  markdownDirective: true,
  defaultProps: {
    backColor: '#FFE6CD',
    color: '#333',
    borderColor: 'transparent',
    prefix: '📢',
  },
})
