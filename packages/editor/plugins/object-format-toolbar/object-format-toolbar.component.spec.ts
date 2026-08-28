import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import {
  CsColorPickerComponent,
  CsInputNumberComponent,
  CsSelectComponent,
  CsSliderComponent,
  CsSwitchComponent,
} from "@cses/ui";
import {
  DEFAULT_OBJECT_EFFECTS,
  DEFAULT_OBJECT_LINE,
  DEFAULT_OBJECT_PAINT,
  DEFAULT_OBJECT_TEXT_FRAME,
  DEFAULT_OBJECT_TEXT_STYLE,
  createObjectPaint,
  type BlockObjectFormatSelectionState,
  type ObjectFormatPatch,
  type ObjectPaint,
} from "../../framework";
import { ObjectFormatToolbarComponent } from "./object-format-toolbar.component";

const format = {
  width: 240,
  height: 120,
  rotation: 0,
  lockAspectRatio: false,
  shapeType: "rectangle",
  shapeFill: { ...DEFAULT_OBJECT_PAINT },
  shapeOutline: { ...DEFAULT_OBJECT_LINE },
  shapeEffects: {
    shadow: { ...DEFAULT_OBJECT_EFFECTS.shadow },
    glow: { ...DEFAULT_OBJECT_EFFECTS.glow },
  },
  textFrame: {
    ...DEFAULT_OBJECT_TEXT_FRAME,
    margins: [8, 8, 8, 8] as [number, number, number, number],
  },
  textStyle: {
    ...DEFAULT_OBJECT_TEXT_STYLE,
    fill: { ...DEFAULT_OBJECT_TEXT_STYLE.fill },
    outline: { ...DEFAULT_OBJECT_TEXT_STYLE.outline },
    effects: {
      shadow: { ...DEFAULT_OBJECT_TEXT_STYLE.effects.shadow },
      glow: { ...DEFAULT_OBJECT_TEXT_STYLE.effects.glow },
    },
  },
};

const state: BlockObjectFormatSelectionState = {
  blockIds: ["shape-1", "shape-2"],
  targets: [
    {
      blockId: "shape-1",
      flavour: "shape",
      capability: {
        kind: "shape",
        features: {
          geometry: true,
          shape: true,
          pictureFill: true,
          lineArrows: true,
          textFrame: true,
          textStyle: "rich-default",
        },
        defaults: format,
        shapeTypes: ["rectangle", "ellipse"],
      },
      format,
      shapeTypes: ["rectangle", "ellipse"],
      readonly: false,
    },
  ],
  features: {
    geometry: true,
    shape: true,
    pictureFill: true,
    lineArrows: true,
    textFrame: true,
    textStyle: "rich-default",
  },
  shapeTypes: ["rectangle", "ellipse"],
  values: {
    width: { mixed: true, value: undefined },
    height: { mixed: false, value: 120 },
    rotation: { mixed: false, value: 0 },
    lockAspectRatio: { mixed: false, value: false },
    shapeType: { mixed: false, value: "rectangle" },
    shapeFill: { mixed: false, value: format.shapeFill },
    shapeOutline: { mixed: false, value: format.shapeOutline },
    shapeEffects: { mixed: false, value: format.shapeEffects },
    textFrame: { mixed: false, value: format.textFrame },
    textStyle: { mixed: false, value: format.textStyle },
  },
  readonlyCount: 1,
};

