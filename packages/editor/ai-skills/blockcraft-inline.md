# BlockCraft: Inline / Blot System Deep Dive

> **Level 2: Mechanism Deep Dive** — Only read this when modifying the inline editing system.
>
> Last updated: 2026-08-28

## Architecture Overview

```
Y.Text (Yjs, source of truth)
  → toDelta() → RevisionAttributionAdapter view projection → DeltaInsert[]
  → InlineRuntime.render(deltas) or applyDelta(ops)
  → ScrollBlot tree (runtime middle layer)
  → DOM (<div.edit-container> with <c-element>/<c-text> tags)
```

## Key Files

| File | Purpose |
|------|---------|
| `framework/block-std/inline/index.ts` | `InlineManager` (static utils) + `EmbedConverter` type |
| `embeds/index.ts` | Central public barrel for built-in Embed converters, keys, helpers, and Agent declarations |
| `embeds/<embed-key>/index.ts` | One Embed's canonical converter/value contract; the old scattered `*-embed.ts` files are removed |
| `embeds/<embed-key>/agent/index.ts` | Optional AI semantic contract and explicit insert grant for that Embed key |
| `framework/block-std/agent/index.ts` | Runtime-independent Block and Inline Embed Agent capability types/helpers |
| `framework/block-std/inline/runtime/` | `InlineRuntime` — per-block blot coordinator |
| `framework/block-std/inline/runtime/inline-float-layout.ts` | Wrapped-image geometry, controller and single-side fallback |
| `framework/block-std/inline/runtime/inline-fragment-layout.ts` | Range measurement, grapheme-safe planner and reversible dual-side projection |
| `framework/block-std/inline/runtime/inline-pagination-access.ts` | Package-internal access registry; keeps pagination off the public InlineRuntime API |
| `framework/block-std/inline/runtime/inline-pagination-projection.ts` | Zero-model-length text-line gaps for oversized table-cell pagination |
| `framework/block-std/inline/blot/scroll-blot.ts` | `ScrollBlot` — root container blot |
| `framework/block-std/inline/blot/text-blot.ts` | `TextBlot` — renders text with attributes |
| `framework/block-std/inline/blot/embed-blot.ts` | `EmbedBlot` — renders inline embeds (length=1) |
| `framework/block-std/inline/blot/break-blot.ts` | `BreakBlot` — end-of-block break (length=0) |
| `framework/block-std/inline/blot/cursor-blot.ts` | `CursorBlot` — temporary IME blot (length=0) |
| `framework/block-std/inline/position/` | `InlinePositionMapper` — model ↔ DOM position |
| `framework/block-std/inline/const.ts` | Constants, attribute helpers |
| `framework/revision/attribution-adapter.ts` | Package-internal Yjs 13 relative-position and temporary revision-attribute boundary |

## Revision Projection

Revision metadata is not stored as one competing Y.Text format value. Before a
full inline render, `DocumentRevisionManager.projectInlineDeltas()` splits the
current delta at active relative ranges and injects temporary
`data-bc-revision-ids`, `data-bc-revision-kind`, and
`data-bc-revision-state` attributes. Overlapping inline changes therefore keep
all attribution IDs and can apply dependency-aware projection without last
writer wins.

The same projection covers object Deltas. An inline Embed has model length one,
so its insertion/deletion range decorates the outer `c-element` rendered by
`EmbedBlot`. A semantic attribute update is stored non-destructively as the old
Embed plus a replacement Embed in one Revision group; final projection chooses
the correct object from the group's decisions. No converter-specific Revision
wrapper or shell style is required.

Blocks with text revisions currently take the guarded full-render path so the
temporary attribution stays exact after local or remote changes. Blocks without
text revisions keep the normal incremental `InlineRuntime.applyDelta()` fast
path. The package-internal `RevisionAttributionAdapter` isolates this Yjs 13
implementation so a later Yjs renderer can replace it without changing public
Revision records.

