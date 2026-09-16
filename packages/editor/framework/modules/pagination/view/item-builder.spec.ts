// packages/editor/framework/modules/pagination/view/item-builder.spec.ts
import {BlockNodeType} from "../../../block-std/types/block.type";
import {buildPaginationItems} from "./item-builder";
import {paginate} from "../engine";

describe('item-builder', () => {
  it('按 policy 装配，page-divider 标记 manualBreak', () => {
    const items = buildPaginationItems([
      {id: 'a', flavour: 'paragraph', nodeType: BlockNodeType.editable, isHeading: false, height: 100},
      {id: 'h', flavour: 'paragraph', nodeType: BlockNodeType.editable, isHeading: true, height: 40},
      {id: 'img', flavour: 'image', nodeType: BlockNodeType.void, isHeading: false, height: 300},
      {id: 'd', flavour: 'page-divider', nodeType: BlockNodeType.void, isHeading: false, height: 0},
    ]);
    expect(items).toEqual([
      {id: 'a', height: 100, breakable: true, keepWithNext: false, manualBreak: false},
      {id: 'h', height: 40, breakable: true, keepWithNext: false, manualBreak: false},
      {id: 'img', height: 300, breakable: false, keepWithNext: false, manualBreak: false},
      {id: 'd', height: 0, breakable: false, keepWithNext: false, manualBreak: true},
    ]);
  });

  it('excludes placement infrastructure while retaining empty authored blocks and page breaks', () => {
    const items = buildPaginationItems([
      {id: 'body', flavour: 'paragraph', nodeType: BlockNodeType.editable, isHeading: false, height: 95},
      {id: 'empty', flavour: 'paragraph', nodeType: BlockNodeType.editable, isHeading: false, height: 0},
      {id: 'divider', flavour: 'page-divider', nodeType: BlockNodeType.void, isHeading: false, height: 0},
      {id: 'plane', flavour: 'placement-layout', nodeType: BlockNodeType.block, isHeading: false, height: 72},
    ]);
    expect(items.map(item => item.id)).toEqual(['body', 'empty', 'divider']);
    const result = paginate(items, {contentHeight: 100});
    expect(result.pages.length).toBe(1);
    expect(result.pages[0].slots.map(slot => slot.id)).toEqual(['body', 'empty']);
    expect(result.byBlock.has('plane')).toBeFalse();
  });

  it('空输入返回空', () => {
    expect(buildPaginationItems([])).toEqual([]);
  });
});
