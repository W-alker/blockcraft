import { TestBed } from "@angular/core/testing";
import {
  TEXT_BOX_PRESETS,
  getTextBoxPreset,
  getTextBoxPresetCategoriesFor,
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
    fixture.componentRef.setInput("current", "classic");
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const items = host.querySelectorAll<HTMLButtonElement>("[data-preset-id]");
    const outline = getTextBoxPresetsFor("h", "outline");

    // The grid is one tab, not the whole catalog.
    expect(items.length).toBe(outline.length);
    expect(items.length).toBeLessThan(TEXT_BOX_PRESETS.length);
    expect(
      host
        .querySelector('[data-preset-id="classic"]')
        ?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(host.textContent).toContain("默认白框");
    expect(host.textContent).not.toContain("精选");
  });

  it("switches the grid when another shape tab is chosen", async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const bubbleTab = Array.from(
      host.querySelectorAll<HTMLElement>(".cs-segmented-item"),
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
    expect(ids.length).toBe(getTextBoxPresetsFor("h", "bubble").length);
    expect(ids.every((id) => id.startsWith("bubble-"))).toBeTrue();
  });

  it("offers shape tabs only, with no direction split", async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const tabLabels = Array.from(
      host.querySelectorAll<HTMLElement>(".cs-segmented-item"),
    ).map((tab) => tab.textContent!.trim());

    // Direction is a frame flag applied on top of a pick, not a second copy of
    // the catalog, so every shape tab is offered unconditionally.
    expect(tabLabels).toEqual(
      getTextBoxPresetCategoriesFor("h").map((category) => category.label),
    );
    expect(tabLabels).toEqual(["线框", "矩形", "气泡"]);
  });

  it("leads 线框 with the no-fill frame while unknown ids fall back to 默认白框", () => {
    const outline = getTextBoxPresetsFor("h", "outline");

    // 极简 and 默认白框 now persist only canonical object-format sections;
    // preview aliases are resolved at the catalog boundary.
    expect(outline[0].id).toBe("no-fill");
    expect(normalizeTextBoxProps(outline[0].props).fo).toBe(0);
    expect(normalizeTextBoxProps(getTextBoxPreset("classic").props).fo).toBe(1);

    // The fallback is pinned to the classic frame rather than the catalog's
    // first slot: a stale id resolving to a fill-less frame would read as
    // data loss, not as a fallback.
    expect(getTextBoxPreset("no-such-preset").id).toBe("classic");
  });

  it("marks the fill-less thumbnail with a transparency checkerboard", async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    // The picker panel is the same near-white as a white fill, so without the
    // checkerboard 极简 and 默认白框 render identical thumbnails.
    expect(
      host.querySelector('[data-preset-id="no-fill"] pattern'),
    ).not.toBeNull();
    expect(host.querySelector('[data-preset-id="classic"] pattern')).toBeNull();
    expect(
      host
        .querySelector('[data-preset-id="classic"] path')
        ?.getAttribute("fill"),
    ).toBe("#FFFFFF");
  });

  it("keeps only the default white frame from the former featured styles", () => {
    const ids = TEXT_BOX_PRESETS.map((item) => String(item.id));

    expect(
      getTextBoxPresetsFor("h", "outline").map((item) => item.id),
    ).toContain("classic");
    for (const removed of [
      "soft-blue",
      "paper-note",
      "speech",
      "cloud",
      "ink-title",
      "royal-banner",
      "neon-card",
    ]) {
      expect(ids).not.toContain(removed);
    }
  });

  it("renders the surface image for decorated entries", async () => {
    await TestBed.configureTestingModule({
      imports: [TextBoxPresetPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(TextBoxPresetPickerComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const outlineTab = Array.from(
      host.querySelectorAll<HTMLElement>(".cs-segmented-item"),
    ).find((tab) => tab.textContent?.trim() === "线框")!;

    outlineTab.click();
    fixture.detectChanges();

    // Decorated entries zero out fill and stroke, so a shape-only thumbnail
    // would render blank.
    const images = host.querySelectorAll<HTMLImageElement>(
      ".text-box-preset-picker__bg",
    );
    const decoratedCount = getTextBoxPresetsFor("h", "outline").filter(
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
    ).querySelector<HTMLButtonElement>('[data-preset-id="classic"]')!;

    button.click();

    expect(picked).toEqual(["classic"]);
    expect(normalizeTextBoxProps(getTextBoxPreset("classic").props).shapeType).toBe(
      "rectangle",
    );
    expect(getTextBoxPreset("classic").props.fill).toBeTruthy();
    expect(getTextBoxPreset("classic").props).not.toEqual(
      jasmine.objectContaining({ preset: "classic" }),
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
