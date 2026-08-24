import { TestBed } from "@angular/core/testing";
import {
  normalizeWordArtProps,
  type WordArtBlockProps,
} from "../../blocks/word-art-block";
import {
  WordArtToolbarComponent,
  type WordArtToolbarAction,
} from "./word-art-toolbar.component";

describe("WordArtToolbarComponent", () => {
  function createBlock(
    props: Partial<WordArtBlockProps> = {},
    mode: "relative" | "absolute" = "relative",
    grouped = false,
  ) {
    return {
      wordArtProps: normalizeWordArtProps(props),
      doc: {
        placement: {
          getObjectLayout: () => mode === "absolute" ? "over" : "top-bottom",
          getState: () => ({ mode }),
          canMoveForward: () => false,
          canMoveBackward: () => false,
          isInObjectGroup: () => grouped,
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

  it("switches one click-owned secondary panel without writing document data", () => {
    const component = new WordArtToolbarComponent({} as any);
    component.wordArtBlock = createBlock();
    const panels: Array<string | null> = [];
    const actions: WordArtToolbarAction[] = [];
    component.panelChange.subscribe((panel) => panels.push(panel));
    component.action.subscribe((action) => actions.push(action));

    component.togglePanel("layout");
    component.togglePanel("format");
    component.togglePanel("format");

    expect(panels).toEqual(["layout", "format", null]);
    expect(component.activePanel).toBeNull();
    expect(actions).toEqual([]);
  });

  it("renders a compact rail and the click-owned format sections", async () => {
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
    const rail = host.querySelector<HTMLElement>(".word-art-toolbar__rail")!;
    const panelButtons = rail.querySelectorAll<HTMLButtonElement>(
      "button[aria-controls]",
    );

    expect(host.querySelector("select")).toBeNull();
    expect(Array.from(panelButtons).map((button) => button.ariaLabel)).toEqual([
      "布局选项",
      "艺术字格式",
    ]);
    expect(rail.querySelector('[aria-label="布局选项"] .bc_buju')).not.toBeNull();
    expect(
      rail.querySelector('[aria-label="艺术字格式"] .bc_yishuzishengcheng'),
    ).not.toBeNull();
    expect(host.querySelector("#bc-word-art-format-panel")).toBeNull();

    panelButtons[1]!.click();
    fixture.detectChanges();
    const formatPanel = host.querySelector<HTMLElement>(
      "#bc-word-art-format-panel",
    )!;
    expect(formatPanel).not.toBeNull();
    expect(getComputedStyle(formatPanel).width).toBe("288px");
    expect(getComputedStyle(formatPanel).overflow).toBe("visible");
    expect(getComputedStyle(formatPanel).maxHeight).toBe("none");
    expect(
      host.querySelector('cs-select[aria-label="艺术字字体"]'),
    ).not.toBeNull();
    expect(
      host.querySelector("cs-input-number"),
    ).not.toBeNull();
    expect(
      host.querySelector('cs-segmented[csarialabel="艺术字水平对齐"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('cs-segmented[csarialabel="艺术字垂直对齐"]'),
    ).not.toBeNull();
    expect(host.querySelector("cs-slider")).not.toBeNull();
    expect(host.querySelector("bc-float-toolbar-item")).toBeNull();

    fixture.componentInstance.setFormatSection("fill");
    fixture.detectChanges();
    expect(
      host.querySelector('cs-segmented[csarialabel="艺术字填充类型"]'),
    ).not.toBeNull();
    expect(host.querySelector("cs-color-picker")).not.toBeNull();

    fixture.componentInstance.setFormatSection("effects");
    fixture.detectChanges();
    expect(
      host.querySelector('cs-select[aria-label="艺术字效果"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('.word-art-toolbar__label .bc_wenziyinying'),
    ).not.toBeNull();
    expect(host.querySelector("cs-switch")).not.toBeNull();

    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it("keeps layouts in a secondary card instead of the primary rail", async () => {
    await TestBed.configureTestingModule({
      imports: [WordArtToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(WordArtToolbarComponent);
    fixture.componentInstance.wordArtBlock = createBlock();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[aria-label="嵌入型"]')).toBeNull();
    host.querySelector<HTMLButtonElement>('[aria-label="布局选项"]')!.click();
    fixture.detectChanges();
    const layoutPanel = host.querySelector<HTMLElement>(
      "#bc-word-art-layout-panel",
    )!;
    expect(layoutPanel).not.toBeNull();
    expect(getComputedStyle(layoutPanel).width).toBe("288px");
    expect(host.querySelector('[aria-label="嵌入型"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="四周型环绕"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="删除艺术字"]')).not.toBeNull();

    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it("hides independent stack controls for grouped WordArt", async () => {
    await TestBed.configureTestingModule({
      imports: [WordArtToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(WordArtToolbarComponent);
    fixture.componentInstance.wordArtBlock = createBlock(
      {},
      "absolute",
      true,
    );
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[aria-label="布局选项"]')).toBeNull();
    expect(host.querySelector('[aria-label="上移一层"]')).toBeNull();
    expect(host.querySelector('[aria-label="下移一层"]')).toBeNull();
    expect(host.querySelector('[aria-label="嵌入型"]')).toBeNull();
    expect(host.querySelector('[aria-label="上下型"]')).toBeNull();

    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it("emits typed updates from the CSES controls", () => {
    const component = new WordArtToolbarComponent({} as any);
    component.wordArtBlock = createBlock();
    const actions: WordArtToolbarAction[] = [];
    component.action.subscribe((action) => actions.push(action));

    component.setFillType("linear-gradient");
    component.setFontFamily("slab-serif");
    component.setEffect("slant-right");
    component.setHorizontalAlign("right");
    component.setVerticalAlign("bottom");

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
  });

  it("keeps CSES slider changes local until the interaction is committed", () => {
    const component = new WordArtToolbarComponent({} as any);
    component.wordArtBlock = createBlock({
      outlineWidthEm: 0.05,
      letterSpacingEm: 0.4,
    });
    const actions: WordArtToolbarAction[] = [];
    component.action.subscribe((action) => actions.push(action));

    component.draftOutlineWidth(0.1);
    component.draftLetterSpacing(0.6);
    expect(component.outlineWidthValue).toBe(0.1);
    expect(component.letterSpacingValue).toBe(0.6);
    expect(actions).toEqual([]);

    component.commitOutlineWidth();
    component.commitLetterSpacing();
    expect(actions).toEqual([
      {
        name: "update-props",
        value: { outlineWidthEm: 0.1 },
      },
      {
        name: "update-props",
        value: { letterSpacingEm: 0.6 },
      },
    ]);
  });
});
