import { TestBed } from "@angular/core/testing";
import {
  TEXT_BOX_PRESETS,
  TEXT_BOX_PRESET_CATEGORIES,
  getTextBoxPreset,
  getTextBoxPresetsFor,
  normalizeTextBoxProps,
  type TextBoxPresetId,
} from "../../blocks/text-box-block";
import { TextBoxPresetPickerComponent } from "./text-box-preset-picker";

describe("TextBoxPresetPickerComponent", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("renders the active tab as shape-backed visual choices", async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent);
    fixture.componentRef.setInput("current", "office-simple");
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const items = host.querySelectorAll<HTMLButtonElement>("[data-preset-id]");
    const office = getTextBoxPresetsFor("h", "office");

    // The grid is one tab, not the whole catalog.
    expect(items.length).toBe(office.length);
    expect(items.length).toBeLessThan(TEXT_BOX_PRESETS.length);
    expect(
      host
        .querySelector('[data-preset-id="office-simple"]')
        ?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(host.textContent).toContain("基础文本框");
  });

  it("switches the grid when another shape tab is chosen", async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const bubbleTab = Array.from(
      host.querySelectorAll<HTMLElement>(".cs-tabs-tab"),
    ).find((tab) => tab.textContent?.trim() === "气泡")!;

    // Full pointer sequence, not a bare click: the tab strip suppresses
    // mousedown to hold the editor's selection, and that must not swallow the
    // click that actually switches tabs.
    bubbleTab.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    bubbleTab.click();
    fixture.detectChanges();

    const ids = Array.from(
      host.querySelectorAll<HTMLElement>("[data-preset-id]"),
    ).map((item) => item.dataset["presetId"]!);
    expect(ids).toEqual(
      getTextBoxPresetsFor("h", "bubble").map((item) => item.id),
    );
  });

  it("offers all ten semantic categories including vertical styles", async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const tabLabels = Array.from(
      host.querySelectorAll<HTMLElement>(".cs-tabs-tab"),
    ).map((tab) => tab.textContent!.trim());

    // Vertical is a semantic category with purpose-built tall presets, not a
    // duplicate direction switch applied to every horizontal style.
    expect(tabLabels).toEqual(
      TEXT_BOX_PRESET_CATEGORIES.map((category) => category.label),
    );
    expect(tabLabels).toEqual([
      "办公经典",
      "引言",
      "侧边栏",
      "杂志",
      "异形",
      "气泡",
      "纸张",
      "文化风格",
      "材质效果",
      "竖排",
    ]);
  });

  it("scrolls only the tab strip and lets the style content expand", async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const picker = host.querySelector<HTMLElement>(".text-box-preset-picker")!;
    const nav = host.querySelector<HTMLElement>(".cs-tabs-nav")!;

    expect(getComputedStyle(picker).overflow).toBe("visible");
    expect(getComputedStyle(picker).maxHeight).toBe("none");
    expect(getComputedStyle(nav).overflowX).toBe("auto");
    expect(getComputedStyle(nav).overflowY).toBe("hidden");
    expect(getComputedStyle(nav).scrollbarWidth).toBe("none");

    const before = nav.scrollLeft;
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    });
    nav.dispatchEvent(wheel);
    expect(nav.scrollWidth).toBeGreaterThan(nav.clientWidth);
    expect(nav.scrollLeft).toBeGreaterThan(before);
    expect(wheel.defaultPrevented).toBeTrue();
  });

  it("uses the new Word classic style as the unknown-id fallback", () => {
    const office = getTextBoxPresetsFor("h", "office");

    expect(office[0].id).toBe("office-simple");
    expect(normalizeTextBoxProps(office[0].props).fo).toBe(1);
    expect(getTextBoxPreset("no-such-preset").id).toBe("office-simple");
  });

  it("replaces the former catalog wholesale with 58 unique gallery styles", () => {
    const ids = TEXT_BOX_PRESETS.map((item) => String(item.id));

    expect(ids.length).toBe(58);
    expect(new Set(ids).size).toBe(58);
    for (const removed of [
      "classic",
      "no-fill",
      "outline-r-ink-swallow",
      "rect-r-notes-rule",
      "bubble-r-solid-gold",
    ]) {
      expect(ids).not.toContain(removed);
    }
  });

  it("uses Chinese labels for every visible category and preset", () => {
    const latin = /[A-Za-z]/;
    expect(
      TEXT_BOX_PRESET_CATEGORIES.every((item) => !latin.test(item.label)),
    ).toBeTrue();
    expect(TEXT_BOX_PRESETS.every((item) => !latin.test(item.label))).toBeTrue();
  });

  it("models bubbles as callout geometry and vertical labels as vertical frames", () => {
    const bubbles = getTextBoxPresetsFor("h", "bubble").map((preset) =>
      normalizeTextBoxProps(preset.props),
    );
    const vertical = getTextBoxPresetsFor("v", "vertical").map((preset) =>
      normalizeTextBoxProps(preset.props),
    );

    expect(bubbles.length).toBe(14);
    expect(bubbles.filter((props) => !!props.artwork).length).toBe(2);
    expect(
      bubbles.every(
        (props) =>
          !!props.artwork ||
          !!props.adjustments ||
          props.shapeType === "cloud-callout" ||
          props.shapeType === "explosion",
      ),
    ).toBeTrue();
    expect(
      normalizeTextBoxProps(getTextBoxPreset("bubble-top-left").props)
        .adjustments,
    ).toEqual({ tailX: 170, tailY: 0 });
    expect(
      normalizeTextBoxProps(getTextBoxPreset("bubble-side-right").props)
        .adjustments,
    ).toEqual({ tailX: 1000, tailY: 500 });
    expect(vertical.length).toBe(3);
    expect(
      vertical.every((props) => props.textFrame.direction === "vertical-rl"),
    ).toBeTrue();
  });

  it("renders the surface image for decorated entries", async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const officeTab = Array.from(
      host.querySelectorAll<HTMLElement>(".cs-tabs-tab"),
    ).find((tab) => tab.textContent?.trim() === "办公经典")!;

    officeTab.click();
    fixture.detectChanges();

    // Decorated entries zero out fill and stroke, so a shape-only thumbnail
    // would render blank.
    const images = host.querySelectorAll<HTMLImageElement>(
      ".text-box-preset-picker__bg",
    );
    const decoratedCount = getTextBoxPresetsFor("h", "office").filter(
      (item) => !!normalizeTextBoxProps(item.props).artwork,
    ).length;
    expect(images.length).toBe(decoratedCount);
    expect(
      Array.from(images).every((img) =>
        img.src.startsWith("data:image/svg+xml"),
      ),
    ).toBeTrue();
  });

  it("emits only the catalog id while the preset stores concrete props", async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent);
    const picked: TextBoxPresetId[] = [];
    fixture.componentInstance.pick.subscribe((value) => picked.push(value));
    fixture.detectChanges();
    const button = (
      fixture.nativeElement as HTMLElement
    ).querySelector<HTMLButtonElement>('[data-preset-id="office-simple"]')!;

    button.click();

    expect(picked).toEqual(["office-simple"]);
    expect(
      normalizeTextBoxProps(getTextBoxPreset("office-simple").props).shapeType,
    ).toBe("rectangle");
    expect(getTextBoxPreset("office-simple").props.fill).toBeTruthy();
    expect(getTextBoxPreset("office-simple").props).not.toEqual(
      jasmine.objectContaining({ preset: "office-simple" }),
    );
  });

  it("removes standalone popup chrome when embedded in a settings card", async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent);
    fixture.componentRef.setInput("embedded", true);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).classList).toContain(
      "text-box-preset-picker-host--embedded",
    );
  });
});
