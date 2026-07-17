import {ParagraphBlockSchema} from '../../blocks/paragraph-block';
import {
  BlockNodeType,
  createInlineImageDelta,
  DeltaInsert,
  IBlockSnapshot,
} from '../../framework';

const hasCaptionContent = (deltas: DeltaInsert[]) => deltas.some(delta =>
  typeof delta.insert === 'string'
    ? delta.insert.length > 0
    : !!delta.insert,
);

export function imageBlockSnapshotToInlineParagraph(
  snapshot: IBlockSnapshot,
): IBlockSnapshot | null {
  if (
    snapshot.flavour !== 'image' ||
    snapshot.nodeType !== BlockNodeType.block
  ) {
    return null;
  }

  const image = createInlineImageDelta(
    snapshot.props['src'],
    snapshot.props['width'],
    snapshot.props['height'],
  );
  if (!image) return null;

  const caption = snapshot.children.find(child =>
    child.flavour === 'caption' &&
    child.nodeType === BlockNodeType.editable,
  );
  const captionDeltas: DeltaInsert[] = caption?.nodeType === BlockNodeType.editable
    ? caption.children.map(delta => ({
      ...delta,
      ...(delta.attributes ? {attributes: {...delta.attributes}} : {}),
    }))
    : [];
  const children: DeltaInsert[] = [image];

  if (hasCaptionContent(captionDeltas)) {
    children.push({insert: ' '}, ...captionDeltas);
  }

  return ParagraphBlockSchema.createSnapshot(children);
}
