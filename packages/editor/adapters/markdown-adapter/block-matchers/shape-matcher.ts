import type {DeltaInsert, IBlockSnapshot} from '../../../framework'
import type {BlockMarkdownAdapterMatcher} from '../block-adapter'

export const shapeBlockMarkdownAdapterMatcher:
  BlockMarkdownAdapterMatcher = {
    toMatch: () => false,
    fromMatch: o => o.node.flavour === 'shape',
    toBlockSnapshot: {},
    fromBlockSnapshot: {
      enter: (o, context) => {
        const {walkerContext, deltaConverter} = context
        const textSnapshot = o.node.children[0] as
          IBlockSnapshot | undefined
        const delta = textSnapshot?.flavour === 'shape-text'
          ? textSnapshot.children as DeltaInsert[]
          : []
        walkerContext.openNode({
          type: 'paragraph',
          children: deltaConverter.deltaToAST(delta),
        }, 'children').closeNode()
        walkerContext.skipAllChildren()
      },
    },
  }
