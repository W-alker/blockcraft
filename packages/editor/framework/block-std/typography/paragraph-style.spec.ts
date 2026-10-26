import {normalizeParagraphTextDefaults, resolveNextParagraphStyle} from './paragraph-style';
import {editableBlockCreateSnapShotFn} from '../schema/block-schema';
import {native2YBlock, yBlock2Native} from '../reactive';
import * as Y from 'yjs';

describe('段落格式领域规则', () => {
  it('只保留字符外观，不传播链接、修订和业务数据', () => {
    expect(normalizeParagraphTextDefaults({
      't:px': 24, 't:ff': 'times', 'a:bold': true, 'a:italic': false,
      'a:link': 'https://example.com', 'd:revision': 'r', business: 'x', 't:fs': -1,
    })).toEqual({'t:px': 24, 't:ff': 'times', 'a:bold': true});
    expect(normalizeParagraphTextDefaults(null)).toEqual({});
  });

  it('正文和列表续用样式，但下一项清除编号起点及完成状态', () => {
    const props = {depth: 2, pfs: 1.5, lh: 2, psb: 6, psa: 12, checked: true, order: 4, start: 4};
    for (const flavour of ['paragraph', 'bullet', 'ordered', 'todo']) {
      expect(resolveNextParagraphStyle(flavour, props, true)).toEqual({
        flavour, props: {depth: 2, pfs: 1.5, lh: 2, psb: 6, psa: 12}, continueTextFormat: true,
      });
    }
  });

  it('标题和引用段尾回到正文，段中拆分保留样式，并允许明确覆盖', () => {
    for (const [flavour, props] of [['paragraph', {depth: 0, heading: 1}], ['blockquote', {depth: 0}]] as const) {
      expect(resolveNextParagraphStyle(flavour, props, true)).toEqual({flavour: 'paragraph', props: {depth: 0}, continueTextFormat: false});
      expect(resolveNextParagraphStyle(flavour, props, false)).toEqual({flavour, props, continueTextFormat: true});
      expect(resolveNextParagraphStyle(flavour, {...props, nextParagraphStyle: 'same'}, true).continueTextFormat).toBeTrue();
    }
    expect(resolveNextParagraphStyle('custom', {depth: 0, nextParagraphStyle: 'body'}, true).flavour).toBe('custom');
  });

  it('段落快照和 Yjs 重开保留排版、字符默认值及下一段策略', () => {
    const create = editableBlockCreateSnapShotFn('paragraph');
    const props = {depth: 1, fs: 20, pfs: 1.5, lh: 2, psb: 6, psa: 12, backColor: '#eeeeee', borderColor: '#333333',
      textDefaults: {'t:ff': 'times', 'a:bold': true}, nextParagraphStyle: 'same'};
    const snapshot = create([], props);
    expect(snapshot.props).toEqual(props);
    const original = new Y.Doc();
    original.getMap('blocks').set(snapshot.id, native2YBlock(snapshot as never));
    const reopened = new Y.Doc();
    Y.applyUpdate(reopened, Y.encodeStateAsUpdate(original));
    expect(yBlock2Native(reopened.getMap('blocks').get(snapshot.id) as any).props).toEqual(props);
    original.destroy(); reopened.destroy();
  });
});