`CodeInlineRuntime` is a second full-render owner because Shiki rebuilds token
runs asynchronously. Its model/Shiki merge must preserve the temporary
revision IDs, kind, state and hidden display attribute in addition to user
foreground/background colors; otherwise syntax highlighting would erase the
revision presentation after the initial synchronous render. While a token is
`pending` or `conflict`, the merge omits its competing Shiki/user foreground
and background inline styles so the `--bc-revision-*` theme wins; the next
unmarked/final projection restores normal syntax colors.

## Blot Tree Structure

```
ScrollBlot (root)
├── TextBlot { text: "Hello ", attrs: {} }           length=6
├── TextBlot { text: "world", attrs: { bold: true } } length=5
├── EmbedBlot { embed: { mention: "Alice" } }         length=1
├── TextBlot { text: " end", attrs: {} }              length=4
└── BreakBlot                                          length=0
```

## DOM Output

```html
<div class="edit-container">
  <c-element><c-text>Hello </c-text></c-element>
  <c-element class="bold"><c-text>world</c-text></c-element>
  <c-element>
    <span contenteditable="false"><span class="inline-mention">Alice</span></span>
    <span data-zero-space>​</span>
  </c-element>
  <c-element><c-text> end</c-text></c-element>
  <c-element class="bc-end-break"><br></c-element>
</div>
```

## InlineRuntime API

```typescript
class InlineRuntime {
  scrollBlot: ScrollBlot;         // Root of the blot tree
  mapper: InlinePositionMapper;   // Position conversion

  render(deltas: DeltaInsert[]);           // Full rebuild from delta array
  applyDelta(ops: DeltaOperation[]);       // Incremental patch (preferred)

  modelPointToDom(index: number);          // Char offset → { node, offset }
  domPointToModel(node: Node, offset: number); // DOM → char offset

  getLength(): number;                     // Total text length

  // Package-internal IME/pointer coordination; host plugins should not call it.
  acquireFloatLayoutFreeze(): () => void;

}
```

## Delta Operations

```typescript
// DeltaInsert (from Y.Text.toDelta())
{ insert: "text" }                                    // Plain text
{ insert: "text", attributes: { "a:bold": true } }   // Formatted text
{ insert: { mention: "Alice" }, attributes: { ... } } // Embed

// DeltaOperation (for applyDelta)
{ retain: 5 }                          // Skip 5 characters
{ retain: 3, attributes: { "a:bold": true } } // Format 3 chars
{ insert: "new" }                      // Insert text
{ insert: { embed: "val" } }           // Insert embed
{ delete: 2 }                          // Delete 2 characters
```

An Embed insert object has exactly one non-empty key and primitive value;
optional attributes are also primitive. Its Blot/model length is always one.
The key names a canonical value/attributes contract, so replacing a converter
under the same key may change rendering but must not change the persisted data
shape.

## InlinePositionMapper

Converts between character offsets (model space) and DOM nodes (DOM space):

```
Model: "Hello |world" (offset=6)
  → mapper.modelPointToDom(6)
  → { node: TextNode("world"), offset: 0 }

DOM: TextNode("world"), offset=3
  → mapper.domPointToModel(textNode, 3)
  → 9 (6 + 3)
```

The mapper walks the blot tree, accumulating lengths, to find the target position.

## Render vs applyDelta

| Method | When Used | Cost |
|--------|-----------|------|
| `render(deltas)` | Initial load, full rebuild | O(n) — creates all DOM |
| `applyDelta(ops)` | Incremental edits | O(delta) — patches existing DOM |

After every `applyDelta`, the system performs a **consistency check**: it compares the blot tree against `yText.toDelta()`. If there's a mismatch, it falls back to full `render()`.

## Inline Embed Agent Boundary

The Inline runtime and document Agent have separate registration boundaries:

