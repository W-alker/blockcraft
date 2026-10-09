import {BlockNodeType, type DeltaInsert} from '../../model';
import type {IBlockSnapshot} from '../../block-std/types/block.type';
import {sanitizePasteDeltas, sanitizePasteSnapshot, sanitizePasteText} from './paste-text-safety';

const marks = (count: number) => '\u0300'.repeat(count);

describe('paste text normalization', () => {
  it('keeps eight marks and removes a complete run of nine, retaining base characters', () => {
    expect(sanitizePasteText('我' + marks(8) + '你' + marks(9) + '。')).toBe('我' + marks(8) + '你。');
  });

  it('keeps ordinary scripts, accents, emoji, line breaks and invisible formatting', () => {
    const text = 'cafe\u0301 ไทย हिन्दी العربية 中文 👨‍👩‍👧‍👦\u200c\n第二行';
    expect(sanitizePasteText(text)).toBe(text);
  });

  it('counts supplementary-plane marks as code points', () => {
    const mark = '\u{1d185}';
    expect(sanitizePasteText('a' + mark.repeat(8) + 'b' + mark.repeat(9))).toBe('a' + mark.repeat(8) + 'b');
  });

  it('recognizes a run split across formatting and retains remaining attributes', () => {
    const deltas: DeltaInsert[] = [
      {insert: '我' + marks(5), attributes: {'a:bold': true}},
      {insert: marks(4), attributes: {'a:italic': true}},
      {insert: '你', attributes: {'s:color': '#345678'}}
    ];
    const before = JSON.stringify(deltas);
    expect(sanitizePasteDeltas(deltas)).toEqual([
      {insert: '我', attributes: {'a:bold': true}},
      deltas[2]
    ]);
    expect(JSON.stringify(deltas)).toBe(before);
  });

  it('handles several disjoint runs spanning three inserts without losing intervening text', () => {
    const deltas = [{insert: 'a' + marks(4)}, {insert: marks(5) + 'b' + marks(12)}, {insert: 'c' + marks(3)}];
    expect(sanitizePasteDeltas(deltas)).toEqual([{insert: 'a'}, {insert: 'b'}, {insert: 'c' + marks(3)}]);
  });

  it('allows a supplementary mark to straddle a UTF-16 formatting boundary', () => {
    const run = '\u{1d185}'.repeat(9);
    expect(sanitizePasteDeltas([{insert: 'a' + run.slice(0, 3)}, {insert: run.slice(3) + 'b'}]))
      .toEqual([{insert: 'a'}, {insert: 'b'}]);
  });

  it('treats embeds as boundaries and leaves their payload and attributes intact', () => {
    const embed: DeltaInsert = {insert: {icon: 'bc_icon'}, attributes: {'a:bold': true}};
    const deltas = [{insert: 'a' + marks(5)}, embed, {insert: marks(4) + 'b'}];
    expect(sanitizePasteDeltas(deltas)).toBe(deltas);
  });

  it('returns the original delta array when no normalization is needed', () => {
    const deltas = [{insert: 'normal'}, {insert: 'cafe\u0301', attributes: {'a:bold': true}}];
    expect(sanitizePasteDeltas(deltas)).toBe(deltas);
  });

  it('normalizes nested editable children without rewriting block properties or metadata', () => {
    const paragraph: IBlockSnapshot = {id: 'p', flavour: 'paragraph', nodeType: BlockNodeType.editable,
      props: {}, meta: {}, children: [{insert: '我' + marks(9)}]};
    const container: IBlockSnapshot = {id: 'box', flavour: 'text-box', nodeType: BlockNodeType.block,
      props: {title: marks(9)}, meta: {plh: marks(9)}, children: [paragraph]};
    sanitizePasteSnapshot(container);
    expect(paragraph.children).toEqual([{insert: '我'}]);
    expect(container.props['title']).toBe(marks(9));
    expect(container.meta['plh']).toBe(marks(9));
  });

  it('does not merge mark runs across separate blocks', () => {
    const children = [5, 4].map((count, i) => ({id: String(i), flavour: 'paragraph', nodeType: BlockNodeType.editable,
      props: {}, meta: {}, children: [{insert: marks(count)}]} as IBlockSnapshot));
    const snapshot: IBlockSnapshot = {id: 'root', flavour: 'root', nodeType: BlockNodeType.root,
      props: {}, meta: {}, children};
    const before = JSON.stringify(snapshot);
    sanitizePasteSnapshot(snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
