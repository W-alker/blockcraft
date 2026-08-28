import {BlockNodeType} from '../../../framework'
import {createGenericBlockAdapterContribution} from '../../../adapters/generic'

export const frameBlockAdapters = createGenericBlockAdapterContribution({
  flavour: 'frame',
  nodeType: BlockNodeType.block,
  htmlTag: 'section',
  markdownDirective: true,
})