- `DocConfig.embeds` registers a converter and makes existing Delta renderable.
- `InlineEmbedAgentCapabilityDefinition` adds optional semantics for one
  `embedKey`.
- its optional `insert` member is the explicit Agent generation grant, with
  complete JSON Schemas for the primitive value and attributes object.

The runtime capability directory includes an Inline Embed declaration only
when the host has also installed a converter with that key. An external Embed
that needs AI support should own an optional
`embeds/<embed-key>/agent/index.ts`, export its declaration, and require the
host to compose it into a `DocumentAgentHostExtension`. Without that
declaration, the Embed still renders and its raw Delta remains visible in Agent
document context, but the Agent cannot generate it. A declaration without
`insert` is understanding-only; built-in `mention`, `shape`, and `word-art`
use this mode by default.

Agent-authored `apply-text-delta` validates every object insert against both
the installed key and its capability schemas. `retain + attributes` accepts
only canonical general text formatting, never Embed-semantic attributes. To
change Embed semantics, delete its exact one-offset range and insert a newly
validated Embed. Generic range deletion may still remove an undeclared or
understanding-only Embed; the absence of an insert grant does not make content
undeletable.

This boundary does not add an Agent dependency to `InlineRuntime`,
`EmbedBlot`, or a converter. The declarations are data-only editor exports;
`blockcraft-agent` consumes them at the host boundary.

## Embed Lifecycle and Default Inline Images

`EmbedConverter.onDestroy(element, delta)` is the teardown boundary for
DOM-owned listeners/controllers. `EmbedBlot.detach()` invokes it, and a
semantic attribute update invokes it for the old view before replacing that
view with `converter.toView(nextDelta)`. A converter that allocates resources
must make `onDestroy` idempotent.

The built-in `image` converter wraps its `<img>` in
`.bc-inline-image-shell > .bc-inline-image-frame`, reserves persisted
`width/height`, and falls back to `320 × 240` (4:3) when either dimension is
missing. The frame owns the visible resource and its loading/error/retry
controller; the outer shell remains the atomic one-length Embed. On the first
successful load it emits an internal bubbling size event; `ImgToolbarPlugin`
resolves the embed's current model offset and fills only missing
`width/height` attributes inside `ORIGIN_NO_RECORD`. The model remains the
source of truth, including while the editable block is offscreen. The renderer
sets the real `<img>` to `draggable="false"`; the shell also capture-cancels
residual native `dragstart` and removes that listener through the same
idempotent `onDestroy()` boundary. Inline-image position changes consequently
cannot fall through to browser `deleteByDrag` / `insertFromDrop` DOM edits.

When an image Delta has `wrap: true`, the shell projects
`data-bc-inline-float` and persisted `side/x/gap` data. Each
`InlineRuntime` owns one package-internal `InlineFloatLayoutController`.
The same float controller recognizes bundled Shape/WordArt shells through the
generic `data-bc-inline-float-layout`, `data-bc-inline-float-frame`, size,
side, x and gap dataset contract. Shape and WordArt Delta do not persist
`side`; their converters always project the internal side as `auto` and ignore
incoming values. Images retain their generic programmatic side metadata, but
the bundled toolbar exposes only the automatic wrapping product behavior.
Image-specific attributes remain supported for backward compatibility.
`side: 'auto'` produces dual-side geometry only when both text intervals are
at least 96 CSS pixels; explicit `left/right` and unsafe auto positions keep
the contained CSS-float fallback. Dual mode measures browser Range geometry,
splits TextBlots only at grapheme-safe model offsets, and moves the real Blot
nodes into local inline row spans in left-then-right model order. The right
fragment uses a measured `margin-inline-start` so both sides share one browser
line box without relying on CSS Grid. Layout wrappers have zero model length
and never serialize. Multiple anchors are processed in Delta order; block-flow
fragment groups push a later overlapping exclusion band below the previous one.

