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
import {BUBBLE_R_TEXT_BOX_ARTWORK} from './bubble-r'
import {normalizeObjectPaint, normalizeObjectTextFrame} from '../../../framework'

/** Every catalog entry that ships a drawing rather than plain shape geometry. */
const presetArtwork = (preset: (typeof TEXT_BOX_PRESETS)[number]) =>
  typeof preset.props.artwork === 'string' ? preset.props.artwork : ''
const presetMargins = (preset: (typeof TEXT_BOX_PRESETS)[number]) =>
  normalizeObjectTextFrame(preset.props.textFrame).margins
const decorated = TEXT_BOX_PRESETS.filter(preset =>
  presetArtwork(preset).startsWith(TEXT_BOX_ARTWORK_SCHEME),
)

describe('text-box artwork registry', () => {
  it('keeps drawings out of the document and resolves them at render time', () => {
    expect(decorated.length).toBeGreaterThan(0)

    for (const preset of decorated) {
      const reference = presetArtwork(preset)
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
    expect(
      resolveTextBoxArtworkSrc(textBoxArtworkRef('not-a-real-id')),
    ).toBeNull()
    expect(getTextBoxArtwork(null)).toBeNull()
  })

  it('collapses an expanded drawing back to its reference', () => {
    // HTML export expands references so the file stands on its own elsewhere.
    // Re-importing one must not leave the expanded copy in the document.
    const artwork = getTextBoxArtwork(
      presetArtwork(decorated[0]),
    )!
    expect(findTextBoxArtworkBySrc(artwork.src)).toBe(artwork)
    expect(
      findTextBoxArtworkBySrc('data:image/svg+xml;utf8,%3Csvg%2F%3E'),
    ).toBeNull()
    expect(findTextBoxArtworkBySrc(null)).toBeNull()
  })

  it('carries the text-safe frame as fractions so it survives a resize', () => {
    for (const preset of decorated) {
      const artwork = getTextBoxArtwork(presetArtwork(preset))!
      const {top, right, bottom, left} = artwork.textInsets

      // Fractions of the frame, not pixels. Held as px in `p` the reserve was
      // only correct at the size the entry was drawn for: a frame dragged from
      // 360x240 to 540x160 kept a 360px-wide text rectangle inside a balloon
      // whose interior had become 270px, and the text crossed the outline.
      for (const value of [top, right, bottom, left]) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThan(1)
      }
      expect(top + bottom)
        .withContext(preset.id)
        .toBeLessThan(1)
      expect(left + right)
        .withContext(preset.id)
        .toBeLessThan(1)

      // The reserve lives in one place now. Leaving a copy in `p` would stack
      // a second, non-scaling inset underneath it.
      const margins = presetMargins(preset)
      expect(margins.every((value) => value === 0))
        .withContext(preset.id)
        .toBeTrue()
    }
  })

  it('derives the editable region from the chosen style, not one padding tuple', () => {
    const plain = getTextBoxPreset('classic')
    const bubble = getTextBoxPreset('bubble-r-ink-shout')
    const bubbleArtwork = getTextBoxArtwork(
      bubble.props.artwork,
    )!

    // A plain rectangle has no contour to avoid, so it keeps ordinary optical
    // padding. The balloon clears its asymmetric rim and tail through the
    // drawing's proportional safe area and carries no second fixed reserve.
    expect(normalizeObjectTextFrame(plain.props.textFrame).margins)
      .toEqual([10, 14, 10, 14])
    expect(normalizeObjectPaint(plain.props.fill).type).toBe('solid')
    expect(normalizeObjectTextFrame(bubble.props.textFrame).margins)
      .toEqual([0, 0, 0, 0])
    expect(bubbleArtwork.textInsets.bottom).toBeGreaterThan(
      bubbleArtwork.textInsets.top,
    )
    expect(bubbleArtwork.textInsets.right).not.toBe(
      bubbleArtwork.textInsets.left,
    )
  })

  it('fits every bubble drawing closely to its selectable frame', async () => {
    const width = 300
    const height = 200
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')!

    for (const artwork of BUBBLE_R_TEXT_BOX_ARTWORK) {
      const image = new Image()
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error(`无法加载 ${artwork.id}`))
        image.src = artwork.src
      })

      context.clearRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      const pixels = context.getImageData(0, 0, width, height).data
      let left = width
      let top = height
      let right = -1
      let bottom = -1

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (pixels[(y * width + x) * 4 + 3] < 8) continue
          left = Math.min(left, x)
          top = Math.min(top, y)
          right = Math.max(right, x)
          bottom = Math.max(bottom, y)
        }
      }

      // Keep a small anti-aliasing gutter, but never persist the reference
      // sheet's transparent card reserve as part of the selectable object.
      expect(left).withContext(`${artwork.id}: left`).toBeLessThanOrEqual(5)
      expect(top).withContext(`${artwork.id}: top`).toBeLessThanOrEqual(5)
      expect(right)
        .withContext(`${artwork.id}: right`)
        .toBeGreaterThanOrEqual(width - 6)
      expect(bottom)
        .withContext(`${artwork.id}: bottom`)
        .toBeGreaterThanOrEqual(height - 6)
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
    expect(serialized.length).toBeLessThan(3_000)
  })
})
