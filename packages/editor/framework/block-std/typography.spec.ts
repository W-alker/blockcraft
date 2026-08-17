import {
  createInlineTypographyPatch,
  INLINE_FONT_SCALE_PRESETS,
  INLINE_LETTER_SPACING_PRESETS,
  matchTypographyFontFamily,
  normalizeDocumentFontSize,
  normalizeInlineFontScale,
  normalizeInlineLetterSpacing,
  normalizeParagraphFontScale,
  normalizeParagraphSpacing,
  normalizeTypographyLineHeight,
  paragraphPointsToPixels,
  resolveTypographyFontFamily,
  resolveEditableBlockFontScale,
} from "./typography";

describe("compact typography contract", () => {
  it("resolves short font ids to trusted portable stacks", () => {
    expect(resolveTypographyFontFamily("kai")).toContain("Kaiti SC");
    expect(resolveTypographyFontFamily("mono")).toContain("monospace");
    expect(resolveTypographyFontFamily("url(javascript:bad)")).toBeNull();
  });

  it("maps supported external CSS families back to compact ids", () => {
    expect(matchTypographyFontFamily('"Kaiti SC", KaiTi, serif')).toBe("kai");
    expect(matchTypographyFontFamily("Consolas, monospace")).toBe("mono");
    expect(matchTypographyFontFamily("Arial, sans-serif")).toBe("arial");
    expect(matchTypographyFontFamily("Calibri, sans-serif")).toBe("calibri");
    expect(matchTypographyFontFamily('"Microsoft YaHei", sans-serif')).toBe(
      "yahei",
    );
    expect(matchTypographyFontFamily("SimSun, serif")).toBe("simsun");
    expect(matchTypographyFontFamily("Unknown Corporate Font")).toBeNull();
  });

  it("normalizes and bounds compact numeric values", () => {
    expect(normalizeInlineFontScale(1.23456)).toBe(1.235);
    expect(normalizeInlineFontScale(4)).toBeNull();
    expect(normalizeParagraphFontScale(1.23456)).toBe(1.235);
    expect(normalizeParagraphFontScale(4)).toBeNull();
    expect(normalizeInlineLetterSpacing(-0.1)).toBe(-0.1);
    expect(normalizeInlineLetterSpacing(0.6)).toBeNull();
    expect(normalizeDocumentFontSize(16)).toBe(16);
    expect(normalizeDocumentFontSize(9)).toBeNull();
    expect(normalizeTypographyLineHeight(1.75)).toBe(1.75);
    expect(normalizeTypographyLineHeight(0)).toBeNull();
    expect(normalizeParagraphSpacing(12.3456)).toBe(12.346);
    expect(normalizeParagraphSpacing(121)).toBeNull();
    expect(paragraphPointsToPixels(12)).toBe(16);
    expect(resolveEditableBlockFontScale({pfs: 1.5, heading: 2}, "paragraph"))
      .toBeCloseTo(2.7, 6);
    expect(resolveEditableBlockFontScale({pfs: 1.5}, "caption"))
      .toBeCloseTo(1.35, 6);
  });

  it("provides dense relative scale and em letter-spacing presets", () => {
    expect(INLINE_FONT_SCALE_PRESETS).toEqual([
      0.5, 0.625, 0.75, 0.875, 1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.5, 3,
    ]);
    expect(INLINE_LETTER_SPACING_PRESETS).toEqual([
      -0.1, -0.075, -0.05, -0.025, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4,
      0.5,
    ]);
  });

  it("creates compact patches and omits neutral repeated values", () => {
    expect(createInlineTypographyPatch("ff", "kai")).toEqual({
      "t:ff": "kai",
      "s:fontFamily": null,
    });
    expect(createInlineTypographyPatch("fs", 1)).toEqual({
      "t:fs": null,
      "s:fontSize": null,
    });
    expect(createInlineTypographyPatch("ls", 0)).toEqual({
      "t:ls": null,
      "s:letterSpacing": null,
    });
  });
});
