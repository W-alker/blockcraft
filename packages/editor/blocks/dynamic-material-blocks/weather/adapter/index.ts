import {BlockNodeType, type IBlockSnapshot} from '../../../../framework'
import {createGenericBlockAdapterContribution} from '../../../../adapters/generic'

export const weatherBlockAdapters = createGenericBlockAdapterContribution({
  flavour: 'weather',
  nodeType: BlockNodeType.void,
  htmlTag: 'figure',
  markdownDirective: true,
  portableText: (_: IBlockSnapshot) => '天气',
})
