import {
  findTextBoxArtworkBySrc,
  getTextBoxArtwork,
  getTextBoxPreset,
  resolveTextBoxArtworkSrc,
  TEXT_BOX_ARTWORK_SCHEME,
  TEXT_BOX_PRESETS,
  TextBoxBlockSchema,
  textBoxArtworkRef,
} from "../index";
import {
  normalizeObjectPaint,
  normalizeObjectTextFrame,
} from "../../../framework";

/** Every catalog entry that ships a drawing rather than plain shape geometry. */
const presetArtwork = (preset: (typeof TEXT_BOX_PRESETS)[number]) =>
  typeof preset.props.artwork === "string" ? preset.props.artwork : "";
const presetMargins = (preset: (typeof TEXT_BOX_PRESETS)[number]) =>
  normalizeObjectTextFrame(preset.props.textFrame).margins;
const decorated = TEXT_BOX_PRESETS.filter((preset) =>
  presetArtwork(preset).startsWith(TEXT_BOX_ARTWORK_SCHEME),
);

describe("text-box artwork registry", () => {
  it("keeps drawings out of the document and resolves them at render time", () => {
    expect(decorated.length).toBeGreaterThan(0);

    for (const preset of decorated) {
      const reference = presetArtwork(preset);
      // The document stores a reference. Inlining the drawing put 0.3–1.6 KB of
      // SVG into every text box — and into every Yjs sync, undo entry and
      // export that followed it.
      expect(reference.startsWith(TEXT_BOX_ARTWORK_SCHEME))
        .withContext(preset.id)
        .toBeTrue();
      expect(reference.length).toBeLessThan(64);

      const artwork = getTextBoxArtwork(reference);
      expect(artwork).withContext(preset.id).not.toBeNull();
      expect(artwork!.src.startsWith("data:image/svg+xml"))
        .withContext(preset.id)
        .toBeTrue();
      expect(resolveTextBoxArtworkSrc(reference)).toBe(artwork!.src);
    }
  });

  it("loads every bundled gallery drawing as a browser image", async () => {
    await Promise.all(
      decorated.map(async (preset) => {
        const source = resolveTextBoxArtworkSrc(presetArtwork(preset))!;
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error(`无法加载样式资源：${preset.id}`));
          image.src = source;
        });
        expect(image.naturalWidth).withContext(preset.id).toBeGreaterThan(0);
        expect(image.naturalHeight).withContext(preset.id).toBeGreaterThan(0);
      }),
    );
  });

  it("leaves uploaded images alone and refuses to paint unknown references", () => {
    // `bgi` is shared with the toolbar's own upload flow, which stores whatever
    // URL the host returns. Only the `bc:` scheme belongs to the registry.
    const uploaded = "https://cdn.example.com/photo.png";
    expect(getTextBoxArtwork(uploaded)).toBeNull();
    expect(resolveTextBoxArtworkSrc(uploaded)).toBe(uploaded);

    // A document from a newer catalog, or one whose entry was removed. Painting
    // `bc:` into an `<img>` would show a broken-image icon; dropping it leaves
    // an ordinary framed text box.
    expect(getTextBoxArtwork(textBoxArtworkRef("not-a-real-id"))).toBeNull();
    expect(
      resolveTextBoxArtworkSrc(textBoxArtworkRef("not-a-real-id")),
    ).toBeNull();
    expect(getTextBoxArtwork(null)).toBeNull();
  });

  it("collapses an expanded drawing back to its reference", () => {
    // HTML export expands references so the file stands on its own elsewhere.
    // Re-importing one must not leave the expanded copy in the document.
    const artwork = getTextBoxArtwork(presetArtwork(decorated[0]))!;
    expect(findTextBoxArtworkBySrc(artwork.src)).toBe(artwork);
    expect(
      findTextBoxArtworkBySrc("data:image/svg+xml;utf8,%3Csvg%2F%3E"),
    ).toBeNull();
    expect(findTextBoxArtworkBySrc(null)).toBeNull();
  });

  it("keeps surface ornaments separate from the editable safe area", () => {
    for (const preset of decorated) {
      const artwork = getTextBoxArtwork(presetArtwork(preset))!;
      const { top, right, bottom, left } = artwork.textInsets;

      expect([top, right, bottom, left].every((value) => value >= 0 && value < 1))
        .withContext(preset.id)
        .toBeTrue();
      if (!preset.id.startsWith("bubble-line-")) {
        // Ordinary ornaments do not change the silhouette; their editable
        // safe area therefore remains owned by textFrame margins.
        expect([top, right, bottom, left])
          .withContext(preset.id)
          .toEqual([0, 0, 0, 0]);
      }
      const margins = presetMargins(preset);
      expect(margins.some((value) => value > 0))
        .withContext(preset.id)
        .toBeTrue();
    }
  });

  it("derives the editable region from each chosen gallery style", () => {
    const plain = getTextBoxPreset("office-simple");
    const decoratedOffice = getTextBoxPreset("office-banded");

    expect(normalizeObjectTextFrame(plain.props.textFrame).margins).toEqual([
      18, 22, 18, 22,
    ]);
    expect(normalizeObjectPaint(plain.props.fill).type).toBe("solid");
    expect(
      normalizeObjectTextFrame(decoratedOffice.props.textFrame).margins,
    ).toEqual([24, 28, 24, 28]);
    expect(getTextBoxArtwork(decoratedOffice.props.artwork)).not.toBeNull();
  });

  it("creates snapshots that carry the reference, never the drawing", () => {
    const preset = getTextBoxPreset(decorated[0].id);
    const snapshot = TextBoxBlockSchema.createSnapshot("", preset.props);
    const serialized = JSON.stringify(snapshot.props);

    expect(serialized).not.toContain("data:image/svg+xml");
    expect(serialized).toContain(TEXT_BOX_ARTWORK_SCHEME);
    // A decorated frame used to serialize past 1.4 KB, nearly all of it the
    // inline drawing.
    expect(serialized.length).toBeLessThan(3_000);
  });
});
