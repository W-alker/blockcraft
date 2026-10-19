import {BlockNodeType, IBlockSnapshot} from '../../framework';
import {imageBlockSnapshotToInlineParagraph} from './inline-image-conversion';

const imageSnapshot = (
  src: unknown,
  children: IBlockSnapshot[] = [],
): IBlockSnapshot => ({
  id: 'image-1',
  flavour: 'image',
  nodeType: BlockNodeType.block,
  props: {src: src as any, width: 320, height: 180, align: 'center'},
  meta: {},
  children,
});

describe('imageBlockSnapshotToInlineParagraph', () => {
  it('preserves image data and formatted caption deltas', () => {
    const caption: IBlockSnapshot = {
      id: 'caption-1',
      flavour: 'caption',
      nodeType: BlockNodeType.editable,
      props: {depth: 0, textAlign: 'center'},
      meta: {},
      children: [{insert: '说明', attributes: {'a:bold': true}}],
    };

    const paragraph = imageBlockSnapshotToInlineParagraph(imageSnapshot(
      'https://cdn.example.com/a.png',
      [caption],
    ))!;

    expect(paragraph.flavour).toBe('paragraph');
    expect(paragraph.children).toEqual([
      {
        insert: {image: 'https://cdn.example.com/a.png'},
        attributes: {width: 320, height: 180},
      },
      {insert: ' '},
      {insert: '说明', attributes: {'a:bold': true}},
    ]);
    expect(paragraph.props['textAlign']).toBeUndefined();
  });

  it('creates an embed-only paragraph without caption', () => {
    expect(imageBlockSnapshotToInlineParagraph(
      imageSnapshot('https://cdn.example.com/a.png'),
    )!.children).toEqual([
      {
        insert: {image: 'https://cdn.example.com/a.png'},
        attributes: {width: 320, height: 180},
      },
    ]);
  });

  it('creates a square-wrapped inline image when wrap options are supplied', () => {
    expect(imageBlockSnapshotToInlineParagraph(
      imageSnapshot('https://cdn.example.com/wrapped.png'),
      {wrap: true, side: 'auto', x: 0.36, gap: 12},
    )!.children).toEqual([
      {
        insert: {image: 'https://cdn.example.com/wrapped.png'},
        attributes: {
          width: 320,
          height: 180,
          wrap: true,
          side: 'auto',
          x: 0.36,
          gap: 12,
        },
      },
    ]);
  });

  it('rejects empty src and non-image snapshots', () => {
    expect(imageBlockSnapshotToInlineParagraph(imageSnapshot(''))).toBeNull();
    expect(imageBlockSnapshotToInlineParagraph({
      ...imageSnapshot('https://cdn.example.com/a.png'),
      flavour: 'paragraph',
    })).toBeNull();
  });
});
