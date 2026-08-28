import {BlockNodeType} from '../../../framework'
import {createGenericBlockAdapterContribution} from '../../../adapters/generic'

export const captionBlockAdapters = createGenericBlockAdapterContribution({
  flavour: 'caption',
  nodeType: BlockNodeType.editable,
  htmlTag: 'figcaption',
})
