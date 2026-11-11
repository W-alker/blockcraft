import {
  createGenericBlockAdapterContribution,
} from '../../../../../adapters/generic'
import {
  BlockNodeType,
  type IBlockSnapshot,
} from '../../../../../framework'

function portableCoverText(snapshot: IBlockSnapshot): string {
  const title = typeof snapshot.props['title'] === 'string'
    ? snapshot.props['title'].trim()
    : ''
  const author = snapshot.props['author']
  const authorName = author
    && typeof author === 'object'
    && !Array.isArray(author)
    && typeof (author as Record<string, unknown>)['name'] === 'string'
    ? (author as Record<string, unknown>)['name'] as string
    : ''

  return [title || '演示封面', authorName.trim()]
    .filter(Boolean)
    .join(' — ')
}

/** Format ownership for the presentation-only cover Block. */
export const demoCoverBlockAdapters = createGenericBlockAdapterContribution({
  flavour: 'demo-cover',
  nodeType: BlockNodeType.void,
  htmlTag: 'section',
  defaultProps: {title: ''},
  portableText: portableCoverText,
})
