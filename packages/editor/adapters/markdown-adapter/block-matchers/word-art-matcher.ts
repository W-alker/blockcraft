import type {DeltaInsert} from '../../../framework'
import type {BlockMarkdownAdapterMatcher} from '../block-adapter'

const plainTextDelta = (value: DeltaInsert[]): DeltaInsert[] => {
  const result: DeltaInsert[] = []
  for (const item of value) {
    if (typeof item.insert === 'string') {
      if (item.insert) result.push({insert: item.insert})
      continue
    }
    if (item.insert?.['break']) result.push({insert: {break: '\n'}})
  }
  return result
}

export const wordArtBlockMarkdownAdapterMatcher:
  BlockMarkdownAdapterMatcher = {
    toMatch: () => false,
    fromMatch: o => o.node.flavour === 'word-art',
    toBlockSnapshot: {},
    fromBlockSnapshot: {
      enter: (o, context) => {
        const {walkerContext, deltaConverter} = context
        walkerContext.openNode({
          type: 'paragraph',
          children: deltaConverter.deltaToAST(
            plainTextDelta(o.node.children as DeltaInsert[]),
          ),
        }, 'children').closeNode()
        walkerContext.skipAllChildren()
      },
    },
  }
