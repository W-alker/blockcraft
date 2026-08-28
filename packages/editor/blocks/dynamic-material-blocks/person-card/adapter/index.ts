import {BlockNodeType, type IBlockSnapshot} from '../../../../framework'
import {createGenericBlockAdapterContribution} from '../../../../adapters/generic'

export const personCardBlockAdapters = createGenericBlockAdapterContribution({
  flavour: 'person-card',
  nodeType: BlockNodeType.void,
  htmlTag: 'figure',
  markdownDirective: true,
  portableText: (_: IBlockSnapshot) => '人员卡片',
})
