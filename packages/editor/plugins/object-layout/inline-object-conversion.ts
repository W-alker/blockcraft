import {
  ShapeBlockSchema,
  WordArtBlockSchema,
  normalizeShapeSnapshotProps,
  isShapeKind,
  type InlineObjectKind,
  type InlineObjectWrapOptions,
} from '../../blocks'
import {
  INLINE_SHAPE_EMBED_KEY,
  INLINE_WORD_ART_EMBED_KEY,
  createInlineShapeDelta,
  createInlineWordArtDelta,
  readInlineShapeDelta,
  readInlineWordArtDelta,
} from '../../embeds'
import {ParagraphBlockSchema} from '../../blocks/paragraph-block'
import {
  BlockNodeType,
  generateId,
  type DeltaInsert,
  type DeltaInsertEmbed,
  type IBlockSnapshot,
} from '../../framework'
import {sliceDelta} from '../../global'

const deltaLength = (delta: DeltaInsert): number =>
  typeof delta.insert === 'string' ? delta.insert.length : 1

const cloneDeltas = (deltas: readonly DeltaInsert[]): DeltaInsert[] =>
  deltas.map(delta => ({
    ...delta,
    ...(delta.attributes ? {attributes: {...delta.attributes}} : {}),
    ...(typeof delta.insert === 'object' && delta.insert
      ? {insert: {...delta.insert}}
      : {}),
  }))

const shapeTextDeltas = (snapshot: IBlockSnapshot): DeltaInsert[] => {
  const text = snapshot.children.find(child =>
    typeof child === 'object' &&
    child != null &&
    'flavour' in child &&
    'nodeType' in child &&
    child.flavour === 'shape-text' &&
    child.nodeType === BlockNodeType.editable
  ) as IBlockSnapshot | undefined
  return text?.nodeType === BlockNodeType.editable
    ? cloneDeltas(text.children as DeltaInsert[])
    : []
}

export function objectBlockSnapshotToInlineParagraph(
  snapshot: IBlockSnapshot,
  wrap?: Partial<InlineObjectWrapOptions>,
): IBlockSnapshot | null {
  let delta: DeltaInsertEmbed | null = null
  if (snapshot.flavour === 'shape' && snapshot.nodeType === BlockNodeType.block) {
    delta = createInlineShapeDelta(
      snapshot.props,
      shapeTextDeltas(snapshot),
      wrap,
    )
  } else if (
    snapshot.flavour === 'word-art' &&
    snapshot.nodeType === BlockNodeType.editable
  ) {
    delta = createInlineWordArtDelta(
      snapshot.props,
      snapshot.children as DeltaInsert[],
      wrap,
    )
  }
  return delta ? ParagraphBlockSchema.createSnapshot([delta]) : null
}

export function resolveInlineObjectDeltaAtOffset(
  deltas: readonly DeltaInsert[],
  offset: number,
  kind?: InlineObjectKind,
): {kind: InlineObjectKind; delta: DeltaInsertEmbed} | null {
  if (!Number.isInteger(offset) || offset < 0) return null
  let currentOffset = 0
  for (const delta of deltas) {
    if (currentOffset === offset && typeof delta.insert === 'object') {
      const resolvedKind = INLINE_SHAPE_EMBED_KEY in delta.insert
        ? 'shape'
        : INLINE_WORD_ART_EMBED_KEY in delta.insert
          ? 'word-art'
          : null
      if (!resolvedKind || (kind && resolvedKind !== kind)) return null
      return {
        kind: resolvedKind,
        delta: {
          insert: {...delta.insert},
          ...(delta.attributes ? {attributes: {...delta.attributes}} : {}),
        },
      }
    }
    currentOffset += deltaLength(delta)
    if (currentOffset > offset) return null
  }
  return null
}

export function inlineObjectSnapshotToBlockSnapshots(
  snapshot: IBlockSnapshot,
  offset: number,
  kind?: InlineObjectKind,
): {snapshots: IBlockSnapshot[]; object: IBlockSnapshot} | null {
  if (snapshot.nodeType !== BlockNodeType.editable) return null
  const deltas = snapshot.children as DeltaInsert[]
  const resolved = resolveInlineObjectDeltaAtOffset(deltas, offset, kind)
  if (!resolved) return null

  const object = resolved.kind === 'shape'
    ? (() => {
        const data = readInlineShapeDelta(resolved.delta)
        const block = ShapeBlockSchema.createSnapshot(
          isShapeKind(data.props['shape']) ? data.props['shape'] : undefined,
          data.text,
        )
        block.props = normalizeShapeSnapshotProps({
          ...data.props,
          width: data.width,
          height: data.height,
        })
        return block
      })()
    : (() => {
        const data = readInlineWordArtDelta(resolved.delta)
        return WordArtBlockSchema.createSnapshot(data.text, {
          ...data.props,
          width: data.width,
          height: data.height,
        })
      })()

  const before = cloneDeltas(sliceDelta(deltas, 0, offset))
  const after = cloneDeltas(sliceDelta(deltas, offset + 1))
  const snapshots: IBlockSnapshot[] = []
  const createTextSide = (children: DeltaInsert[]): IBlockSnapshot => ({
    ...snapshot,
    id: generateId(),
    meta: {...snapshot.meta},
    props: {...snapshot.props},
    nodeType: BlockNodeType.editable,
    children,
  })
  if (before.length) snapshots.push(createTextSide(before))
  snapshots.push(object)
  if (after.length) snapshots.push(createTextSide(after))
  return {snapshots, object}
}
