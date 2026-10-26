// packages/editor/framework/modules/pagination/engine/engine.integration.spec.ts
import {BlockNodeType} from "../../../block-std/types/block.type";
import {isManualBreak, paginate, PaginationItem, resolveBlockPolicy, resolveGeometry} from "./index";

describe('pagination engine 集成', () => {
  it('由 policy + geometry 装配 item 并分页（含 page-divider 手动分页）', () => {
    const raw = [
      {id: 'a', flavour: 'paragraph', nodeType: BlockNodeType.editable, isHeading: false, height: 100},
      {id: 'd', flavour: 'page-divider', nodeType: BlockNodeType.void, isHeading: false, height: 0},
      {id: 'b', flavour: 'paragraph', nodeType: BlockNodeType.editable, isHeading: false, height: 100},
    ];

    const items: PaginationItem[] = raw.map(r => ({
      id: r.id,
      height: r.height,
      ...resolveBlockPolicy({flavour: r.flavour, nodeType: r.nodeType, isHeading: r.isHeading}),
      manualBreak: isManualBreak(r.flavour),
    }));

    const geometry = resolveGeometry({
      pageHeightPx: 1000,
      margins: {top: 50, right: 0, bottom: 50, left: 0},
    });
    // contentHeight = 1000 - 50 - 50 = 900

    const result = paginate(items, geometry);
    expect(result.pages.map(p => p.slots.map(s => s.id))).toEqual([['a'], ['b']]);
  });
});