describe("ObjectFormatToolbarComponent", () => {
  it("keeps one panel shell and one scroll owner while switching Word-style groups", async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectFormatToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ObjectFormatToolbarComponent);
    fixture.componentRef.setInput("state", state);
    fixture.componentRef.setInput("side", "left");
    fixture.componentRef.setInput("activeLayout", "under");
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(".object-format--left"),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(".object-format__panel"),
    ).toBeNull();

    expect(
      fixture.nativeElement.querySelector('[aria-label="大小与属性"]'),
    ).toBeNull();

    fixture.componentInstance.open("shape");
    fixture.componentInstance.cdr.markForCheck();
    fixture.detectChanges();
    const shell = fixture.nativeElement.querySelector(".object-format__panel");
    expect(shell.querySelector("header")).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain("设置形状格式");
    expect(fixture.nativeElement.textContent).not.toContain(
      "填充、轮廓与更多选项",
    );
    expect(
      fixture.nativeElement.querySelectorAll(".object-format__scroll").length,
    ).toBe(1);
    expect(fixture.nativeElement.textContent).toContain("1 个锁定对象会被跳过");
    expect(fixture.nativeElement.textContent).toContain("更改形状");
    expect(sectionElement(fixture, "shape-type").hidden).toBeTrue();
    expect(sectionElement(fixture, "shape-fill").hidden).toBeFalse();
    expect(sectionElement(fixture, "shape-outline").hidden).toBeTrue();
    expect(sectionElement(fixture, "shape-effects").hidden).toBeTrue();
    expect(sectionBody(fixture, "shape-fill")).not.toBeNull();
    expect(sectionBody(fixture, "shape-outline")).not.toBeNull();
    expect(sectionBody(fixture, "shape-effects")).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(CsSelectComponent)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(CsColorPickerComponent)),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector("bc-shape-fill-panel"),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(CsSliderComponent)),
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.directive(CsSwitchComponent)),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector("button[cs-button]"),
    ).not.toBeNull();

    fixture.componentInstance.selectShapeSection("shape-type");
    fixture.detectChanges();
    expect(sectionElement(fixture, "shape-type").hidden).toBeFalse();
    expect(sectionElement(fixture, "shape-fill").hidden).toBeTrue();

    fixture.componentInstance.open("text");
    fixture.componentInstance.cdr.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector(".object-format__panel")).toBe(
      shell,
    );
    expect(
      fixture.nativeElement.querySelectorAll(".object-format__scroll").length,
    ).toBe(1);
    expect(sectionBody(fixture, "text-frame")).not.toBeNull();
    const marginLabels: NodeListOf<HTMLElement> =
      fixture.nativeElement.querySelectorAll(
        ".object-format__margin-grid > label",
      );
    expect(marginLabels.length).toBe(4);
    expect(
      Array.from(marginLabels).every((label) =>
        label.querySelector(".object-format__margin-input"),
      ),
    ).toBeTrue();
    expect(sectionElement(fixture, "text-frame").hidden).toBeFalse();
    expect(sectionElement(fixture, "text-typography").hidden).toBeTrue();
    expect(sectionElement(fixture, "text-effects").hidden).toBeTrue();
    fixture.componentInstance.selectTextSection("text-typography");
    fixture.detectChanges();
    const fontSelect = fixture.nativeElement.querySelector(
      '[data-object-format-section="text-typography"] cs-select',
    );
    expect(fontSelect).not.toBeNull();
    expect(sectionElement(fixture, "text-frame").hidden).toBeTrue();
    expect(sectionElement(fixture, "text-typography").hidden).toBeFalse();
    expect(fixture.nativeElement.textContent).not.toContain("框内换行");
    expect(fixture.nativeElement.textContent).not.toContain("文字随对象旋转");
    expect(fixture.nativeElement.textContent).not.toContain("随文字增高");
    expect(fixture.nativeElement.textContent).not.toContain("重置");
  });

  it("keeps outline controls inside a vertical-only scroll owner", async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectFormatToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ObjectFormatToolbarComponent);
    fixture.componentRef.setInput("state", state);
    fixture.componentInstance.activePanel = "shape";
    fixture.detectChanges();
    fixture.componentInstance.selectShapeSection("shape-outline");
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const scroll = host.querySelector<HTMLElement>(".object-format__scroll")!;
    const slider = sectionElement(
      fixture,
      "shape-outline",
    ).querySelector<HTMLElement>("cs-slider")!;
    const scrollStyle = getComputedStyle(scroll);
    const sliderStyle = getComputedStyle(slider);

    expect(scrollStyle.overflowX).toBe("hidden");
    expect(scrollStyle.overflowY).toBe("auto");
    expect(parseFloat(sliderStyle.marginLeft)).toBeGreaterThan(0);
    expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);
  });

  it("keeps hierarchy available while limiting object arrangement to multi-selection", async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectFormatToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ObjectFormatToolbarComponent);
    fixture.componentRef.setInput("state", { ...state, blockIds: ["shape-1"] });
    fixture.componentInstance.activePanel = "layout";
    fixture.componentRef.setInput("activeLayout", "under");
    fixture.detectChanges();
    const compactPanel = fixture.nativeElement.querySelector(
      ".object-format__panel--compact",
    );
    expect(compactPanel).not.toBeNull();
    const activeLayout = fixture.nativeElement.querySelector(
      '.object-format__icon-action[aria-label="衬于文字下方"]',
    );
    expect(activeLayout.classList.contains("active")).toBeTrue();
    expect(activeLayout.getAttribute("aria-pressed")).toBe("true");
    const activeLayoutLabel = (
      activeLayout as HTMLElement
    ).querySelector<HTMLElement>("span")!;
    expect(activeLayoutLabel.textContent?.trim()).toBe("衬于文字下方");
    expect(getComputedStyle(activeLayout).flexDirection).toBe("column");
    expect(activeLayoutLabel.clientHeight).toBeGreaterThan(0);
    expect(
      fixture.nativeElement.querySelector(
        '[data-object-format-section="multi-object"]',
      ),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-object-format-section="hierarchy"]',
      ),
    ).not.toBeNull();
    expect(
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
          ".object-format__icon-action span",
        ),
      ).every((label) => label.clientHeight > 0),
    ).toBeTrue();

    fixture.componentRef.setInput("state", state);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(
        '[data-object-format-section="multi-object"]',
      ),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-object-format-section="hierarchy"]',
      ),
    ).not.toBeNull();
  });

  it("hides absolute-only arrangement tools for inline and top-bottom layout", async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectFormatToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ObjectFormatToolbarComponent);
    fixture.componentRef.setInput("state", { ...state, blockIds: ["shape-1"] });
    fixture.componentInstance.activePanel = "layout";

    for (const layout of ["inline", "top-bottom"] as const) {
      fixture.componentRef.setInput("activeLayout", layout);
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('section[aria-label="页面对齐"]'),
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector(
          '[data-object-format-section="hierarchy"]',
        ),
      ).toBeNull();
    }

    fixture.componentRef.setInput("activeLayout", "over");
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('section[aria-label="页面对齐"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-object-format-section="hierarchy"]',
      ),
    ).not.toBeNull();
  });

  it("fills the layout row while hiding unsupported inline layout", async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectFormatToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ObjectFormatToolbarComponent);
    fixture.componentRef.setInput("state", {
      ...state,
      blockIds: ["text-box-1"],
    });
    fixture.componentRef.setInput("supportedLayouts", [
      "top-bottom",
      "under",
      "over",
    ]);
    fixture.componentInstance.activePanel = "layout";
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[aria-label="嵌入型"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[aria-label="上下型"]'),
    ).not.toBeNull();
    const layoutGrid = fixture.nativeElement.querySelector(
      ".object-format__icon-grid--4",
    );
    expect(
      getComputedStyle(layoutGrid).gridTemplateColumns.split(" ").length,
    ).toBe(3);
  });

  it("emits preview while a CSES slider moves and one model patch on commit", async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectFormatToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ObjectFormatToolbarComponent);
    fixture.componentRef.setInput("state", state);
    fixture.componentInstance.activePanel = "shape";
    const actions: string[] = [];
    fixture.componentInstance.action.subscribe((action) =>
      actions.push(action.name),
    );
    fixture.detectChanges();

    fixture.componentInstance.fillOpacityValue(40);
    expect(actions).toEqual(["preview"]);
    fixture.componentInstance.commitSlider("shape-fill-opacity");
    expect(actions).toEqual(["preview", "patch"]);
  });

  it("connects the expanded CSES controls to canonical section patches", async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectFormatToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ObjectFormatToolbarComponent);
    fixture.componentRef.setInput("state", state);
    const patches: ObjectFormatPatch[] = [];
    fixture.componentInstance.action.subscribe((action) => {
      if (action.name === "patch") patches.push(action.patch);
    });
    fixture.detectChanges();

    const gradient = createObjectPaint("linear-gradient");
    gradient.stops[1] = { ...gradient.stops[1]!, offset: 0.58 };
    fixture.componentInstance.paintChangeValue("shape", gradient);
    fixture.componentInstance.dashChangeValue("dash-dot");
    fixture.componentInstance.marginChangeValue(0, 18);
    fixture.componentInstance.textFontFamilyChangeValue(
      fixture.componentInstance.fontOptions[0].value,
    );
    fixture.componentInstance.transformChangeValue("arch-up");

    expect(patches.length).toBe(5);
    expect((patches[0]["shapeFill"] as typeof gradient).stops[1]?.offset).toBe(
      0.58,
    );
    expect((patches[1]["shapeOutline"] as { dash: string }).dash).toBe(
      "dash-dot",
    );
    expect((patches[2]["textFrame"] as { margins: number[] }).margins[0]).toBe(
      18,
    );
    expect((patches[3]["textStyle"] as { fontFamily: string }).fontFamily).toBe(
      fixture.componentInstance.fontOptions[0].value,
    );
    expect((patches[4]["textStyle"] as { transform: string }).transform).toBe(
      "arch-up",
    );
  });

  it("reveals picture configuration only after a user source exists", async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectFormatToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ObjectFormatToolbarComponent);
    const emptyPicture = createObjectPaint("picture");
    fixture.componentRef.setInput("state", stateWithShapeFill(emptyPicture));
    fixture.componentInstance.activePanel = "shape";
    fixture.detectChanges();

    const fillSection = sectionElement(fixture, "shape-fill");
    const urlInput =
      fillSection.querySelector<HTMLInputElement>('input[type="url"]');
    expect(urlInput?.value).toBe("");
    expect(
      fillSection.querySelector('[data-object-format-picture-config="shape"]'),
    ).toBeNull();
    expect(
      fixture.componentInstance.showsPaintOpacity(emptyPicture),
    ).toBeFalse();

    const userFill = {
      ...emptyPicture,
      src: "https://cdn.example.com/fill.png",
    };
    fixture.componentRef.setInput("state", stateWithShapeFill(userFill));
    fixture.detectChanges();

    expect(
      fillSection.querySelector('[data-object-format-picture-config="shape"]'),
    ).not.toBeNull();
    expect(urlInput?.value).toBe("https://cdn.example.com/fill.png");
    expect(fixture.componentInstance.showsPaintOpacity(userFill)).toBeTrue();
  });

  it("previews batched effects and writes only after explicit confirmation", async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectFormatToolbarComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ObjectFormatToolbarComponent);
    fixture.componentRef.setInput("state", state);
    const actions: Array<{ name: string; patch?: ObjectFormatPatch }> = [];
    fixture.componentInstance.action.subscribe((action) =>
      actions.push(action),
    );
    fixture.detectChanges();

    fixture.componentInstance.effectEnabledValue("shadow", true);
    fixture.componentInstance.shadowNumberValue("blur", 18);
    fixture.componentInstance.effectEnabledValue("glow", true);
    fixture.componentInstance.glowNumberValue(12);

    expect(actions.every((action) => action.name === "preview")).toBeTrue();
    expect(actions.some((action) => action.name === "patch")).toBeFalse();
    fixture.componentInstance.applyShapeEffects();
    const patches = actions.filter((action) => action.name === "patch");
    expect(patches.length).toBe(1);
    expect(patches[0]?.patch?.shapeEffects?.shadow.blur).toBe(18);
    expect(patches[0]?.patch?.shapeEffects?.glow.radius).toBe(12);

    fixture.componentInstance.textEffectEnabledValue("shadow", true);
    fixture.componentInstance.textEffectOpacityValue("shadow", 35);
    fixture.componentInstance.cancelTextEffects();
    expect(actions.at(-1)?.name).toBe("restore-preview");
  });
});

function stateWithShapeFill(
  shapeFill: ObjectPaint,
): BlockObjectFormatSelectionState {
  const targetFormat = { ...format, shapeFill };
  return {
    ...state,
    targets: state.targets.map((target) => ({
      ...target,
      format: targetFormat,
    })),
    values: {
      ...state.values,
      shapeFill: { mixed: false, value: shapeFill },
    },
  };
}

function sectionBody(
  fixture: { nativeElement: HTMLElement },
  section: string,
): Element | null {
  return fixture.nativeElement.querySelector(
    `[data-object-format-section="${section}"] > .object-format__section-body`,
  );
}

function sectionElement(
  fixture: { nativeElement: HTMLElement },
  section: string,
): HTMLElement {
  return fixture.nativeElement.querySelector(
    `[data-object-format-section="${section}"]`,
  )!;
}
