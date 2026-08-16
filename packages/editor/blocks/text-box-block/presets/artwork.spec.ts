import {
  findTextBoxArtworkBySrc,
  getTextBoxArtwork,
  getTextBoxPreset,
  resolveTextBoxArtworkSrc,
  TEXT_BOX_ARTWORK_SCHEME,
  TEXT_BOX_PRESETS,
  TextBoxBlockSchema,
  textBoxArtworkRef,
} from '../index'

/** Every catalog entry that ships a drawing rather than plain shape geometry. */
const decorated = TEXT_BOX_PRESETS.filter(preset => 'bgi' in preset.props)

describe('text-box artwork registry', () => {
  it('keeps drawings out of the document and resolves them at render time', () => {
    expect(decorated.length).toBeGreaterThan(0)

    for (const preset of decorated) {
      const reference = (preset.props as {bgi?: string}).bgi!
      // The document stores a reference. Inlining the drawing put 0.3–1.6 KB of
      // SVG into every text box — and into every Yjs sync, undo entry and
      // export that followed it.
      expect(reference.startsWith(TEXT_BOX_ARTWORK_SCHEME))
        .withContext(preset.id)
        .toBeTrue()
      expect(reference.length).toBeLessThan(64)

      const artwork = getTextBoxArtwork(reference)
      expect(artwork).withContext(preset.id).not.toBeNull()
      expect(artwork!.src.startsWith('data:image/svg+xml'))
        .withContext(preset.id)
        .toBeTrue()
      expect(resolveTextBoxArtworkSrc(reference)).toBe(artwork!.src)
    }
  })

  it('leaves uploaded images alone and refuses to paint unknown references', () => {
    // `bgi` is shared with the toolbar's own upload flow, which stores whatever
    // URL the host returns. Only the `bc:` scheme belongs to the registry.
    const uploaded = 'https://cdn.example.com/photo.png'
    expect(getTextBoxArtwork(uploaded)).toBeNull()
    expect(resolveTextBoxArtworkSrc(uploaded)).toBe(uploaded)

    // A document from a newer catalog, or one whose entry was removed. Painting
    // `bc:` into an `<img>` would show a broken-image icon; dropping it leaves
    // an ordinary framed text box.
    expect(getTextBoxArtwork(textBoxArtworkRef('not-a-real-id'))).toBeNull()
    expect(resolveTextBoxArtworkSrc(textBoxArtworkRef('not-a-real-id')))
      .toBeNull()
    expect(getTextBoxArtwork(null)).toBeNull()
  })

  it('collapses an expanded drawing back to its reference', () => {
    // HTML export expands references so the file stands on its own elsewhere.
    // Re-importing one must not leave the expanded copy in the document.
    const artwork = getTextBoxArtwork(
      (decorated[0].props as {bgi?: string}).bgi!,
    )!
    expect(findTextBoxArtworkBySrc(artwork.src)).toBe(artwork)
    expect(findTextBoxArtworkBySrc('data:image/svg+xml;utf8,%3Csvg%2F%3E'))
      .toBeNull()
    expect(findTextBoxArtworkBySrc(null)).toBeNull()
  })

  it('carries the text-safe frame as fractions so it survives a resize', () => {
    for (const preset of decorated) {
      const artwork = getTextBoxArtwork(
        (preset.props as {bgi?: string}).bgi!,
      )!
      const {top, right, bottom, left} = artwork.textInsets

      // Fractions of the frame, not pixels. Held as px in `p` the reserve was
      // only correct at the size the entry was drawn for: a frame dragged from
      // 360x240 to 540x160 kept a 360px-wide text rectangle inside a balloon
      // whose interior had become 270px, and the text crossed the outline.
      for (const value of [top, right, bottom, left]) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThan(1)
      }
      expect(top + bottom).withContext(preset.id).toBeLessThan(1)
      expect(left + right).withContext(preset.id).toBeLessThan(1)

      // The reserve lives in one place now. Leaving a copy in `p` would stack
      // a second, non-scaling inset underneath it.
      const padding = (preset.props as {p?: readonly number[]}).p
      expect(padding?.every(value => value === 0))
        .withContext(preset.id)
        .toBeTrue()
    }
  })

  it('creates snapshots that carry the reference, never the drawing', () => {
    const preset = getTextBoxPreset(decorated[0].id)
    const snapshot = TextBoxBlockSchema.createSnapshot('', preset.props)
    const serialized = JSON.stringify(snapshot.props)

    expect(serialized).not.toContain('data:image/svg+xml')
    expect(serialized).toContain(TEXT_BOX_ARTWORK_SCHEME)
    // A decorated frame used to serialize past 1.4 KB, nearly all of it the
    // inline drawing.
    expect(serialized.length).toBeLessThan(600)
  })
})
