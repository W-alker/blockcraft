import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { CsTooltipDirective } from "@cses/ui";
import {
  resolveWordArtPresentation,
  WORD_ART_PRESETS,
  type WordArtPresetId,
} from "../../../blocks/word-art-block";
import { WordArtPresetPickerComponent } from "./word-art-preset-picker.component";

describe("WordArtPresetPickerComponent", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("renders the expanded presets as visual A cards without visible labels", async () => {
    await TestBed.configureTestingModule({
      imports: [WordArtPresetPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(WordArtPresetPickerComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const menu = host.querySelector<HTMLElement>('[role="menu"]');
    const buttons = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );

    expect(menu?.getAttribute("aria-label")).toBe("选择艺术字预设");
    expect(
      host.querySelector(".word-art-preset-picker__title")?.textContent,
    ).toBe("艺术字预设");
    expect(buttons.length).toBe(WORD_ART_PRESETS.length);
    expect(buttons.length).toBe(16);
    expect(buttons.map((button) => button.dataset["presetId"])).toEqual(
      WORD_ART_PRESETS.map((item) => item.id),
    );
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(
      WORD_ART_PRESETS.map((item) => item.label),
    );
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(
      WORD_ART_PRESETS.map(() => "A"),
    );
    for (const preset of WORD_ART_PRESETS) {
      expect(
        host.querySelector(".word-art-preset-picker__viewport")?.textContent,
      ).not.toContain(preset.label);
    }
  });

  it("uses the production presentation resolver for card styling", async () => {
    await TestBed.configureTestingModule({
      imports: [WordArtPresetPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(WordArtPresetPickerComponent);
    fixture.detectChanges();
    const preview = (
      fixture.nativeElement as HTMLElement
    ).querySelector<HTMLElement>(
      '[data-preset-id="sunset"] .word-art-preset-picker__preview',
    )!;
    const expected = resolveWordArtPresentation(WORD_ART_PRESETS[0].props);
    const canonical = document.createElement("span");
    canonical.style.fontFamily = expected.fontFamily;
    canonical.style.fontWeight = `${expected.props.fontWeight}`;
    canonical.style.color = expected.textColor;
    canonical.style.backgroundImage = expected.backgroundImage;
    canonical.style.setProperty("-webkit-text-stroke", expected.textStroke);
    canonical.style.textShadow = expected.textShadow;

    expect(preview.style.fontFamily).toBe(canonical.style.fontFamily);
    expect(preview.style.fontWeight).toBe(canonical.style.fontWeight);
    expect(preview.style.color).toBe(canonical.style.color);
    expect(preview.style.backgroundImage).toBe(canonical.style.backgroundImage);
    expect(preview.style.getPropertyValue("-webkit-text-stroke")).toBe(
      canonical.style.getPropertyValue("-webkit-text-stroke"),
    );
    expect(preview.style.textShadow).toBe(canonical.style.textShadow);
  });

  it("emits the picked preset id and exposes tooltip text", async () => {
    await TestBed.configureTestingModule({
      imports: [WordArtPresetPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(WordArtPresetPickerComponent);
    const picked: WordArtPresetId[] = [];
    fixture.componentInstance.pick.subscribe((value) => picked.push(value));
    fixture.detectChanges();
    const ocean = fixture.debugElement.query(
      By.css('[data-preset-id="ocean"]'),
    );

    ocean.nativeElement.click();

    expect(picked).toEqual(["ocean"]);
    expect(ocean.injector.get(CsTooltipDirective).csTooltip()).toBe(
      "深海蓝",
    );
  });
});