Before `render()` or `applyDelta()`, the controller revokes its projection,
restores direct canonical Blot DOM, and merges only the TextBlot splits recorded
by that projection. The normal Y.Text patch then runs and a fresh projection is
built. Any measurement/projection failure falls back view-only to the contained
single-side float. Content and owner-resize reconciliation are animation-frame
batched and never read layout from a scroll handler; runtime destroy revokes fragments,
observers, frames and leases so virtual reattach rebuilds from the latest Delta.

Caret/selection mapping still uses real Blots. SelectionManager suppresses
native recalculation during a projection rewrite and restores the unchanged
anchor/head Range afterward. CompositionSession, native pointer selection and
wrapped-image dragging hold ref-counted layout leases; while frozen,
invalidations only mark the controller dirty.

Oversized top-level text and table-cell pagination use a second reversible
layout projection. A top-level text Block remains atomic while its natural
stride is at most one regular content page; only an oversized Block requests
visual-line anchors. Pagination keeps an internal plan pairing each block-top
layout offset with the corresponding Y.Text UTF-16 offset, so the pure engine
sees only pixels while the live view can insert at a stable model position.
The package-internal `inline-pagination-access.ts` seam measures complete
visual-line boundaries as revision-scoped Y.Text UTF-16 offsets and applies
gaps without adding methods to the public `InlineRuntime` contract. The
projection splits only real TextBlots at those offsets and inserts block-like markers carrying
`data-bc-inline-pagination-gap`; markers have zero model length, are ignored by
DOM/model mapping, selection and serialization, and are merged away by
projection cleanup. They are transparent layout spacers: the table-level mask,
not each cell-local text anchor, paints the shared sheet/background bands.
Wrapped paragraphs use one composed owner for float fragment groups, their
layout-only TextBlot splits and pagination markers. A wrapped object plus the
painted shell/group exclusion band is atomic, while visual-line anchors before
and after that band remain eligible continuation points. Single-side shell
height includes the configured wrap gap; dual-side mode includes the projected
fragment group and transformed frame. `render()`, `applyDelta()` and `destroy()`
restore canonical DOM once, so stale anchors cannot survive a model mutation or
component teardown. Selection projection guards preserve the current
anchor/head. Pointer, wrapped-object and IME leases keep the previous stable
projection in place; pagination retries only after the refreshed float plan is
writable again.

Bundled custom renderers enter the same package-internal canonical mutation
boundary. When a synchronous or asynchronous rebuild revokes live page gaps,
`inline-pagination-access.ts` notifies the pagination owner and cached Y.Text
anchors are replayed on its next coalesced frame. Code and Mermaid Shiki passes
therefore cannot leave projection bookkeeping ahead of the actual Blot DOM.

Before natural text geometry is read again, the pagination owner synchronously
revokes its previous inline gaps. It batches all natural DOM reads before
applying the new gaps and registers the final host heights as pagination-owned
ResizeObserver output. A stale content/context revision or a replaced Runtime
clears the projection and schedules a fresh plan; offsets are never clamped and
reused across revisions.

`ImgToolbarPlugin` changes `wrap/x/gap` through one Embed `formatText()`
transaction and normalizes the internal side to `auto`. Wrapped-image drag
leaves the committed frame and
fragment boundaries unchanged while a fixed, inert proxy follows x/y outside
contenteditable. Pointerup maps proxy x to normalized `x` and pointer y to a
model anchor, then performs one same-block or cross-block Yjs transaction.
The exact one-length Embed payload and non-position attributes are preserved;
no pixel `y` is serialized. Pointercancel, Escape, detach, editor-external drop
and readonly transitions remove the proxy and restore model-derived geometry
without mutation. A resize/wrap change is a semantic Embed replacement while
Revision tracking is active; anchor movement intentionally remains an
untracked move rather than an insert/delete Diff.

