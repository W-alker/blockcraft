import {BlockNodeType, type IBlockSnapshot} from '../../../../framework'
import {createGenericBlockAdapterContribution} from '../../../../adapters/generic'

export const embedBlockAdapters = createGenericBlockAdapterContribution({
  flavour: 'embed',
  nodeType: BlockNodeType.void,
  htmlTag: 'figure',
  portableText: (snapshot: IBlockSnapshot) => String(
    snapshot.props['url'] ?? snapshot.props['src'] ?? '嵌入内容',
  ),
})
