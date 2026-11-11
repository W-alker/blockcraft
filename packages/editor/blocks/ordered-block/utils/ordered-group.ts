import {IBlockProps} from '../../../framework'
import {
  isOrderedMarkerStyleId,
  OrderedMarkerStyleId,
} from './get-number-prefix'
import {
  getOrderedCounterDepth,
  getOrderedCounterHeading,
  getOrderedCounterStart,
  isSameOrderedCounter,
  OrderedCounterBlock,
  prunesOrderedCounter,
} from './ordered-counter-group'

const readBlock = (doc: BlockCraft.Doc, blockId: string): OrderedCounterBlock | null => {
  const flavour = doc.model.getFlavour(blockId)
  const props = doc.model.getProps(blockId)
  return flavour && props
    ? {id: blockId, flavour, props: props as OrderedCounterBlock['props']}
    : null
}

/**
 * Resolve the numbered group containing the anchor.
 *
 * The group follows the same structural pruning rules as automatic numbering:
 * same-level paragraphs do not break it, while returning to a shallower level
 * or crossing the relevant heading boundary does. An explicit positive
 * `start` begins a new group for the same counter.
 */
export const resolveOrderedMarkerGroupIds = (
  doc: BlockCraft.Doc,
  anchorId: string,
): string[] => {
  const anchor = readBlock(doc, anchorId)
  if (!anchor || anchor.flavour !== 'ordered') return []
  const parentId = doc.model.getParentId(anchorId)
  if (!parentId) return [anchorId]

  const siblings = doc.model.getChildrenIds(parentId)
    .map(id => readBlock(doc, id))
    .filter((block): block is OrderedCounterBlock => !!block)
  const anchorIndex = siblings.findIndex(block => block.id === anchorId)
  if (anchorIndex < 0) return [anchorId]

  const depth = getOrderedCounterDepth(anchor)
  const heading = getOrderedCounterHeading(anchor)
  let start = anchorIndex
  if (getOrderedCounterStart(anchor) === null) {
    for (let index = anchorIndex - 1; index >= 0; index--) {
      const current = siblings[index]
      if (prunesOrderedCounter(current, depth, heading)) break
      start = index
      if (
        current.flavour === 'ordered' &&
        isSameOrderedCounter(current, depth, heading) &&
        getOrderedCounterStart(current) !== null
      ) {
        break
      }
    }
  }

  let end = anchorIndex
  for (let index = anchorIndex + 1; index < siblings.length; index++) {
    const current = siblings[index]
    if (prunesOrderedCounter(current, depth, heading)) break
    if (
      current.flavour === 'ordered' &&
      isSameOrderedCounter(current, depth, heading) &&
      getOrderedCounterStart(current) !== null
    ) {
      break
    }
    end = index
  }

  return siblings
    .slice(start, end + 1)
    .filter(block =>
      block.flavour === 'ordered' &&
      isSameOrderedCounter(block, depth, heading),
    )
    .map(block => block.id)
}

const hasDifferentStyle = (
  doc: BlockCraft.Doc,
  blockId: string,
  style: OrderedMarkerStyleId | null,
) => {
  const props = doc.model.getProps(blockId) as IBlockProps | null
  if (!props) return false
  const current = isOrderedMarkerStyleId(props['ms'])
    ? props['ms']
    : null
  return current !== style
}

/** Apply one marker preset to every distinct numbered group reached by the anchors. */
export const applyOrderedMarkerStyle = (
  doc: BlockCraft.Doc,
  anchorIds: readonly string[],
  style: OrderedMarkerStyleId | null,
) => {
  if (style !== null && !isOrderedMarkerStyleId(style)) return
  const targets = new Set<string>()
  const handled = new Set<string>()

  anchorIds.forEach(anchorId => {
    if (handled.has(anchorId)) return
    const groupIds = resolveOrderedMarkerGroupIds(doc, anchorId)
    groupIds.forEach(id => {
      handled.add(id)
      if (doc.readonlyManager?.isReadonly(id) ?? false) return
      if (hasDifferentStyle(doc, id, style)) targets.add(id)
    })
  })

  if (!targets.size) return
  doc.crud.transact(() => {
    targets.forEach(id => doc.crud.updateBlockProps(id, {ms: style}))
  })
}
