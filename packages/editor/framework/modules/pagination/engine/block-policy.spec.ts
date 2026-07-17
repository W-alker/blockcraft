// packages/editor/framework/modules/pagination/engine/block-policy.spec.ts
import {BlockNodeType} from "../../../block-std/types/block.type";
import {isManualBreak, resolveBlockPolicy} from "./block-policy";

describe('block-policy', () => {
  it('void 块原子不可拆、超高锁高（capHeight）', () => {
    expect(resolveBlockPolicy({flavour: 'image', nodeType: BlockNodeType.void}))
      .toEqual({breakable: false, keepWithNext: false, capHeight: true});
  });

  it('带 caption 子块的图片仍按原子块锁高', () => {
    expect(resolveBlockPolicy({flavour: 'image', nodeType: BlockNodeType.block}))
      .toEqual({breakable: false, keepWithNext: false, capHeight: true});
  });

  it('代码块不按行拆、超高锁高（capHeight）', () => {
    expect(resolveBlockPolicy({flavour: 'code', nodeType: BlockNodeType.editable}))
      .toEqual({breakable: false, keepWithNext: false, capHeight: true});
  });

  it('普通段落可按行拆、不 keepWithNext、不锁高', () => {
    expect(resolveBlockPolicy({flavour: 'paragraph', nodeType: BlockNodeType.editable}))
      .toEqual({breakable: true, keepWithNext: false, capHeight: false});
  });

  it('标题段落 keepWithNext', () => {
    expect(resolveBlockPolicy({flavour: 'paragraph', nodeType: BlockNodeType.editable, isHeading: true}))
      .toEqual({breakable: true, keepWithNext: true, capHeight: false});
  });

  it('表格可按行拆、不锁高', () => {
    expect(resolveBlockPolicy({flavour: 'table', nodeType: BlockNodeType.block}))
      .toEqual({breakable: true, keepWithNext: false, capHeight: false});
  });

  it('callout / columns 保持整体不可拆', () => {
    expect(resolveBlockPolicy({flavour: 'callout', nodeType: BlockNodeType.block}).breakable).toBe(false);
    expect(resolveBlockPolicy({flavour: 'columns', nodeType: BlockNodeType.block}).breakable).toBe(false);
  });

  it('未知 editable 默认可拆，未知 block 默认不可拆', () => {
    expect(resolveBlockPolicy({flavour: 'x', nodeType: BlockNodeType.editable}).breakable).toBe(true);
    expect(resolveBlockPolicy({flavour: 'y', nodeType: BlockNodeType.block}).breakable).toBe(false);
  });

  it('isManualBreak 识别 page-divider', () => {
    expect(isManualBreak('page-divider')).toBe(true);
    expect(isManualBreak('paragraph')).toBe(false);
  });
});
