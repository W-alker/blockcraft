// 同一函数、类、静态状态必须经旧路径与领域路径共享，不能产生双份实现。
import * as legacy0 from './_dnd-geometry';
import * as owner0 from '../modules/drag-drop/_dnd-geometry';
import * as legacy1 from './adapter.service';
import * as owner1 from '../host/adapter.service';
import * as legacy2 from './block-creator.service';
import * as owner2 from '../host/block-creator.service';
import * as legacy3 from './block-fullscreen-controller';
import * as owner3 from '../doc/view/block-fullscreen-controller';
import * as legacy4 from './block-object-format.manager';
import * as owner4 from '../modules/object/block-object-format.manager';
import * as legacy5 from './block-object-sizing.manager';
import * as owner5 from '../modules/object/block-object-sizing.manager';
import * as legacy6 from './block-placement/alignment.coordinator';
import * as owner6 from '../modules/object/block-placement/alignment.coordinator';
import * as legacy7 from './block-placement/delete-command';
import * as owner7 from '../modules/object/block-placement/delete-command';
import * as legacy8 from './block-placement/duplicate-command';
import * as owner8 from '../modules/object/block-placement/duplicate-command';
import * as legacy9 from './block-placement/flow.coordinator';
import * as owner9 from '../modules/object/block-placement/flow.coordinator';
import * as legacy10 from './block-placement/geometry';
import * as owner10 from '../modules/object/block-placement/geometry';
import * as legacy11 from './block-placement/group.coordinator';
import * as owner11 from '../modules/object/block-placement/group.coordinator';
import * as legacy12 from './block-placement/interaction.controller';
import * as owner12 from '../modules/object/block-placement/interaction.controller';
import * as legacy13 from './block-placement/object-geometry';
import * as owner13 from '../modules/object/block-placement/object-geometry';
import * as legacy14 from './block-placement/page-surface';
import * as owner14 from '../modules/object/block-placement/page-surface';
import * as legacy15 from './block-placement/root-layout.coordinator';
import * as owner15 from '../modules/object/block-placement/root-layout.coordinator';
import * as legacy16 from './block-placement/runtime';
import * as owner16 from '../modules/object/block-placement/runtime';
import * as legacy17 from './block-placement/stack.coordinator';
import * as owner17 from '../modules/object/block-placement/stack.coordinator';
import * as legacy18 from './block-placement/state';
import * as owner18 from '../modules/object/block-placement/state';
import * as legacy19 from './block-placement/surface.controller';
import * as owner19 from '../modules/object/block-placement/surface.controller';
import * as legacy20 from './block-placement/types';
import * as owner20 from '../modules/object/block-placement/types';
import * as legacy21 from './block-placement.manager';
import * as owner21 from '../modules/object/block-placement.manager';
import * as legacy22 from './dnd.service';
import * as owner22 from '../modules/drag-drop/dnd.service';
import * as legacy23 from './document-layout-metrics.manager';
import * as owner23 from '../doc/view/document-layout-metrics.manager';
import * as legacy24 from './document-view-scale.manager';
import * as owner24 from '../doc/view/document-view-scale.manager';
import * as legacy25 from './file.service';
import * as owner25 from '../host/file.service';
import * as legacy26 from './internal-drag.controller';
import * as owner26 from '../modules/drag-drop/internal-drag.controller';
import * as legacy27 from './message.service';
import * as owner27 from '../host/message.service';
import * as legacy28 from './overlay.service';
import * as owner28 from '../angular/overlay.service';

