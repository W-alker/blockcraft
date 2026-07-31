import {
  BlockNodeType,
  DeltaInsert,
  DeltaInsertEmbed,
  IBlockSnapshot,
} from '../../framework';
import {
  calculateInlineImageSize,
  disableInlineImageWrap,
  enableInlineImageWrap,
  inlineImageSnapshotToBlockSnapshots,
  planInlineImageAnchorMove,
  resolveInlineImageDragPreview,
  resolveInlineImageDeltaAtOffset,
  resolveInlineImageAtOffset,
} from './inline-image-interaction';

const mixedDeltas = (): DeltaInsert[] => [
  {insert: '前', attributes: {'a:bold': true}},
  {
    insert: {image: 'https://cdn.example.com/a.png'},
    attributes: {width: 120, height: 60},
  },
  {insert: '后', attributes: {'s:color': 'red'}},
];

const paragraphSnapshot = (children = mixedDeltas()): IBlockSnapshot => ({
  id: 'paragraph-1',
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable,
  props: {depth: 2, textAlign: 'center'},
  meta: {},
  children,
});

describe('inline image interaction helpers', () => {
  it('resolves an image embed at an exact model offset', () => {
    expect(resolveInlineImageAtOffset(mixedDeltas(), 1, 'https://cdn.example.com/a.png')).toEqual({
      src: 'https://cdn.example.com/a.png',
      width: 120,
      height: 60,
    });
    expect(resolveInlineImageAtOffset(mixedDeltas(), 0)).toBeNull();
    expect(resolveInlineImageAtOffset(mixedDeltas(), 1, 'stale.png')).toBeNull();
  });

  it('clones the exact image delta so custom payload and attributes survive moves', () => {
    const imageDelta: DeltaInsertEmbed = {
      insert: {image: 'a.png', assetId: 'asset-1'},
      attributes: {width: 120, wrap: true, x: .2, custom: 'keep'},
    };
    const deltas: DeltaInsert[] = [imageDelta];
    const resolved = resolveInlineImageDeltaAtOffset(deltas, 0, 'a.png')!;

    expect(resolved).toEqual(imageDelta);
    expect(resolved).not.toBe(imageDelta);
    expect(resolved.insert).not.toBe(imageDelta.insert);
    expect(resolved.attributes).not.toBe(imageDelta.attributes);
  });

  it('plans same-block anchor moves with forward offset compensation', () => {
    const plan = planInlineImageAnchorMove({
      sourceBlockId: 'a',
      sourceOffset: 1,
      sourceLength: 6,
      targetBlockId: 'a',
      targetOffset: 5,
      targetLength: 6,
      delta: {
        insert: {image: 'a.png'},
        attributes: {width: 120, wrap: true, x: .2},
      },
      normalizedX: .6,
    });

    expect(plan).toEqual({
      kind: 'same-block',
      sourceOperations: [
        {retain: 1},
        {delete: 1},
        {retain: 3},
        {
          insert: {image: 'a.png'},
          attributes: {width: 120, wrap: true, x: .6},
        },
      ],
    });
  });

  it('plans a same-block backward anchor move before deleting the source', () => {
    const plan = planInlineImageAnchorMove({
      sourceBlockId: 'a',
      sourceOffset: 4,
      sourceLength: 7,
      targetBlockId: 'a',
      targetOffset: 1,
      targetLength: 7,
      delta: {
        insert: {image: 'a.png'},
        attributes: {wrap: true, x: .8},
      },
      normalizedX: .1,
    });

    expect(plan).toEqual({
      kind: 'same-block',
      sourceOperations: [
        {retain: 1},
        {
          insert: {image: 'a.png'},
          attributes: {wrap: true, x: .1},
        },
        {retain: 3},
        {delete: 1},
      ],
    });
  });

  it('plans an atomic cross-block delete and insert without losing metadata', () => {
    const plan = planInlineImageAnchorMove({
      sourceBlockId: 'a',
      sourceOffset: 2,
      sourceLength: 5,
      targetBlockId: 'b',
      targetOffset: 3,
      targetLength: 7,
      delta: {
        insert: {image: 'a.png', assetId: 'asset-1'},
        attributes: {height: 60, side: 'auto', custom: true},
      },
      normalizedX: .4,
    });

    expect(plan).toEqual({
      kind: 'cross-block',
      sourceOperations: [{retain: 2}, {delete: 1}],
      targetOperations: [
        {retain: 3},
        {
          insert: {image: 'a.png', assetId: 'asset-1'},
          attributes: {height: 60, side: 'auto', custom: true, x: .4},
        },
      ],
    });
  });

  it('keeps the aspect ratio and uses natural or rendered fallbacks', () => {
    expect(calculateInlineImageSize(240, {src: 'a', width: 120, height: 60})).toEqual({
      width: 240,
      height: 120,
    });
    expect(calculateInlineImageSize(300, {src: 'a'}, {
      naturalWidth: 600,
      naturalHeight: 400,
      renderedWidth: 150,
      renderedHeight: 100,
    })).toEqual({width: 300, height: 200});
    expect(calculateInlineImageSize(90, {src: 'a'}, {
      renderedWidth: 180,
      renderedHeight: 120,
    })).toEqual({width: 90, height: 60});
  });

  it('enables and disables square wrapping without touching image size', () => {
    expect(enableInlineImageWrap({
      src: 'a.png',
      width: 120,
      height: 60,
    })).toEqual({
      wrap: true,
      side: 'auto',
      x: 0,
    });
    expect(enableInlineImageWrap({
      src: 'a.png',
      width: 120,
      height: 60,
      wrap: true,
      side: 'left',
      x: .4,
      gap: 0,
    })).toEqual({
      wrap: true,
      side: 'left',
      x: .4,
      gap: 0,
    });
    expect(disableInlineImageWrap()).toEqual({
      wrap: null,
      side: null,
      x: null,
      gap: null,
    });
  });

  it('turns pointer-space image coordinates into a clamped wrap preview', () => {
    const preview = resolveInlineImageDragPreview({
      containerWidth: 600,
      imageWidth: 180,
      imageHeight: 108,
      imageX: 420,
      side: 'auto',
      gap: 12,
    });

    expect(preview.geometry.resolvedTextSide).toBe('left');
    expect(preview.attributes).toEqual({
      wrap: true,
      side: 'auto',
      x: .7,
      gap: 12,
    });

    const clamped = resolveInlineImageDragPreview({
      containerWidth: 600,
      imageWidth: 180,
      imageHeight: 108,
      imageX: -100,
      side: 'right',
      gap: 12,
    });
    expect(clamped.geometry.imageX).toBe(0);
    expect(clamped.attributes.x).toBe(0);
  });

  it('splits formatted text around the image and preserves block props', () => {
    const result = inlineImageSnapshotToBlockSnapshots(paragraphSnapshot(), 1)!;

    expect(result.snapshots.map(snapshot => snapshot.flavour)).toEqual([
      'paragraph',
      'image',
      'paragraph',
    ]);
    expect(result.snapshots[0].children).toEqual([
      {insert: '前', attributes: {'a:bold': true}},
    ]);
    expect(result.snapshots[0].props).toEqual({depth: 2, textAlign: 'center'});
    expect(result.image.props).toEqual({
      src: 'https://cdn.example.com/a.png',
      width: 120,
      height: 60,
    });
    expect(result.snapshots[2].children).toEqual([
      {insert: '后', attributes: {'s:color': 'red'}},
    ]);
  });

  it('drops wrap-only attributes when converting to an image block', () => {
    const wrapped = mixedDeltas();
    wrapped[1] = {
      ...wrapped[1],
      attributes: {
        ...wrapped[1].attributes,
        wrap: true,
        side: 'left',
        x: .4,
        gap: 12,
      },
    };
    const result = inlineImageSnapshotToBlockSnapshots(
      paragraphSnapshot(wrapped),
      1,
    )!;

    expect(result.image.props).toEqual({
      src: 'https://cdn.example.com/a.png',
      width: 120,
      height: 60,
    });
  });

  it('omits empty text sides and supports an image-only paragraph', () => {
    const image = mixedDeltas()[1];
    const result = inlineImageSnapshotToBlockSnapshots(paragraphSnapshot([image]), 0)!;

    expect(result.snapshots).toEqual([result.image]);
    expect(result.image.flavour).toBe('image');
  });

  it('rejects stale offsets, empty image sources, and non-editable snapshots', () => {
    expect(inlineImageSnapshotToBlockSnapshots(paragraphSnapshot(), 0)).toBeNull();
    expect(inlineImageSnapshotToBlockSnapshots(paragraphSnapshot([
      {insert: {image: ''}},
    ]), 0)).toBeNull();
    expect(inlineImageSnapshotToBlockSnapshots({
      ...paragraphSnapshot(),
      nodeType: BlockNodeType.block,
      children: [],
    } as IBlockSnapshot, 1)).toBeNull();
  });
});
