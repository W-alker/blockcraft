import { TestBed } from "@angular/core/testing";
import {
  BcFloatToolbarItemComponent,
  BcOverlayTriggerDirective,
} from "../../components";
import {
  normalizeWordArtProps,
  type WordArtBlockProps,
} from "../../blocks/word-art-block";
import {
  WordArtToolbarComponent,
  type WordArtToolbarAction,
} from "./word-art-toolbar.component";

describe("WordArtToolbarComponent", () => {
  function createBlock(props: Partial<WordArtBlockProps> = {}) {
    return {
      wordArtProps: normalizeWordArtProps(props),
      doc: {
        placement: {
          getObjectLayout: () => "top-bottom",
          getState: () => ({ mode: "relative" }),
          canMoveForward: () => false,
          canMoveBackward: () => false,
        },
      },
    } as any;
  }

  it("offers inline and square-wrap layouts", () => {
    const component = new WordArtToolbarComponent({} as any);
    component.wordArtBlock = createBlock();
    expect(component.layoutOptions.map((item) => item.value)).toEqual([
      "inline",
      "wrap",
      "top-bottom",
      "under",
      "over",
    ]);
  });

  it("exposes local font and style menus with the semantic shadow icon", async () => {
    await TestBed.configureTestingModule({
      imports: [WordArtToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(WordArtToolbarComponent);
    fixture.componentInstance.wordArtBlock = createBlock({
      horizontalAlign: "left",
      verticalAlign: "middle",
    });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector("select")).toBeNull();
    expect(
      host.querySelectorAll(
        "bc-float-toolbar-item.word-art-toolbar__menu-trigger",
      ).length,
    ).toBe(5);
    expect(
      host.querySelector('bc-float-toolbar-item[aria-label="艺术字预设"]'),
    ).toBeNull();
    expect(
      host.querySelector('bc-float-toolbar-item[aria-label="艺术字字体"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('input[type="number"][min="8"][max="512"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('bc-float-toolbar-item[aria-label="艺术字填充类型"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('bc-float-toolbar-item[aria-label="艺术字效果"]'),
    ).not.toBeNull();
    expect(
      host.querySelector(
        'bc-float-toolbar-item[aria-label="水平对齐"] .bc_zuoduiqi',
      ),
    ).not.toBeNull();
    expect(
      host.querySelector(
        'bc-float-toolbar-item[aria-label="垂直对齐"] .bc_juzhongduiqi1',
      ),
    ).not.toBeNull();
    expect(
      host.querySelector('button[aria-label="投影"] .bc_wenziyinying'),
    ).not.toBeNull();

    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it("keeps special settings and object actions in two fixed rows", async () => {
    await TestBed.configureTestingModule({
      imports: [WordArtToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(WordArtToolbarComponent);
    fixture.componentInstance.wordArtBlock = createBlock();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const toolbar = host.querySelector<HTMLElement>(".word-art-toolbar")!;
    const rows = toolbar.querySelectorAll<HTMLElement>(
      ":scope > .word-art-toolbar__row",
    );

    expect(rows.length).toBe(2);
    expect(getComputedStyle(toolbar).flexDirection).toBe("column");
    expect(getComputedStyle(rows[0]).flexWrap).toBe("nowrap");
    expect(getComputedStyle(rows[1]).flexWrap).toBe("nowrap");
    expect(
      rows[0].classList.contains("word-art-toolbar__row--special-settings"),
    ).toBeTrue();
    expect(rows[0].querySelector('[aria-label="艺术字效果"]')).not.toBeNull();
    expect(rows[0].querySelector('[aria-label="水平对齐"]')).toBeNull();
    expect(
      rows[1].classList.contains("word-art-toolbar__row--object-actions"),
    ).toBeTrue();
    expect(rows[1].firstElementChild?.getAttribute("aria-label")).toBe(
      "水平对齐",
    );
    expect(rows[1].lastElementChild?.getAttribute("aria-label")).toBe(
      "删除艺术字",
    );

    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it("emits typed updates and closes every overlay menu", () => {
    const component = new WordArtToolbarComponent({} as any);
    component.wordArtBlock = createBlock();
    const actions: WordArtToolbarAction[] = [];
    component.action.subscribe((action) => actions.push(action));
    const trigger = jasmine.createSpyObj<BcOverlayTriggerDirective>(
      "BcOverlayTriggerDirective",
      ["closePanel"],
    );

    component.selectFillType(
      { value: "linear-gradient" } as BcFloatToolbarItemComponent,
      trigger,
    );
    component.selectFontFamily(
      { value: "slab-serif" } as BcFloatToolbarItemComponent,
      trigger,
    );
    component.selectEffect(
      { value: "slant-right" } as BcFloatToolbarItemComponent,
      trigger,
    );
    component.selectHorizontalAlign(
      { value: "right" } as BcFloatToolbarItemComponent,
      trigger,
    );
    component.selectVerticalAlign(
      { value: "bottom" } as BcFloatToolbarItemComponent,
      trigger,
    );

    expect(actions[0]).toEqual({
      name: "update-props",
      value: { fillType: "linear-gradient" },
    });
    expect(actions[1]).toEqual({
      name: "update-props",
      value: { fontFamily: "slab-serif" },
    });
    expect(actions[2]).toEqual({
      name: "update-props",
      value: { effect: "slant-right" },
    });
    expect(actions[3]).toEqual({
      name: "update-props",
      value: { horizontalAlign: "right" },
    });
    expect(actions[4]).toEqual({
      name: "update-props",
      value: { verticalAlign: "bottom" },
    });
    expect(trigger.closePanel).toHaveBeenCalledTimes(5);
  });

  it("matches the shape toolbar range progress without persisting on input", async () => {
    await TestBed.configureTestingModule({
      imports: [WordArtToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(WordArtToolbarComponent);
    fixture.componentInstance.wordArtBlock = createBlock({
      outlineWidthEm: 0.05,
      letterSpacingEm: 0.4,
    });
    const actions: WordArtToolbarAction[] = [];
    fixture.componentInstance.action.subscribe((action) =>
      actions.push(action),
    );
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const outline = host.querySelector<HTMLInputElement>(
      'input[type="range"][aria-label="描边粗细"]',
    )!;
    const spacing = host.querySelector<HTMLInputElement>(
      'input[type="range"][aria-label="字间距"]',
    )!;

    expect(outline.style.getPropertyValue("--word-art-range-progress")).toBe(
      "25%",
    );
    expect(
      Number.parseFloat(
        spacing.style.getPropertyValue("--word-art-range-progress"),
      ),
    ).toBeCloseTo(50, 8);

    outline.value = "0.1";
    outline.dispatchEvent(new Event("input"));
    expect(outline.style.getPropertyValue("--word-art-range-progress")).toBe(
      "50%",
    );
    expect(actions).toEqual([]);

    outline.dispatchEvent(new Event("change"));
    expect(actions).toEqual([
      {
        name: "update-props",
        value: { outlineWidthEm: 0.1 },
      },
    ]);

    fixture.destroy();
    TestBed.resetTestingModule();
  });
});
