import type {ShapeTextInsets} from '../../shape-block/shape-definitions'

/**
 * Registry of the catalog's built-in drawings, keyed by a stable id.
 *
 * Why a registry rather than the drawing itself in `bgi`:
 *
 * `bgi` is a *reference* — the toolbar's own image flow uploads through
 * `DOC_FILE_SERVICE_TOKEN` and stores the URL the host hands back. Decorated
 * presets used to inline their whole drawing there as a `data:` URI, which put
 * 0.3–1.6 KB of SVG into every text box: into the Yjs document, into every sync
 * message, into every undo entry and into HTML export. Twenty framed text boxes
 * cost ~18 KB of document. A `bc:` reference costs 25 bytes and the drawing
 * ships with the package, where it belongs.
 *
 * This mirrors what `sh` already does. A Shape is not stored as a path — `sh`
 * names a `ShapeDefinition` and the renderer looks up its geometry *and* its
 * `textInsets`. An artwork entry is the same pair for a drawing that no catalog
 * shape can express, which is why `textInsets` lives here too: the frame's
 * text-safe area belongs to the artwork, is a proportion of the frame, and
 * therefore has to survive being resized. Held as fixed px in `p` it only fits
 * at the size it was drawn for — a frame dragged wider ran its text straight
 * through the balloon.
 *
 * Resolution is deliberately *not* in `resolveBlockSurface()`: that lives in
 * `framework/` and must not reach into `blocks/`. The two renderers look the
 * entry up themselves, exactly as they already look up `getShapeDefinition`.
 */
export interface TextBoxArtwork {
  /** Stable asset key. Persisted as `bc:<id>`; never renamed casually. */
  id: string
  /** The drawing, as an inline SVG data URI. Resolved at render time. */
  src: string
  /**
   * Text-safe frame as fractions of the frame box, same contract and same
   * consumer as `ShapeDefinition.textInsets`. Solved against the drawing's own
   * innermost ink at the text rectangle's corners, not its bounding box.
   */
  textInsets: ShapeTextInsets
}

/**
 * Scheme marking a reference into this registry. `normalizeImageSrc()` only
 * rejects `javascript:` and `vbscript:`, so anything else survives untouched —
 * which is why the scheme has to be recognizable rather than merely unusual.
 */
export const TEXT_BOX_ARTWORK_SCHEME = 'bc:'

/** The value written into `bgi` when a preset is chosen. */
export function textBoxArtworkRef(id: string): string {
  return `${TEXT_BOX_ARTWORK_SCHEME}${id}`
}

const REGISTRY = new Map<string, TextBoxArtwork>()

/**
 * Registers one tab's drawings. Called at module load by each catalog file, so
 * a tab owns its own artwork and no central list has to be edited in lockstep.
 */
export function registerTextBoxArtwork(
  entries: readonly TextBoxArtwork[],
): readonly TextBoxArtwork[] {
  for (const entry of entries) REGISTRY.set(entry.id, entry)
  return entries
}

/**
 * Resolves a `bgi` value to its registry entry, or `null` for anything else —
 * user-uploaded URLs, inline `data:` URIs from documents written before the
 * registry existed, and ids this build does not know (a document from a newer
 * catalog, or an entry since removed).
 *
 * An unknown id resolves to `null` on purpose. Handing `bc:whatever` to an
 * `<img>` renders a broken-image icon; dropping it leaves the frame's own fill
 * and border, which is still a usable text box.
 */
export function getTextBoxArtwork(source: unknown): TextBoxArtwork | null {
  if (typeof source !== 'string') return null
  if (!source.startsWith(TEXT_BOX_ARTWORK_SCHEME)) return null
  return REGISTRY.get(source.slice(TEXT_BOX_ARTWORK_SCHEME.length)) ?? null
}

/**
 * Paintable source for a `bgi` value: the registered drawing for a reference,
 * the value itself for a URL or a legacy inline URI, `null` for an unknown
 * reference.
 */
export function resolveTextBoxArtworkSrc(source: string): string | null {
  if (!source.startsWith(TEXT_BOX_ARTWORK_SCHEME)) return source
  return getTextBoxArtwork(source)?.src ?? null
}

/**
 * Collapses a drawing back to its reference. HTML export expands references so
 * the file stands on its own in other applications; re-importing one must not
 * put the expanded copy back into the document.
 */
export function findTextBoxArtworkBySrc(src: unknown): TextBoxArtwork | null {
  if (typeof src !== 'string' || !src) return null
  for (const entry of REGISTRY.values()) {
    if (entry.src === src) return entry
  }
  return null
}
