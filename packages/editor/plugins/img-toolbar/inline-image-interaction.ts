import {ImageBlockSchema} from '../../blocks/image-block';
import {
  BlockNodeType,
  DeltaInsert,
  DeltaInsertEmbed,
  DeltaOperation,
  generateId,
  IBlockSnapshot,
  InlineImageData,
  InlineImageWrapOptions,
  InlineImageWrapSide,
  normalizeInlineImageWrapOptions,
  readInlineImageDelta,
} from '../../framework';
import {
  InlineFloatGeometry,
  resolveInlineFloatGeometry,
} from '../../framework/block-std/inline/runtime/inline-float-layout';
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

/**
 * Resolves the exact embed delta at a model offset. Drag-and-drop uses this
 * instead of rebuilding the image payload so custom embed attributes survive
 * an anchor move unchanged.
 */
export function resolveInlineImageDeltaAtOffset(
  deltas: DeltaInsert[],
  offset: number,
  expectedSrc?: string,
): DeltaInsertEmbed | null {
  if (!Number.isInteger(offset) || offset < 0) return null;

  let currentOffset = 0;
  for (const delta of deltas) {
    if (currentOffset === offset && typeof delta.insert === 'object') {
      const image = readInlineImageDelta(delta as DeltaInsertEmbed);
      if (!image.src || (expectedSrc !== undefined && image.src !== expectedSrc)) {
        return null;
      }
      return {
        insert: {...delta.insert},
        ...(delta.attributes ? {attributes: {...delta.attributes}} : {}),
      } as DeltaInsertEmbed;
    }
    currentOffset += deltaLength(delta);
    if (currentOffset > offset) return null;
  }
  return null;
}

export interface InlineImageAnchorMoveInput {
  sourceBlockId: string
  sourceOffset: number
  sourceLength: number
  targetBlockId: string
  targetOffset: number
  targetLength: number
  delta: DeltaInsertEmbed
  normalizedX: number
}

export type InlineImageAnchorMovePlan =
  | {kind: 'noop'}
  | {kind: 'format'; sourceOperations: DeltaOperation[]}
  | {kind: 'same-block'; sourceOperations: DeltaOperation[]}
  | {
    kind: 'cross-block'
    sourceOperations: DeltaOperation[]
    targetOperations: DeltaOperation[]
  };

const retain = (length: number): DeltaOperation[] =>
  length > 0 ? [{retain: length}] : [];

/**
 * Builds the minimal Y.Text deltas for moving one embed anchor. Target offsets
 * are measured before deletion, so forward moves in the same block compensate
 * for the removed embed.
 */
export function planInlineImageAnchorMove(
  input: InlineImageAnchorMoveInput,
): InlineImageAnchorMovePlan {
  if (
    !Number.isInteger(input.sourceOffset) ||
    input.sourceOffset < 0 ||
    input.sourceOffset >= input.sourceLength
  ) {
    return {kind: 'noop'};
  }

  const targetOffset = Math.max(
    0,
    Math.min(Math.trunc(input.targetOffset), input.targetLength),
  );
  const attributes = {
    ...(input.delta.attributes ?? {}),
    x: input.normalizedX,
  };
  const movedDelta: DeltaOperation = {
    insert: {...input.delta.insert},
    attributes,
  };

  if (input.sourceBlockId !== input.targetBlockId) {
    return {
      kind: 'cross-block',
      sourceOperations: [
        ...retain(input.sourceOffset),
        {delete: 1},
      ],
      targetOperations: [
        ...retain(targetOffset),
        movedDelta,
      ],
    };
  }

  const insertOffset = targetOffset > input.sourceOffset
    ? targetOffset - 1
    : targetOffset;
  if (insertOffset === input.sourceOffset) {
    const oldX = input.delta.attributes?.['x'];
    if (
      typeof oldX === 'number' &&
      Math.abs(oldX - input.normalizedX) < 0.000001
    ) {
      return {kind: 'noop'};
    }
    return {
      kind: 'format',
      sourceOperations: [
        ...retain(input.sourceOffset),
        {retain: 1, attributes: {x: input.normalizedX}},
      ],
    };
  }

  if (insertOffset < input.sourceOffset) {
    return {
      kind: 'same-block',
      sourceOperations: [
        ...retain(insertOffset),
        movedDelta,
        ...retain(input.sourceOffset - insertOffset),
        {delete: 1},
      ],
    };
  }

  return {
    kind: 'same-block',
    sourceOperations: [
      ...retain(input.sourceOffset),
      {delete: 1},
      ...retain(insertOffset - input.sourceOffset),
      movedDelta,
    ],
  };
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

export interface InlineImageWrapAttributes {
  wrap: true
  side: InlineImageWrapSide
  x: number
  gap?: number
}

export function enableInlineImageWrap(
  current: Partial<InlineImageData>,
  defaults: Partial<InlineImageWrapOptions> = {},
): InlineImageWrapAttributes {
  const normalized = normalizeInlineImageWrapOptions({
    wrap: true,
    side: current.side ?? defaults.side,
    x: current.x ?? defaults.x,
    gap: current.gap ?? defaults.gap,
  });
  return normalized as InlineImageWrapAttributes;
}

export function disableInlineImageWrap(): {
  wrap: null
  side: null
  x: null
  gap: null
} {
  return {
    wrap: null,
    side: null,
    x: null,
    gap: null,
  };
}

export interface InlineImageDragPreviewInput {
  containerWidth: number
  imageWidth: number
  imageHeight: number
  imageX: number
  side?: InlineImageWrapSide
  gap?: number
}

export interface InlineImageDragPreview {
  geometry: InlineFloatGeometry
  attributes: InlineImageWrapAttributes
}

export function resolveInlineImageDragPreview(
  input: InlineImageDragPreviewInput,
): InlineImageDragPreview {
  const requestedX =
    input.containerWidth > 0
      ? input.imageX / input.containerWidth
      : 0;
  const geometry = resolveInlineFloatGeometry({
    containerWidth: input.containerWidth,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    x: requestedX,
    side: input.side,
    gap: input.gap,
  });
  return {
    geometry,
    attributes: enableInlineImageWrap({
      wrap: true,
      side: input.side,
      x: geometry.normalizedX,
      gap: input.gap,
    }),
  };
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