Bundled inline Shape/WordArt use the same frozen-layout Pointer Events gesture
for both plain inline and wrapped modes. The inert
`.bc-inline-object-drag-proxy` preserves the object's visual transform while
moving outside contenteditable. Release moves the exact one-length Embed Delta
to the resolved same- or cross-editable-block anchor in one transaction. A
plain inline object preserves its attributes without adding float coordinates;
a wrapped object additionally recalculates normalized `x`. Shape and WordArt
moves also drop any stale `side` attribute. The first primary pointerdown
selects the Embed and arms a pending gesture, but creates no proxy or layout
lease until movement crosses 2px. A pointerup below that threshold remains a
plain click.

## Attributes

Inline formatting is stored as delta attributes:

```typescript
{ bold: true }
{ italic: true }
{ underline: true }
{ strike: true }
{ code: true }
{ color: '#ff0000' }
{ background: '#ffff00' }
{ 'a:link': 'https://...' }  // Link
```

Attribute helpers:
```typescript
import { InlineManager } from "../../framework";

InlineManager.getAttrs(element)    // Read attributes from DOM element
InlineManager.setAttrs(element, attrs) // Apply attributes to DOM element
```

### Attribute namespaces → DOM (`setAttributes`)

`framework/block-std/inline/setAttributes.ts` applies delta attributes onto each `<c-element>` container by key prefix:

| Prefix | Example key | Applied as |
|--------|-------------|------------|
| `a:` | `a:bold`, `a:link` | HTML attribute — `element.setAttribute('bold', …)` |
| `d:` | `d:foo` | `data-*` — `element.dataset.foo = …` |
| `s:` | `s:color`, `s:fontSize` | inline CSS — `element.style.setProperty('color' / 'font-size', …)` |
| `t:` | `t:ff`, `t:fs`, `t:ls` | compact semantic typography resolved through the trusted font catalog and bounded numeric normalizers |

A `null`/falsy value removes the attribute/style. For `s:` keys the property name is **camelCase→kebab-case** converted before `setProperty` (so `s:fontSize` → `font-size`, `s:fontFamily` → `font-family`) — `setProperty` ignores camelCase names, so this conversion is what makes those legacy styles actually render. CSS custom properties (`s:--x`) keep their case. Legacy relative font scaling may store `s:fontSize` as an `em` ratio; new product writes use numeric `t:fs`.

New typography writes use `t:ff` (short font ID), `t:fs` (relative scale) and
`t:ls` (letter spacing in `em`). `createInlineTypographyPatch()` also clears the
matching legacy `s:*` alias and omits neutral `fs=1` / `ls=0`, keeping Y.Text
runs compact. Legacy styles remain readable and HTML import normalizes supported
values into the compact form. DOM shells retain matching `data-bc-ff/fs/ls`
markers so `InlineManager.getAttrs()` can reconstruct canonical keys instead of
creating camel/kebab duplicates.

The shared dropdown presets cover relative scale `0.5×`–`3×` and letter
spacing `-0.1em`–`0.5em`. They remain numeric model values; `×` / `em` are UI
and CSS projection units only and are not duplicated in `t:fs` / `t:ls`.

The built-in catalog covers system default, Arial, Calibri, Verdana, Tahoma,
common Chinese sans/serif families, Times New Roman, Georgia, Kai, FangSong and
monospace stacks. Persist the catalog ID rather than repeating a CSS stack.

## When to Read Source Files

- **Changing how text is rendered**: Read `TextBlot`, `ScrollBlot.render()`
- **Adding new inline formatting**: Read `InlineManager.setAttrs/getAttrs`, attribute constants
- **Fixing cursor positioning**: Read `InlinePositionMapper`
- **Understanding incremental updates**: Read `InlineRuntime.applyDelta()`
- **Working with embeds**: Read `EmbedBlot`, `EmbedConverter` interface
- **IME issues**: Read `CursorBlot`, `CompositionSession`
- **Full architecture**: Read `packages/editor/ARCHITECTURE.md`, inline system section
