import {BlockNodeType, DeltaInsert, IBlockSnapshot} from '../../framework';
import {
  calculateInlineImageSize,
  inlineImageSnapshotToBlockSnapshots,
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
  meta: {readonly: false},
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
