import {BlockNodeType, type IBlockSnapshot} from '../../../../framework'
import {createGenericBlockAdapterContribution} from '../../../../adapters/generic'

export const dateCardBlockAdapters = createGenericBlockAdapterContribution({
  flavour: 'date-card',
  nodeType: BlockNodeType.void,
  htmlTag: 'figure',
  markdownDirective: true,
  portableText: (_: IBlockSnapshot) => '日期卡片',
})
