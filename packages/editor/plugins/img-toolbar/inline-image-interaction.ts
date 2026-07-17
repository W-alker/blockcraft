import {ImageBlockSchema} from '../../blocks/image-block';
import {
  BlockNodeType,
  DeltaInsert,
  DeltaInsertEmbed,
  generateId,
  IBlockSnapshot,
  InlineImageData,
  readInlineImageDelta,
} from '../../framework';
import {sliceDelta} from '../../global';

const deltaLength = (delta: DeltaInsert) =>
  typeof delta.insert === 'string' ? delta.insert.length : 1;

const cloneDeltas = (deltas: DeltaInsert[]): DeltaInsert[] => deltas.map(delta => ({
  ...delta,
  ...(delta.attributes ? {attributes: {...delta.attributes}} : {}),
  ...(typeof delta.insert === 'object' ? {insert: {...delta.insert}} : {}),
}));

const positiveNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;

export function resolveInlineImageAtOffset(
  deltas: DeltaInsert[],
  offset: number,
  expectedSrc?: string,
): InlineImageData | null {
  if (!Number.isInteger(offset) || offset < 0) return null;

  let currentOffset = 0;
  for (const delta of deltas) {
    if (currentOffset === offset && typeof delta.insert === 'object') {
      const image = readInlineImageDelta(delta as DeltaInsertEmbed);
      if (!image.src || (expectedSrc !== undefined && image.src !== expectedSrc)) {
        return null;
      }
      return image;
    }
    currentOffset += deltaLength(delta);
    if (currentOffset > offset) return null;
  }
  return null;
}

export function calculateInlineImageSize(
  nextWidth: number,
  current: Partial<InlineImageData>,
  fallback: {
    naturalWidth?: number;
    naturalHeight?: number;
    renderedWidth?: number;
    renderedHeight?: number;
  } = {},
): {width: number; height: number} {
  const width = Math.max(1, Math.round(nextWidth));
  const pairs = [
    [positiveNumber(current.width), positiveNumber(current.height)],
    [positiveNumber(fallback.naturalWidth), positiveNumber(fallback.naturalHeight)],
    [positiveNumber(fallback.renderedWidth), positiveNumber(fallback.renderedHeight)],
  ] as const;
  const ratio = pairs.find(([pairWidth, pairHeight]) => pairWidth && pairHeight);
  const height = ratio
    ? Math.max(1, Math.round(width * ratio[1]! / ratio[0]!))
    : Math.max(1, Math.round(positiveNumber(fallback.renderedHeight) ?? width));

  return {width, height};
}

export function inlineImageSnapshotToBlockSnapshots(
  snapshot: IBlockSnapshot,
  offset: number,
): {snapshots: IBlockSnapshot[]; image: IBlockSnapshot} | null {
  if (snapshot.nodeType !== BlockNodeType.editable) return null;

  const deltas = snapshot.children as DeltaInsert[];
  const data = resolveInlineImageAtOffset(deltas, offset);
  if (!data) return null;

  const image = ImageBlockSchema.createSnapshot(
    data.src,
    data.width,
    data.height,
  );
  const before = cloneDeltas(sliceDelta(deltas, 0, offset));
  const after = cloneDeltas(sliceDelta(deltas, offset + 1));
  const snapshots: IBlockSnapshot[] = [];
  const createTextSide = (children: DeltaInsert[]): IBlockSnapshot => ({
    ...snapshot,
    id: generateId(),
    meta: {...snapshot.meta},
    props: {...snapshot.props},
    nodeType: BlockNodeType.editable,
    children,
  });

  if (before.length) snapshots.push(createTextSide(before));
  snapshots.push(image);
  if (after.length) snapshots.push(createTextSide(after));

  return {snapshots, image};
}