describe('领域迁移兼容入口', () => {
  it('./_dnd-geometry 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy0).sort()).toEqual(Object.keys(owner0).sort());
    for (const key of Object.keys(legacy0)) {
      expect((legacy0 as Record<string, unknown>)[key]).toBe((owner0 as Record<string, unknown>)[key]);
    }
  });
  it('./adapter.service 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy1).sort()).toEqual(Object.keys(owner1).sort());
    for (const key of Object.keys(legacy1)) {
      expect((legacy1 as Record<string, unknown>)[key]).toBe((owner1 as Record<string, unknown>)[key]);
    }
  });
  it('./block-creator.service 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy2).sort()).toEqual(Object.keys(owner2).sort());
    for (const key of Object.keys(legacy2)) {
      expect((legacy2 as Record<string, unknown>)[key]).toBe((owner2 as Record<string, unknown>)[key]);
    }
  });
  it('./block-fullscreen-controller 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy3).sort()).toEqual(Object.keys(owner3).sort());
    for (const key of Object.keys(legacy3)) {
      expect((legacy3 as Record<string, unknown>)[key]).toBe((owner3 as Record<string, unknown>)[key]);
    }
  });
  it('./block-object-format.manager 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy4).sort()).toEqual(Object.keys(owner4).sort());
    for (const key of Object.keys(legacy4)) {
      expect((legacy4 as Record<string, unknown>)[key]).toBe((owner4 as Record<string, unknown>)[key]);
    }
  });
  it('./block-object-sizing.manager 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy5).sort()).toEqual(Object.keys(owner5).sort());
    for (const key of Object.keys(legacy5)) {
      expect((legacy5 as Record<string, unknown>)[key]).toBe((owner5 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/alignment.coordinator 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy6).sort()).toEqual(Object.keys(owner6).sort());
    for (const key of Object.keys(legacy6)) {
      expect((legacy6 as Record<string, unknown>)[key]).toBe((owner6 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/delete-command 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy7).sort()).toEqual(Object.keys(owner7).sort());
    for (const key of Object.keys(legacy7)) {
      expect((legacy7 as Record<string, unknown>)[key]).toBe((owner7 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/duplicate-command 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy8).sort()).toEqual(Object.keys(owner8).sort());
    for (const key of Object.keys(legacy8)) {
      expect((legacy8 as Record<string, unknown>)[key]).toBe((owner8 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/flow.coordinator 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy9).sort()).toEqual(Object.keys(owner9).sort());
    for (const key of Object.keys(legacy9)) {
      expect((legacy9 as Record<string, unknown>)[key]).toBe((owner9 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/geometry 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy10).sort()).toEqual(Object.keys(owner10).sort());
    for (const key of Object.keys(legacy10)) {
      expect((legacy10 as Record<string, unknown>)[key]).toBe((owner10 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/group.coordinator 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy11).sort()).toEqual(Object.keys(owner11).sort());
    for (const key of Object.keys(legacy11)) {
      expect((legacy11 as Record<string, unknown>)[key]).toBe((owner11 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/interaction.controller 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy12).sort()).toEqual(Object.keys(owner12).sort());
    for (const key of Object.keys(legacy12)) {
      expect((legacy12 as Record<string, unknown>)[key]).toBe((owner12 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/object-geometry 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy13).sort()).toEqual(Object.keys(owner13).sort());
    for (const key of Object.keys(legacy13)) {
      expect((legacy13 as Record<string, unknown>)[key]).toBe((owner13 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/page-surface 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy14).sort()).toEqual(Object.keys(owner14).sort());
    for (const key of Object.keys(legacy14)) {
      expect((legacy14 as Record<string, unknown>)[key]).toBe((owner14 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/root-layout.coordinator 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy15).sort()).toEqual(Object.keys(owner15).sort());
    for (const key of Object.keys(legacy15)) {
      expect((legacy15 as Record<string, unknown>)[key]).toBe((owner15 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/runtime 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy16).sort()).toEqual(Object.keys(owner16).sort());
    for (const key of Object.keys(legacy16)) {
      expect((legacy16 as Record<string, unknown>)[key]).toBe((owner16 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/stack.coordinator 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy17).sort()).toEqual(Object.keys(owner17).sort());
    for (const key of Object.keys(legacy17)) {
      expect((legacy17 as Record<string, unknown>)[key]).toBe((owner17 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/state 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy18).sort()).toEqual(Object.keys(owner18).sort());
    for (const key of Object.keys(legacy18)) {
      expect((legacy18 as Record<string, unknown>)[key]).toBe((owner18 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/surface.controller 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy19).sort()).toEqual(Object.keys(owner19).sort());
    for (const key of Object.keys(legacy19)) {
      expect((legacy19 as Record<string, unknown>)[key]).toBe((owner19 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement/types 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy20).sort()).toEqual(Object.keys(owner20).sort());
    for (const key of Object.keys(legacy20)) {
      expect((legacy20 as Record<string, unknown>)[key]).toBe((owner20 as Record<string, unknown>)[key]);
    }
  });
  it('./block-placement.manager 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy21).sort()).toEqual(Object.keys(owner21).sort());
    for (const key of Object.keys(legacy21)) {
      expect((legacy21 as Record<string, unknown>)[key]).toBe((owner21 as Record<string, unknown>)[key]);
    }
  });
  it('./dnd.service 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy22).sort()).toEqual(Object.keys(owner22).sort());
    for (const key of Object.keys(legacy22)) {
      expect((legacy22 as Record<string, unknown>)[key]).toBe((owner22 as Record<string, unknown>)[key]);
    }
  });
  it('./document-layout-metrics.manager 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy23).sort()).toEqual(Object.keys(owner23).sort());
    for (const key of Object.keys(legacy23)) {
      expect((legacy23 as Record<string, unknown>)[key]).toBe((owner23 as Record<string, unknown>)[key]);
    }
  });
  it('./document-view-scale.manager 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy24).sort()).toEqual(Object.keys(owner24).sort());
    for (const key of Object.keys(legacy24)) {
      expect((legacy24 as Record<string, unknown>)[key]).toBe((owner24 as Record<string, unknown>)[key]);
    }
  });
  it('./file.service 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy25).sort()).toEqual(Object.keys(owner25).sort());
    for (const key of Object.keys(legacy25)) {
      expect((legacy25 as Record<string, unknown>)[key]).toBe((owner25 as Record<string, unknown>)[key]);
    }
  });
  it('./internal-drag.controller 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy26).sort()).toEqual(Object.keys(owner26).sort());
    for (const key of Object.keys(legacy26)) {
      expect((legacy26 as Record<string, unknown>)[key]).toBe((owner26 as Record<string, unknown>)[key]);
    }
  });
  it('./message.service 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy27).sort()).toEqual(Object.keys(owner27).sort());
    for (const key of Object.keys(legacy27)) {
      expect((legacy27 as Record<string, unknown>)[key]).toBe((owner27 as Record<string, unknown>)[key]);
    }
  });
  it('./overlay.service 保持所有运行时导出的身份', () => {
    expect(Object.keys(legacy28).sort()).toEqual(Object.keys(owner28).sort());
    for (const key of Object.keys(legacy28)) {
      expect((legacy28 as Record<string, unknown>)[key]).toBe((owner28 as Record<string, unknown>)[key]);
    }
  });
});
