import {BlockNodeType, type IBlockSnapshot} from '../block-std';
import {snapshots2Text} from './snapshot';

describe('snapshots2Text block formatting', () => {
  const block = (flavour = 'paragraph', props: Record<string, any> = {}, text = '正文'): IBlockSnapshot => ({
    id: 'text', flavour: flavour as any, nodeType: BlockNodeType.editable,
    props, meta: {}, children: [{insert: text}],
  });

  it('preserves indentation, saved order and marker style without mutating snapshots', () => {
    const snapshots = [block('paragraph', {depth: 2}), block('ordered', {order: 4}),
      block('ordered', {depth: 1, order: 1}), block('ordered', {order: 2, ms: 'c1'}),
      block('ordered', {start: 6}), block('ordered', {depth: 2, order: 3, ms: 'r2'})];
    const before = JSON.stringify(snapshots);
    const expected = '\t\t正文\n5. 正文\n\tb. 正文\n三、 正文\n6. 正文\n\t\tIV. 正文\n';
    expect(snapshots2Text(snapshots)).toBe(expected);
    expect(snapshots2Text(snapshots)).toBe(expected);
    expect(JSON.stringify(snapshots)).toBe(before);
  });

  it('keeps the unformatted extraction available to revision content', () => {
    expect(snapshots2Text([block('ordered', {depth: 3, order: 8})], {includeBlockFormatting: false})).toBe('正文\n');
  });

  it('does not inherit table/container indentation into editable descendants', () => {
    const table: IBlockSnapshot = {id: 'table', flavour: 'table', nodeType: BlockNodeType.block,
      props: {depth: 3}, meta: {}, children: [block(), block('ordered', {order: 1})]};
    expect(snapshots2Text([table])).toBe('正文\n2. 正文\n');
  });

  it('preserves literal tabs and line breaks in content', () => {
    expect(snapshots2Text([block('code', {depth: 1}, '\tfirst\n\tsecond')])).toBe('\t\tfirst\n\tsecond\n');
  });

  it('handles invalid and extreme depth/order with bounded output', () => {
    expect(snapshots2Text([block('ordered', {depth: -1, order: Infinity})])).toBe('1. 正文\n');
    expect(snapshots2Text([block('paragraph', {depth: 1e9})]).length).toBe(103);
    expect(snapshots2Text([block('ordered', {depth: 2, order: 1e9})])).toBe('\t\t1000000001. 正文\n');
  });
});
