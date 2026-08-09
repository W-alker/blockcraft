# BlockCraft Migration Guide

> **Version adaptation reference.** Each entry documents a framework change that affects external consumers — including breaking API changes, deprecations, removed exports, behavior changes, and any rename/move that downstream code might depend on.
>
> Last updated: 2026-08-10 | Tracks `@ccc/blockcraft` npm releases.

## Why This File Exists

The BlockCraft skill pack and source code evolve together. When the framework refactors or grows new features, three things must stay aligned:

1. The **source code** in `packages/editor/`
2. The **L0/L1/L2 docs** in `packages/editor/ai-skills/`
3. The **migration entries** in this file

If you're an external consumer upgrading `@ccc/blockcraft`, this file tells you exactly what to change in your own code. If you're a contributor making a framework change, you **must** add an entry here before publishing the new version (see project `CLAUDE.md` "文档同步规则").

## Entry Format

Every entry follows this template:

```markdown
## v<X.Y.Z> — YYYY-MM-DD

**Severity**: patch | minor | major (semver — patch = fully back-compat, minor = additive, major = breaking)

**What changed**: one-paragraph summary aimed at a future reader who knows nothing about the PR.

**Why**: the motivation (incident, design lesson, feature request, …). Helps future-you decide if a follow-up is still relevant.

**Affected ai-skills files**:

- list of L0/L1/L2 markdowns updated in the same PR

### Breaking Changes (only for major)

- removed APIs, renamed exports, changed signatures, removed events, …

### Deprecations

- APIs marked `@deprecated` with the version they will be removed in (or "no removal date")

### New APIs / Features

- new exports, new methods, new lifecycle hooks, new schema fields, …

### Migration Recipe

Concrete before/after code snippets so a downstream developer can find-and-replace mechanically:

\`\`\`typescript
// before
selection.from.block

// after
selection.anchor.block
\`\`\`

### Behavior Changes

Things that didn't change shape but changed behavior — e.g. an event now fires earlier, a method now throws on a previously-silent edge case.
```

> **Severity → version bump rule**:
>
> - `patch` (e.g. 0.1.37 → 0.1.38): bug fix, doc-only change, internal refactor that doesn't touch any exported surface
> - `minor` (e.g. 0.1.37 → 0.2.0): additive — new APIs, new plugins, new blocks, new optional schema fields, new exports
> - `major` (e.g. 0.1.37 → 1.0.0): breaking — removed APIs, renamed exports, signature changes, behavior reversals
>
> **Deprecations are minor**, not major — they only become major when the deprecated API is actually removed.
>

### v0.3.0-alpha.30 - 2026-08-10 (patch) — preserve paginated table fullscreen editing

**What changed**: Table fullscreen now isolates only sibling branches along the
active table's DOM ownership path instead of hiding an application ancestor. The
controller uses the table's `ownerDocument` realm, refreshes isolation markers
after pagination or virtualization reparents the block, suspends table-local page
decorations while fullscreen, and replays the latest projection on exit. A
paginated root also drops its own centering transform for the fullscreen lifetime
so the fixed table is viewport-relative.

**Why**: Chromium can emit native `input` without `beforeinput` when a
contenteditable editing host has a hidden ancestor. That bypasses BlockCraft's
input transformer and Y.Text update path. Separately, the pagination root's
centering transform creates a containing block for `position: fixed`, while page
spacers, gaps and masks are view-only artifacts that should not appear inside the
fullscreen table.

**Affected ai-skills files**:

- `blockcraft-theme.md`
- `MIGRATIONS.md`

### Behavior Changes

- Fullscreen themes must preserve the active path marked by
  `.bc-table-fullscreen-isolation-container` and
  `.bc-table-fullscreen-isolation-branch`; only sibling branches are hidden.
- Entering fullscreen temporarily suspends table pagination decorations and the
  BlockCraft-owned paginated-root transform. Both are restored from the latest
  projection when fullscreen exits.
- Existing `.table-block.is-fullscreen`, `body.bc-table-fullscreen-lock` and CDK
  overlay behavior remain compatible.

### v0.3.0-alpha.29 - 2026-08-09 (patch) — bound final print stability observation

**What changed**: The final fixed-page print surface still requires the complete
DOM subtree to stop mutating, but its `ResizeObserver` now watches only physical
page boundaries, direct page layers and top-level content slots/fragments. It no
longer installs one resize target for every deeply cloned `data-block-id`.
Timeout diagnostics now report the final change target plus mutation, resize and
observed-boundary counts.

**Why**: An oversized cell-flow table can be cloned across many pages and contain
hundreds of nested cell/text blocks per fragment. Observing every clone made the
stability gate scale as `pages × nested blocks` and could exhaust the fixed wait
budget even after the physical page boxes were stable. The active paginated root
also produces its own synchronous clear/restore projection mutations while
capturing table geometry, so host-managed readonly export copies should use one
synchronous stable-layout capture rather than a second generic DOM-silence gate.

**Affected ai-skills files**:

- `blockcraft-plugins-util.md`
- `MIGRATIONS.md`

### Behavior Changes

- Final `.bc-print-root[data-bc-print-root="true"]` surfaces keep subtree mutation
  stability, while resize stability is evaluated at page-geometry boundaries.
  Changes that alter a whole block or fragment size are still observed.
- A host that owns an already-active paginated readonly copy should finish its
  business/resource preparation, then call `captureStableLayout()` exactly once
  and capture the snapshot in the same task. It should not wait for generic DOM
  silence on that active projection first.

### v0.3.0-alpha.28 - 2026-08-09 (minor) — preserve stable block trailing spacing in paginated print

**What changed**: `PaginationItem` now carries optional `trailingSpacing`, the
block-end spacing already included in its measured `height`. Live pagination,
sparse geometry, readonly fallback measurement and paginated printing preserve
that value through the stable layout. Printing freezes it on each whole-block
host before validation and page reparenting; table fragments continue to carry
the same spacing only in their stable final fragment window.

**Why**: the readonly print tree appends structural sentinels so non-terminal
page blocks do not lose their gap when reparented. For a real document-tail block,
that sentinel changes `:last-child` and can revive the default 10px margin after
the stable layout captured a zero margin. Re-reading computed margin in the print
tree therefore produced a false `24px` versus `34px` divergence after oversized
tables and could move whole blocks. Stable spacing is now data, not a print-DOM
side effect.

**Affected ai-skills files**:

- `blockcraft-plugins-util.md`
- `MIGRATIONS.md`

### New APIs / Features

- `PaginationItem.trailingSpacing?: number` — stable block-end spacing in layout
  pixels, already included in `height`; custom stable-layout providers may set it
  when their render tree can change `:last-child` during export.

### Behavior Changes

- Stable paginated print no longer derives a captured block's tail spacing from
  the reparented readonly DOM. Legacy layouts without `trailingSpacing` retain the
  previous computed-style fallback.

### v0.3.0-alpha.27 - 2026-08-09 (minor) — structured pagination chrome content

**What changed**: `PageChrome` now accepts optional serializable `content` for
the left, center and right regions. Each region can contain image and text items,
including muted text and page-number tokens. An optional `separator` renders the
same divider box in live pagination and fixed PDF page surfaces.

**Why**: Host applications need to compose brand, date and page-number content
without converting a whole footer to a bitmap or maintaining separate live and
print renderers.

**Affected ai-skills files**:

- `blockcraft.md`
- `MIGRATIONS.md`

### New APIs / Features

- `PageChrome.content` / `PageChromeContentSegments`
- `PageChromeInlineContent` and serializable text/image content item types
- `PageChrome.separator: 'top' | 'bottom'`

### Migration Recipe

Existing string segments remain valid. A structured brand region can be added
incrementally:

```typescript
footer: {
  content: {
    left: {items: [
      {kind: 'image', src: logo, height: 20, maxWidth: 28},
      {kind: 'text', text: company},
      {kind: 'text', text: appVersion, tone: 'muted'},
    ]},
  },
  center: '{page}',
  right: exportDate,
  separator: 'top',
}
```

### Unreleased - 2026-08-09 (patch) — constrain paginated media without changing block coordinates

**What changed**: Paginated live and fixed-page print views no longer apply CSS
`zoom` to an entire oversized block. Only flow-layout image/video media wrappers
receive deterministic `max-width` and `max-height` constraints. Captions, block
hosts and editor controls keep their normal font and coordinate system. Absolute
image/video objects, shapes and all other atomic blocks never receive a media
fit projection. Sparse pagination also stops inferring fit from flavour and
`lockHeight`; only a stable full-DOM media measurement may publish `fitScale`.

**Why**: Whole-block `zoom` changed the coordinate system inherited by absolute
placement objects and was not reproduced identically by every browser/print
host. It could therefore shift image and shape coordinates even when paper and
content-box dimensions matched. Constraining the actual media surface keeps the
page root and placement plane at 100% while still fitting oversized flow media.

**Affected ai-skills files**:

- `MIGRATIONS.md`

### Behavior Changes

- `.bc-page-height-fitted` and `--bc-page-fit-scale` are no longer used for
  rendering; stale copies are removed defensively when constructing print pages.
- Flow image/video captions are not scaled. The available page content height
  is reduced by their natural non-media stride before the wrapper limit is
  calculated.
- Shapes, bookmarks and absolute placement objects retain their persisted pixel
  width, height, x and y; an oversized non-media atomic block follows its normal
  cap/overflow policy instead of being silently zoomed.

### Unreleased - 2026-08-08 (patch) — restore CSS-native WordArt rendering

**What changed**: Editable, readonly, snapshot and inline WordArt now paint the
real CSS text node again. The block no longer mounts an SVG visual mirror or
makes the editable glyph layer transparent. Fixed-page export preserves the
stable cloned text box and freezes presentation CSS without measuring Range or
DOMRect. WKWebView print degrades gradient fill to the first configured gradient
color; solid fill, font metrics, stroke, shadow and transform remain intact.

**Why**: Keeping contenteditable HTML only as a transparent interaction layer
made caret/selection/drag proxies vulnerable to a second black glyph run and
kept browser text layout separate from what users actually saw. Native WebKit
PDF still cannot safely receive CSS gradient clipping, so only that unsupported
paint is degraded instead of maintaining an SVG rendering system everywhere.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-plugins-util.md`
- `blockcraft-theme.md`
- `MIGRATIONS.md`

#### Behavior Changes

- Screen/editor/snapshot/inline WordArt contains no generated SVG glyph layer.
- Legacy rich-text styling on WordArt child blots no longer overrides the
  block's plain-text presentation during selection or drag proxies.
- Native PDF gradient WordArt uses the first gradient color as a deterministic
  WebKit fallback; non-gradient presentation remains unchanged.

> The version in `packages/editor/package.json` MUST be bumped according to this rule before running `pnpm publish:editor`.

---

### Unreleased - 2026-08-08 (minor) — canonicalize and freeze placement print projection

**What changed**: Flow, live pagination, and fixed-page export now keep the
root placement plane at `top/left = 0/0` inside the root content box and fill
the content width. Stable placement geometry now comes directly from resolved
pagination margins, page chrome and first-page leading geometry; print no longer
converts DOMRect measurements into X/Y/width compensation.
Custom render providers can now capture detached placement-plane DOM and its
per-block visual geometry before disabling pagination or changing root sizing;
fixed-page assembly consumes that stable source and validates one canonical
projection instead of reading the post-switch root.

**Why**: A DOMRect captured in a scaled screen view or isolated readonly window
can include host padding or a different zoom/transform chain. Converting that
visual value back into pagination data produced origins such as 93px for a
canonical 72px margin even though persisted `placement.x/y` was correct.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-plugins-util.md`
- `MIGRATIONS.md`

### Behavior Changes

- Print page 1 mounts the placement plane at `0/0`; later pages apply only the
  continuous-screen page-stride Y projection.
- Fixed pages mount captured placement content in a fresh `100%`/`zoom:1`
  wrapper whose containing block is `.bc-print-content`. Hidden page assembly
  happens at viewport `0/0`, avoiding WebKit drift from very large negative
  staging coordinates.
- Fixed `placement.x/y` remain unchanged and exclude root padding everywhere.
- Stable placement geometry is canonical model data. Optional provider geometry
  remains diagnostic and reports `layout-diverged` instead of becoming a print offset.
- `PrintRenderResult.placementOriginX/Y/placementWidth` remain accepted as
  compatibility diagnostics but no longer control print layout.
- When `PrintRenderResult.placementPlanes` is present, it is the only placement
  DOM source. An incomplete set is `layout-diverged`; it never falls back to the
  changed readonly root.
- The live pagination surface has `min-width` equal to the sheet width, keeping
  root, external header, and page backdrop center-aligned in narrow hosts. All
  three use the same `left:50% + translateX(-50%)` centerline; root no longer
  relies on flex centering.

### New APIs / Features

- `captureStablePrintPlacementPlanes(root)` captures detached root placement
  planes and O(objects) visual-bounds manifests inside the stable pagination
  barrier.
- `PrintRenderResult.placementPlanes?: readonly StablePrintPlacementPlane[]`
  lets a custom provider deliver those snapshots to fixed-page assembly.

> The version in `packages/editor/package.json` MUST be bumped according to this rule before running `pnpm publish:editor`.

---

## Releases

### v0.3.0-alpha.22 - 2026-08-07 (patch) — make absolute placement content-box relative

**Severity**: patch

**What changed**: Interactive blocks, Snapshot Viewer, pagination capture and
fixed-page export now use the root content box as the single absolute-placement
containing block. The placement plane mirrors root padding around a zero-height
content container, while geometry measurement subtracts that padding from its
origin and width.

**Why**: Treating `root.clientWidth` and the outer placement plane as the
coordinate space included root padding in some paths but not in isolated print
pages. Fixed `placement.x/y` therefore shifted whenever the editor and export
roots used the same paper width with different padding contexts.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-plugins-util.md`
- `MIGRATIONS.md`

#### Behavior Changes

- `placement.x/y = 0` now resolves to the root content-box top-left in every
  renderer.
- Legacy percentage `placement.x` resolves against content width, excluding
  left and right root padding.
- `StablePaginationLayout.placementOriginX/placementOriginY/placementWidth`
  describe the placement content box, not the outer root padding box.

### v0.3.0-alpha.19 - 2026-08-07 (patch) — capture absolute placement with the stable page layout

**Severity**: patch

**What changed**: `StablePaginationLayout` now carries the optional
`placementOriginY` captured from the rendered pagination plane in the same
synchronous export barrier as page breaks. Fixed print pages prefer that value
over provider hints and inferred header offsets. When stable first-page geometry
contains a document-header leading offset but the readonly renderer cannot
return the header DOM, the body keeps the same offset instead of moving only the
normal flow upward.

**Why**: Interpreting the same CSS `top` again after reparenting into print page
boxes could put every absolute shape, image, and WordArt block at a different Y
position from the editor. A missing generic `leadingContent` widened the error
by exactly the document-header height.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-plugins-util.md`
- `MIGRATIONS.md`

#### API Additions

- `StablePaginationLayout.placementOriginY?: number`

#### Behavior Changes

- Stable-layout export uses the captured live placement-plane origin.
- `PrintRenderResult.placementOriginY` remains a backward-compatible fallback.
- A stable first-page leading offset also applies to normal flow when the
  generic readonly provider cannot reproduce the external header DOM.

### v0.3.0-alpha.18 - 2026-08-07 (patch) — apply document text color to headings

**Severity**: patch

**What changed**: The root `color` prop now updates both the root host `color`
style and the root-scoped `--bc-color` theme token. Headings and other default
text styles that consume the theme token therefore follow the document color.

**Why**: The first root color implementation relied on inheritance, but heading
styles explicitly consume `--bc-color` and could keep the theme default.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `MIGRATIONS.md`

#### Behavior Changes

- Root document color now covers headings and other default theme-token text.
- Explicit inline and block colors continue to override the document default.

### v0.3.0-alpha.17 - 2026-08-07 (minor) — persist the inherited document text color

**Severity**: minor (additive schema field)

**What changed**: `RootBlockModel.props` now declares the optional `color?:
string` field. `RootBlockComponent` applies it as its host CSS `color`, making it
the inherited default for document blocks while preserving explicit inline and
block-level colors.

**Why**: Document-level appearance settings need a collaborative, snapshot-safe
default text color that can be committed in the same root props transaction as
the document background.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `MIGRATIONS.md`

#### New APIs / Features

- `RootBlockModel.props.color?: string`

#### Migration Recipe

No existing document needs migration. Set or clear the inherited text color
through normal root props mutations:

```typescript
doc.crud.updateBlockProps(doc.rootId, {color: '#182230'})
doc.crud.updateBlockProps(doc.rootId, {color: null})
```

#### Behavior Changes

- When present, the root `color` prop is rendered on the BlockCraft root host
  and inherited by descendants that do not declare their own color.

### v0.3.0-alpha.16 - 2026-08-07 (minor) — persist CSS document backgrounds on the root block

**Severity**: minor (additive schema field)

**What changed**: `RootBlockModel.props` now declares the optional
`background?: string` field. The value is a standard CSS `background` shorthand
stored in the root Yjs props and therefore participates in collaboration,
Undo/Redo and full-document snapshots.

**Why**: Document backgrounds need one compact, durable value that can express
color, image, position/size, repeat, attachment and origin/clip while allowing
flow and paginated hosts to project the same data onto different visual
surfaces.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `MIGRATIONS.md`

#### New APIs / Features

- `RootBlockModel.props.background?: string`

#### Migration Recipe

No existing document needs migration. Hosts can opt in with a normal model-first
props mutation and project the value onto their own view surface:

```typescript
doc.crud.updateBlockProps(doc.rootId, {
  background: '#fff url("https://cdn.example.com/bg.png") center / cover no-repeat',
})
```

Use `{background: null}` to remove the field. Do not persist view-specific DOM
selectors or personal preferences in this root prop.

#### Behavior Changes

- BlockCraft persists but does not automatically paint the background. Flow
  containers and paginated sheets remain host-owned rendering surfaces.

### v0.3.0-alpha.15 - 2026-08-07 (patch) — require stable WordArt SVG before fixed-page export

**Severity**: patch

**What changed**: Fixed-page export no longer constructs or recomputes WordArt
SVG from CSS text inside final page boxes. It now accepts only the stable SVG
produced by the readonly/snapshot renderer, reuses that exact node and geometry,
and removes the CSS text layer. WordArt content, size, props or font changes
clear the ready marker immediately so pagination waits for the next stable SVG.

**Why**: Export-time `Range` / `DOMRect` sampling ran in a different formatting
context from the user-visible paginated page. That second geometry calculation
could move WordArt even when both surfaces used the same editor configuration.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-plugins-util.md`
- `MIGRATIONS.md`

#### Migration Recipe

Built-in WordArt consumers require no code change. Custom readonly or snapshot
renderers that emit WordArt print metadata must finish the normal BlockCraft SVG
rendering path before reporting pagination stability; export no longer provides
a CSS-text fallback renderer.

#### Behavior Changes

- Final fixed page boxes never call `Range` / `DOMRect` and never create a new
  WordArt SVG.
- Missing or stale stable WordArt SVG now fails with `layout-not-ready` instead
  of silently exporting geometry calculated from the print surface.
- The same SVG node, fractional dimensions, transforms and glyph positions from
  stable readonly rendering are preserved through page assembly and native PDF.
- Repeated WordArt finalization from print-live and print-vector stages has been
  removed; the assembled page surface finalizes exactly once.

### v0.3.0-alpha.14 - 2026-08-07 (minor) — allow host-rendered find/replace panels

**Severity**: minor (additive API)

**What changed**: `FindReplacePlugin` now accepts
`{defaultDialog?: boolean}`. Setting it to `false` leaves Cmd/Ctrl+F available
to the host while the plugin continues to own and expose its initialized
`FindReplaceHelper`. BlockCraft's bundled dialog now reuses that same helper
instead of creating a second model listener and highlight projection.

**Why**: Host applications need product-specific search panel styling without
copying the model scan, virtualized highlight, navigation, readonly and Yjs
replacement behavior.

**Affected ai-skills files**:

- `blockcraft-plugins-util.md`
- `MIGRATIONS.md`

#### New APIs / Features

- `FindReplacePluginOptions.defaultDialog?: boolean`

#### Migration Recipe

Hosts with their own panel can register the headless presentation mode and
delegate all operations to the plugin-owned helper:

```typescript
const findReplace = new FindReplacePlugin({defaultDialog: false})
plugins.push(findReplace)

findReplace.helper.findAll(query)
findReplace.helper.findNext()
findReplace.helper.replaceOne(replacement)
```

#### Behavior Changes

- The bundled dialog and plugin now share one helper lifecycle. Directly
  constructed `FindReplaceDialog` instances without a helper input retain the
  previous self-owned fallback behavior.

### v0.3.0-alpha.14 - 2026-08-07 (minor) — allow host presence layers to suppress the local cursor

**Severity**: minor (additive API)

**What changed**: `BlockCraftAwareness` now exposes
`setLocalCursorEnabled(enabled)` and the readonly `localCursorEnabled` state.
Disabling clears only the local awareness cursor; remote cursor rendering,
virtualized reprojection and the collaboration connection remain active.
Re-enabling immediately publishes the current canonical BlockCraft selection.
The class is now exported from the package root, and its optional config accepts
`shouldRenderRemoteCursor(state)` for host presence filtering.

**Why**: Host applications need editing/viewing presence states without
copying BlockCraft's cursor renderer and falling behind its virtualization,
selection, scrolling and lifecycle behavior.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `MIGRATIONS.md`

#### New APIs / Features

- `BlockCraftAwareness.setLocalCursorEnabled(enabled: boolean): void`
- `BlockCraftAwareness.localCursorEnabled: boolean`
- `BlockCraftAwarenessConfig.shouldRenderRemoteCursor(state): boolean`
- Root export: `import {BlockCraftAwareness} from '@ccc/blockcraft'`

#### Migration Recipe

Hosts with a custom viewing state can delegate cursor projection to BlockCraft:

```typescript
cursorAwareness.setLocalCursorEnabled(presenceStatus === 'editing')
```

#### Behavior Changes

- Calling the new method with the current value is a no-op. Calls after
  `destroy()` are ignored.

### v0.3.0-alpha.14 - 2026-08-07 (patch) — make WordArt SVG-native and preserve the projected placement origin

**Severity**: patch

**What changed**: Editable, readonly and snapshot WordArt now share one SVG
visual layer; the contenteditable element remains only as a transparent input,
caret and selection host. Its inline styles keep only text/input geometry;
fill, gradient, outline, shadow and effect transforms are SVG-owned.
Collapsed fake-range overlays now mount on the opt-in WordArt surface instead
of inside the geometry-constrained contenteditable host, and transient editor UI
is excluded from SVG text collection and invalidation. SVG materialization also
preserves fractional border-box and local-position geometry instead of rounding
through integer `offsetWidth` / `offsetHeight` values.
Native `::selection` keeps the themed highlight background but forces the
interaction-layer glyph color transparent, so selecting text cannot paint a
second black glyph run above SVG. The SVG-ready paint rule is keyed directly
off the WordArt surface/frame instead of an editor-root ancestor, so an inline
drag proxy cloned under `document.body` cannot restore gray HTML glyphs beside
the cloned SVG. Its selection selector also includes the WordArt print-props
attribute, keeping sufficient specificity against host-level
`.no-native-selection ...::selection { color: HighlightText !important; }`
rules. Standard `::selection` and Firefox `::-moz-selection` live in separate
rules; combining them makes Chromium reject the complete selector list.
`PrintRenderResult` also accepts the optional
`placementOriginY`, allowing a host that captured an isolated stable pagination
layout to pass the placement plane's actual root-relative layout origin into
fixed PDF page assembly.

**Why**: Equal pagination settings do not guarantee equal final formatting
contexts after a host document header and page surface have been projected.
Recomputing that origin during export can add the leading offset twice. A
print-only CSS-to-SVG conversion also left screen and native PDF on different
visual DOM paths. In Chromium, inserting a fake cursor inside the transparent
editable host could additionally enlarge that host, rebuild the SVG from a
different box, and move WordArt even though the document model had not changed.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-plugins-util.md`
- `MIGRATIONS.md`

#### Behavior Changes

- Hosts that already render WordArt need no migration. Screen and print now
  consume the same SVG visual node automatically.
- Local and collaborative fake cursors remain visible without participating in
  WordArt measurement, SVG text extraction or export invalidation. Chromium no
  longer changes WordArt geometry merely because a virtual cursor is present.
- Fractional WordArt dimensions and local offsets are retained across live,
  readonly and print SVG materialization, avoiding subpixel drift between the
  editor surface and native PDF output.
- Hosts rebuilding fixed pages from a projected isolated document should pass
  `placementOriginY`; omitted values preserve the geometry-derived fallback.

### v0.3.0-alpha.13 - 2026-08-07 (patch) — stabilize paginated WordArt and registry-backed SVG icons

**Severity**: patch

**What changed**: Paginated PDF, live-print and vector-print surfaces now
materialize CSS gradient WordArt as SVG only after their final page boxes and
per-page placement planes are mounted. SVG text uses the source Range's visual
top edge directly. BlockController trigger icons, nested menu icons and sort
action icons also consistently render `svgIcon` values through Angular
Material's `MatIconRegistry` again.

**Why**: WKWebView's native PDF painter can expand
`background-clip:text` into a full gradient rectangle and interpret an
alphabetic SVG baseline differently from browsers. Materializing the final
static print tree prevents renderer races and keeps absolute placement aligned
with the paginated screen surface. Rendering registered icons as raw
`<svg><use>` references also required a global symbol sprite that documented
host integrations do not load, leaving those icons blank.

**Affected ai-skills files**:

- `blockcraft-plugins-block.md`
- `blockcraft-plugins-util.md`
- `MIGRATIONS.md`

#### Behavior Changes

- Hosts that already register BlockCraft icons with `MatIconRegistry` need no
  changes. A global SVG symbol sprite is no longer required by BlockController.
- CSS gradient WordArt is converted only inside framework-owned readonly print
  copies. The live document, stored block data, placement coordinates and
  stable pagination layout remain unchanged.
- WordArt SVG lines use `dominant-baseline="text-before-edge"` with the visual
  top returned by `Range`; native PDF output no longer receives a guessed
  Canvas alphabetic baseline that can move CJK glyphs by roughly one ascent.

### v0.3.0-alpha.12 - 2026-08-07 (patch) — isolate oversized-cell gap geometry from page painting

**Severity**: patch

**What changed**: Oversized table-cell live pagination no longer inserts
`.bc-pagination-cell-flow-gap` siblings at Block/cell-start anchors. It applies
one reversible margin offset to the existing Block host instead. Text-line
continuations retain their zero-model-length Inline markers, but those markers
are transparent; a single table-level mask now owns every sheet/background
band in the table coordinate system.

**Why**: Different logical cells can continue at different safe anchors. When
each cell-local spacer painted its own page gradient, their local coordinates
produced staggered gray rectangles inside otherwise valid sheet content and
added unnecessary nodes to contenteditable cell DOM.

**Affected ai-skills files**:

- `blockcraft-plugins-util.md`
- `blockcraft-inline.md`
- `blockcraft-theme.md`
- `MIGRATIONS.md`

#### Migration Recipe

No host API, stored document or pagination configuration migration is required.
Hosts that inspected `.bc-pagination-cell-flow-gap` should stop depending on
that plugin-owned implementation class and style page colors through the
existing `--bc-page-sheet-bg` / `--bc-pagination-backdrop-bg` tokens.

#### Behavior Changes

- Block/cell-start continuation projection adds no sibling DOM node and restores
  the Block host's original inline margin exactly when pagination is cleared.
- `[data-bc-inline-pagination-gap]` remains zero-model-length and now contributes
  geometry only; it never paints a local page-gradient band.
- `.bc-pagination-table-flow-mask` is the sole live table page-band painter, so
  columns with different continuation anchors cannot expose staggered gray bars.
- No public TypeScript API, stored schema or package version changed.

### v0.3.0-alpha.11 - 2026-08-05 (minor) — isolated PDF preparation and stability barrier

**Severity**: minor (additive prerelease API)

**What changed**: Paginated PDF options now accept a `prepareDocument` hook
that runs against the internally created readonly snapshot copy before
measurement. A generic DOM/ResizeObserver quiet barrier runs after print
resources settle and can be tuned through `stability`.
Named pagination paper sizes are also emitted as explicit physical dimensions
for browser/native print mirrors, including A0/A1/A2 and Tabloid. Browser CSS
uses the paper standards' native `mm`/`in` values while native PDF metadata keeps
the exact PostScript-point values; fixed page boxes no longer round through
screen pixels. Oversized image/video
blocks and over-wide non-breakable atomic blocks are fitted into the content
box instead of being hard-cropped.
Live pagination, isolated export measurement and stable-layout validation now
share one atomic-block visual-height rule: `overflow: visible` contributes the
painted `scrollHeight`, while `hidden`, `clip`, `auto` and `scroll` use the host
border box. Clipped internal overflow therefore no longer creates phantom page
stride or a 4px live/export mismatch.

**Why**: Async business blocks may need to fetch fresh data in the export copy.
Pagination must not guess whether an empty view is loaded, nor measure while
that view, its images, fonts or dimensions are still changing.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-plugins-util.md`
- `MIGRATIONS.md`

#### New APIs / Features

- `PaginationPdfOptions.prepareDocument`
- `PaginationPrintDocumentContext`
- `PaginationPrintDocumentPreparer`
- `PaginationPdfOptions.stability`
- `PaginationRenderStabilityOptions`
- `waitForPaginationRenderStable()`

#### Migration Recipe

Existing exports require no change. Hosts with async business blocks can opt in:

```typescript
await pagination.exportToPdf('document.pdf', {
  prepareDocument: async ({doc, root, signal}) => {
    await businessExportCoordinator.reloadAndWait(doc, {root, signal})
  },
  stability: {quietFrames: 2, timeoutMs: 10000},
})
```

The hook must operate on the supplied readonly `doc`; it must not read or mutate
the live collaborative document.

#### Behavior Changes

- PDF reflow waits for two quiet DOM/size frames after images and fonts settle.
- A rejected business hook fails with `layout-not-ready` and destroys the copy.
- `resourcePolicy: 'best-effort'` converts only the generic stability timeout to
  a warning; semantic preparation failures remain fatal.
- Named page geometry keeps standard CSS `mm`/`in` values and exact physical pt metadata;
  hosts should forward `page.widthPt` / `page.heightPt` without rounding.
- Physical page flow slots and the print root now use the same explicit standard
  `mm`/`in` width as `@page`; they do not resolve paper width through `100%` of a
  WebView viewport. A fixed-height slot naturally consumes exactly one physical
  page; no adjacent-slot `break-before` / `break-after` is emitted, because a
  second forced advance creates alternating blank pages in WebKit. A `0.01px`
  negative height tolerance absorbs only the device-pixel rounding tail and
  avoids cumulative one-pixel drift.
  Hosts printing an already paginated surface must keep scale at `1:1` (for
  example `NSPrintInfo.horizontalPagination = clip`) rather than shrink-to-fit;
  continuous-flow exports may continue to use fit.
- Default browser PDF export now prints a top-level print mirror instead of a
  zero-sized iframe. Non-splitting flow slots map one deterministic BlockCraft
  page to one browser sheet; `@page`, the mirror and every slot share one physical
  width/height contract so a host print backend cannot silently derive a second
  viewport-sized paper box.
- Browser print uses a minimally short flow slot with `overflow:hidden`; the real
  page keeps its exact physical height inside it. Page descendants can no longer
  extend the slot's fragment and make WebKit emit an intervening blank sheet.
  The inner `.bc-print-content` root explicitly uses `width:auto`: its left and
  right offsets are the sole content-width constraints. This overrides the base
  editor root's `width:100%`, which otherwise discards the right inset and clips
  one full right margin from every wide block.
  Print content is no longer clipped at the inner content-box edge; fragment
  windows and height locks clip their own content, then the physical page is the
  final clipping boundary. Shadows and business controls may therefore extend
  into the configured margin exactly as they do in the paginated screen view.
- The zero-height root `placement-layout` is excluded from normal flow pagination.
  Its global absolute-placement plane is cloned into every print page and shifted
  by the screen page stride (`paper height + pageGap`), so an object keeps its
  original visual page and crossing objects are clipped by adjacent paper boxes
  instead of the whole plane being moved to the last slot page.
  A custom `PrintRenderProvider` supplies host-owned leading content through
  `leadingContent`. BlockCraft mounts that exact DOM in a final-paper-width
  staging page, waits for resources and layout stability, validates its height
  against the stable first-page geometry, then mounts it at z=2 above the z=1
  body. It must not be synthesized as a normal block or measured in a wider host.
  This keeps persisted `placement.y` relative to the same post-header origin as
  the live paginated view. Each print content root
  also retains `data-bc-placement-container`, preserving the theme's
  `under(0) / flow(1) / over(2)` stacking contract. The projected plane is
  widened back from the content box to the full sheet width, so percentage x
  coordinates retain the live root's sheet-relative coordinate system even
  with asymmetric margins. Strict export now fails with `layout-diverged` when
  a non-empty placement plane is missing from the readonly DOM.
- Oversized media and non-breakable atomic blocks may receive
  `--bc-page-fit-scale`; the theme applies this with CSS `zoom` so the complete
  block remains visible inside the page content width/height.
- The unified print surface now idempotently adds its zero-size flow sentinel
  before resource settling and stable-layout validation, including for custom
  render providers. A provider that returns a pagination-disabled document root
  can no longer make its tail block newly match `:last-child`, drop the theme's
  bottom gap, and fail strict export with a false 4px height divergence.

### v0.3.0-alpha.10 - 2026-08-05 (patch) — cap oversized atomic table-cell content

**Severity**: patch

**What changed**: Live pagination now consistently limits oversized atomic
children inside table cells to the page content height. Nested media and embeds
remain clipped, while nested code blocks keep their header visible and expose an
internally scrollable code body.

**Why**: An image, code block or embed taller than one page must not expand its
table row through a sheet boundary. Code still needs an accessible live editing
surface after the atomic one-page cap is applied.

**Affected ai-skills files**:

- `blockcraft-theme.md`

### Behavior Changes

- `.bc-page-nested-height-locked.code-block` now uses a one-page flex shell and
  scrolls `.edit-container-wrapper`; other nested atomic blocks retain clipped
  overflow. The class remains reversible pagination-only view state.

### v0.3.0-alpha.9 - 2026-08-05 (minor) — explicit document layout metrics

**Severity**: minor (additive prerelease API)

**What changed**: `DocConfig.layoutMetrics` can now provide resolved document
`baseFontSize` and `lineHeight` values. `BlockCraftDoc` exposes
`updateLayoutMetrics()` and `refreshLayoutMetrics()` so runtime CSS typography
changes explicitly invalidate model-first virtualization and sparse pagination
geometry. Built-in table estimates now ignore legacy `table-row.props.height`
and use bounded cell-content projection based on O(1) text length.

**Why**: Table placeholder geometry must follow `--bc-fs` / `--bc-lh`, but
estimators cannot safely call `getComputedStyle()` or traverse rich-text deltas.
One document-owned measurement plus explicit host updates keeps the hot and
offscreen paths deterministic.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-perf.md`
- `MIGRATIONS.md`

#### New APIs / Features

- `DocConfig.layoutMetrics?: {baseFontSize?: number; lineHeight?: number}`
- `doc.layoutMetrics` (`DocumentLayoutMetricsManager`)
- `doc.updateLayoutMetrics(metrics)`
- `doc.refreshLayoutMetrics()`
- `BlockModelHeightEstimateContext.baseFontSize` / `.lineHeight`

#### Migration Recipe

Existing hosts require no change; root typography is measured once at init.
Hosts that mutate typography after init must make the invalidation explicit:

```typescript
root.style.setProperty('--bc-fs', '18px')
root.style.setProperty('--bc-lh', '1.5')
doc.refreshLayoutMetrics()

// Or let BlockCraft update both metrics and CSS variables:
doc.updateLayoutMetrics({baseFontSize: 18, lineHeight: 27})
```

#### Behavior Changes

- `table-row.props.height` no longer contributes to model-only table height.
- Table text projection uses `Y.Text.length` rather than `toDelta()` or
  per-character inspection.
- Runtime typography changes do not auto-poll computed style; the host must
  call one of the explicit APIs above.

### v0.3.0-alpha.8 - 2026-08-05 (major) — height-budgeted virtualization overscan

**Severity**: major (breaking prerelease configuration rename)

**What changed**: Root virtualization replaces the root-count-based `overscan`
option with `overscanViewports`. The mounted window is now calculated entirely
from projected height. Its default value `1` reserves one viewport above and
below the visible viewport, for a three-viewport total window. Sparse segment
merging also refuses to bridge an omitted projected gap taller than one quarter
of the viewport.

**Why**: Expanding by root count cannot bound DOM work: two adjacent roots may
be two very large tables. A height budget makes the amount of materialized
layout proportional to the scroll container while keeping small-block documents
smooth during scrolling.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-perf.md`
- `MIGRATIONS.md`

#### Breaking Changes

- `VirtualizationConfig.overscan` and
  `ResolvedVirtualizationConfig.overscan` are replaced by
  `overscanViewports`.

#### Migration Recipe

```typescript
// before: six root children on each side
virtualization: {enabled: true, overscan: 6}

// after: one viewport of projected height on each side (three total)
virtualization: {enabled: true, overscanViewports: 1}
```

#### Behavior Changes

- Fractions such as `overscanViewports: 0.5` are supported; negative values
  clamp to zero.
- At the start or end of a long document, unavailable preload budget shifts to
  the other side so the mounted window still targets three viewport heights.
- A root taller than the target window is mounted as one atomic subtree, but
  no additional roots are added merely to satisfy an item count.
- `segmentMergeGap` remains a root-count cap and now also has a projected-height
  veto, preventing sparse leases from pulling giant omitted roots into the DOM.

### v0.3.0-alpha.7 - 2026-08-05 (patch) — backfill complete responsive image sizing

**Severity**: patch

**What changed**: A mounted built-in image whose persisted data lacks `wr` now
uses the first successful intrinsic-size load to write complete `wr/ar` sizing.
Existing pixel `width/height` is converted using the current root and parent
content widths, then removed in the same no-history Yjs transaction. Images
that already have `wr` continue to backfill only a missing `ar`.

**Why**: Virtualization and sparse pagination can estimate media geometry from
model-only responsive sizing. Previously old image data could acquire `ar`
while permanently retaining no `wr`, leaving persistence only partially
normalized after the image had already mounted and loaded successfully.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-block.md`
- `MIGRATIONS.md`

#### Migration Recipe

No host-code migration is required. Loading an editable legacy image once is
enough to normalize its responsive dimensions. Offscreen images remain on the
existing model fallback until mounted, and readonly images remain unchanged.

#### Behavior Changes

- A successfully loaded, writable legacy image now writes `wr/ar` through
  `ORIGIN_NO_RECORD`; the compatibility write synchronizes and persists but
  does not add an Undo item.
- A legacy pixel width is capped by the current parent width before conversion,
  so the initial responsive frame matches the mounted visual width.
- Once backfilled props arrive, continuous virtualization and sparse pagination
  refresh their shared model-only height estimate from the persisted `wr/ar`.

### v0.3.0-alpha.6 - 2026-08-05 (minor) — independent page chrome distance and styled page-number tokens

**Severity**: minor (additive prerelease API)

**What changed**: `PageChrome` adds an optional `distance` field so headers and
footers can be positioned independently from body margins. Pagination token
substitution now supports decimal, upper/lower Roman and Chinese page numbers.
Resolved pagination geometry exposes the effective chrome distances and body
insets, and live pagination plus print/PDF consume those same resolved values.

**Why**: Word-compatible page setup treats “header from top” and “footer from
bottom” as independent settings. Host applications also need page-number
presets such as Roman numerals, Chinese numerals, decorated numbers and
“current / total” without implementing a second live/print formatter.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-plugins-util.md`
- `MIGRATIONS.md`

#### New APIs / Features

- `PageChrome.distance?: number` measures from the top edge for a header and
  from the bottom edge for a footer.
- `PageNumberTokenStyle`, `formatPageNumber()` and styled `{page:*}` /
  `{total:*}` tokens: `decimal`, `roman-upper`, `roman-lower`, `chinese`.
- `ResolvedPaginationGeometry` includes `headerDistance`, `footerDistance`,
  `contentTop` and `contentBottom` when produced by `resolveScreenGeometry()`.

#### Migration Recipe

No migration is required. Existing configs without `distance` retain their
previous margin-plus-chrome-height layout. To opt in to Word-like page chrome:

```typescript
pagination.updateConfig({
  margins: {top: 72, right: 72, bottom: 72, left: 72},
  header: {center: '{page:roman-upper}', distance: 48},
  footer: {
    right: '第 {page:chinese} 页 共 {total:chinese} 页',
    distance: 48,
  },
})
```

#### Behavior Changes

- An explicit `distance` places chrome inside the body margin band whenever it
  fits; only chrome crossing the body boundary reduces page content height.
- Live page frames and print/PDF pages resolve identical edge distances and
  number tokens.

### v0.3.0-alpha.5 - 2026-08-05 (minor) — add host-controlled document scaling and margin header placement

**Severity**: minor (additive prerelease API)

**What changed**: `BlockCraftDoc` now exposes a `DocumentViewScaleManager` as
`doc.viewScale`. It can attach one host-owned document surface, apply a clamped
50%–200% visual scale, handle Ctrl/Cmd+wheel and publish scale changes while
normalizing virtualization, block placement and table-fullscreen coordinates.
`PaginationDocumentHeaderOptions` also adds `placement: 'top-margin'` and
`topInset` so host document chrome can occupy the first sheet's top margin
without automatically consuming the same height from body content.

**Why**: Host applications need Word-like whole-document zoom without changing
stored font sizes, and custom document headers must share one coordinate system
with live sheets while preserving ordinary page margins.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-block.md`
- `blockcraft-theme.md`
- `blockcraft-perf.md`
- `MIGRATIONS.md`

#### New APIs / Features

- `DocumentViewScaleManager`, `DocumentViewScaleAttachOptions`,
  `DocumentViewScaleChange` and `DocumentViewScaleChangeSource`.
- `doc.viewScale` with `attach`, `detach`, `setScale`, `zoomIn`, `zoomOut`,
  `reset`, `layoutToVisual`, `visualToLayout`, `scale$` and `change$`.
- `PaginationDocumentHeaderOptions.placement` and `.topInset`.

#### Migration Recipe

No migration is required. To opt in:

```typescript
doc.viewScale.attach(documentPageElement, {wheel: true})
doc.viewScale.setScale(1.25)

const pagination = new PaginationPlugin({
  documentHeader: {
    element: documentHeaderElement,
    placement: 'top-margin',
    topInset: 20,
  },
})
```

#### Behavior Changes

- Layout-facing measurements used by root virtualization and block placement
  are normalized while a view scale is attached. At scale 1 the existing
  behavior is unchanged.
- A top-margin document header deducts only its overflow beyond the configured
  body start. The existing default `placement: 'content'` remains unchanged.
- Projecting a host document header keeps absolute objects strictly relative to
  the root content coordinate system. Rendering, pointer measurement and
  virtual visibility share the deterministic `--bc-placement-content-origin-y`
  value (the effective paginated top padding), so objects follow body content
  without using a projection-time DOM delta; persisted `placement.x/y` remains
  unchanged.
- `PaginationPlugin({enabled: true})` now defers controller activation to the
  first frame after document initialization. This avoids sparse-projection
  re-entry during root virtualization setup while preserving the requested
  initial mode.
- Table fullscreen now isolates the active table from host document chrome,
  pagination sheets, absolute objects and fixed host toolbars without reparenting
  the block. It also cancels the host document scale for the duration of fullscreen,
  so table fullscreen and table-local zoom remain viewport-correct at any document
  zoom level. Existing fullscreen classes and CSS tokens remain compatible.

### v0.3.0-alpha.4 - 2026-08-05 (patch) — align nested-host pagination surfaces

**Severity**: patch

**What changed**: Live pagination now distinguishes the actual scroll
container from the root layout surface. `.bc-paginated-scroll` remains on the
configured scrolling ancestor, while the new plugin-owned
`.bc-pagination-surface` class is applied to the root's direct parent and owns
page/content centering. The ordinary editor root also defaults to
`box-sizing: border-box; width: 100%` outside paginated mode. The additive
`PaginationPluginOptions.documentHeader` contract projects and measures a
host-owned first-page header on that same surface.

**Why**: Host applications can place a document header or other wrappers
between the scrolling viewport and the editor root. Mounting page sheets on
the viewport made their origin differ from the root's origin, while host
padding combined with content-box sizing could make the flow root overflow its
declared container width.

**Affected ai-skills files**:

- `blockcraft-app.md`
- `blockcraft-theme.md`
- `blockcraft-plugins-util.md`

### Behavior Changes

- Pagination sheets are mounted under the root's direct parent instead of an
  outer configured scroll ancestor. Host code must continue treating the
  generated backdrop and runtime classes as plugin-owned. The final sheet now
  retains the same 24px canvas clearance as the first sheet instead of ending
  directly at the scroll overflow boundary.
- Non-paginated roots fill the inline size of their immediate container by
  default. A host that intentionally needs a narrower root should set that
  width explicitly in its theme.
- Invalid custom page-chrome heights (`NaN`, infinity or negative values) now
  use the 24px default, so `header` / `footer` customization cannot produce
  invalid page geometry.
- `documentHeader` temporarily reparents the configured live element while
  pagination is enabled, observes its height and includes it in first-page
  capacity and subsequent page-gap geometry. Disable/destroy restores the
  original DOM position and inline styles.

### v0.3.0-alpha.2 - 2026-08-04 (major) — consolidate Schema virtualization capabilities

**Severity**: major (breaking prerelease API cleanup)

**What changed**: The block-level view-retention policy moved from
`IBlockSchemaOptions.metadata.viewRetention` to
`IBlockSchemaOptions.metadata.virtualization.viewRetention`. The existing
`estimateHeight` callback remains in that same `virtualization` capability
object. The former top-level Schema field has been removed. Built-in audio,
video and iframe-style Schemas were migrated without changing their runtime
keep-alive behavior.

**Why**: View retention and model-only height estimation are both policies by
which one block flavour participates in root virtualization. Keeping one at the
Schema metadata root and one under `virtualization` exposed a historical
implementation split rather than a coherent public domain boundary. The alpha
line is the appropriate point to remove that inconsistency before consumers
rely on both spellings.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-block.md`
- `blockcraft-perf.md`
- `MIGRATIONS.md`

#### Breaking Changes

- Removed `IBlockSchemaOptions.metadata.viewRetention`.
- Schema-owned retention is now declared as
  `IBlockSchemaOptions.metadata.virtualization.viewRetention`.

#### New APIs / Features

- `BlockVirtualizationCapability<T>.viewRetention?: BlockViewRetention`
  groups the materialized-view lifecycle policy with the existing model-only
  `estimateHeight` geometry policy.

#### Migration Recipe

Move the existing field into the Schema's virtualization capability object:

```typescript
// before (0.3.0-alpha.1 and earlier)
metadata: {
  version: 1,
  label: 'Custom player',
  viewRetention: 'keep-alive',
}

// after (0.3.0-alpha.2)
metadata: {
  version: 1,
  label: 'Custom player',
  virtualization: {
    viewRetention: 'keep-alive',
    estimateHeight: ({props}) => props.height ?? 320,
  },
}
```

`DocConfig.virtualization.resolveViewRetention`, `retainedViewLimit` and the
other document-wide runtime options do not move.

#### Behavior Changes

- None. Keep-alive still begins only after first materialization and pins the
  containing direct-root render unit until deletion or document disposal.

### v0.3.0-alpha.1 - 2026-08-04 (minor) — let custom Schemas estimate virtual height

**Severity**: minor

**What changed**: `IBlockSchemaOptions.metadata.virtualization.estimateHeight`
lets a custom block return a pure model-only height for continuous root
virtualization and sparse pagination. Its typed context includes block identity,
readonly props, direct child IDs, a cycle-safe child estimator, cached root
content width, fallback height and `layoutMode: 'flow' | 'paginated'`. Finite
non-negative values, including zero, are treated as model-driven geometry and
refresh after relevant offscreen model changes. Invalid values or exceptions
fall through to the existing sizing/built-in/flavour estimate path.

**Why**: Host-specific cards and data views previously had only one fixed
per-flavour estimate. Even when a block persisted an exact `props.height`, it
could not supply that value before mounting. A Schema-owned contract keeps
height rules in the block's domain and also lets semantic blocks such as manual
page breaks distinguish continuous-flow presentation from paginated geometry.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-block.md`
- `blockcraft-perf.md`
- `MIGRATIONS.md`

#### New APIs / Features

- `BlockVirtualizationLayoutMode`
- `BlockModelHeightEstimateContext<T>`
- `BlockModelHeightEstimator<T>`
- `BlockVirtualizationCapability<T>`
- Optional `IBlockSchemaOptions.metadata.virtualization.estimateHeight`

#### Migration Recipe

Existing hosts require no changes. A custom block that previously relied on a
fixed flavour estimate can move the rule into its Schema:

```typescript
// before
new BlockCraftDoc({
  // ...
  virtualization: {
    enabled: true,
    estimatedHeights: {'task-list': 600},
  },
})

// after
const TaskListSchema: IBlockSchemaOptions<TaskListModel> = {
  // ...
  metadata: {
    version: 1,
    label: 'Task list',
    virtualization: {
      estimateHeight: ({props}) => props.height ?? 600,
    },
  },
}
```

The callback must not read DOM or request external data. Persist a compact
layout fact in props when asynchronous content changes height.

#### Behavior Changes

- The bundled `page-divider` estimates `32px` in flow layout and `0px` in
  paginated layout. Its flavour and manual-break semantics are unchanged.
- Schema estimates take precedence over object-sizing, built-in estimates and
  `estimatedHeights[flavour]`; mounted `ResizeObserver` measurements still
  provide exact live geometry.

### v0.3.0-alpha.0 - 2026-08-04 (minor) — add inline and wrapped Shape/WordArt objects

**Severity**: minor

**What changed**: The bundled editor now registers `shape` and `word-art`
inline Embed converters. `ShapeToolbarPlugin` and `WordArtToolbarPlugin` expose
**嵌入型** and **四周型环绕**, preserve the complete object presentation and
text payload during block/inline conversion, and restore top-bottom/under/over
blocks from mixed text without losing adjacent Delta formatting. The shared
inline float layout now accepts a generic object-frame dataset contract in
addition to the existing image contract. HTML round-trips inline object
payloads and wrapping metadata; Markdown degrades them to readable text. Plain
inline and wrapped Shape/WordArt frames also support immediate Pointer Events
drag with same- or cross-editable-block Delta reanchoring.

**Why**: Shapes and WordArt previously supported only block flow and absolute
layers, so they could not participate in a text line or Word-like square text
wrapping. Reusing the one-length Embed and float projection model keeps
selection, clipboard, collaboration, virtualization and adapter behavior
consistent with inline images.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-embed.md`
- `blockcraft-plugins-toolbar.md`
- `blockcraft-inline.md`
- `blockcraft-adapter.md`
- `blockcraft-theme.md`
- `MIGRATIONS.md`

#### New APIs / Features

- `INLINE_SHAPE_EMBED_KEY`, `createInlineShapeDelta()`,
  `readInlineShapeDelta()`, `createInlineShapeEmbedConverter()` and
  `inlineShapeEmbedConverter`.
- `INLINE_WORD_ART_EMBED_KEY`, `createInlineWordArtDelta()`,
  `readInlineWordArtDelta()`, `createInlineWordArtEmbedConverter()` and
  `inlineWordArtEmbedConverter`.
- Shared inline-object payload/layout types and DOM helpers are exported from
  `blocks/inline-object/`.
- `.bc-inline-object-shell`, `.bc-inline-object-frame`,
  `.bc-inline-object-drag-proxy`,
  `[data-bc-inline-float-frame]` and
  `[data-bc-inline-float-layout="wrap"]` form the generic object view/theme
  contract.

#### Migration Recipe

Hosts using `createBundledEditorCapabilities()` need no code change. Hosts that
manually assemble Shape/WordArt capabilities should register a fresh converter
beside each existing Plugin:

```typescript
// before
plugins: [new ShapeToolbarPlugin(), new WordArtToolbarPlugin()]

// after
embeds: [
  ['shape', createInlineShapeEmbedConverter()],
  ['word-art', createInlineWordArtEmbedConverter()],
],
plugins: [new ShapeToolbarPlugin(), new WordArtToolbarPlugin()]
```

No stored-document rewrite or package version change was made in this worktree.
Existing block Shape/WordArt snapshots and image Embed attributes remain
compatible.

#### Behavior Changes

- An absolute Shape/WordArt switched directly to wrapping enters the editable
  text line it visibly covers. Without a covered editable block it falls back
  to the nearest visual flow anchor.
- Clicking an inline Shape/WordArt selects the exact one-character Embed in the
  model and native DOM Range before opening its layout-only toolbar, so
  copy/cut target the object rather than a stale text cursor.
- Inline Shape/WordArt detailed editing is intentionally not nested inside the
  atomic Embed; switching to top-bottom/under/over restores the editable block.
- Dragging a selected inline Shape/WordArt moves its exact Embed payload in one
  Yjs transaction. Wrapped objects also update normalized `x`; plain inline
  objects do not gain float coordinates. Cancel/Escape/blur/readonly teardown
  leaves the model unchanged.
- Model-only virtualization height estimation now accounts for their persisted
  dimensions and square-wrap exclusion height.

### v?.?.? - 2026-08-04 (patch) — convert absolute images directly to text wrapping

**Severity**: patch

**What changed**: `ImgToolbarPlugin` now shows **四周型环绕** directly in the
toolbar for an absolute image. If the image visually overlaps a compatible
editable text block, the action inserts the wrapped image Embed into that
covered text line and removes the absolute image in one Yjs transaction. Its
normalized `x` is recalculated against the target text container, and a
non-empty image caption is preserved as following inline content. If no text
block is actually covered, conversion falls back to a new wrapped paragraph at
the nearest visual flow anchor while translating the absolute `placement.x`.
Clipboard copy/cut/paste event boundaries also resample an editor-owned native
Range before dispatch, so a browser `selectionchange` delay cannot leave those
commands operating on an older collapsed model cursor. Clicking an inline
image now explicitly selects its one-character Embed range in both
`BlockSelection` and the native DOM selection; readonly documents allow this
selection for copy without opening image editing controls.

**Why**: A floating image previously required two toolbar actions to reach text
wrapping. Separately, browsers can dispatch a clipboard shortcut before the
latest native drag selection has propagated into `BlockSelection`; copy then
produced empty content and cut deleted a zero-length range.

**Affected ai-skills files**:

- `blockcraft-plugins-toolbar.md`
- `MIGRATIONS.md`

#### Migration Recipe

No host code, plugin configuration, stored document migration or package
version change is required. Existing image and inline-image snapshots remain
compatible.

#### Behavior Changes

- The block image toolbar shows **四周型环绕** only while the selected image is
  absolute; relative block images keep the existing four layout actions.
- Direct wrapping only enters an editable block whose visual rectangle actually
  intersects the image. A merely nearby block is not used, and the source
  image's own caption cannot become the target.
- A local image still uploading remembers the requested wrap target and
  completes the same conversion after its final URL becomes available.
- Clipboard commands with a native Range inside the editor synchronously sample
  that Range at the browser event boundary. Model-only selections with no
  native Range continue using the canonical `BlockSelection` directly.
- Clicking an inline image produces a length-one text selection covering its
  Embed. Repeated clicks restore that selection without rebuilding the toolbar.
- An Embed-only inline range does not open the floating text/marker toolbar;
  mixed text-plus-Embed selections continue to open it.
- No exported API, option, schema, theme token or package version changed.

### v?.?.? - 2026-08-03 (patch) — preview table column resize with a guide

**Severity**: patch

**What changed**: Built-in table column resizing no longer mutates the live
`<col>` width and column bar on every mouse move. The committed table remains
fixed while an inert body-level active-color vertical guide previews the target
boundary without being clipped by the current table width; mouse release
re-resolves the source cell against the current model grid and writes
`colWidths` once.

**Why**: Live width preview forced the full table to reflow throughout the
gesture. On large paginated tables that repeatedly changed row heights, woke
`ResizeObserver`, invalidated pagination geometry and made the drag lag or
jitter.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-perf.md`
- `blockcraft-plugins-inline.md`
- `MIGRATIONS.md`

#### Migration Recipe

No host code, stored document or plugin configuration migration is required.
Existing `colWidths` data and `TableBlockBinding` construction are unchanged.
No package version was changed.

#### Behavior Changes

- Mouse movement updates only the visual guide and performs no Yjs/model write,
  live table-width mutation or Angular change detection.
- Primary mouse release commits one final `colWidths` update and therefore one
  normal table/pagination reflow.
- Escape, window blur, a readonly release and a stale
  stable-cell anchor cancel the gesture without changing column widths.
- The built-in resize handle is isolated from root mouse/selection capture via
  the existing `data-bc-native-input` UI-island contract, preventing a
  competing selection gesture from being armed before resize starts. Table
  capture gives resize priority over pagination flow-mask and rectangle checks.
- Idle delegated `mousemove` repairs a handle left at the table host after view
  projection; repeated movement in the same cell uses a layout-free identity
  fast path.
- Safari/WebKit may paint the absolute handle while hit-testing the same point
  as its `td`; primary mousedown therefore recognizes the narrow right-edge
  cell geometry without adding reads to the move path.
- A concurrent column reorder is handled by resolving the captured cell ID at
  commit time instead of applying the width to a stale numeric column index.
- No public API, option, stored schema, theme token or package version changed.

### v?.?.? - 2026-08-03 (patch) — make table rectangle editing model-first

**Severity**: patch

**What changed**: Table rectangular selection now resolves coordinates,
rowspan/colspan closure, physical snapshot shape and visible edit targets from a
cached, DOM-free model grid. Input, selected-text extraction and table
copy/cut/paste/delete/Arrow/Tab commands operate on stable cell IDs and model
snapshots. `TableBlockComponent` projects that rectangle only onto currently
mounted cell components.

**Why**: A model-owned `table-cell` selection could remain live while its
intermediate cells lacked ComponentRefs, but subsequent editing still rebuilt
the range from the mounted Component matrix. Rectangular selection followed by
typing or deletion could therefore miss cells or use stale coordinates.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-selection.md`
- `blockcraft-input.md`
- `blockcraft-data.md`
- `blockcraft-perf.md`
- `blockcraft-plugins-inline.md`
- `MIGRATIONS.md`

#### Migration Recipe

No host code or stored-document migration is required. Continue using
`SelectionManager.setTableCellSelection()` and `TableBlockBinding`; built-in
commands automatically use the complete model. No package version was changed.

#### Behavior Changes

- Rectangular typing, IME materialization, delete, selected-text extraction and
  table clipboard/navigation commands no longer require every selected cell to
  have a mounted ComponentRef.
- Merged coverage cells preserve physical TSV/snapshot shape but are edited only
  once through their visible master cell.
- Table selection highlighting touches only mounted master cells and does not
  materialize offscreen cells.
- Malformed real table grids fail closed instead of guessing a destructive
  target from partial component state.
- No public option, method signature, stored schema or package version changed.

### v?.?.? - 2026-08-03 (patch) — continue oversized table cells across pages

**Severity**: patch

**What changed**: Live pagination now creates safe, editable continuations when
one physical table row is taller than the page content area. Direct child-Block
boundaries and complete visual text lines become cell-local continuation
anchors; a pure planner advances different columns independently and stores one
stable plan for exact live layout, sparse Projection and readonly printing.
Screen gaps and table masks are zero-model-length view state. The table's
virtual flow height and internal sheet gaps now also position every following
root Block, preventing content below the table from drifting into the wrong
sheet. IME composition retains the previous stable projection until completion.

**Why**: Row-only table splitting had no legal cut inside a single oversized
`<tr>`. The engine could advance its page count while the live DOM retained the
natural table height, so the table crossed sheet gaps and all later blocks used
a stale vertical origin.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-plugins-util.md`
- `blockcraft-inline.md`
- `blockcraft-theme.md`
- `blockcraft-perf.md`
- `MIGRATIONS.md`

#### Migration Recipe

No host code, stored document or pagination configuration migration is
required. Existing `PaginationPlugin` registrations automatically receive the
corrected behavior. Pagination remains opt-in and continuous layout is
unchanged.

#### Behavior Changes

- A physical table row taller than one content area continues at complete
  Block/text-line boundaries instead of overflowing as one fragment.
- Continuation gaps do not write Yjs, change Delta length or enter Undo history;
  selection mapping ignores them and IME projection is frozen while composing.
- Exact live, sparse live and print layouts share one immutable cell-flow plan;
  blocks after the table use its virtual projected extent.
- Irreducible nested atomic content is clipped locally to the page content
  height without adding a cell scroll container.
- Content-bearing rowspans across several otherwise normal-height physical rows
  retain the existing keep-together row-boundary behavior.
- No public option/signature or package version changed.

### v?.?.? - 2026-08-01 (patch) — suppress native HTML drag for default inline images

**Severity**: patch

**What changed**: The built-in inline-image Embed now renders its real `<img>`
with `draggable="false"` and capture-cancels residual native `dragstart` at the
atomic image shell. The guard is removed through `EmbedConverter.onDestroy()`.
The existing InputTransformer rejection of `deleteByDrag` and
`insertFromDrop` remains the last-resort consistency boundary.

**Why**: A browser could start native image DnD alongside the model-owned
Pointer proxy and dispatch drag input types inside contenteditable even though
BlockCraft later prevented their default DOM mutation.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-embed.md`
- `blockcraft-inline.md`
- `blockcraft-input.md`
- `MIGRATIONS.md`

#### Migration Recipe

No downstream code or stored-document migration is required. Hosts using the
default image converter now receive Pointer-only inline-image movement. A host
that intentionally needs native/cross-application image dragging must continue
to provide its own same-key `image` EmbedConverter.

#### Behavior Changes

- Default inline images no longer start native HTML DnD or drag out of the
  editor; `ImgToolbarPlugin` Pointer movement remains unchanged.
- The shell guard stops only dragstart events originating in that Embed subtree;
  ordinary text selection drag, block handles and external file drops remain
  available.
- Unexpected drag input types are still prevented without a Yjs/model write.
- No public API, Delta field, theme token or package version changed.

### v?.?.? - 2026-08-01 (patch) — isolate inline-image resize preview from text layout

**Severity**: patch

**What changed**: Ordinary and wrapped inline images no longer preview a resize
by changing the committed frame inside contenteditable. Their left/right handles
now freeze the frame, text fragments, selection and connected toolbar while an
accessibility-inert body-level outline displays the proportional target bounds
and live pixel dimensions. Pointerup still writes the existing short
`width/height` Delta attributes once.

**Why**: A live frame resize could enter or cross projected wrap text while the
fragment boundaries still represented the committed size, making the visual
resize feedback become obscured or disappear.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-plugins-toolbar.md`
- `MIGRATIONS.md`

#### Migration Recipe

No downstream code or stored document migration is required. The existing
inline-image Delta fields and `ImgToolbarPlugin` construction remain unchanged.

#### Behavior Changes

- The real inline-image frame and editable text layout stay fixed for the whole
  resize gesture; only the inert body overlay updates on animation frames.
- The left handle fixes the committed right edge and the right handle fixes the
  committed left edge. Target width is clamped to the owning editable content
  bounds, height keeps the resolved image ratio, and wrapped left-edge resizes
  update the existing normalized `x` so the final frame matches the preview.
- Escape, pointercancel, window blur, toolbar close, readonly changes and stale
  Delta anchors remove the outline and release layout/virtual-view leases
  without writing model data.
- Block-image, shape and WordArt resize behavior is unchanged.
- No public API, theme token, serialized field or package version changed.

### v?.?.? - 2026-08-01 (patch) — estimate offscreen table height from row models

**Severity**: patch

**What changed**: Root virtualization and sparse pagination now estimate a
built-in table's pre-mount height from its direct `table-row` models. Positive
row `props.height` values are summed, invalid heights use the configured
`table-row` estimate or the built-in 60px fallback, and the configured `table`
estimate remains a minimum total height.

**Why**: Treating every unmounted table as one fixed-height card made the main
scroll range and model-only navigation severely underestimate tables with
hundreds or thousands of rows.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-perf.md`
- `MIGRATIONS.md`

#### Migration Recipe

No downstream code changes are required. Existing height configuration remains
valid; the table value is now a floor and an optional row fallback can refine
invalid/missing row heights:

```typescript
virtualization: {
  enabled: true,
  estimatedHeights: {
    table: 240,
    'table-row': 60,
  },
}
```

#### Behavior Changes

- A non-empty unmounted table can reserve more vertical space than its static
  `estimatedHeights.table` value when its row sum is larger.
- Empty/malformed tables retain the previous flavour fallback.
- Initial and row-structure estimation is `O(rows)` and reads no cell content
  or DOM.
- Nested cell text/props changes do not rescan all rows per keystroke; direct
  table-row height props and row structure changes refresh the estimate.
- The value remains non-exact for pagination/printing, and table row/cell views
  are not virtualized by this patch.
- No package version was changed by this source update.

### v?.?.? - 2026-07-31 (minor) — add dual-sided Word-like inline-image wrapping

**Severity**: minor

**What changed**: Wrapped inline images with `side: 'auto'` now place real
editable text on both sides when both intervals are at least 96 CSS pixels.
The mounted editable block uses reversible local TextBlot row fragments while
retaining the same one-length Delta Embed and persisted `wrap/side/x/gap`
fields. Explicit left/right and unsafe auto positions keep the contained
single-side float fallback. Multiple anchors use deterministic Delta-order
push-down, and virtual height estimates use combined dual-side capacity.
Wrapped-image dragging now keeps the committed frame in place and moves an
inert x/y proxy; pointerup maps y to a same- or cross-block Delta anchor and
commits the preserved Embed payload in one transaction.

**Why**: A native CSS float can reserve only one edge-connected exclusion and
cannot reproduce Word-style text on both sides of a centered image. Local real
Blot fragments provide dual-side layout without introducing a cloned editor,
new model fields or cross-block exclusions.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-inline.md`
- `blockcraft-plugins-toolbar.md`
- `blockcraft-input.md`
- `blockcraft-selection.md`
- `MIGRATIONS.md`

#### New APIs / Features

- Eligible `side: 'auto'` dual-side line-fragment projection
- Grapheme-safe Range fitting and projection-owned TextBlot split rollback
- Delta-order multi-image exclusion-band push-down
- Package-internal selection, IME and pointer layout-freeze coordination
- Word-style x/y drag proxy with same/cross-editable-block anchor movement
- Presentation-only `.bc-inline-image-drag-proxy` theme hook

#### Migration Recipe

No data or host-code migration is required. To force the prior one-sided
presentation, persist an explicit side instead of `auto`:

```typescript
// before: auto selected the wider single side
createInlineImageDelta(url, 320, 180, {
  wrap: true,
  side: 'auto',
  x: 0.3,
})

// after: explicit side preserves single-sided wrapping
createInlineImageDelta(url, 320, 180, {
  wrap: true,
  side: 'right',
  x: 0.3,
})
```

#### Behavior Changes

- `auto` uses both sides only when each side is at least 96 CSS pixels; it
  otherwise falls back to the wider side. Ties remain deterministic.
- Explicit `left/right` behavior and all serialized Delta/HTML fields remain
  unchanged.
- During drag, fragment boundaries, selection and the committed image stay
  frozen while an accessibility-inert proxy follows x/y outside contenteditable.
  Pointerup commits normalized `x` plus the resolved Delta anchor once; no
  pixel `y` is added to the schema.
- Same-block moves compensate forward offsets after deleting the one-length
  Embed. Cross-block moves delete and insert the exact Embed payload inside one
  Yjs transaction. Gaps/non-editable hits snap to the nearest compatible
  mounted editable block; editor-external drops cancel.
- IME and native pointer selection defer fragment rewrites until their active
  gesture ends. Selection is reprojected from the existing anchor/head model.
- Runtime detach/destroy removes projections, observers, scheduled frames and
  leases; reattach rebuilds from current Y.Text.
- No package version was changed by this source update.

### v?.?.? - 2026-07-31 (patch) — restore immediate local-image upload preview

**Severity**: patch

**What changed**: Built-in local block-image insertion no longer waits for
intrinsic metadata before creating the block. The block immediately shows its
local preview and upload progress, then initializes root-relative `wr/ar` from
the first successful preview load. Initial display width and later pointer
resize are capped by the current parent content width while `wr` remains based
on the root content width.

**Why**: Waiting for image decoding before insertion hid the established upload
state and made selecting or dropping an image feel unresponsive. The mounted
preview already exposes reliable browser-normalized intrinsic dimensions and
can initialize responsive sizing without blocking document insertion.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-block.md`
- `MIGRATIONS.md`

#### Migration Recipe

No downstream code changes are required. Custom interactive insertion paths
that copied the old built-in pre-read pattern can insert immediately:

```typescript
// before: delays insertion until metadata decoding finishes
const size = await readImageIntrinsicSize(file)
const snapshot = ImageBlockSchema.createSnapshot({
  src: fileService.createObjectURL(file),
  wr: 100,
  ...(size ? {ar: size.ar} : {}),
})

// after: the mounted built-in image preview initializes wr/ar
const snapshot = ImageBlockSchema.createSnapshot({
  src: fileService.createObjectURL(file),
})
```

`readImageIntrinsicSize()` remains available for model-only workflows that
must provide explicit dimensions before mounting.

#### Behavior Changes

- Media-panel selection, empty-image selection and file drop insert the local
  image before intrinsic metadata decoding.
- The first successful local preview writes `wr/ar` through the no-history
  initialization path. Upload completion changes only `src`.
- Small images retain intrinsic width; large or nested images are capped at
  the current parent width. Persisted `wr` remains root-relative for
  virtualization, pagination and responsive rendering.
- Image pointer resizing uses the parent width as its maximum and the root
  width as its persistence basis.
- Remote/legacy image initialization, peer “同步中…” presentation and upload
  failure behavior are unchanged.
- No package version was changed by this source update.

### v?.?.? - 2026-07-31 (minor) — add square wrapping for inline images

**Severity**: minor

**What changed**: The built-in one-length `image` inline Embed now supports
optional square text wrapping. New typed wrap attributes round-trip through
the default converter and HTML adapter, the image toolbar can switch and
position the wrapped image with a Word-style x/y proxy, and
virtualization/sparse pagination reserve a model-derived contained height
before the DOM mounts.

**Why**: Inline images need Word-like four-sided text flow without becoming
block images or absolute placement objects, while retaining native caret/IME
behavior and predictable virtual geometry.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-embed.md`
- `blockcraft-inline.md`
- `blockcraft-plugins-toolbar.md`
- `MIGRATIONS.md`

#### New APIs / Features

- `InlineImageWrapSide = 'auto' | 'left' | 'right'`
- `InlineImageWrapOptions`
- Optional fourth
  `createInlineImageDelta(src, width, height, wrapOptions)` argument
- `normalizeInlineImageWrapOptions()`
- Stable `.bc-inline-image-frame` inside the existing inline-image shell
- Inline-only **四周型环绕** toolbar action and proxy-based Pointer Events
  positioning
- HTML `data-bc-wrap*` preservation and model-only wrapped-height estimation

#### Migration Recipe

Existing inline-image snapshots and three-argument helper calls require no
migration. To opt in:

```typescript
// before: ordinary inline image
createInlineImageDelta(url, 320, 180)

// after: square wrapping, image starts at 24% of the editable width
createInlineImageDelta(url, 320, 180, {
  wrap: true,
  side: 'auto',
  x: 0.24,
  gap: 12,
})
```

#### Behavior Changes

- Missing `wrap` preserves the previous ordinary inline rendering.
- Wrapped floats are contained inside their owning editable block and never
  affect later blocks.
- HTML preserves `wrap/side/x/gap`; Markdown intentionally drops those layout
  fields while keeping the image URL.
- Wrapped resize creates one final model write. Drag previews remain DOM-only;
  release creates one transaction that may update `x`, the Delta anchor, or
  both.
- No package version was changed by this source update.

### v?.?.? - 2026-07-31 (patch) — simplify the WordArt floating toolbar

**Severity**: patch

**What changed**: The default WordArt connected toolbar no longer duplicates
the preset and font-family selectors owned by the fixed toolbar. Font size and
the remaining local styling, alignment, placement, layering and deletion
controls stay available. The shadow toggle now uses the semantic
`bc_wenziyinying` iconfont glyph.

**Why**: Keeping whole-preset and font-family selection in one fixed-toolbar
entry makes the object toolbar narrower and avoids two competing entry points
for the same presentation controls.

**Affected ai-skills files**:

- `blockcraft-plugins-toolbar.md`
- `MIGRATIONS.md`

#### Behavior Changes

- `WordArtToolbarComponent` no longer renders `艺术字预设` or `艺术字字体`
  overlay triggers.
- The fixed toolbar's **插入艺术字** visual preset dropdown is unchanged.
- No WordArt schema, props, snapshot or Plugin registration migration is
  required.

### v?.?.? - 2026-07-31 (minor) — distinguish template locks from user locks

**Severity**: minor

**What changed**: Persistent block locks now carry an optional origin. Ordinary
user locks preserve the existing owner-unlock behavior, while template locks
remain protected after a template is instantiated and require an explicit host
unlock grant even when the current user ID matches the persisted owner. The
rendered block host also exposes the effective lock kind so template authoring
can reveal lock decoration without showing it in ordinary template use.

**Why**: Screen-local styling or a fixed demo identity cannot express the
business lifecycle of authoring a template and later using its snapshots in
other editors. Lock intent must travel with the block data.

**Affected ai-skills files**:
- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-theme.md`
- `MIGRATIONS.md`

### New APIs / Features

- `BlockLockKind = 'user' | 'template'`
- `SetBlockReadonlyOptions` and
  `BlockCraftDoc.setBlockReadonly(block, readonly, {kind})`
- `DocConfig.defaultBlockLockKind?: BlockLockKind`
- `BlockCraftDocBuilder.defaultBlockLockKind(kind)`
- `BlockReadonlyResolution.lockKind`
- `BlockUnlockContext.lockKind`
- `IBaseMetadata.lockKind?: 'template'`
- `data-bc-lock-kind="user|template"` on readonly block hosts
- `data-bc-reveal-template-locks` authoring-only styling hook

### Migration Recipe

Existing locks require no data migration and continue to resolve as user locks.
Template authoring hosts should opt their generic lock controls into template
locks and explicitly authorize template unlocks:

```typescript
const doc = new BlockCraftDoc({
  // before
  currentUserId: session.userId,
})

doc.setBlockReadonly(regionId, true)
```

```typescript
const doc = new BlockCraftDoc({
  // after
  currentUserId: session.userId,
  defaultBlockLockKind: 'template',
  canUnlockBlock: ({lockKind, currentUserId, lockUserId}) =>
    lockKind === 'template'
    && permissions.canEditTemplate(currentUserId)
    && currentUserId === lockUserId,
})

doc.setBlockReadonly(regionId, true) // generic controls now create template locks
// or: doc.setBlockReadonly(regionId, true, {kind: 'template'})
```

For legacy snapshots known to come from a template-authoring store, migrate
valid `meta.lock` values by adding `meta.lockKind = 'template'` before import.
Do not apply that migration indiscriminately to ordinary documents.

### Behavior Changes

- Missing or unknown `meta.lockKind` resolves as `'user'`.
- A user lock remains owner-unlockable; a template lock always requires
  `DocConfig.canUnlockBlock` to return `true`.
- Clipboard copies remove both `meta.lock` and `meta.lockKind`.
- The base theme hides explicit template-lock decoration unless an ancestor
  opts in with `data-bc-reveal-template-locks`; readonly enforcement is
  unchanged.

### v?.?.? - 2026-07-31 (minor) — add editable WordArt blocks

**Severity**: minor

**What changed**: The package now exports a direct-Y.Text `word-art` editable
Block, classic WordArt presentation presets and normalization helpers, a
zero-config `WordArtToolbarPlugin`, lossless HTML mapping, readable Markdown
degradation and a dedicated Snapshot Viewer renderer. The bundled capability
factory and fixed toolbar register and insert it by default. The existing
`ShapeResizerComponent` gained backward-compatible calculator, preview-mirror,
rotation-label and border-drag inputs so WordArt and future fixed objects can
share the same eight handles, rotation affordance and Word-like edge movement.

**Why**: Decorative text needs the same selection, placement, resizing,
rotation, layering, collaboration and persistence guarantees as visual
objects, while remaining directly editable through the framework's normal
Y.Text/IME pipeline.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-block.md`
- `blockcraft-plugin.md`
- `blockcraft-plugins-ref.md`
- `blockcraft-plugins-toolbar.md`
- `blockcraft-adapter.md`
- `MIGRATIONS.md`

#### New APIs / Features

- `WordArtBlockSchema`, `WordArtBlockComponent`, `WordArtBlockProps`
- `WordArtToolbarPlugin`, `WordArtToolbarComponent`,
  `WordArtTransformOverlayComponent`
- `WORD_ART_PRESETS`, `WORD_ART_FONT_OPTIONS`, `getWordArtPreset()`
- `normalizeWordArtProps()`, `resolveWordArtPresentation()`,
  `wordArtPresentationToInlineStyle()`, `calculateWordArtResize()`
- `ShapeResizeCalculator` and optional `ShapeResizerComponent` inputs:
  `resizeCalculator`, `previewMirror`, `rotationLabel`, `borderDraggable`

#### Migration Recipe

The bundled editor requires no migration. A custom Schema/Plugin assembly can
opt in explicitly:

```typescript
const schemas = new SchemaManager([
  // existing schemas
  WordArtBlockSchema,
  PlacementLayoutBlockSchema,
]);

const plugins = [
  // existing plugins
  new WordArtToolbarPlugin(),
];
```

#### Behavior Changes

- Bundled block materials now include `word-art`; the fixed toolbar shows
  the **插入艺术字** five-card visual preset dropdown when that Schema is
  registered. Its previews reuse the production presentation resolver.
- Choosing a fixed-toolbar preset creates an absolute `over` object near the
  saved selection with that presentation, enters editing and selects all
  default `艺术字` text.
- WordArt transform handles render inside the real surface so rotated resize
  previews and committed placement share one coordinate system. Its preset,
  font, fill, effect and horizontal/vertical alignment menus use the shared
  floating-toolbar overlays. Alignment choices are iconfont-only, and range
  controls match the shape-toolbar track, thumb and focus treatment.
- Clicking text or blank space enters WordArt text editing without arming an
  object drag. Object placement/reorder starts only from one of the four
  invisible hit regions on the visible selection border; no separate move
  handle is rendered.
- HTML preserves the complete allowlisted presentation/placement model.
  Markdown intentionally degrades to a normal readable paragraph.
- No existing Schema, snapshot or Plugin configuration changes are required.

### v?.?.? - 2026-07-31 (minor) — add generic instance metadata for content regions

**Severity**: minor

**What changed**: Editable Block instances can now persist a custom placeholder
mode (`plhMode`), while container instances can persist opt-in direct-child
filters (`incl` / `excl`). Schemas declare which non-editable containers
interpret the child filters and whether a container may remain empty. The
package also adds a generic `render-unit` block,
model-first child eligibility, and an optional host mutation policy for
protecting template structure.

**Why**: Template decorators need contextual hints in empty content areas and
per-instance child restrictions without creating one Block flavour per
template. Static Schema restrictions remain the non-negotiable upper bound.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-block.md`
- `blockcraft-plugins-ref.md`
- `blockcraft-plugins-util.md`
- `blockcraft-theme.md`
- `MIGRATIONS.md`

#### New APIs / Features

- `IBaseMetadata.plhMode?: 'focused' | 'always'`
- `IBaseMetadata.incl?: string[]` and `excl?: string[]`
- `BlockPlaceholderMode`
- `BlockInstanceMetaCapability`
- `IBlockSchemaOptions.metadata.instanceMeta`
- `IBlockSchemaOptions.metadata.allowEmptyChildren`
- `SchemaManager.isValidChildrenForInstance(...)`
- `matchesBlockFlavourPattern(...)` and
  `evaluateInstanceChildConstraints(...)`
- `BlockCraftDoc.canInsertChild(parentId, childFlavour)`
- `RenderUnitBlockSchema`, `RenderUnitBlockComponent`, and
  `RenderUnitBlockModel`
- `DocConfig.blockMutationPolicy?: BlockMutationPolicy` and the exported
  mutation-policy types, manager and error

#### Migration Recipe

```typescript
metadata: {
  includeChildren: ['paragraph', 'image'],
  instanceMeta: {
    childConstraints: true,
  },
}

const region = MyRegionSchema.createSnapshot()
region.meta = {
  incl: ['paragraph'],
  excl: ['image'],
}
const paragraph = ParagraphBlockSchema.createSnapshot()
paragraph.meta = {
  plh: '在此添加正文或图片',
  plhMode: 'always',
}
region.children = [paragraph]

// Instance-aware insertion eligibility:
doc.canInsertChild(parentId, childFlavour)
```

#### Behavior Changes

- Instance rules only narrow the static Schema. `excl` wins over `incl`, an
  explicit empty `incl` allows nothing, and malformed rules fail closed.
- `DocCRUD` enforces instance rules for insert, move and replace.
- Persistent placeholders on editable blocks remain visible in readonly mode
  while empty and hide during IME composition. Non-editable containers do not
  render placeholder metadata; regions place it on an editable child.
- Placeholder DOM uses `.bc-placeholder-empty` and
  `.bc-placeholder-target[data-placeholder]`, retaining host `.empty`.
- `table-cell`, `column`, and `callout` do not opt into instance child
  constraints.
- Package version is intentionally unchanged; maintainers decide releases.

### v?.?.? - 2026-07-31 (patch) — virtualize root absolute layouts from model geometry

**Severity**: patch

**What changed**: Root virtualization now builds a model-only vertical
visibility index for absolute children of the zero-height root
`placement-layout`. It compares persisted root-relative `placement.y` and
estimated object height with the current root-relative viewport plus one
viewport of pre-rendering. The layout is no longer keep-alive after its first
materialization; it can detach when no absolute child or interaction lease is
visible.

**Why**: Continuous root virtualization previously saw only the layout's
zero-height root entry. On a cold reload it could omit the layout even when an
absolute image was visibly positioned in the initial viewport, so the image
component and its stable loading placeholder were never created. Permanently
pinning the entire layout would fix correctness but defeat virtual rendering.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-block.md`
- `MIGRATIONS.md`

### Behavior Changes

- Absolute coordinates are interpreted against the root children content
  coordinate system. New direct absolute insertion uses that same container as
  its measurement origin.
- `placement-layout` does not contribute to normal-flow height or scroll
  anchoring. Its visibility projection runs separately and reads no child DOM
  geometry during scrolling.
- Responsive media uses persisted `wr/ar`; fixed-size objects use model
  `width/height`; rotated fixed-size objects expand their vertical visibility
  band to the rotated bounding box.
- The current root-layout phase remains atomic: one visible absolute child
  mounts all siblings in that layout. Selection and pointer interactions can
  still pin the unit independently.
- No snapshot or host configuration migration is required.

### v?.?.? - 2026-07-30 (minor) — add stable visual-resource placeholders

**Severity**: minor

**What changed**: The package now exports a standalone visual-resource
placeholder directive, generic image/video/iframe adapters, resource state
types and a browser-compatible local-image metadata reader. Built-in block
images, videos, default inline images and Snapshot Viewer compose the same
loading/error/retry presentation with their existing stable size frame.
Image creation also accepts a short `{src, wr?, ar?}` object input. Root
virtualization and sparse pagination now share one model-only media height
estimator.

**Why**: Waiting for media metadata left image geometry at zero, caused layout
jumps after virtual remounts and made inline/block failure states inconsistent.
Persisting or deterministically reserving the frame before loading lets
offscreen layout compute without mounting DOM while keeping resource loading an
optional directive/component extension rather than a document capability.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-block.md`
- `blockcraft-inline.md`
- `blockcraft-plugins-toolbar.md`
- `MIGRATIONS.md`

#### New APIs / Features

- `BcResourcePlaceholderDirective`
- `ResourcePlaceholderState`, `ResourceIntrinsicSize`,
  `ResourcePlaceholderAdapter` and related binding types
- `imageResourcePlaceholderAdapter`,
  `videoResourcePlaceholderAdapter`,
  `iframeResourcePlaceholderAdapter`
- `readImageIntrinsicSize(source, options?)`
- `ImageBlockCreateInput` and
  `ImageBlockSchema.createSnapshot({src, wr?, ar?})`

#### Migration Recipe

Existing integrations require no migration. Custom visual blocks can opt into
the shared state UI while keeping geometry in their own props:

```html
<div
  #frame
  bcResourcePlaceholder
  [resourceElement]="image"
  [resourceKey]="props.src"
>
  <img #image [src]="props.src" />
  <block-resizer [container]="frame" />
</div>
```

Local image creators can avoid the fallback correction:

```typescript
const size = await readImageIntrinsicSize(file);
const snapshot = ImageBlockSchema.createSnapshot({
  src: fileService.createObjectURL(file),
  wr: 100,
  ...(size ? { ar: size.ar } : {}),
});
```

The positional `createSnapshot(src, width?, height?, caption?)` image API is
still supported.

#### Behavior Changes

- New local image insertions read intrinsic dimensions before writing the
  snapshot. Remote/legacy block images with no `ar` use 4:3 immediately and
  backfill the first successful ratio without Undo history.
- Default inline images use stored `width/height` or reserve `320 × 240`; the
  first successful load fills only missing dimensions in an
  `ORIGIN_NO_RECORD` transaction.
- Loading failure keeps the same geometry and exposes an in-place retry.
- Snapshot updates move prepared resource frames into the live tree and
  destroy detached controllers; completed resources do not leak listeners.
- Continuous virtualization and sparse pagination use the same DOM-free
  `wr/ar` / inline-image estimator. Ordinary text keeps its prior measured
  height rather than being overwritten by a generic fallback.
- `EmbedConverter.onDestroy` now also runs for the old view during semantic
  embed re-render, not only on final blot detach.

### v?.?.? - 2026-07-30 (major) — share the full bundled capability catalog

**Severity**: major

**What changed**: The package now exports one reference-editor capability
catalog through `BUNDLED_EDITOR_SCHEMAS`,
`BUNDLED_EDITOR_BLOCK_MATERIAL_GROUPS`,
`projectBundledBlockMaterials()`, `validateBundledEditorCapabilities()` and
`createBundledEditorCapabilities()`. The bundled editor and template surfaces
consume the same factory instead of maintaining divergent registration lists.
Four built-in Plugins that previously inherited/collided on non-unique runtime
names now publish stable IDs.

**Why**: A host that copied the bundled list could silently omit blocks,
inline embeds or toolbars, and stateful Plugin instances could accidentally be
shared across documents. Unique validation also exposed historical Plugin name
collisions that made a complete validated stack impossible.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-plugin.md`
- `blockcraft-plugins-ref.md`
- `blockcraft-plugins-block.md`
- `blockcraft-plugins-inline.md`
- `blockcraft-plugins-toolbar.md`

#### Breaking Changes

- `OrderedBlockPlugin.name`: `"custom"` → `"ordered-block"`
- `CodeInlineEditorBinding.name`: `"custom"` →
  `"code-inline-editor-binding"`
- `TableBlockBinding.name`: `"custom"` → `"table-block-binding"`
- `BookmarkBlockExtensionPlugin.name`: `"EmbedFrameExtensionPlugin"` →
  `"bookmark-block-extension"`

Only integrations that use `plugin.name` as a lookup key need to migrate.
Plugin constructors and behavior are otherwise unchanged.

#### New APIs / Features

- `BUNDLED_EDITOR_SCHEMAS`: ordered, duplicate-free full Schema baseline.
- `BUNDLED_EDITOR_BLOCK_MATERIAL_GROUPS` and
  `projectBundledBlockMaterials()`: insertion-panel projection that omits root,
  internal child and infrastructure schemas.
- `createBundledEditorCapabilities(options)`: creates a fresh
  `SchemaManager`, embed converter list and full Plugin stack per Doc, with
  host options and additional Schema/embed extension points.
- `validateBundledEditorCapabilities(input)`: rejects duplicate block
  flavours, embed names and Plugin names before initialization.

#### Migration Recipe

```typescript
// before: copied lists can drift, and stateful instances are easy to reuse
const schemas = new SchemaManager(copiedBundledSchemas);
const plugins = copiedBundledPlugins;

// after: call once for every BlockCraftDoc
const capabilities = createBundledEditorCapabilities({
  additionalSchemas: [MyBlockSchema],
  additionalEmbeds: [["my-embed", myEmbedConverter]],
});
const doc = new BlockCraftDoc({
  // ...
  schemas: capabilities.schemas,
  embeds: [...capabilities.embeds],
  plugins: [...capabilities.plugins],
});
```

If application code keys Plugin settings by the old names, replace those keys
with the stable IDs listed under Breaking Changes.

#### Behavior Changes

- Full bundled capability creation throws immediately on duplicate Schema,
  embed or Plugin identities instead of allowing later registration ambiguity.
- Each factory call owns new Plugin and embed converter instances; sharing one
  returned capability object across documents is unsupported.

### v?.?.? - 2026-07-30 (minor) — add per-block placeholder metadata

**Severity**: minor

**What changed**: Editable block instances can now persist their own
placeholder with `meta.plh?: string`. `PlaceholderPlugin` resolves this field
before its per-flavour runtime override and Schema default, and observes active
block meta changes through one doc-level subscription. The public
`BaseBlockComponent.updateMeta()` patch type now also describes its existing
runtime behavior that `null` deletes a metadata key.

**Why**: Schema placeholder declarations and Plugin overrides apply to every
block of one flavour. Applications need two paragraph instances of the same
flavour to carry different collaborative, serializable guidance without
cloning or mutating a global Schema.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-block.md`
- `blockcraft-plugins-util.md`
- `blockcraft-data.md`
- `MIGRATIONS.md`

### New APIs / Features

- `IBaseMetadata.plh?: string`
- `BaseBlockComponent.updateMeta()` accepts `null` as a typed deletion command
  for metadata keys, matching its existing runtime behavior.

### Migration Recipe

No existing document or integration requires migration. Set an instance
placeholder before insertion or on a mounted block:

```typescript
const snapshot = ParagraphBlockSchema.createSnapshot();
snapshot.meta.plh = "请输入摘要";

block.updateMeta({ plh: "请输入摘要" });
block.updateMeta({ plh: "" }); // disable only this block
block.updateMeta({ plh: null }); // delete and restore flavour/schema fallback
```

### Behavior Changes

- Resolution order is `block.meta.plh` → Plugin flavour override → Schema
  `metadata.placeholder`.
- Empty-string `plh` explicitly disables placeholder for that block.
- Missing `plh` preserves the previous behavior; malformed non-string values
  are ignored and fall through without modifying the document.
- Active-block local, remote and Undo/Redo `plh` changes refresh immediately.
  Other blocks and other meta keys do not trigger placeholder DOM writes.
- Plugin subscription count remains constant with document size.

### v?.?.? - 2026-07-30 (minor) — add one-step absolute object stacking

**Severity**: minor

**What changed**: `BlockPlacementManager` now exposes one-step
foreground/background movement for absolute root objects. Child order inside
the root `placement-layout` defines order within the `under` and `over` tiers,
with ordinary flow content acting as a virtual boundary. The built-in image and
shape toolbars expose the same movement using the
`bc_cengji-shangyi` / `bc_cengji-xiayi` iconfont glyphs.

**Why**: Choosing only **衬于文字下方** or **浮于文字上方** could not resolve
overlap between multiple absolute objects. Authors need predictable adjacent
movement without editing numeric z-index values or coupling ordering to DOM
paint accidents.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-plugins-toolbar.md`
- `MIGRATIONS.md`

### New APIs / Features

- `BlockPlacementManager.canMoveForward(blockOrId)`
- `BlockPlacementManager.canMoveBackward(blockOrId)`
- `BlockPlacementManager.moveForward(blockOrId)`
- `BlockPlacementManager.moveBackward(blockOrId)`

### Migration Recipe

Existing snapshots require no data migration. Custom absolute-object toolbars
can delegate to the document manager:

```typescript
if (doc.placement.canMoveForward(block)) {
  doc.placement.moveForward(block);
}

if (doc.placement.canMoveBackward(block)) {
  doc.placement.moveBackward(block);
}
```

### Behavior Changes

- Later `placement-layout.children` siblings paint above earlier siblings within
  the same semantic tier.
- Moving the highest `under` object forward makes it the lowest `over` object;
  moving the lowest `over` object backward makes it the highest `under` object.
  The layer and child order change in one Yjs transaction.
- Moving forward at the highest `over` object or backward at the lowest `under`
  object returns `false`; built-in toolbar controls render disabled there.

### v?.?.? - 2026-07-30 (minor) — add root-relative object sizing

**Severity**: minor

**What changed**: Block Schemas can now opt into root-relative object sizing.
The built-in image and video blocks persist top-level `wr` (root content width
percentage) and `ar` (width/height), share one Pointer Events width resizer,
and resolve dimensions through the document-owned
`BlockObjectSizingManager`. Root virtualization, sparse pagination, Snapshot
Viewer and HTML adapters consume the same model. Existing pixel
`width/height` snapshots remain supported and migrate only after the user
completes a resize.

**Why**: Pixel sizes were tied to one editing viewport and could not provide
stable model-only height estimates for virtual rendering. A flavour-agnostic
Schema capability also lets iframe-like objects adopt the same sizing model
without duplicating media-specific logic.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-block.md`
- `blockcraft-adapter.md`
- `blockcraft-plugins-toolbar.md`
- `MIGRATIONS.md`

### New APIs / Features

- Optional `IBlockSchemaOptions.metadata.objectSizing`
- `BlockObjectSizingCapability`
- `BlockObjectSizeProps`
- `ObjectDimensionsSource`
- `NormalizedObjectSize`
- `ResolvedObjectDimensions`
- `normalizeObjectSize()`
- `resolveObjectDimensions()`
- `deriveObjectSizeFromPixels()`
- `BlockObjectSizingManager` and `doc.objectSizing`
- `ResizeContainerComponent.referenceWidth`
- `BlockResizeCommit.basisWidth`

### Migration Recipe

Existing custom pixel-sized blocks continue to work. To adopt responsive object
sizing, compose the props type, persist `wr`, declare Schema defaults and use
the document resolver:

```typescript
// before
props: {width?: number; height?: number}

// after
props: BlockObjectSizeProps & {url: string}

metadata: {
  objectSizing: {defaultWr: 100, defaultAr: 16 / 9},
}

const dimensions = doc.objectSizing.resolve(block.flavour, block.props)
```

Lossless custom HTML adapters should write/read `data-bc-wr` and
`data-bc-ar`. Standard Markdown requires no change.

### Behavior Changes

- New images and videos default to `wr: 100`; missing image/video ratios use
  Schema defaults until intrinsic metadata fills `ar`.
- Root width changes update mounted dimensions and offscreen height estimates
  without writing Yjs or adding Undo history.
- Image/video aspect ratio is locked during left/right Pointer Events resize;
  pointerup produces one props write.
- A legacy pixel object keeps its old visual size until the first completed
  resize, then writes `wr/ar` and clears `width/height` atomically.
- Snapshot Viewer and HTML export now preserve `wr/ar`; HTML import prefers the
  new data attributes before legacy pixel dimensions.

### v?.?.? - 2026-07-30 (major) — converge shape picker icons on SVG geometry

**Severity**: major

**What changed**: The fixed toolbar's 12-item shape picker now renders trusted
shape geometry through the exported `ShapeIconComponent`. The
`ShapeDefinition.icon` field and built-in picker iconfont values were removed;
each picker preview reuses the same `path` as the inserted shape. The fixed
toolbar entry keeps its existing `bc_tuxing` iconfont glyph.

**Why**: Iconfont approximations duplicated geometry metadata and caused
several distinct shapes to display the same generic glyph. A single path source
keeps built-in and future shape previews accurate without adding SVG asset
files or font glyphs.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-block.md`
- `blockcraft-plugins-formatting.md`
- `blockcraft-plugins-toolbar.md`
- `MIGRATIONS.md`

### Breaking Changes

- Exported `ShapeDefinition` no longer contains `icon: string`.

### New APIs / Features

- Exported standalone `ShapeIconComponent` with required `path` input.

### Migration Recipe

Shape definition values should remove their duplicate iconfont class:

```typescript
// before
const definition: ShapeDefinition = {
  type: "rectangle",
  label: "矩形",
  icon: "bc_icon bc_juxing",
  path: "M0 0H1000V1000H0Z",
  textInsets,
};

// after
const definition: ShapeDefinition = {
  type: "rectangle",
  label: "矩形",
  path: "M0 0H1000V1000H0Z",
  textInsets,
};
```

### Behavior Changes

- The shape entry keeps its existing `bc_tuxing` iconfont glyph.
- Picker icons inherit `currentColor` and display the exact inserted geometry.
- Other BlockCraft icons continue to use iconfont.

### v?.?.? - 2026-07-30 (minor) — add drag rotation to shapes

**Severity**: minor

**What changed**: The built-in shape block now supports Word-like
drag rotation from a top-center selection handle. Rotation is persisted as an
optional shape prop, normalized to finite degrees, rendered together with shape
text, preserved by HTML import/export and committed once per Pointer Events
gesture. Eight-direction resize now transforms screen pointer deltas into the
rotated shape's local axes and maps edge compensation back to page coordinates.

**Why**: Shapes need direct visual rotation without adding toolbar-only controls
or allowing browser-native drag/drop. Coordinate-aware resize is part of the
same feature because axis-aligned pointer math becomes incorrect as soon as a
shape is rotated.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-block.md`
- `blockcraft-plugins-toolbar.md`
- `blockcraft-adapter.md`
- `MIGRATIONS.md`

### New APIs / Features

- Optional `ShapeBlockProps.rotation`; normalized
  `NormalizedShapeBlockProps.rotation`
- `ShapeRotateCommit`
- `normalizeShapeRotation()`
- `calculateShapeRotation()`
- `rotateShapeVector()`
- `ShapeResizerComponent.rotation` input and `rotateCommit` output

### Migration Recipe

Existing shape snapshots and typed prop overrides require no change because
`rotation` is optional and missing values normalize to `0`. Custom exporters
that aim for lossless BlockCraft HTML should preserve the new attribute:

```html
<figure data-bc-block="shape" data-shape-rotation="37.5"></figure>
```

### Behavior Changes

- Selecting an unlocked shape shows a rotation handle above its resize outline.
  Dragging rotates freely; holding Shift snaps to the nearest 15°.
- Rotation preview is animation-frame-coalesced outside Angular. Pointerup
  performs one `updateProps()` write; pointer cancel, Escape, window blur and
  destruction restore the pre-gesture transform without a write.
- Rotated resize handles follow shape-local axes. Absolute west/north resize
  compensation is rotated back into the placement container coordinate system.
- The shape toolbar keeps additional top clearance so it does not cover the
  rotation handle, and pointerdown on the handle never starts object movement.
- HTML round-trips rotation through `data-shape-rotation`; malformed external
  values normalize safely.

### v?.?.? - 2026-07-30 (minor) — add the root placement layout

**Severity**: minor

**What changed**: Standard absolute image and shape blocks now live below one
hidden `placement-layout` at the end of `root.children` instead of remaining
ordinary root-flow siblings. The bundled editor registers the new
`PlacementLayoutBlockSchema`; `BlockPlacementManager` lazily creates, merges,
normalizes and removes the layout. Absolute descendants are excluded from
BlockController and ordinary sibling navigation, while an explicit
full-document root selection still copies/deletes the complete layout subtree.
Object position adjustment is Pointer Events-only and commits one placement
update on `pointerup`; it does not use native HTML5 drag/drop.

**Why**: A CSS-absolute block that remained a normal flow sibling had
contradictory model and visual positions. BlockController, range operations and
virtualization could still treat it as if it occupied its old source location.
A root infrastructure surface gives placement one canonical structural
boundary and keeps future positionable shapes on the same editor capability.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-block.md`
- `blockcraft-selection.md`
- `blockcraft-input.md`
- `blockcraft-plugins-block.md`
- `blockcraft-plugins-toolbar.md`
- `blockcraft-adapter.md`
- `MIGRATIONS.md`

### New APIs / Features

- `PlacementLayoutBlockSchema`, `PlacementLayoutBlockComponent`
- `BLOCK_PLACEMENT_LAYOUT_FLAVOUR`
- `BlockPlacementManager.isPlacementLayout()`
- `BlockPlacementManager.isInAbsoluteLayout()`
- `BlockPlacementManager.getRootFlowChildIds()`
- `BlockPlacementManager.getAbsoluteBlockIds()`
- `BlockPlacementManager.insertAbsoluteSnapshot()`
- `BlockPlacementManager.allowsGapCursor()`
- `BlockPlacementManager.isAbsoluteObjectSelection()`
- Snapshot Viewer structural rendering for `placement-layout`
- The layout accepts future custom positionable flavours; normalization keeps
  only children whose own Schema supports absolute placement.

### Migration Recipe

Custom schema assemblies that enable standard absolute placement must register
the infrastructure schema:

```typescript
// before
const schemas = new SchemaManager([
  ImageBlockSchema,
  ShapeBlockSchema,
  ShapeTextBlockSchema,
]);

// after
const schemas = new SchemaManager([
  PlacementLayoutBlockSchema,
  ImageBlockSchema,
  ShapeBlockSchema,
  ShapeTextBlockSchema,
]);
```

Do not add native drag handlers to custom object toolbars:

```typescript
// before
host.addEventListener("dragstart", startPositionDrag);

// after
host.addEventListener("pointerdown", (event) => {
  doc.placement.startDrag(event, block);
});
```

### Behavior Changes

- The standard absolute transition is root-only. Nested container objects
  return `false` for absolute layout until a future scoped layout phase.
- Legacy root-level absolute objects and duplicate/invalid placement layouts
  are normalized through a no-undo Yjs repair path.
- Returning to top-bottom or inline placement inserts near the object's current
  visual position; it does not persist or restore the old logical index.
- Ordinary range navigation/copy/delete stops before the placement layout.
  Full-root copy/cut/delete includes its absolute descendants.
- BlockController never responds to the placement layout or its descendants;
  image/shape-specific toolbars own those interactions.
- The fixed toolbar creates shapes directly in the placement layout with the
  default `over` tier. If this is the first object, the layout and shape are
  inserted as one nested snapshot; no temporary root-flow state is rendered.
- The placement layout and absolute objects expose no gap cursor. Stale gap
  snapshots degrade to whole-block selection, and relative gaps are restored
  when an object returns to flow.
- Whole absolute-object selection prevents printable input, IME, Enter, Tab and
  paste while preserving Delete/Backspace and object toolbar operations.
  Nested editable children such as `shape-text` still use normal text input.
- Shape text is visually integrated with its shape and has no independent
  border, outline, shadow, background or block margin.
- HTML flattens the infrastructure wrapper but preserves image/shape placement
  attributes so document initialization can reconstruct the root layout.

### v?.?.? - 2026-07-29 (patch) — simplify shape editing UI and create text lazily

**Severity**: patch

**What changed**: Empty `ShapeBlockSchema` snapshots no longer contain a
placeholder `shape-text` child. The child is created and focused only when the
user double-clicks the shape, or when non-empty text is explicitly passed to
`createSnapshot()`. The default shape toolbar no longer shows shape type, text
color or text alignment controls, and its remaining outline-width dropdown now
uses BlockCraft's shared floating-toolbar style instead of a native `select`.
Empty shape HTML also omits `data-bc-shape-text`.

**Why**: Empty editable children appeared as unexplained paragraphs in the
document model, while native selects and duplicated controls made the compact
object toolbar inconsistent with other BlockCraft toolbars.

**Affected ai-skills files**:

- `blockcraft-block.md`
- `blockcraft-plugins-toolbar.md`
- `blockcraft-adapter.md`
- `MIGRATIONS.md`

### Behavior Changes

- `ShapeBlockSchema.createSnapshot()` and calls with empty text now return a
  childless shape. Callers that pass non-empty text keep the previous one-child
  result.
- `ShapeToolbarAction` and the underlying text-style props remain available for
  compatibility; only the bundled toolbar surface is reduced.
- HTML import/export preserves both childless shapes and shapes containing text.

### v?.?.? - 2026-07-29 (minor) — add Word-like shape blocks

**Severity**: minor

**What changed**: BlockCraft now exports a `shape` container block, its
collaborative `shape-text` editable child, 12 normalized SVG shape definitions,
eight-direction resize behavior, and `ShapeToolbarPlugin`. The toolbar controls
shape geometry/style/text alignment and uses the shared object-layout states
**上下型 / 衬于文字下方 / 浮于文字上方**; no inline-shape representation is
introduced. The bundled fixed toolbar adds a visible **插入形状** picker backed
by the same 12 definitions. HTML preserves the full shape model and Markdown
degrades to readable text.

**Why**: Documents need Word-like diagram objects that share the editor's
selection, collaboration, undo/redo, object placement and iconfont conventions
instead of a one-off host implementation.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-block.md`
- `blockcraft-plugin.md`
- `blockcraft-plugins-formatting.md`
- `blockcraft-plugins-ref.md`
- `blockcraft-plugins-toolbar.md`
- `blockcraft-adapter.md`
- `MIGRATIONS.md`

### New APIs / Features

- `ShapeBlockSchema`, `ShapeTextBlockSchema`
- `ShapeBlockComponent`, `ShapeTextBlockComponent`
- `ShapeToolbarPlugin`, `ShapeToolbarComponent`, `ShapeToolbarAction`
- `ShapeBlockProps`, `ShapeKind`, `ShapeStrokeStyle`, `ShapeTextAlign`,
  `ShapeVerticalAlign`
- `SHAPE_KINDS`, `SHAPE_DEFINITIONS`, `DEFAULT_SHAPE_PROPS`,
  `getShapeDefinition()`, `isShapeKind()`, `normalizeShapeProps()`
- `ShapeResizerComponent`, `ShapeResizeHandle`, `ShapeResizeCommit`,
  `calculateShapeResize()`

### Migration Recipe

Custom editor assemblies can opt in additively:

```typescript
const schemas = new SchemaManager([
  // existing schemas...
  ShapeBlockSchema,
  ShapeTextBlockSchema,
]);

const plugins = [
  // existing plugins...
  new ShapeToolbarPlugin(),
];
```

### Behavior Changes

- The bundled editor registers both shape schemas and the toolbar plugin, so the
  slash/block insertion menu now includes **形状**. Its fixed toolbar also
  shows a `bc_tuxing` **插入形状** button whose 12-item picker inserts the
  chosen type near the saved selection and selects the new shape.
- Shape HTML round-trips geometry, style, text and placement. Shape Markdown
  exports only its readable text.
- No existing block or plugin behavior is removed or renamed.

### v?.?.? - 2026-07-29 (patch) — stabilize connected overlay positioning

**Severity**: patch

**What changed**: `DocOverlayService.createConnectedOverlay()` now defaults
`flexibleDimensions` to `false`. Callers can still opt into CDK flexible sizing
by passing `flexibleDimensions: true`.

**Why**: CDK's flexible-position bounding box can left-align a fixed-width pane
after a scroll-driven position update, causing a centered toolbar to jump
toward the viewport edge. Exact dimensions keep fixed toolbars anchored
consistently.

**Affected ai-skills files**:

- `blockcraft-toolbar.md`
- `MIGRATIONS.md`

### Migration Recipe

Only overlays that relied on the previous implicit flexible sizing need a
change:

```typescript
doc.overlayService.createConnectedOverlay(
  {
    target,
    component: LongPickerComponent,
    flexibleDimensions: true,
  },
  close$,
);
```

### Behavior Changes

- Connected overlays now use CDK exact dimensions unless
  `flexibleDimensions: true` is supplied explicitly.

### v?.?.? - 2026-07-29 (minor) — add schema-gated block placement and layers

**Severity**: minor

**What changed**: BlockCraft now provides a document-level relative/absolute
placement capability. Schemas opt in through `metadata.placement`; placement
state lives in normal block props and the new `doc.placement` manager owns mode
switching, the standard under/over stacking tiers and pointer drag. Its
user-facing object-layout facade standardizes **嵌入型 / 上下型 /
衬于文字下方 / 浮于文字上方**, while relative/absolute remain implementation
details. Hosts
with an existing layout domain can adapt mode transitions synchronously through
`DocConfig.placement.transitionMode`. The built-in image Schema, image toolbar
and BlockController use this capability, including edge recovery for blocks
placed below normal content. Returning an absolute block to relative flow, or
converting an absolute block image to an inline image, now resolves the nearest
ordinary sibling from the block's current visual center and performs the
move plus clear/replace atomically. BlockController SVG metadata now renders
symbol IDs directly instead of depending on `MatIconRegistry`.

**Why**: free positioning previously lived in a template-decoration feature,
so ordinary images could only be reordered in document flow. SVG icons also
appeared blank when a route had not registered icon names with Angular
Material, even though the iconfont symbol sprite was present.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-block.md`
- `blockcraft-selection.md`
- `blockcraft-plugins-block.md`
- `blockcraft-plugins-toolbar.md`
- `MIGRATIONS.md`

### New APIs / Features

- `BlockPlacementMode`, `BlockPlacementLayer`, `BlockPositionState` and
  `ResolvedBlockPosition`.
- `IBlockProps.placement?: BlockPositionState`.
- `IBlockSchemaOptions.metadata.placement?: {modes: readonly BlockPlacementMode[]}`.
- `BlockCraftDoc.placement: BlockPlacementManager`.
- `DocConfig.placement?: BlockPlacementConfig`, with the synchronous
  `BlockPlacementTransitionContext` adapter.
- `BlockPlacementManager.getState()`, `supports()`, `setMode()`,
  `resolveFlowAnchor()`, `reanchorToFlow()`, `setLayer()`, `updateAbsolute()`,
  `startDrag()`, `cancelDrag()` and its drag state stream.
- `BlockObjectLayout`, `BlockObjectBlockLayout`,
  `BLOCK_OBJECT_LAYOUT_OPTIONS`, `BlockObjectLayoutAdapter`, and
  `BlockObjectLayoutAdapterContext`.
- `BlockPlacementManager.getObjectLayout()`, `supportsObjectLayout()`,
  `setObjectLayout()` and `registerObjectLayoutAdapter()`.
- `BlockPlacementFlowAnchor`, a stable-id `{parentId, anchorBlockId, side}`
  descriptor for composing flow reanchoring into another Yjs transaction.
- `resolveBlockPlacement()`, `resolvePlacementBox()` and
  `measureBlockPlacement()` helpers, plus `measureObjectPlacement()` for
  measuring an inline representation against its future block container.
- Block menu item/action types accept the optional `svgIcon` symbol ID.
- `ImageBlockSchema` supports relative and absolute placement by default.

### Migration Recipe

No migration is required for flow-only blocks. To opt a custom visual block in:

```typescript
interface MyProps {
  placement?: BlockPositionState;
}

const MySchema = {
  // ...
  metadata: {
    version: 1,
    label: "My block",
    placement: { modes: ["relative", "absolute"] },
  },
};

doc.placement.setObjectLayout(block, "under");
doc.placement.setObjectLayout(block, "top-bottom");
```

When migrating an older custom free-positioning shape, translate it once at the
snapshot boundary:

```typescript
// before
props: {x: 20, y: 80}

// after
props: {placement: {mode: 'absolute', x: 20, y: 80}}
```

To expose **嵌入型** for a custom shape, register its representation adapter
during plugin initialization and release it during destruction:

```typescript
const release = doc.placement.registerObjectLayoutAdapter("my-shape", {
  toInline: ({ doc, block }) => {
    // replace the block with your inline embed in one transaction
    return true;
  },
});
```

### Behavior Changes

- Built-in placement menus no longer expose “相对定位 / 绝对定位” or a
  separate layer menu. Under/over automatically enter absolute placement;
  top-bottom automatically returns to relative flow.
- Image block and inline-image toolbars use the same four labels and iconfont
  glyphs. Inline → under/over preserves the inline image's current visual
  coordinates when creating the absolute block.

If an application already moves blocks between host-owned flow and free-layout
containers, adapt the core command once instead of duplicating UI behavior:

```typescript
new BlockCraftDoc({
  // ...
  placement: {
    transitionMode: ({ block, to }) => {
      if (!isHostLayoutBlock(block)) return false;
      moveInHostLayout(block, to);
      return true;
    },
  },
});
```

### Behavior Changes

- The base block host renders absolute positioning only for Schemas that opt in;
  stale placement props on other Schemas remain relative.
- Switching to absolute measures the block's current visual position. Switching
  back resolves the nearest mounted ordinary sibling from the absolute block's
  visual center, moves before/after that sibling's midpoint and removes
  placement in one transaction. With no valid anchor it keeps the old logical
  position and only clears placement.
- The image toolbar's block-image → inline-image conversion consumes the same
  visual anchor and groups reordering plus replacement into one transaction.
- Pointer movement uses transform-only preview and commits one undoable props
  update on release. Readonly blocks and concurrent block reorder drags reject
  the interaction.
- Materialized absolute blocks hold a virtualization view lease until returned
  to relative flow.
- Absolute placement layers resolve to `under` or `over`; the base
  renderer uses `under: 0`, ordinary flow children `1`, and `over: 2` inside an
  isolated placement container. Existing state without `layer` remains `over`;
  legacy unreleased `normal` and `top` values are read as `over` and normalized
  on the next layer or coordinate write.
- Under-content blocks can be selected from a narrow visible edge band; readonly
  blocks remain selectable while their mutations stay rejected.
- `setMode()` offers the optional host adapter even when the requested core mode
  equals the current one, allowing multiple host domain states to refine
  relative flow.
- BlockController trigger/menu SVG icons resolve document symbol IDs directly.

### v?.?.? - 2026-07-28 (minor) — add experimental sparse live pagination

**Severity**: minor

**What changed**: `PaginationPluginOptions` adds the opt-in
`experimentalSparseView` flag, and the bundled reference
`<block-craft-editor>` adds the initialization-only `paginationSparseView`
input. When both sparse pagination and root virtualization are enabled, an
internal paginated Projection drives root viewport/spacer geometry without a
full-document view lease. Pagination gap, table-break and height-lock effects
now cache complete layout state while reading and mutating only mounted root
views.

**Why**: exact live pagination previously required mounting every root Block,
which removed the memory and mount-time benefit of root virtualization. Phase C
introduces a guarded sparse path so large-document behavior can be exercised
before it becomes the default in a later phase.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-perf.md`
- `blockcraft-plugins-util.md`
- `MIGRATIONS.md`

### New APIs / Features

- `PaginationPluginOptions.experimentalSparseView?: boolean` defaults to
  `false`. With root virtualization enabled, `true` activates the Phase C
  sparse Projection path.
- The bundled reference editor accepts
  `<block-craft-editor [paginationSparseView]="true">`. Like
  `virtualizationEnabled`, it is read during component construction.
- The sparse path keeps mounted root count proportional to viewport,
  overscan and existing pins. Offscreen roots use model-derived estimates;
  mounted roots upgrade to live measurements.

### Migration Recipe

No migration is required. Existing applications retain the exact
full-document-lease behavior because the new option defaults to `false`.
Opt in explicitly for large-document validation:

```typescript
const pagination = new PaginationPlugin({
  enabled: true,
  experimentalSparseView: true,
});

const doc = new BlockCraftDoc({
  // ...
  virtualization: { enabled: true },
  plugins: [pagination],
});
```

For the bundled reference editor:

```html
<block-craft-editor
  [virtualizationEnabled]="true"
  [paginationSparseView]="true"
/>
```

### Behavior Changes

- Default behavior is unchanged: live pagination still holds the exact
  full-document view lease while enabled.
- In experimental sparse mode, the paginated Projection owns viewport/spacer
  coordinates; continuous height observation is paused so page gaps cannot
  pollute the continuous `HeightMap`.
- Offscreen text/props/structure updates invalidate model geometry and schedule
  one frame-coalesced `O(N)` scan of cached numbers. DOM reads remain bounded
  to mounted roots.
- Unmounted page gaps, table breaks and height locks are replayed when their
  root view remounts and are cleared idempotently on disable/destroy.
- A non-exact sparse layout is not reused for print/PDF; export falls back to
  the complete readonly reflow. The Phase E background `ensureExact()` queue is
  not part of this release.
- Repeated invalid Projection order/length disables sparse pagination and
  restores continuous virtualization; it does not force a full-document mount.

### v?.?.? - 2026-07-28 (minor) — expose model layout invalidation facts

**Severity**: minor

**What changed**: `BlockModelGraph` now exposes the additive
`contentChange$` stream with `IBlockModelContentChange` and
`BlockModelContentChangeKind`. Structure events add optional
`affectedRootIds` for direct-root layout invalidation. Phase B also introduces
a package-internal stable-ID pagination GeometryIndex, LayoutCoordinator,
paginated Projection and bounded shadow comparator; these internals compare
against the legacy live pagination result and are not exported.

**Why**: pagination and future sparse layout work need model-level content and
root-impact facts that remain valid for unmounted blocks. The internal shadow
path can now validate model-derived pagination geometry before it is allowed to
control mounting or DOM presentation.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-data.md`
- `blockcraft-perf.md`
- `MIGRATIONS.md`

### New APIs / Features

- `BlockModelGraph.contentChange$` emits transaction-coalesced reachable block
  IDs, `"text"` / `"props"` kinds and Yjs `origin`, `local` and `isUndoRedo`
  context.
- Exported `IBlockModelContentChange` and
  `BlockModelContentChangeKind = "text" | "props"` describe that stream.
- `IBlockModelStructureChange.affectedRootIds?: readonly string[]` reports the
  direct-root render units affected by structural layout changes. Current
  runtimes always populate the optional field; pure direct-root reorder emits
  an empty array.

### Migration Recipe

No migration is required for existing text-only consumers. `textChange$`
retains its original filtering and transaction context:

```typescript
// Existing code remains valid.
doc.model.textChange$.subscribe(({ blockIds, local, origin, isUndoRedo }) => {
  updateTextIndex(blockIds);
});

// Opt in only when text, inline attributes or props should invalidate work.
doc.model.contentChange$.subscribe(({ blockIds, kinds }) => {
  invalidateModelDerivedState(blockIds, kinds);
});

// The new structure field is optional for source-compatible mocks/consumers.
doc.model.structureChange$.subscribe((change) => {
  invalidateRootLayout(change.affectedRootIds ?? []);
});
```

### Behavior Changes

- `contentChange$` includes reachable text mutations, inline attribute changes,
  nested props changes, `children`/`props` replacement and whole reachable
  block replacement. It ignores `meta`-only changes and unreachable blocks.
- Every runtime structure event now carries `affectedRootIds`, while the public
  field remains optional.
- Phase B pagination remains diagnostic-only: legacy DOM appliers and the
  full-document view lease are still authoritative. Text-only changes mark
  geometry dirty and rely on `ResizeObserver`; props, structure, theme, font
  and content-width changes schedule coalesced animation-frame recomputation.
  Each actual recomputation temporarily performs legacy and shadow pagination,
  both linear in document size.

### v?.?.? - 2026-07-28 (patch) — prepare internal vertical layout projection seams

**Severity**: patch

**What changed**: Phase A added the package-internal
`VerticalLayoutProjection` query contract, its continuous-layout
`ContinuousLayoutProjection` adapter, and parallel projected viewport and
scroll-anchor helpers. `RootVirtualizationManager` now routes viewport,
scroll-anchor, spacer and stable-navigation layout reads through its internal
active Projection. `HeightMap` remains the mutable continuous-layout index, and
all existing exported entry points retain their current signatures.

**Why**: later pagination/virtualization integration needs read-only projected
geometry without making the still-evolving Projection lifecycle a public
extension contract. This patch is internal architecture preparation only and
has no external API or runtime behavior impact.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-perf.md`
- `MIGRATIONS.md`

### Migration Recipe

No migration is required. Existing `HeightMap`, viewport, scroll-anchor,
virtualization and pagination calls continue to work unchanged. The new
Projection types and projected helpers are not exported from the
virtualization public barrel.

### Behavior Changes

None externally. The active Projection is fixed to
`ContinuousLayoutProjection`, which reads the same `HeightMap`; continuous
layout coordinates and runtime behavior remain equivalent. Custom Projection
registration, `change$`-driven switching and continuous/paginated Projection
transitions are not implemented. Live `PaginationPlugin` still acquires a
full-document view lease while enabled, so the pagination/virtualization
conflict is not resolved in Phase A.

### v?.?.? - 2026-07-28 (minor) — stabilize collaboration cursor colors

**Severity**: minor

**What changed**: `BlockCraftAwareness.setLocalUser()` now accepts an optional
`color` on the user object. A valid concrete CSS color is used for that user's
remote cursor; otherwise the stable user ID maps to a curated collaboration
palette. Labels and collapsed carets use the solid color, while non-collapsed
ranges use the same color at 18% opacity.

**Why**: the previous `getRandomDarkColor(.4)` fallback could create muddy,
nearly black, or visually adjacent colors. It also assigned the same user a
different color on different clients and reconnects, while using a translucent
color for the name label reduced text contrast.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-theme.md`
- `MIGRATIONS.md`

### New APIs / Features

- The exported `CollaborationUser` shape is
  `{id: string, name: string, color?: string}`.
- `setLocalUser({id, name, color})` publishes an optional host-selected
  concrete CSS color through Awareness.

### Migration Recipe

Existing integrations remain valid:

```typescript
cursorAwareness.setLocalUser({
  id: currentUser.id,
  name: currentUser.name,
});
```

To preserve a product/account color:

```typescript
cursorAwareness.setLocalUser({
  id: currentUser.id,
  name: currentUser.name,
  color: currentUser.profileColor,
});
```

### Behavior Changes

- Missing or invalid explicit colors now fall back to a deterministic palette
  entry derived from `user.id`; `Math.random()` is no longer used.
- The same user ID keeps the same fallback color across clients and reconnects.
- Cursor name labels use white text on an opaque solid background.
- Non-collapsed remote selections use an 18%-opacity version of the same color.
- Color parsing and hashing run only when a remote user is created or its
  identity/color changes, not on selection, text, scroll, resize, or virtual
  view refresh paths.

### v?.?.? - 2026-07-28 (major) — make persistent block locks owner-aware

**Severity**: major

**What changed**: the persistent block-level readonly bit was replaced by an
owner user ID. `meta.lock?: string` now represents both explicit lock presence
and ownership. `DocConfig.currentUserId` owns new locks, and only the same user
or a synchronous host `canUnlockBlock` grant can remove them.

**Why**: `meta.readonly?: boolean` could prevent content writes but could not
distinguish the user who created a lock from any other collaborator, so every
compatible client could expose an unrestricted unlock action.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-block.md`
- `blockcraft-data.md`
- `blockcraft-plugins-block.md`
- `MIGRATIONS.md`

### Breaking Changes

- `IBaseMetadata.readonly?: boolean` was removed and replaced by
  `IBaseMetadata.lock?: string`.
- Legacy `meta.readonly` values are not read or migrated; old locked blocks load
  as unlocked until the host performs its own data migration.
- `BlockReadonlyResolution` now includes required
  `lockUserId: string | null`.
- `setBlockReadonly(block, true)` now throws `BlockLockError` when the document
  has no valid `DocConfig.currentUserId`.
- `setBlockReadonly(block, false)` now throws `BlockLockError` unless the
  current user owns the explicit lock or the host grants additional permission.

### Deprecations

- `stripReadonlyMetaDeep()` remains as an alias with no removal date. New code
  should use `stripBlockLockMetaDeep()`.

### New APIs / Features

- `DocConfig.currentUserId?: string` supplies the stable identity captured by
  the document's block-lock manager.
- `DocConfig.canUnlockBlock?: (context: BlockUnlockContext) => boolean`
  synchronously grants additional unlock permission, typically for admins.
- `BlockCraftDoc.canUnlockBlock(blockOrId)` exposes the current unlock decision.
- `BlockReadonlyResolution.lockUserId` exposes the effective explicit owner's
  ID for self or ancestor locks.
- `BlockReadonlyManager.currentUserId`,
  `getExplicitLockUserId()`, `canLock()` and `canUnlock()` expose owner-aware
  permission state.
- `BlockLockError`, `BlockLockErrorReason` and `BlockUnlockContext` are exported
  for typed host integration.

### Migration Recipe

Before:

```typescript
const doc = new BlockCraftDoc({
  // ...
});

// persisted metadata
block.meta.readonly = true;

doc.setBlockReadonly(block.id, true);
doc.setBlockReadonly(block.id, false); // any compatible client could unlock
```

After:

```typescript
const doc = new BlockCraftDoc({
  // ...
  currentUserId: currentUser.id,
  canUnlockBlock: ({ currentUserId }) =>
    currentUserId !== null && permissions.isDocumentAdmin(currentUserId),
});

// persisted metadata after locking
block.meta.lock === currentUser.id;

doc.setBlockReadonly(block.id, true);
if (doc.canUnlockBlock(block.id)) {
  doc.setBlockReadonly(block.id, false);
}
```

BlockCraft intentionally performs no automatic legacy migration. If existing
`meta.readonly === true` data must stay protected, migrate it before document
initialization by assigning an application-defined owner ID to `meta.lock`.

### Behavior Changes

- Missing identity disables lock/unlock controls but does not make unlocked
  content readonly.
- Another user's explicit lock cannot be overwritten by calling
  `setBlockReadonly(block, true)`.
- Owners always retain unlock permission; `canUnlockBlock` only adds permission
  and cannot deny the owner.
- The BlockController switch distinguishes owner, other-user, inherited and
  missing-identity states and rechecks authorization when clicked.
- Full document snapshots retain `meta.lock`; clipboard serialization removes
  it so pasted copies are editable.
- Owner-aware checks remain a trusted-client policy. Raw Yjs updates still need
  server/persistence authorization when they cross a security boundary.

### v?.?.? - 2026-07-28 (minor) — add mode-independent stable block navigation

**Severity**: minor

**What changed**: `BlockCraftDoc.navigateToBlock(blockId)` now reveals a
reachable stable block ID in both full and virtual rendering. It waits for
document initialization, uses latest-request-wins cancellation, and resolves a
boolean without changing model Selection, native DOM Selection, or focus. The
bundled editor's copied block links now preserve the current document URL and
can reveal an initially unmounted target after reload or same-document history
navigation.

**Why**: Hosts need one navigation contract for copied links, search, comments,
outline entries, and history restoration. Calling the virtualization subsystem
directly leaked rendering mode and could race document initialization.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`

### New APIs / Features

- `BlockCraftDoc.navigateToBlock(blockId: string): Promise<boolean>` reveals a
  stable target in either rendering mode. `true` means the latest request
  reached a mounted target; missing/stale/destroyed/superseded requests resolve
  `false`.

### Migration Recipe

```typescript
// before: virtual-mode-only host integration
const revealed = await doc.virtualization.scrollToBlock(blockId);

// after: works before init and in either rendering mode
const revealed = await doc.navigateToBlock(blockId);
```

### Behavior Changes

- `RootVirtualizationManager.scrollToBlock(blockId)` now keeps a pre-init
  request pending until the manager is initialized. A newer request or disposal
  settles that pending request with `false`.
- Copied links from the bundled editor replace only the copied URL's `blockId`
  query parameter instead of using a hard-coded document origin.
- Activating a same-document block link navigates directly without writing the
  current URL or browser history.
- An initial URL `blockId` queues navigation but does not initialize the bundled
  Playground editor; the target is revealed after explicit initialization.

### v?.?.? - 2026-07-22 (minor) — add opt-in model-first root virtualization

**Severity**: minor

**What changed**: `DocConfig.virtualization` can now enable root-child view
windowing. Yjs and `BlockModelGraph` stay complete while `DocVM` creates and
mounts only viewport, overscan and selection-leased root subtrees. Spacer DOM,
measured height correction and ID-based scroll anchoring preserve document
geometry.

**Why**: Selection and input no longer require every block component to exist,
so large documents can reduce Angular/DOM cost without introducing a second
data or selection model.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-block.md`
- `blockcraft-data.md`
- `blockcraft-perf.md`
- `blockcraft-plugins-block.md`
- `blockcraft-plugins-util.md`
- `blockcraft-selection.md`
- `blockcraft-toolbar.md`

### New APIs / Features

- `DocConfig.virtualization?: VirtualizationConfig` with `enabled`, `overscan`,
  `segmentMergeGap`, bounded `retainedViewLimit`, and per-flavour
  `estimatedHeights`, plus optional `resolveViewRetention(context)` overrides.
- Exported virtualization kernel types/utilities and
  `RootVirtualizationManager`.
- `BlockCraftDoc.virtualization` exposes the document-owned coordinator.
- The bundled `EditorComponent.virtualizationEnabled` input selects whether its
  internally constructed document enables virtualization. It defaults to
  `true` and is applied once during component initialization.
- `DocVM` supports root-only creation, retained subtree ensure/mount and sparse
  root structural reconciliation.
- `RootVirtualizationManager.ensureViewMounted(blockIds)` synchronously
  materializes transient view capabilities without creating a persistent pin.
- `RootVirtualizationManager.scrollToBlock(blockId)` resolves a stable nested or
  root block ID, transiently mounts/pins its containing root unit, and returns a
  promise that settles after bounded real-DOM center correction.
- `RootVirtualizationManager.acquireBlockViewLease(blockIds)` synchronously
  mounts and pins only the containing root units, follows stable IDs across
  structure changes, and returns an idempotent release function.
- `RootVirtualizationManager.viewChange$` emits deduplicated mounted root-ID
  windows for view-bound plugin projection lifecycle.
- `RootVirtualizationManager.acquireFullDocumentViewLease()` synchronously
  mounts all root units for exact whole-document DOM capabilities and returns
  an idempotent release function.
- `BlockModelGraph.getTextDeltas(blockId)` and `textChange$` expose rich text
  reads and changed block IDs without requiring mounted components.
- `BlockModelGraph.synchronizeParentBeforeView(parentId)` is exported for
  framework composition but marked `@internal`. It is the sparse-root write
  pipeline's model-before-view barrier; extensions must continue to treat
  `doc.model` as read-only.
- `DocCRUD.replaceText(blockId, ...)` and `applyTextDelta(blockId, ...)` provide
  readonly-guarded Yjs writes for reachable unmounted editable blocks.
- `DocCRUD.formatText(blockId, index, length, attrs)` provides the corresponding
  readonly-guarded rich-text formatting write without a ComponentRef.
- `DocCRUD.updateBlockProps(blockId, patch)` provides the corresponding
  readonly-guarded props write for reachable blocks without requiring a
  ComponentRef. A `null` patch value deletes the key.
- `DocCRUD.insertBlockSnapshots(parentId, index, snapshots)` inserts into a
  reachable parent without requiring its ComponentRef and returns stable block
  IDs without resolving inserted components for the caller. Existing parent
  views still follow normal Yjs synchronization; `insertBlocks()` keeps its
  synchronous component-returning contract.
- `DocCRUD.replaceBlockSnapshots(blockId, snapshots)` replaces a reachable
  non-root block and returns stable IDs without resolving replacement views.
  `replaceWithSnapshots()` keeps its component-returning compatibility API.
- `FindReplaceMatch.blockId` exposes stable model identity; its existing
  `block` property remains available as a lazy view-materializing accessor.
- `IBlockSchemaOptions.metadata.plainTextOnly?: boolean` declares an editable
  flavour's model-level formatting capability. `BlockCraftDoc.isPlainTextBlock()`
  resolves that capability without mounting the block; built-in `code` and
  `mermaid-textarea` opt in.
- `IBlockSchemaOptions.metadata.viewRetention?: 'virtual' | 'keep-alive'`
  declares whether a materialized stateful block may leave the live document.
  `BlockViewRetention`, `BlockViewRetentionContext`, and
  `BlockViewRetentionResolver` are exported for custom schemas and host config.
- `RootVirtualizationManager.bindBlockViewRetention(context)` binds the resolved
  schema/host policy to one component lifetime. `BaseBlockComponent` invokes it
  automatically; custom blocks normally only declare schema metadata.

### Migration Recipe

No migration is required because virtualization defaults to disabled. Opt in at
document construction:

```typescript
new BlockCraftDoc({
  // ...
  virtualization: {
    enabled: true,
    overscan: 6,
    retainedViewLimit: 12,
    estimatedHeights: { paragraph: 32, table: 240 },
  },
});
```

The bundled reference editor can opt out before initialization:

```html
<block-craft-editor [virtualizationEnabled]="false" />
```

Changing this input after `BlockCraftDoc` initialization is unsupported;
destroy and recreate the component instead.

Model-only integrations should use `doc.model`; `doc.vm` and
`getBlockById()` continue to represent component availability.

Custom editable flavours that set `component.plainTextOnly = true` should mirror
that intrinsic capability in schema metadata so offscreen formatting commands
can make the same decision:

```typescript
metadata: {
  // ...
  plainTextOnly: true,
}
```

Custom iframe/media blocks that own browser-side state can opt in without
writing lifecycle code:

```typescript
metadata: {
  // ...
  viewRetention: 'keep-alive',
}
```

Hosts can override schema defaults globally:

```typescript
virtualization: {
  enabled: true,
  resolveViewRetention: ({flavour}) =>
    flavour === 'video' ? 'virtual' : undefined,
}
```

### Behavior Changes

- With virtualization enabled, both `initByYBlock()` and `initBySnapshot()`
  create only root initially. Snapshot input is fully materialized into Yjs and
  `BlockModelGraph` before viewport children are created.
- Healthy virtual reconciliation adds only constant-time local
  revision/length checks. Detected height/index drift receives one cold rebuild;
  a transient coordinator failure is retried for at most three consecutive
  frames. Continued failure permanently switches that document to complete
  root mounting and emits one message-service warning, favoring editability over
  sparse-view memory until the document is disposed.
- Direct root children are virtualization units. Nested subtrees are not
  independently windowed.
- Detached root component subtrees are retained in an LRU bounded by
  `retainedViewLimit` (default 12, minimum 0). Eviction permanently destroys
  the complete detached subtree; a later mount reconstructs it from current
  Yjs state. Components synchronously returned by commands remain valid for the
  current command but are not durable references across reconciliation frames.
- Built-in `audio`, `video`, `embed`, `figma-embed`, and `juejin-embed` views
  become keep-alive after first materialization. Their containing root unit
  remains mounted until block deletion or document disposal, preserving iframe
  and playback state. No initial scan/pre-mount occurs, active leases share one
  pin source, and ordinary scroll frames perform no retention-policy work.
- An active local selection pins only the direct root units containing its
  ordered start/end while scrolling. Root boundary pairs keep their `[start,
end)` model semantics while intermediate units remain virtualized; a collapsed
  root boundary pins only the adjacent caret-bearing unit, and a nested boundary
  pins its containing root unit. Root-order transactions rebuild indices and
  re-evaluate endpoint pins from stable IDs plus root boundary indices.
- Local `.selected` / `.focused` presentation follows deduplicated mounted-root
  windows and repaints newly mounted fragments from model coverage segments.
  Selection liveness, copy, `getSelectedText()`, common-format reads and bulk
  text/props formatting no longer require intermediate ComponentRefs.
- A non-collapsed cross-root native Selection is reprojected after each
  deduplicated mounted-root window change. Virtual-root boundary endpoints now
  project inside the adjacent pinned block's inline/gap/host edge rather than
  mutable root-container child offsets, so middle DOM mount/unmount cannot
  rebase the browser live Range. Reprojection remains an endpoint-rerender
  safety net, preserves backward anchor/focus, and is skipped only while a
  primary pointer is actually held or during IME composition. A transient
  dispatcher `isSelecting` flag from
  programmatic full-select no longer blocks repair. While the matching bounded
  endpoint mount/frame projection is pending, native `selectionchange` cannot
  overwrite the canonical model range; a new primary pointer intent cancels
  the retry. This does not add work to every raw scroll event or enumerate the
  selected middle.
- Internal block dragging acquires one targeted block-view lease for all source
  blocks before clearing Selection. Edge auto-scroll can move beyond overscan
  without detaching the source components, and every drop/cancel/destroy path
  releases the lease through common teardown. Pointer movement performs no
  additional lease calculation.
- `DocOverlayService.createConnectedOverlay()` now treats an explicit
  `BlockComponent` target as a block-owned interaction and automatically holds
  its targeted view lease until close, CDK detach/dispose, creation rollback or
  document teardown. `HTMLElement` targets keep their existing
  close-on-disconnect behavior and acquire no lease. Open/close boundaries pay
  the pin update; scroll and pointer paths do no additional lease work.
- Collaborative `FakeRange` projections now follow the deduplicated virtual
  root window. Offscreen remote endpoints stay model-only and reappear without
  a new awareness message when mounted; cross-root remote selections paint only
  mounted fragments. Remote positions acquire no local view lease, and each
  window update checks only remote cursors against mounted root IDs rather than
  scanning the document or complete selected ranges.
- Root insert/delete/move/undo/redo captures one visible ID anchor across all
  transactions coalesced into the next frame. The estimated target window is
  mounted first, then the actual anchor host position supplies a final scroll
  correction; ordinary scroll frames and nested-only structure changes do not
  pay this work.
- Undo/redo checks the restored head geometry before native Selection replay.
  A head that is already fully visible leaves the viewport unchanged; an
  offscreen or unavailable head delegates to virtual block navigation and is
  centered when scroll bounds allow. This pre-replay check avoids mistaking the
  browser's own minimal focus scroll for prior visibility.
- Remote changes to uncreated blocks are model-only until mount and do not emit
  missing-component warnings.
- Deleting a temporary container and moving its child to another parent in one
  transaction now destroys views by post-transaction model ownership. The
  moved ComponentRef survives, and stale delayed events from the deleted parent
  are ignored. This keeps drag-created columns undo/redo coherent without a
  scroll-triggered rerender.
- Imports and bulk writers can use `insertBlockSnapshots()` to avoid transient
  Angular component creation for sparse-root/uncreated-parent inserts.
  `insertBlocks()` delegates to the same validated Yjs write path, then
  materializes views only to preserve its legacy return value. When that legacy
  path runs inside an outer Yjs transaction, it synchronizes only the affected
  parent into `BlockModelGraph` before Angular lifecycle hooks read the inserted
  block; the later deep-observer pass detects the no-op and does not emit a
  duplicate structure revision. Ordinary top-level inserts do not pay this
  extra reconciliation.
- `deleteBlocks()`, `deleteBlockById()` and `moveBlocks()` now resolve reachable
  structure from Yjs/`BlockModelGraph`; source and target ComponentRefs are no
  longer required. Offscreen mutations remain model-only, while mounted parents
  still synchronize through the existing observer and preserve moved component
  identity. Readonly guards, return values and root non-empty behavior remain
  unchanged.
- `nextSibling()` / `prevSibling()` materialize an adjacent virtual root unit
  before returning its component, so keyboard navigation can cross an isolated
  pinned segment or viewport boundary. This transient mount is reclaimed unless
  the resulting Selection or viewport takes ownership.
- Component-oriented programmatic Selection helpers materialize string targets
  before resolving their block components. Table/cell targets are batched, and
  `selectBlock(root)` materializes only its first/last endpoint units before the
  endpoint selection lease takes ownership.
- A virtualized Selection commit checks its bounded endpoint neighborhood and
  synchronously materializes missing endpoint/boundary-adjacent views before
  publishing `doc.selection.value`. Synchronous observers may therefore read
  `firstBlock` / `lastBlock` without racing the next virtualization frame.
  A retained but detached component counts as missing for DOM projection;
  Selection uses the O(1) `DocVM.isMounted()` status before projecting an empty
  caret, with no DOM connectivity or layout read.
  Already-mounted commits do not trigger height, spacer, geometry, or
  full-selection traversal; the endpoint lease remains frame-coalesced and
  independent of selection length.
- Undo/redo history restoration materializes only bookmark endpoint views before
  relative-position resolution, including retained-but-detached and fully
  LRU-evicted targets. It submits one scroll-visible model-first replay and waits
  while that exact DOM projection is pending instead of republishing and
  canceling it. After projection, the active selection head is revealed in the
  editor viewport and bounded verification repairs only genuine focus or
  DOM/model mismatch.
- Find/replace scans and incrementally updates against the complete model. It
  does not mount blocks while indexing or replacing all; active result
  navigation materializes one root unit, and passive highlights follow the
  mounted virtual window.
- `OrderedBlockPlugin` queues stable IDs, computes numbering from the complete
  `BlockModelGraph` sibling sequence, and writes derived `order` props through
  `DocCRUD`. Missing offscreen components no longer abort a renumber pass, and
  sorting does not materialize those components.
- `MarkdownStreamRenderer` preserves its incremental ID-stable diff semantics,
  but now reads complete structure/text/props from `BlockModelGraph` and writes
  through `DocCRUD`. Streaming can patch, insert, delete or replace offscreen
  root blocks without mounting them or accessing raw Yjs values.
- `BlockCraftDoc` publishes the configured whole-document readonly policy before
  `afterInit` callbacks and plugin registration. Initialization observers no
  longer see the temporary protected bootstrap state, and immediate guarded
  writes are checked against `DocConfig.readonly`.
- Full-document JSON/Markdown/PDF export and pagination printing obtain their
  snapshots through `doc.exportSnapshot()`. Offscreen virtual blocks remain in
  the output without materializing their Angular views.
- Root blank-area/gap hit-testing reads only mounted root views; it never walks
  unmounted siblings to answer a DOM coordinate query.
- Live pagination automatically owns a full-document view lease while enabled,
  including root blocks inserted during the lease, and releases it after all
  pagination view effects are cleared. Exact pagination therefore suspends
  root virtualization's mount/memory savings until pagination is disabled.
- Permanent full-mount fallback first repairs mounted root order from the
  canonical model, clears all virtual spacers and disconnects height tracking.
  Scroll/resize no longer schedules window work in fallback mode, and stale
  estimated geometry cannot keep the document blank after a mount failure.
- `packages/editor/package.json` remains unchanged because release numbering is
  user-owned.

### v?.?.? - 2026-07-19 (major) — separate retained views from permanent block destruction

**Severity**: major

**What changed**: `BaseBlockComponent.detach()` now enters an idempotent
`retained` view state without emitting or completing `onDestroy$`.
`reattach()` recreates view-only state from the current Yjs model and returns
the block to `mounted`. Permanent Angular destruction remains the only source
of `onDestroy$`.

**Why**: Virtual rendering must temporarily remove expensive view state while
keeping the component and its document subscriptions reusable. Treating a
reversible detach as permanent destruction silently completed subscriptions,
left inline/embed resources behind, and made a later reattach incomplete.

**Affected ai-skills files**:

- `blockcraft-block.md`

### Breaking Changes

- Code that relied on `detach()` emitting `onDestroy$` must move temporary
  view cleanup to `onDetach$` or `beforeDetach()`.

### New APIs / Features

- Exported `BlockViewState` with `mounted`, `retained`, and `destroyed` states.
- `BaseBlockComponent.viewState` and `isAttached`.
- `BaseBlockComponent.onDetach$` and `onReattach$`.
- Protected `beforeDetach()` and `afterReattach()` lifecycle hooks.

### Migration Recipe

Keep permanent subscriptions bound to component destruction, and separate
temporary view resources explicitly:

```typescript
// before: detach() also completed this subscription
source$.pipe(takeUntil(this.onDestroy$)).subscribe(...)

// after: permanent document/component subscription remains alive
source$.pipe(takeUntil(this.onDestroy$)).subscribe(...)

// release and recreate only DOM/view resources across virtualization
protected override beforeDetach() {
  this.overlay?.dispose()
}

protected override afterReattach() {
  this.renderFromCurrentModel()
}
```

### Behavior Changes

- Repeated `detach()` and `reattach()` calls are no-ops after the first valid
  transition.
- Permanent destruction of a still-mounted component invokes `beforeDetach()`
  once before broadcasting `onDestroy$`.
- `EditableBlockComponent` destroys its inline runtime while retained, ignores
  detached DOM patches, and rebuilds from the latest Y.Text on reattach.
- Inline teardown removes retained DOM and invokes each embed converter's
  `onDestroy` exactly once.
- `packages/editor/package.json` remains unchanged because release numbering is
  user-owned.

### v?.?.? - 2026-07-19 (minor) — make selection structure model-resolvable

**Severity**: minor

**What changed**: `BlockSelection` structural derivation now uses a
`SelectionModelResolver` backed by `BlockModelGraph`. Selection liveness,
document order, boundary coverage, text-edge predicates and content endpoint
IDs no longer require mounted Angular block components. `firstBlockId` and
`lastBlockId` expose model-safe content edges while the existing component
accessors remain available for view code. Virtual renderers can optionally
register a `SelectionProjectionMountAdapter`; when DOM projection fails,
Selection requests only the endpoint neighborhood before replaying its existing
bounded projection retry.

**Why**: A canonical model selection must survive virtualization, delayed view
mounts and remote/undo reconciliation. Treating `point.block` as model
authority caused valid selections to be cleared whenever their components were
temporarily absent from the VM. Model-safe state alone was not enough to make
the native caret visible again; Selection also needed a bounded, cancellable
way to ask the renderer for the minimum DOM required by projection.

**Affected ai-skills files**:

- `blockcraft-selection.md`
- `blockcraft.md`

### New APIs / Features

- Exported `SelectionModelResolver` and `SelectionModelReader`.
- Exported `SelectionProjectionMountAdapter` with
  `ensureMounted(blockIds, signal)`.
- `BlockSelection.firstBlockId` and `BlockSelection.lastBlockId`.
- The optional `SelectionModelResolver` constructor argument for advanced
  direct `BlockSelection` construction.
- `SelectionManager.registerProjectionMountAdapter(adapter)` returns an
  idempotent unregister function.

### Migration Recipe

Model/data code should use IDs without forcing component resolution:

```typescript
// before: requires the endpoint component to be mounted
const startId = selection.firstBlock.id;

// after: valid for mounted and virtualized selections
const startId = selection.firstBlockId;
```

View code that needs `hostElement`, inline runtime or block methods may keep
using `firstBlock` / `lastBlock` after ensuring the component is mounted.

Virtual renderers may opt into projection recovery without pinning the selected
middle range:

```typescript
const unregister = doc.selection.registerProjectionMountAdapter({
  ensureMounted(blockIds, signal) {
    return virtualRenderer.ensureBlocksMounted(blockIds, { signal });
  },
});
```

### Behavior Changes

- `SelectionManager.createSelection()` accepts structurally valid JSON when
  endpoint components are unmounted; missing model IDs still return `null`.
- `doc.selection.value` liveness is determined by `BlockModelGraph`, not VM
  component presence.
- Selected/focused class reconciliation skips currently unmounted covered IDs
  instead of invalidating or throwing from the model selection.
- Failed DOM projection asks a registered adapter for deduplicated endpoint IDs;
  boundary points additionally request only their immediate previous/next
  children. Two boundary endpoints request at most six IDs.
- Newer selection intent, adapter replacement/unregistration, and document
  destruction abort an in-flight mount request. Replacement transfers the same
  intent to the new adapter; unregistration falls back to frame retry; destroy
  schedules no more work. Late completion is ignored.
- Adapter resolution or rejection enters the existing bounded projection retry;
  hosts without an adapter retain the previous retry behavior.
- Existing selection JSON and programmatic write methods are unchanged.
- `packages/editor/package.json` remains unchanged because release numbering is
  user-owned.

### v?.?.? - 2026-07-17 (minor) — add default inline image embed

**Severity**: minor

**What changed**: BlockCraft now includes a default, overridable `image` inline
Embed. `ImgToolbarPlugin` supports bidirectional block/inline conversion and
proportional resizing of the default inline renderer while preserving valid
dimensions and surrounding formatted content. Active inline images also receive
a temporary theme-colored selection outline that is cleared with their controls.

**Why**: Images previously existed only as blocks, so documents could not mix
an atomic image with surrounding inline text without a host-defined converter.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-embed.md`
- `blockcraft-plugins-block.md`

### New APIs / Features

- `INLINE_IMAGE_EMBED_KEY`, `inlineImageEmbedConverter`,
  `createInlineImageDelta`, `readInlineImageDelta`, and
  `withDefaultEmbedConverters`.
- `image` is present by default; a user-provided converter with the same key
  wins without changing other configured embeds.
- `ImgToolbarPlugin` exposes **转为行内图片** and preserves caption deltas.
- The default inline shell exposes proportional resize handles and **转为图片块**
  through the same plugin. Its selected outline is DOM-only and mouseup writes
  only `width` / `height` once.

### Migration Recipe

No registration is required for the default renderer. Existing custom renderers
continue to override it:

```typescript
new BlockCraftDoc({
  // ...
  embeds: [["image", customImageEmbedConverter]],
});
```

### Behavior Changes

- Mixed HTML/Markdown images can round-trip as inline embeds.
- Standalone Markdown images and `<figure><img></figure>` remain image blocks.
- Inline-to-block conversion splits formatted text around the new image block,
  omits empty sides, creates no caption, and respects the parent Schema.
- Clicking the default inline renderer adds
  `.bc-inline-image-shell--selected` until the inline controls close; no Delta
  attribute is added.
- `packages/editor/package.json` remains unchanged because release numbering is
  user-owned.

### v?.?.? - 2026-07-17 (patch) — show feedback for rejected readonly edits

**Severity**: patch

**What changed**: `BlockCraftDoc` now forwards readonly violations caused by
direct user actions to the configured `DocMessageService` as a warning. Repeated
violations are coalesced to one warning per second; programmatic `api` writes
remain error-only and do not produce UI messages.

**Why**: Write guards correctly prevented locked content from changing, but
silent rejection made typing, IME, clipboard, drag and Undo/Redo attempts look
unresponsive.

**Affected ai-skills files**:

- `blockcraft.md` — documents the built-in feedback and API exclusion.
- `blockcraft-app.md` — documents message-service behavior and throttling.

### Behavior Changes

- Hosts using the standard document runtime receive "内容已锁定，无法修改"
  through `DocMessageService.warn` for rejected non-`api` writes.
- Selection, copy, links, media preview and download remain silent and usable.
- No API migration is required, and `packages/editor/package.json` remains
  unchanged because release numbering is user-owned.

### v?.?.? - 2026-07-17 (patch) — centralize selection synchronization boundaries

**Severity**: patch

**What changed**: Selection reconciliation around remote Yjs view sync moved
out of `DocCRUD` into the Selection domain. Undo/Redo relative selection
bookmarks now live on their owning Yjs `StackItem.meta`, while
`SelectionHistoryRestorer` owns focus, relative-position resolution and bounded
DOM/model verification. Native selection, focus, animation frames, Range
creation and geometry access are centralized behind an internal
`SelectionSurfaceAdapter`.

**Why**: Content history and selection history must share Yjs stack identity;
parallel arrays can drift when Yjs merges, truncates, clears or regenerates
stack items. Data mutation code also should not own browser focus and DOM Range
recovery. These boundaries keep DocCRUD data-only, Selection model-first, and
browser compatibility replaceable without adding layout work to hot paths.

**Affected ai-skills files**:

- `blockcraft-selection.md` — documents reconciliation, history and surface ownership.
- `blockcraft-data.md` — documents Yjs StackItem metadata and remote sync lifecycle.
- `blockcraft.md` — updates the Selection quick reference.

### Behavior Changes

- No external migration is required; selection JSON and public editing APIs are unchanged.
- Undo/Redo restoration follows the exact Yjs stack item rather than a parallel selection index.
- Remote transactions expose internal before/after view-sync facts; DocCRUD no longer reads or replays browser selection.
- The surface adapter delegates existing browser calls without caching, polling or extra model traversal.
- `packages/editor/package.json` version is intentionally unchanged; release numbering remains a user-owned decision.

### v?.?.? - 2026-07-16 (minor) — expose pagination content height as a CSS token

**Severity**: minor

**What changed**: Live and print pagination now publish the resolved page
content height as `--bc-page-content-height`. Top-level void and code blocks use
a predeclared `themes/plugins/pagination.scss` override to cap their height
instead of receiving per-block inline `max-height` and `overflow` mutations.
Code blocks constrain their internal content surface so the bottom resize
control is not clipped; image blocks inset their horizontal resize controls
inside the existing host clipping boundary.

**Why**: The cap is page geometry shared by all atomic blocks, not block-owned
state. Keeping it on the pagination root centralizes configuration, reduces DOM
style churn during reflow, and gives live and print surfaces the same CSS
contract while preserving natural-height measurement in JavaScript.

**Affected ai-skills files**:

- `blockcraft-theme.md` — documents the new pagination geometry token and ownership rule.

### New APIs / Features

- `--bc-page-content-height` on `.bc-paginated` roots and `.bc-print-content`.

### Behavior Changes

- Top-level void/code blocks are capped by the pagination stylesheet. Nested
  atomic blocks are intentionally unaffected.
- Code blocks scroll `.edit-container-wrapper` while the host remains visible;
  image blocks preserve host crop semantics and natural-height measurement,
  with resize controls inset into the clipping boundary.
- Live `.bc-paginated` and print `.bc-print-content` consume the same late-loaded
  pagination stylesheet instead of maintaining separate height-cap rules.
- Pagination still measures natural height and records `lockHeight`; only the
  presentation write moved from per-block inline styles to inherited CSS.
- `packages/editor/package.json` version is intentionally unchanged; release
  numbering remains a user-owned decision.

### v?.?.? - 2026-07-16 (minor) — add persistent inherited block readonly

**Severity**: minor

**What changed**: BlockCraft now supports a synchronized, persistent readonly
flag on any non-root block. `BlockReadonlyManager` resolves explicit,
ancestor-inherited and whole-document protection from the model graph and
enforces it across Block APIs, DocChain/DocCRUD, input/IME, clipboard, drag and
drop, Undo/Redo, built-in Blocks, toolbars and Plugins. The Block Controller has
a built-in lock switch and readonly-aware custom menu contracts.

**Why**: Whole-document readonly could not protect an approved section while
leaving the rest of a collaborative document editable. A UI-only flag would be
easy to bypass and would fail for unmounted blocks, asynchronous commits and
programmatic writes, so permission resolution and final enforcement now live at
the model/data boundaries.

**Affected ai-skills files**:

- `blockcraft.md` — adds block readonly to core concepts and Quick Reference.
- `blockcraft-app.md` — documents host APIs, inheritance, events and trust boundary.
- `blockcraft-block.md` — documents Block readonly state and guarded mutation rules.
- `blockcraft-plugins-block.md` — documents the built-in switch and `readonlyBehavior`.
- `blockcraft-input.md` — documents write-footprint preflight and IME races.
- `blockcraft-data.md` — documents Yjs metadata, model-derived caching, origins and history.

### New APIs / Features

- `IBaseMetadata.readonly?: boolean` persists an explicit non-root lock.
- Exported `BlockReadonlyManager`, `BlockRef`, `BlockReadonlyResolution`,
  `BlockReadonlySource`, `BlockReadonlyBlocker`, `BlockReadonlyOperation`,
  `BlockReadonlyViolation`, `BlockReadonlyViolationTrigger` and
  `BlockReadonlyError` contracts.
- `BlockCraftDoc.readonlyManager`, `setBlockReadonly(blockOrId, readonly)` and
  `isBlockReadonly(blockOrId)`.
- `BaseBlockComponent.isReadonly`, `isExplicitReadonly` and `readonlySource`.
- `BlockReadonlyManager.stateChange$` for effective permission-driven UI and
  throttled `violation$` for rejected-action feedback.
- `BlockMenuContext.readonly` and `BlockMenuItem.readonlyBehavior` with
  `hide | disable | allow` policies.
- `ORIGIN_BLOCK_READONLY_CONTROL` and the framework-reserved
  `ORIGIN_SYSTEM_REPAIR` transaction origins.
- `BlockModelGraph.structureRevision` / `structureChange$` support permission
  cache invalidation without duplicating the tree index.

### Migration Recipe

Keep whole-document mode for a global viewer/editor switch:

```typescript
// unchanged global mode
doc.toggleReadonly(true);
```

Use the block API for a persisted section lock:

```typescript
doc.setBlockReadonly(calloutId, true);

if (doc.isBlockReadonly(paragraphInsideCalloutId)) {
  // inherited from the callout
}

doc.setBlockReadonly(calloutId, false);
```

Make custom Block Controller items explicit about protected content:

```typescript
// before: all custom actions were treated uniformly
{type: 'simple', name: 'inspect', label: '查看'}

// after: read-only action remains available; omitted defaults to disabled
{type: 'simple', name: 'inspect', label: '查看', readonlyBehavior: 'allow'}
{type: 'simple', name: 'translate', label: '翻译', readonlyBehavior: 'disable'}
```

Custom Blocks/Plugins must use guarded mutation APIs:

```typescript
// do not: bypasses readonly/transaction ownership
block.props.title = nextTitle;
block.yText.insert(index, text);

// do
block.updateProps({ title: nextTitle });
block.insertText(index, text);
```

### Behavior Changes

- A block lock applies to its entire descendant subtree. An unlocked ancestor
  containing a locked descendant cannot be deleted or moved.
- Root persistent locking is rejected; use `toggleReadonly()` for document mode.
- Guarded programmatic writes throw `BlockReadonlyError`. Owned input/clipboard/
  drag UI prevents the event before mutation and reports the violation.
- `setInitProps()` now performs the same block-permission check as
  `updateProps()`; asynchronous loaders recheck after every await.
- Selection, copy, link activation, media preview and download remain allowed.
  Clipboard copies recursively strip readonly metadata, while persistence and
  collaboration snapshots retain it.
- A blocked Undo/Redo item is not popped and becomes available after unlock.
- Remote updates and deterministic internal consistency repairs still apply and
  render. Block readonly is a trusted-client editing policy, not server-side
  authorization.
- `packages/editor/package.json` version is intentionally unchanged; release
  numbering remains a user-owned decision.

### v?.?.? - 2026-07-15 (minor) — add the model-first document query graph

**Severity**: minor

**What changed**: BlockCraft now exports `BlockModelGraph` and exposes one as
`BlockCraftDoc.model`. The graph reads the complete root-reachable Yjs tree
without requiring Angular Block components or DOM hosts. Document path,
position, sibling interval and snapshot export calculations now use this model
layer while existing component-returning APIs keep their mounted-view boundary.

**Why**: `DocVM` previously acted as both the view registry and the only tree
query surface. That made a temporarily unmounted block indistinguishable from a
deleted block and prevented safe virtual rendering. Separating read-only model
queries from mounted view lookup provides the first virtualization foundation
without changing current full rendering.

**Affected ai-skills files**:

- `blockcraft.md` — adds the model graph to core concepts and Quick Reference.
- `blockcraft-data.md` — documents lifecycle, APIs, reachable-node semantics and mutation boundaries.

### New APIs / Features

- Exported `BlockModelGraph`.
- `BlockCraftDoc.model` for DOM-free structure, order, text and snapshot reads.
- Incremental Yjs structural reconciliation with missing/cyclic/duplicate edge tolerance.

### Migration Recipe

Use model queries when code needs document data but not component or DOM
capabilities:

```typescript
// before: requires a mounted component
const block = doc.getBlockById(blockId);
const parentId = block.parentId;
const path = doc.getBlockPath(block);

// after: works for any root-reachable YBlock, mounted or not
const parentId = doc.model.getParentId(blockId);
const path = doc.model.getPath(blockId);
```

Keep component lookup for view work:

```typescript
// unchanged: toolbar geometry, focus and DOM Range still need a mounted view
const mountedBlock = doc.getBlockById(blockId);
mountedBlock.hostElement.focus();
```

### Behavior Changes

- `BlockCraftDoc.getBlockPath()`, sibling-ID reads, position comparison,
  `queryBlocksBetween()` and `exportSnapshot()` no longer calculate through the
  component tree.
- `getBlockById()` / `getBlockRef()`, CRUD event payloads, plugin lifecycle and
  current full-render behavior are unchanged.
- This release does not add a virtual window, component unmounting, spacers or
  pagination/virtualization integration.
- `packages/editor/package.json` version is intentionally unchanged; release
  numbering remains a user-owned decision.

### v?.?.? - 2026-07-15 (major) — remove DOM-to-image JPEG export

**Severity**: major

**What changed**: BlockCraft removed `DocExportManager.exportToJpeg()`, the protected `_toCanvas()` hook, the constructor's DOM rendering options, and the `dom-to-image-more` peer dependency. `DocExportManager` now accepts only the document and remains responsible for JSON, Markdown, PDF, and print export.

**Why**: DOM-to-image rendering was an isolated, high-memory path with browser and resource compatibility limits. Pagination PDF and printing already use readonly BlockCraft components and native print surfaces, so carrying a rasterization dependency solely for JPEG export was not justified.

**Affected ai-skills files**:

- `blockcraft.md` — updates the export manager quick reference.
- `blockcraft-app.md` — documents the remaining export surface and host ownership of bitmap screenshots.
- `blockcraft-plugins-util.md` — removes the obsolete runtime dependency reference from pagination export guidance.

### Breaking Changes

- `DocExportManager.exportToJpeg(name, options?)` is removed.
- `DocExportManager` no longer accepts a second DOM rendering options argument.
- Subclasses can no longer override the protected `_toCanvas()` rasterization hook.
- Consumers no longer need to install or provide `dom-to-image-more` for `@ccc/blockcraft`.

### Migration Recipe

Keep document export on the supported structured or print paths:

```typescript
// before
const exports = new DocExportManager(doc, { scale: 2, bgcolor: "#fff" });
await exports.exportToJpeg("document.jpg", { scale: 2 });

// after: BlockCraft-owned document/PDF export
const exports = new DocExportManager(doc);
await exports.exportToPdf("document.pdf");

// If the product still requires bitmap screenshots, implement that concern in
// the host application with explicitly chosen browser/resource semantics.
```

### Behavior Changes

- JSON, Markdown, paginated PDF, and print behavior are unchanged.
- BlockCraft no longer clones arbitrary editor DOM into a large canvas, reducing the package dependency surface and avoiding that path's memory peak.

### v?.?.? - 2026-07-15 (minor) — pagination becomes an opt-in plugin

**Severity**: minor

**What changed**: BlockCraft now exports `PaginationPlugin`, the pure pagination layout/export primitives, and `PageDividerBlockSchema`. The plugin owns reversible live page layout, configuration commands, the optional Cmd/Ctrl+P binding, and a stable WYSIWYG print surface. Tables can render cross-page continuation spacers without changing Yjs data. `DocExportManager.exportToPdf()` opens browser native printing by default or invokes a host-provided native backend while the current top-level WebView print mirror is mounted. The PDF body uses readonly BlockCraft components and the captured live page result instead of snapshot-viewer or DOM rasterization. The playground owns its debug-only settings panel; it is not part of the package API.

**Why**: The prototype on `feat/pagination` coupled pagination to `BlockCraftDoc` construction and its page-shaped playground. Making pagination a registered plugin keeps continuous layout as the default, lets hosts switch layouts at runtime, and gives pagination one symmetric `init()` / `destroy()` lifecycle without persisting presentation state into the document model.

**Affected ai-skills files**:

- `blockcraft.md` — adds the pagination domain, registered schema, plugin and quick reference.
- `blockcraft-plugin.md` — documents the reversible runtime plugin pattern.
- `blockcraft-plugins-ref.md` — indexes `PaginationPlugin` in the utility category.
- `blockcraft-plugins-util.md` — documents pagination options, APIs and settings integration.
- `blockcraft-app.md` — documents host registration, layout switching and print/PDF usage.
- `blockcraft-theme.md` — documents pagination CSS tokens and view classes.

### New APIs / Features

- `PaginationPlugin` and `PaginationPluginOptions`; the live layout defaults to disabled.
- `PageDividerBlockSchema` for explicit manual page breaks.
- Pure pagination layout, view and export types/functions under `framework/modules/pagination/`.
- `DocExportManager.exportToPdf()` pagination configuration and `printPdf()` vector printing.
- `PaginationPlugin.exportToPdf()` and `DocExportManager.exportToPdf()` return print metadata and reuse the current stable page result unless explicitly reflowed.
- `PaginationPdfHostBackend`, `PaginationPdfHostContext`, `PaginationPdfHostResult`, `PaginationPdfOptions`, `PaginationPdfResult` and structured `PaginationExportError` for browser/Tauri-neutral integration.
- Pagination theme tokens under the `--bc-pagination-*` namespace.
- Legacy `exportToPdf()` options `paging` and `blockMargin` remain accepted as deprecated no-ops for source compatibility; the new engine always uses block-aware pagination.

### Migration Recipe

Do not copy the prototype branch's document-service wiring:

```typescript
// before (prototype only; never released as the target contract)
const doc = new BlockCraftDoc({
  pagination: { enabled: true, pageSize: "A4" },
});
doc.pagination.updateConfig({ orientation: "landscape" });

// after
const pagination = new PaginationPlugin({
  enabled: true,
  pageSize: "A4",
});
const doc = new BlockCraftDoc({
  // ...required config
  plugins: [pagination],
});
pagination.updateConfig({ orientation: "landscape" });
pagination.disable(); // return to continuous layout without rebuilding the doc
```

Register `PageDividerBlockSchema` only when the host wants explicit manual page breaks. Existing documents and hosts remain on continuous layout when the plugin is absent or disabled.

To export the page layout currently visible on screen, stop passing a duplicate pagination config:

```typescript
// before: always reflows using this separate config
await exports.exportToPdf("document.pdf", {
  pagination: {
    pageSize: "A4",
    margins: { top: 72, right: 72, bottom: 72, left: 72 },
  },
});

// after: enabled PaginationPlugin supplies the current stable layout
await exports.exportToPdf("document.pdf");

// Tauri/host application: run this inside a dedicated top-level export WebView
await exports.exportToPdf("document.pdf", {
  backend: async ({ suggestedName, page, pageCount }) => {
    const path = await choosePdfPath(suggestedName);
    if (!path) return { status: "cancelled" };
    await invokeNativePdfPrint({ path, page, pageCount });
    return { status: "saved", path };
  },
});
```

### Behavior Changes

- Continuous layout remains the default. Enabling or disabling pagination changes local DOM/CSS view state only and does not write Yjs or create Undo history.
- Pagination observers and table continuation views are created lazily and are fully removed on disable/destroy.
- With enabled pagination and no explicit override, PDF export captures the current stable layout and snapshot synchronously, then uses real readonly BlockCraft components. Explicit `options.pagination` requests a separate reflow; a disabled plugin uses its config; no plugin falls back to A4.
- PDF body export no longer uses `dom-to-image-more` or `pdf-lib`. Browser calls a same-origin print iframe; Tauri/other shells inject a native backend that prints the current top-level export WebView. Platform print engines may have small font/color differences, while page boxes and breakpoints stay fixed.
- `DocExportManager.exportToPdf()` no longer returns bytes or downloads a generated Blob. It returns `output/status/pageCount/layoutRevision/warnings/path?`; browser cancellation is not observable, while host backends return `saved` or `cancelled`.
- iframe content remains in the native print DOM and no longer raises the raster-only `unsupported-resource` error. Tainted canvas and unstable resources can still fail according to `resourcePolicy`.
- Cmd/Ctrl+P is consumed by pagination only when the plugin is enabled and `printShortcut` is true.

### v?.?.? - 2026-07-15 (patch) — collaboration cursors preserve gap semantics across rerenders

**Severity**: patch

**What changed**: `FakeRange` now renders a collapsed `gap` selection as a caret on its explicit `before` / `after` filler instead of degrading it to a whole-block border. Block gap fillers carry `data-block-gap-side`, so their geometry no longer depends on `:first-of-type` / `:last-of-type` and cannot be displaced by an appended collaboration overlay. `BlockCraftAwareness` also detects when a related inline full rerender detached a remote cursor and rebuilds only that lost overlay in a coalesced microtask. Remote user labels render in one shared fixed portal under `document.body`, projected from their caret rectangles, so block-level `overflow: hidden` cannot clip them. The portal mirrors the editor scroll viewport and uses `overflow: hidden`, preventing labels from painting outside that viewport. Scroll and resize refreshes are coalesced to one animation-frame pass. `BlockCraftAwareness.destroy()` explicitly releases its portal, overlays, subscriptions, awareness callback, and global listeners when a host leaves a room without destroying the document.

**Why**: IME commit can call the inline runtime's full `rerender()`, which removes unmanaged `FakeRange` nodes from editable content even though the remote awareness coordinate did not change. Separately, treating `gap` as `selected` lost selection intent, and an appended cursor `span` could make the real trailing gap stop matching `:last-of-type`.

### Behavior Changes

- Remote text cursors survive local IME full rerenders. Incremental input that leaves the overlay connected performs no collaboration-cursor layout work.
- A remote collapsed gap is drawn as a narrow caret at the selected side; explicit whole-block `selected` points retain the block border overlay.
- Leading/trailing gap placement is keyed by `data-block-gap-side="before|after"`, independent of other sibling spans.
- Remote user labels are outside editable/block DOM and therefore are not clipped by block overflow or included in inline rerenders. Their shared fixed portal matches the `doc.scrollContainer` client box and clips overflow natively; inner scrolling does not add a container-geometry read. One document-level scroll listener updates all labels once per frame, batching all geometry reads before style writes; no per-cursor listener or CDK overlay is created.
- Hosts that replace a collaboration provider while retaining the document must call `BlockCraftAwareness.destroy()` before discarding the old manager.

**Affected ai-skills files**:

- `blockcraft.md` — adds the collaboration cursor lifecycle quick reference.
- `blockcraft-app.md` — documents host room cleanup with `BlockCraftAwareness.destroy()`.
- `blockcraft-selection.md` — documents portal projection, bounded layout work, and cleanup ownership.

### v?.?.? - 2026-07-14 (patch) — remote collaboration maps live selections through Yjs bookmarks

**Severity**: patch

**What changed**: The current local `BlockSelection` now has an internal revisioned Relative Selection Bookmark. Relevant remote text and children transactions resolve text/boundary endpoints through `Y.RelativePosition`, validate structural points, recompute `commonParent` from the current tree, and publish through the existing model-first `selection.replay()` path. `DocUndoManager` now uses the same bookmark codec instead of maintaining a second point-mapping implementation.

**Why**: Remote sync previously relied on `recalculate()` after selected endpoint blocks changed. That made the canonical selection depend on mounted DOM and browser-specific Range state, could drift during Safari/WebKit updates, and duplicated the relative-position rules already needed by Undo. A shared model mapping path is deterministic, collaboration-safe, and compatible with delayed or virtualized rendering.

**Affected ai-skills files**:

- `blockcraft.md` — Quick Reference records bookmark-first remote selection mapping.
- `blockcraft-selection.md` — documents the shared codec, live tracker, structural relevance filter, focus guards, and DOM fallback.
- `blockcraft-data.md` — documents the remote Yjs transaction to local Selection flow and Undo reuse.

### Behavior Changes

- Remote changes to a selected text block or boundary container map the local anchor/head in the current Yjs model and replay once; successful mapping no longer confirms itself through DOM `recalculate()`.
- Ancestor-only transactions schedule reconciliation only when an endpoint's parent path or sibling index changed. Unrelated root/container inserts do no selection work.
- Pending remote reconciliation is canceled when newer local selection intent is published or focus leaves the editor/native input island.
- When mapping fails, DOM is sampled at most once and only if both native Range endpoints still belong to the current editor root; otherwise the stale model selection is cleared.
- This is an internal patch behavior change. No new public API is exported, and no package version is changed until an explicit release decision.

### v?.?.? - 2026-07-14 (patch) — cross-scope native drag endpoints stabilize on boundaries

**Severity**: patch

**What changed**: When native drag normalization projects an endpoint out of a closed selection scope, `SelectionManager` now publishes the repaired `BlockSelection` and immediately aligns the browser anchor/focus with the same gap-backed boundary while preserving forward/backward direction. Native endpoints are also validated against the editor root before normalization, preventing a Safari drag leaked into surrounding page DOM from entering block lookup. `SelectionSelectedManager` reconciles covered-block class sets instead of removing and re-adding unchanged `.selected` / `.focused` classes.

**Why**: Safari/WebKit could retain the original table-internal DOM endpoint after the model had made the table atomic. Repeated `selectionchange` events then alternated between internal text and parent boundaries, making both the native highlight and whole-table virtual selection flash. Full class teardown additionally restarted table selection transitions even when the covered blocks had not changed.

**Affected ai-skills files**:

- `blockcraft.md` — Quick Reference records cross-scope native endpoint stabilization.
- `blockcraft-selection.md` — documents the native-drag projection exception, direction preservation, idempotence, and class reconciliation.

### Behavior Changes

- Native drags crossing table/container scopes now leave their closed-scope endpoint on the scope block's parent boundary in both model and DOM views.
- The stabilizing DOM write runs only when scope repair changed an endpoint, does not read layout, and does not suppress subsequent pointer-driven `selectionchange` events.
- A native Range with an endpoint outside root is never normalized. BlockCraft clears it only while the editor owns focus; external page/editor selections remain untouched, and model-owned table-cell rectangles are preserved.
- Repeated equivalent selection broadcasts no longer toggle classes on unchanged covered blocks. No package version is changed until an explicit release decision.

### v?.?.? - 2026-07-14 (patch) — DocCRUD render-unit deletion is selection-neutral

**Severity**: patch

**What changed**: `DocCRUD.deleteBlocks()` still synchronously replaces the final child of a non-forced `renderUnit` deletion with one empty paragraph, but it no longer calls `SelectionManager.recalculate()` afterward. Structural mutation and selection placement now have separate owners: DocCRUD updates Yjs/the block tree, while the Input or plugin action commits the intended caret/range through model-first Selection APIs.

**Why**: The removed DOM read happened in the middle of higher-level replacement flows, before typed text and the final cursor recipe had been applied. It could publish a stale intermediate selection, add a forced layout/readback to a mutation hot path, and couple low-level data operations to mounted DOM availability.

**Affected ai-skills files**:

- `blockcraft.md` — records the selection-neutral DocCRUD convention.
- `blockcraft-data.md` — documents the render-unit fallback paragraph and explicit post-mutation selection ownership.

### Behavior Changes

- Direct callers of `deleteBlocks()` that expect a caret after deleting all children of a `renderUnit` must now call `setCursorAt()`, `setCursorAtBlock()`, `replay()`, or another explicit Selection API.
- Data behavior is unchanged: the fallback empty paragraph is still created synchronously in the same Yjs transaction.
- No package version is changed until an explicit release decision.

### v?.?.? - 2026-07-14 (patch) — transient selection projection failures preserve the model

**Severity**: patch

**What changed**: Programmatic `SelectionManager` writes now keep a live canonical `BlockSelection` when its native DOM Range cannot be built or applied because block DOM is still mounting. Selection performs a bounded, projection-version-guarded retry; a newer selection or explicit external focus cancels the old task. Gap cursor readiness uses the same recovery path. Invalid/stale model endpoints and explicit `blur()` / `replay(null)` continue to clear selection.

**Why**: Paste-format switches replace block DOM and create an independent Undo item. Undo can restore the Yjs data and block component before Angular/Safari has mounted the corresponding inline DOM. Treating that temporary projection gap as an invalid selection cleared the undo snapshot and left the editor without a caret across collapsed text, range, and gap paste entry points.

**Affected ai-skills files**:

- `blockcraft.md` — Quick Reference documents delayed, model-preserving DOM projection.
- `blockcraft-selection.md` — documents projection recovery, version cancellation, focus ownership, and exhaustion semantics.

### Behavior Changes

- `setCursorAt()`, `setSelection()`, `setCursorAtBlock()`, `selectBlock()`, `setGapCursor()`, `extendTo()`, and `replay()` no longer clear a live model selection solely because DOM Range projection is temporarily unavailable.
- Projection retries run only on the failure/deferred path, do not call `recalculate()`, and do not republish the model selection.
- Retry tasks do not steal focus from an explicitly focused external element. When DOM replacement naturally drops focus to `body`, they may refocus the editor host before projecting.
- Code that intentionally wants to clear selection must call `doc.selection.blur()` or `doc.selection.replay(null)` explicitly. No package version is changed until an explicit release decision.

### v?.?.? - 2026-07-14 (major) — DOM adapters and input use canonical selection contracts

**Severity**: major

**What changed**: `InputTransformer.deleteByRange()` now accepts only a live `BlockSelection`; its deprecated `INormalizedRange` overload and legacy input executor have been removed. Framework DOM adapters normalize browser ranges through the exported pure `normalizeRange(staticRange, getBlockById, options?)` function and consume `INormalizedEndpoints.start/end`. `SelectionManager.normalizeRange()` remains available as a deprecated compatibility facade returning `INormalizedRange`. Input cursor restoration now commits through model-first selection APIs without immediately sampling the DOM through `recalculate()`.

**Why**: Keeping current model selections, deprecated range shapes, and browser DOM readback active in the same execution path allowed one user intent to be reinterpreted more than once. That increased selection drift risk around IME, structure replacement, undo, Safari/WebKit projection, and future virtual rendering. The new boundary makes DOM normalization an explicit event adapter, keeps edit planning model-only, and treats successful programmatic selection writes as authoritative.

**Affected ai-skills files**:

- `blockcraft.md` — Quick Reference distinguishes explicit DOM sampling, pure endpoint normalization, and model-first Input cursor recipes.
- `blockcraft-selection.md` — documents the deprecated manager facade and the DOM sampling boundary.
- `blockcraft-input.md` — documents the model-only `deleteByRange()` contract and post-edit cursor behavior.

### Breaking Changes

- `InputTransformer.deleteByRange(range: INormalizedRange, merge?)` has been removed. Pass a live `BlockSelection` instead.
- Framework integrations that need to interpret a browser `StaticRange` must consume `INormalizedEndpoints`; the deprecated manager method's `from/to/index/length` result is not accepted by Input.

### Deprecations

- `SelectionManager.normalizeRange()` is deprecated with no removal date. Use the exported pure `normalizeRange()` function for DOM adapter code.

### Migration Recipe

For model-owned deletion:

```typescript
// before
const range = doc.selection.normalizeRange(staticRange);
doc.inputManger.deleteByRange(range, true);

// after
const selection = doc.selection.value;
if (selection) {
  doc.inputManger.deleteByRange(selection, true);
}
```

For browser DOM adapters:

```typescript
// before
const range = doc.selection.normalizeRange(staticRange);
if (range.from.type === "text") {
  useOffset(range.from.index);
}

// after
const endpoints = normalizeRange(staticRange, (id) => doc.getBlockById(id));
if (endpoints.start.type === "text") {
  useOffset(endpoints.start.offset);
}
```

Do not call `doc.selection.recalculate()` after `setSelection()`, `setCursorAt()`, `setCursorAtBlock()`, or `replay()` merely to confirm the write. Read `doc.selection.value` synchronously instead. The package version remains unchanged until an explicit release decision.

### Behavior Changes

- Input planning and deletion no longer execute deprecated range shapes or retain endpoint block references as mutation authority.
- Programmatic cursor restoration after ordinary input, structural replacement, table-cell materialization, and IME commit no longer performs a redundant DOM-to-model walk.
- IME commit still refocuses and reapplies the same model cursor when WebKit drops focus during DOM projection; it does not infer a new cursor from the browser selection.

### v?.?.? - 2026-07-14 (patch) — input edits use model-native plans

**Severity**: patch

**What changed**: `InputTransformer` now adapts current `BlockSelection` and normalized native target endpoints into one pure, short-lived edit plan before executing any model-owned input. `beforeInput`, printable keydown fallback, Backspace/Delete, Enter, and `compositionStart` share the same plan kinds for text cursors/ranges, whole-block ranges, gaps, container boundaries, and table-cell rectangles. Current model execution no longer converts through deprecated `INormalizedRange` `from/to/index/length` shapes; the legacy range branch remains only for explicit compatibility callers.

**Why**: Point-shape branching had spread across input entry points, which made equivalent user intent take different deletion, cursor, IME, and undo paths. A pure planner gives Input one validated intent boundary, keeps Yjs mutation ordering centralized, removes DOM/lazy block references from planning, and allows future virtual rendering to preserve model input semantics without mounted block hosts.

**Affected ai-skills files**:

- `blockcraft.md` — Quick Reference documents model-native input planning.
- `blockcraft-selection.md` — documents the Selection-to-Input consumer boundary.
- `blockcraft-input.md` — documents the adapter/planner/executor flow, compatibility boundary, fail-closed rules, IME dispatch, and virtualization constraint.

### Behavior Changes

- Equivalent model selections now choose the same edit semantics across `beforeInput`, keydown fallback, deletion, Enter, and composition startup.
- Stale IDs, invalid text slices/boundary indexes, unsupported endpoint combinations, and live blocks that no longer match a plan fail closed before native DOM writes.
- Cross-column tail preservation, structural IME undo groups, table rectangles, gap materialization, and boundary replacement retain their existing externally visible behavior.
- Planning reads model IDs/ancestry/children/text lengths only; block components are resolved immediately before execution and DOM is used only for focus/projection adapters.
- Ordinary text keydown and ordinary text Backspace/Delete skip the structural planner through an O(1) endpoint-type gate, so the new boundary does not add model-tree work to those hot paths.

### Migration Recipe

No application migration is required and no exported API was added or removed. Existing callers may continue using the deprecated `INormalizedRange` overload where already supported, but new code should pass/read current `BlockSelection` points. The package version remains unchanged until an explicit release decision.

### v?.?.? - 2026-07-14 (minor) — programmatic selection writes are model-first

**Severity**: minor

**What changed**: `SelectionManager` now resolves endpoint order and nearest common ancestry from the BlockCraft model tree instead of DOM `compareDocumentPosition()`. All programmatic selection writers canonicalize current or deprecated point shapes, publish the canonical `BlockSelection` synchronously, and only then project it to a native DOM `Range`. This includes `setSelection()`, `setCursorAt()`, `extendTo()`, editable block cursor helpers, whole-block selection, gap cursors, table-cell selection, and replay. Model-only table-cell selections still clear the native Range, while gap projection keeps its delayed filler-readiness retry.

**Why**: A programmatic DOM-first write left a timing window where Input, IME, toolbar, and undo code could still read the previous model selection until a browser-specific `selectionchange` arrived. DOM ordering also made model direction depend on rendered host nodes. One model-first commit invariant removes that drift and gives future input/undo convergence a stable selection primitive.

**Affected ai-skills files**:

- `blockcraft.md` — Quick Reference documents synchronous programmatic writes and model-tree ordering.
- `blockcraft-selection.md` — documents `SelectionPositionResolver`, canonicalization, and the unified commit path.

### Behavior Changes

- `setSelection()`, `setCursorAt()`, `extendTo()`, `setCursorAtBlock()`, and `selectOrSetCursorAtBlock()` expose the updated `doc.selection.value` before returning when they target editable content.
- Existing `selectBlock()`, `setGapCursor()`, `setTableCellSelection()`, and replay paths now share the same validation, focus, suppression, and projection ordering.
- Deprecated `index/length` range inputs preserve their exact end-offset semantics and normalize to forward document order. Current `ISelectionPoint` inputs and replay retain anchor/head direction.
- Live block IDs whose parent/child chain is disconnected or inconsistent fail closed instead of deriving order from coincidental DOM placement.
- DOM projection failures clear the canonical selection and native ranges after logging, rather than leaving a partially committed model/DOM pair.

### Migration Recipe

No call-site migration is required. Code that waited for a native `selectionchange` only to read back a programmatic selection can now read `doc.selection.value` immediately after the write. The package version remains unchanged until an explicit release decision.

### v?.?.? - 2026-07-13 (patch) — DOM selection recalculation uses semantic scopes

**Severity**: patch

**What changed**: `IBlockSchemaOptions.metadata.selectionScope` now lets block schemas declare semantic selection scopes (`document`, `table`, `columns`, `container`, or `transparent`). `SelectionManager.recalculate()` resolves `SelectionScope` from that schema metadata when a native DOM range normalizes to endpoints with different physical parent blocks. Ranges are kept when both endpoints belong to the same scope. When native drag crosses a closed scope, the internal endpoint is projected to the scope block's parent `boundary` point, so the scope block is selected as a whole instead of collapsing the entire range. Built-in schemas declare `root → document`, `table → table`, `columns → columns`, `callout → container`, and `mermaid` / `mermaid-textarea → transparent`. `root.id` is the topmost document scope and the `commonParent` for top-level child-list operations. Whole-block `selected` and collapsed `gap` points still belong to the selected block's parent domain, so selecting a table/callout/columns block as a root child keeps the existing block-selection behavior. `SelectionScopePolicy` centralizes scope-owned text input and generic selected-class behavior: `columns` is model-first for text `beforeInput`, preserves the end-column tail, and paints endpoint text blocks only; `table` also paints endpoint text blocks only for text-shaped fallback ranges; document-scope text ranges paint endpoint text blocks plus fully covered middle groups from `queryBlocksThroughPathDeeply`, so transparent endpoint ancestors are not marked as whole-block selected. `RootBlockComponent` stops starting its block-level pointerleave selection chain when the mouse selection starts inside an editable block, so native text drag ranges can reach the scope resolver instead of being promoted to parent block selection first. `FloatTextToolbarPlugin` ignores table-cell rectangles and cross-cell text-shaped fallback ranges so table rows are not styled as block selections.

**Why**: The previous same-physical-parent guard blocked legitimate structured selections, especially text selections across columns, while still not expressing why table/callout internals must not merge with outside root text. A semantic scope layer gives selection, input, and future deletion semantics a single domain boundary. Reading that boundary from schema metadata keeps the selection module from hard-coding individual flavours such as `columns`, `table-row`, or `table-cell`; non-scope blocks stay transparent and inherit the nearest configured scope's behavior.

**Affected ai-skills files**:

- `blockcraft.md` — Quick Reference documents the semantic scope guard.
- `blockcraft-block.md` — documents the `metadata.selectionScope` schema field.
- `blockcraft-selection.md` — documents `selection/scope.ts`, scope rules, and the new recalculation guard.
- `blockcraft-input.md` — documents cross-column text replacement / IME semantics.
- `blockcraft-plugins-formatting.md` — documents FloatTextToolbarPlugin's table-cell selection guard.

### New Internal APIs

- `BlockSelectionScopeKind` and `BlockSelectionScopeMetadata` are exported from the block schema layer for schema metadata typing.
- `IBlockSchemaOptions.metadata.selectionScope?: BlockSelectionScopeMetadata` declares the semantic scope owned by a block schema.
- `SelectionScopePolicy` describes scope-owned `beforeInput`, cross-text-tail, and selected-class behavior.
- `getSelectionScopePolicy(scope)`, `resolveSelectionScopeForBlock(...)`, `resolveSelectionScopeForBlockId(...)`, and `resolveSelectionScopePolicyForBlockId(...)` let framework modules derive behavior from the semantic scope instead of testing block flavours locally.

### Behavior Changes

- Native DOM selections whose endpoints are in different columns of the same `columns` block can now normalize into a `BlockSelection` with `commonParent` set to the `columns` block.
- Native DOM selections from `mermaid-textarea` to surrounding root text can now normalize into a document-level `BlockSelection` whose `commonParent` is `root.id`.
- Native DOM selections from table/callout/columns internals to outside root content project the internal endpoint to the table/callout/columns block's parent boundary, selecting that scope block as a whole instead of letting native selection reset anchor/focus inside the closed scope.
- Document-scope text selections that start or end inside a transparent container no longer apply generic `.selected` styling to that endpoint ancestor container; only the endpoint text blocks and fully covered middle groups are marked.
- Dragging from editable text no longer triggers root's block-level pointerleave promotion, so cross-column text selection is not interrupted before `selectionchange`.
- Typing, deleting, or IME over a text range whose scope policy preserves text tails (`columns`) no longer merges the surviving end-column text tail into the start-column text block. Fully covered intermediate column/block content is still removed according to the selected range.
- Model-owned table-cell rectangle selections and cross-cell text-shaped fallback ranges no longer open the floating rich-text toolbar or mark table-row containers through generic `.selected` painting.

### Migration Recipe

No application migration is required for built-in blocks. Custom block schemas that want closed selection behavior should declare `metadata.selectionScope: 'container'` (or a more specific built-in kind such as `columns` / `table` when matching those semantics). Blocks that should participate in the surrounding scope should omit the field or set `selectionScope: 'transparent'`. Plugins that inspect `selection.commonParent` should treat it as the operation host for cross-parent selections, not always the nearest DOM/common ancestor. At the document fallback level this host is still `root.id`; that does not mean root is a closed semantic scope. Plugins that need to know table rectangles should continue using `selection.getTableCellSelection()`.

### v?.?.? - 2026-07-12 (patch) — IME structural edits undo atomically

**Severity**: patch

**What changed**: `InputTransformer` now wraps IME flows that materialize or delete blocks at `compositionStart` in a `DocUndoManager` capture group that remains open until `compositionEnd` commits the final text. `DocUndoManager` can temporarily force multiple tracked Yjs transactions into one undo item regardless of elapsed wall time, then restores the normal capture timeout and stops capturing so the next user action stays separate.

**Why**: Yjs' default `captureTimeout` can split a single IME intent when the user spends longer than the merge window in the input method. For selected non-editable blocks and other structural IME paths, that meant undo could restore only the text commit or only the structural replacement, leaving the restored model selection and native DOM selection out of sync.

**Affected ai-skills files**:

- `blockcraft-input.md` — documents IME capture groups for structural materialization paths.
- `blockcraft-data.md` — documents `DocUndoManager` capture groups over multi-transaction input primitives.

### Behavior Changes

- IME over gap, boundary, table-cell, whole-block selected, and mixed cross-block selections now undoes as one user action even if composition lasts longer than Yjs' normal `captureTimeout`.
- Undo after such IME input restores the pre-input selection snapshot attached to the structural edit, instead of letting the later text commit create a separate undo item with a caret inside the replacement paragraph.
- A new `compositionStart` closes any leftover IME capture group before starting another session, preventing an interrupted composition from merging unrelated future edits.

### Migration Recipe

No application migration is required. Plugins implementing comparable multi-transaction IME/input primitives should use existing editor mutation APIs and avoid manually splitting one user intent into independent undo items.

### v?.?.? - 2026-07-07 (patch) — IME composition aborts stale selections safely

**Severity**: patch

**What changed**: `InputTransformer` now treats a composition selection that still points at removed blocks as a fail-closed IME startup. It tries the existing composition selection recovery once; if no live model-backed insertion point exists, it prevents default, clears the selection, marks the pending composition as aborted, and consumes the matching `compositionEnd` without committing text. `CompositionEventState.getFallbackPoint()` returns `null` instead of throwing if a recalculated selection becomes stale.

**Why**: IME events can arrive while undo, block deletion, table/cell selection, or browser selectionchange has left a short-lived stale `BlockSelection`. Throwing from lazy `firstBlock` / `lastBlock` reads leaves the editor in a repeated `Block not found` state. Aborting the single invalid composition keeps Yjs authoritative and avoids committing native IME text into the wrong block.

**Affected ai-skills files**:

- `blockcraft-input.md` — documents stale composition selection abort behavior.

### Behavior Changes

- `compositionStart` over an unrecoverable stale selection clears the editor selection and aborts the pending composition instead of throwing.
- The matching `compositionEnd` exits without reading `compositionState` or writing text.
- `compositionEnd` with no resolved commit point exits without throwing `Invalid inputRange`.

### Migration Recipe

No application migration is required. Downstream code that intentionally expected IME `BlockCraftError`s for stale selections should instead treat this as dropped browser input and observe normal selection/input state.

### v?.?.? - 2026-07-08 (patch) — whole-block selection and gap-block Shift+Arrow are model-first

**Severity**: patch

**What changed**: `SelectionManager.selectBlock()` now writes the canonical `BlockSelection` synchronously before applying the derived native DOM `Range`. Programmatic DOM range application for model-first selection paths briefly suppresses native `selectionchange`, and new-format `replay(ISelectionJSON)` derives the native DOM Range from document-ordered `start/end` while preserving anchor/head direction in the model. `selectAllChildren()` is now model-first too: editable blocks replay a full text range, container/root blocks with children replay a `[boundary(0), boundary(childrenLength)]` range, and only void/empty blocks fall back to whole-block `selected`. Ctrl+A now treats a full editable text range, full container boundary range, or explicit whole-block selection as already covering the current block's content and climbs to `selectAllChildren(parent)`, while partial container boundary ranges expand inside the current container first. Shift+Arrow extension that crosses into a void/container block now replays a parent `boundary` endpoint, and Shift+Arrow leaving a container from its first/last child maps the moving endpoint to the container's boundary in its parent instead of promoting the container to whole-block `selected`. Boundary DOM range construction prefers the adjacent block's leading/trailing gap text anchor when one exists, instead of using native `Selection.extend(hostElement, ...)` or a whole-block `selected` endpoint for range extension; non-collapsed cross-block gap anchors and void/container chrome endpoints now normalize back to the corresponding parent boundary point. Existing non-collapsed text anchors remain text points, with `InputTransformer` handling supported mixed `text + boundary` replacement and IME materialization. `SelectionSelectedManager` no longer writes the legacy root `.all-selected` class; consumers should use `BlockSelection.isAllSelected` or block-level `.selected` classes instead. `AttachmentExtensionPlugin` no longer fakes `.selected` on attachment blocks while the rename input is focused; it uses `.bc-attachment-renaming` for that private visual state and restores the real model selection on close. `TableBlockComponent` now paints rectangular cell selection with `.bc-table-cell-selected` instead of reusing the generic `.selected` class on `td.table-cell-block`.

**Why**: Safari/WebKit can reinterpret a callout/highlight/container host range as internal child text or boundary endpoints when the browser fires a delayed `selectionchange`. That could make undo restore the callout's internal content selection instead of the selected block, and could make Shift+Arrow selection shrink or stop when crossing into a container block. Boundary endpoints keep the moving Shift+Arrow endpoint as a document-position range, while gap anchors keep the native DOM endpoints out of the container's editable children. Keeping existing text anchors avoids a visual/model split where the browser paints only a container selection but input deletes additional text below it.

**Affected ai-skills files**:

- `blockcraft.md` — Quick Reference notes that `selectBlock()` updates `doc.selection.value` synchronously.
- `blockcraft-selection.md` — documents model-first whole-block selection, boundary-backed Shift+Arrow over gap blocks, and short native selectionchange suppression for derived DOM ranges.
- `blockcraft-input.md` — documents Yjs-owned replacement and IME handling for supported mixed `text + boundary` ranges.
- `blockcraft-plugins-toolbar.md` — documents AttachmentExtensionPlugin rename-mode visual class ownership.
- `blockcraft-plugins-inline.md` — documents the private table cell rectangle class used by `TableBlockComponent`.

### Behavior Changes

- Code that calls `doc.selection.selectBlock(block)` can read `doc.selection.value` immediately after the call. The value is the whole-block selected model state before the browser native Selection view catches up.
- Code that calls `doc.selection.selectAllChildren(block)` can read `doc.selection.value` immediately after the call. For editable blocks, the value is a full text range. For container/root blocks with children, the value is a boundary range over direct children instead of a whole-block selected endpoint.
- Repeated Ctrl+A climbs by model coverage: partial editable text selects the full text, full editable text selects parent content, partial container boundary ranges expand to the current container's children, and full container boundary or explicit whole-block selections climb to parent content. Table-cell text still promotes to model table-cell selection before whole-table selection.
- The editor no longer adds `.all-selected` to the root host for whole-block selected ranges. External code should read `doc.selection.value?.isAllSelected` for state and style the actual selected blocks through `.selected`.
- Attachment rename mode no longer adds `.selected` directly while the rename overlay input owns focus. Theme/custom CSS that intentionally styled the rename-active attachment through `.attachment-block.selected` should also target `.attachment-block.bc-attachment-renaming`.
- Table rectangular cell selection no longer adds `.selected` to `td.table-cell-block`; it uses `.bc-table-cell-selected`. Whole-table block selection still uses `.table-block.selected` through the normal `SelectionManager` path.
- Programmatic whole-block selection is less browser-dependent around container/callout blocks. A delayed native `selectionchange` caused by applying the derived DOM Range should not overwrite the canonical model selection.
- Shift+Arrow crossing from text or a gap cursor into a void/container block now extends the moving endpoint with parent `{type: 'boundary', index}` points. Shift+Arrow leaving a container from its first or last child does the same at the container's parent boundary instead of turning the container into a whole-block `selected` endpoint. Continued Shift+Arrow extension advances from the model `head` instead of the browser native `Selection.focusNode`, so replayed backward ranges keep growing from the upper edge instead of shrinking from the lower text endpoint. Collapsed starts can still materialize structural boundary ranges, but existing non-collapsed text anchors stay text points so the visible text extent remains represented in the model. The DOM view for boundary endpoints prefers the target block's gap text node, so Safari has a stable native anchor; if a later `selectionchange` reads that cross-block gap anchor or void/container chrome endpoint back, it normalizes to the same parent boundary point instead of a whole-block `selected` endpoint. Same-block leading→trailing gap/chrome ranges still represent explicit whole-block selection.
- Typing, Backspace/Delete fallback, Enter, and IME over supported mixed `text + boundary` selections stay in the Yjs-owned input path and keep the caret/composition on the surviving editable text endpoint instead of blurring.
- IME over cross-block text selections now also collapses the live model/native selection to the surviving text endpoint after undo snapshot capture but before deleting covered blocks, so composition commits into the retained `Y.Text` even when a container/highlight block is inside the selected range.
- No migration is required for normal consumers. Tests that waited for native `selectionchange` after `selectBlock()` should assert the synchronous model selection instead.

### v?.?.? - 2026-07-07 (patch) — stale selections clear before reads and broadcasts

**Severity**: patch

**What changed**: `SelectionManager` now validates a `BlockSelection`'s lazy block references before applying/broadcasting it through `selectionChange$` and before returning `doc.selection.value`. If undo/replay or structural edits leave a selection pointing at deleted blocks, the manager clears it to `null` instead of letting consumers read `firstBlock` / `lastBlock` and throw `Block not found`.

**Why**: Table focus UI, selected-class painting, toolbars, and other selection subscribers all consume the same canonical selection stream. Centralizing the stale-selection guard prevents each subscriber from needing its own `try/catch` around lazy block access after undo/redo.

**Affected ai-skills files**:

- `blockcraft.md` — notes that stale block refs are cleared before `selectionChange$` emit and `doc.selection.value` read.
- `blockcraft-selection.md` — documents the selection liveness guard in the lifecycle, value getter, and observer API.

### Behavior Changes

- Invalid replay/undo selections that reference missing blocks now clear to `null` before selection subscribers run or when `doc.selection.value` is read. No public API shape changed; consumers that already handle `null` selections need no migration.

### v?.?.? - 2026-07-06 (patch) — mixed whole-block/text IME input collapses before deletion

**Severity**: patch

**What changed**: `InputTransformer` now handles mixed selections such as `{ anchor: selected block, head: text offset }` during IME startup by capturing the undo snapshot first, collapsing the live model/native selection to the surviving editable text endpoint before deleting whole-block endpoints, then starting composition there. The same destructive replace helper now avoids exposing a dangling selected block to sync observers while keeping the native IME target focused.

**Why**: IME over a selection that starts on a whole block and ends inside text could delete the selected block while `doc.selection.value` still pointed at it. Synchronous observers and subsequent editing/undo could then read a stale block id, causing repeated `block not found`-style failures.

**Affected ai-skills files**:

- `blockcraft-input.md` — documents mixed whole-block/text input and IME replacement behavior.

### Behavior Changes

- IME and text replacement over mixed whole-block/text ranges now stay in the controlled Yjs input path and keep focus on the surviving text endpoint instead of leaving a stale selection that points at a deleted block.
- No external API shape changed; no migration is required for normal consumers.

### v?.?.? - 2026-07-06 (patch) — selection replay and undo snapshots use anchor/head model

**Severity**: patch

**What changed**: `SelectionManager.replay(ISelectionJSON)` now updates the canonical `BlockSelection` synchronously before applying the derived native DOM Range. `DocUndoManager` now captures and restores selection snapshots as anchor/head model points instead of legacy `from/to`, preserving text selection direction, gap side, boundary indexes, and table-cell anchor/head intent during undo/redo.

**Why**: undo/redo and programmatic replay need a stable model selection immediately after restore. Relying on a later browser `selectionchange` can leave `doc.selection.value` stale or null, and legacy `from/to` snapshots lose direction-sensitive intent for backward text selections and rectangular table selections.

**Affected ai-skills files**:

- `blockcraft-selection.md` — documents synchronous new-format replay and anchor/head undo snapshots.
- `blockcraft.md` — Quick Reference notes that `replay(ISelectionJSON)` updates `doc.selection.value` synchronously.

### Behavior Changes

- Code that calls `doc.selection.replay(savedSelectionJson)` with the new `ISelectionJSON` shape can read `doc.selection.value` immediately after the call. The browser native `Selection` remains a derived view and may still be absent for model-only table-cell selections.
- Undo/redo restores anchor/head direction for supported selection point types instead of normalizing snapshots to document-ordered legacy `from/to`.

### v?.?.? - 2026-07-06 (patch) — IME composition anchors are captured from the accepted model target

**Severity**: patch

**What changed**: `InputTransformer` now starts `CompositionSession` directly from the accepted model text point or from the paragraph it materializes for gap, boundary, table-cell, and selected renderUnit IME input. `selection.recalculate()` can still run after materialization to settle local UI, but the composition commit anchor no longer depends on that DOM-derived result. Active composing `beforeinput` target ranges no longer retarget the session anchor.

**Why**: during IME startup, browsers can temporarily clear or move the native DOM selection, especially around model-only table-cell selections and gap/boundary materialization. Re-reading DOM selection after the editor already knows the intended target could retarget or drop the composition. Capturing from the model/materialized block keeps the commit in Y.Text control flow.

**Affected ai-skills files**:

- `blockcraft-input.md` — documents the compositionStart model-anchor rule and the reduced role of `selection.recalculate()` during IME startup.

### Behavior Changes

- IME composition over text, gap, boundary, table-cell, and selected renderUnit targets commits to the model target accepted at `compositionStart`, even if a follow-up DOM selection recalculation or composing `beforeinput` target range returns `null` or a stale range during browser IME startup.

### v?.?.? - 2026-07-06 (patch) — table-cell selections no longer expose DOM range geometry

**Severity**: patch

**What changed**: `SelectionManager.getSelectionRect()` and `getSelectionRects()` now return `null` for model-owned table-cell selections. Table-cell selections still round-trip through `BlockSelection.getTableCellSelection()`, `setTableCellSelection()`, replay, clipboard/input handlers, and `createFakeRange()`.

**Why**: a rectangular table selection is model-owned and the browser native range is intentionally cleared. Exposing a synthetic DOM Range from `getSelectionRect(s)` let unrelated toolbar/overlay code treat table-cell selections as DOM-backed text/block selections, which could resurrect floating text UI or derive misleading geometry.

**Affected ai-skills files**:

- `blockcraft-selection.md` — documents that table-cell selections are rectless/model-only for geometry APIs.
- `blockcraft.md` — Quick Reference notes that `getSelectionRect(s)` returns `null` for table-cell selections.

### Behavior Changes

- Plugins that position UI from `doc.selection.getSelectionRect()` or `getSelectionRects()` must handle `null` for table-cell selections. Use `selection.getTableCellSelection()` plus table component APIs, or `doc.selection.createFakeRange(selection)`, when table-specific visual feedback is needed.

### v?.?.? - 2026-07-06 (patch) — gap cursor uses a text-only native caret anchor

**Severity**: patch

**What changed**: `createBlockGapSpace()` now creates each block gap filler with only a zero-width text node, and `SelectionManager` places collapsed gap DOM ranges inside that text node instead of at the filler span boundary. The previous filler `<br>` is removed. The selection model is unchanged: gap selections are still represented as `{ blockId, type: 'gap', side }`, and `getBlockGapCaretSpan()` still returns the visual filler span for geometry.

**Why**: Safari/WebKit does not reliably paint a native caret for a collapsed range at `(fillerSpan, 0)` when the editable filler behaves like an empty span. Anchoring the range in a real text node keeps the native caret path visible without reintroducing a CSS fake cursor; removing `<br>` keeps the filler DOM shape single-purpose.

**Affected ai-skills files**:

- `blockcraft-selection.md` — documented the text-only gap filler and zero-width text-node anchor.
- `blockcraft.md` — Quick Reference notes that gap DOM ranges anchor inside the filler text node for WebKit caret visibility.

### Behavior Changes

- The DOM shape of internal block gap fillers changes from span + `<br>` to span + zero-width text node. Code should continue reading the `BlockSelection` model instead of depending on `document.getSelection().anchorNode` being the filler span itself.
- No migration is required for normal `doc.selection.setGapCursor()`, input, keyboard, clipboard, or undo/redo usage.

### v?.?.? - 2026-07-03 (minor) — table-cell 选区点与表格矩形选区模型化

**Severity**: minor

**What changed**: the selection point union now includes `ITableCellSelectionPoint { blockId, type: 'table-cell', tableId, block }`. `SelectionManager.setTableCellSelection(table, anchorCell, headCell?, scrollIntoView?)` stores a model-owned rectangular table selection synchronously, focuses the editor host, clears the browser native range, and lets `TableBlockComponent` paint the selected cells. `BlockSelection.getTableCellSelection()` exposes `{ tableId, anchorCellId, headCellId }`. Selection-sourced events for table-cell model selections now route from the anchor/head cells before bubbling to rows/table/root. `TableBlockBinding` now reads the table-cell model selection for copy/cut/paste/delete/arrow navigation before falling back to explicit table-owned row/column/cell coordinates. `InputTransformer` also recognizes table-cell selections for typing, printable keydown fallback, Enter, Backspace/Delete fallback, and IME materialization. Undo/redo snapshots preserve `blockId + tableId` and replay the table-cell model selection when both still exist.

**Why**: table cell selection is rectangular and cannot be represented safely by DOM Range endpoints or a single block selection. Modeling the rectangle in `BlockSelection` gives input, clipboard, deletion, and undo/redo a stable source of truth while keeping the browser selection as a derived/optional view.

**Affected ai-skills files**:

- `blockcraft-selection.md` — documented `ITableCellSelectionPoint`, JSON shape, `getTableCellSelection()`, `setTableCellSelection()`, model-only replay, and undo/redo behavior
- `blockcraft-input.md` — documented table-cell rectangle input, delete, Enter, and IME materialization semantics
- `blockcraft-plugins-inline.md` — documented TableBlockBinding's table-cell model selection flow and fallback to explicit coordinates
- `blockcraft-event.md` — documented table-cell model selection event scope routing from anchor/head cells
- `blockcraft.md` — Quick Reference now lists `table-cell` selection points and `setTableCellSelection()`

### New APIs / Features

- `ITableCellSelectionPoint { blockId, type: 'table-cell', tableId, block }` — a new selection endpoint variant for table-cell rectangles.
- `ISelectionPointJSON` accepts `{ blockId, type: 'table-cell', tableId }`.
- `BlockSelection.getTableCellSelection(): { tableId: string; anchorCellId: string; headCellId: string } | null`.
- `doc.selection.setTableCellSelection(table, anchorCell, headCell?, scrollIntoView?)`.

### Behavior Changes

- Drag-selecting multiple table cells now writes a model table-cell selection instead of selecting only the anchor cell as a whole block.
- Replaying table-cell JSON restores the model selection without constructing a native DOM Range.
- Empty native `selectionchange` events caused by clearing the browser range no longer clear a model-owned table-cell selection while the editor host keeps focus, so undo/redo can restore the rectangle reliably.
- `doc.selection.getSelectedText()` for a table-cell rectangle returns selected cell text as tab/newline-separated table text.
- `doc.selection.createFakeRange(selection)` now paints model-owned table-cell selections as a border-only focus ring on the anchor cell instead of rendering the full rectangle.
- Table copy/cut/paste/delete paths prefer table-cell model coordinates before fallback table component coordinates.
- Keydown events over model table-cell selections route from the anchor/head cells, so `{flavour: 'table-cell'}` and `{flavour: 'table'}` handlers still run when the browser native Selection has no focus node.
- Arrow over a model table-cell selection moves/collapses to the adjacent visible cell; Shift+Arrow keeps the anchor and extends the head. Boundary arrows are consumed and keep the model selection unchanged.
- Typing or printable keydown over a table-cell rectangle clears selected visible cells, inserts text into the anchor cell's fresh paragraph, and moves the caret after the inserted text.
- IME over a table-cell rectangle clears selected visible cells, materializes a fresh empty paragraph in the anchor cell, and starts `CompositionSession` there so commit writes to `Y.Text`.
- Backspace/Delete fallback over a table-cell rectangle clears selected visible cells and restores the model table-cell rectangle; Enter clears selected visible cells and places the caret in the anchor cell.

### Migration Recipe

Consumers with exhaustive `switch (point.type)` logic must add a `table-cell` branch:

```typescript
if (selection.start.type === "table-cell") {
  const cell = selection.start.block;
  const tableId = selection.start.tableId;
  const rectangle = selection.getTableCellSelection();
}
```

Plugins that previously inferred table rectangles from `selection.firstBlock` should prefer `selection.getTableCellSelection()` and derive coordinates from the owning table.

### v?.?.? - 2026-07-03 (minor) — 表格显式矩形选区删除

**Severity**: minor

**What changed**: `TableBlockComponent` now exposes `getExplicitSelectedCoordinates()`, which returns only an active table-structure selection (dragged cell rectangle, row range, or column range) and never falls back to the current cursor / first cell. `TableBlockBinding` uses that explicit rectangle for Delete/Backspace before considering the legacy single-cell block-selection fallback.

**Why**: table cell selection is rectangular, while the generic `BlockSelection` can still point only at the anchor cell or an inner paragraph. The old Delete/Backspace path could therefore clear only the first cell when the visual table rectangle was selected. Preferring the table-owned rectangle keeps the data mutation aligned with the user's selected cells without treating DOM classes as the source of truth.

**Affected ai-skills files**:

- `blockcraft-plugins-inline.md` — documented TableBlockBinding's explicit rectangle delete behavior and the related table component API
- `blockcraft.md` — updated the plugin quick reference for TableBlockBinding

### New APIs / Features

- `TableBlockComponent.getExplicitSelectedCoordinates(): TableCellsSelection | null` returns the active cell/row/column rectangle only.

### Behavior Changes

- Delete/Backspace over an explicit table cell rectangle clears every cell in that rectangle.
- Plain text deletion inside a table cell is still left to `InputTransformer` when no explicit table rectangle is active.

### Migration Recipe

No code migration required for normal consumers. Plugins that need to distinguish a real table rectangle from the current cursor cell should use `getExplicitSelectedCoordinates()` instead of `getSelectedCoordinates()`.

### v?.?.? - 2026-07-03 (minor) — boundary 选区点与容器边界归一化

**Severity**: minor

**What changed**: the selection point union now includes `IBoundarySelectionPoint { blockId, type: 'boundary', index, block }`, representing a document-tree child boundary inside a container/root block. Non-collapsed DOM range endpoints that land on a container/root block host, a wrapper around its children container, or its `.children-render-container` now normalize to boundary points instead of lossy text or whole-block selected points. `SelectionManager.setSelection()` / `replay()` can build DOM Ranges from boundary JSON, `SelectedManager` paints covered child blocks, `FakeRange` renders covered child blocks, and `DocUndoManager` stores boundary indexes as Yjs relative positions over the parent children array. `InputTransformer` can now structurally edit same-container boundary ranges in renderUnit containers that accept paragraphs.

**Why**: browsers often paint selections whose endpoints sit on wrapper elements around nested editable children, especially in callout/container blocks. Treating those endpoints as whole-container `selected` points could mix a container point with child text points and then fail the parent guard; mapping them to text points made the selection controllable, but erased the fact that the user selected a child-list boundary. Boundary points give BlockCraft a ProseMirror-like model position for container content while keeping DOM as a derived view.

**Affected ai-skills files**:

- `blockcraft-selection.md` — documented `IBoundarySelectionPoint`, boundary JSON, normalization, replay, fake range, undo/redo, and structural input constraints
- `blockcraft-input.md` — documented structural input / IME behavior for same-container boundary selections
- `blockcraft.md` — Quick Reference notes that container-boundary DOM endpoints normalize to boundary points

### New APIs / Features

- `IBoundarySelectionPoint { blockId, type: 'boundary', index, block }` — a new selection endpoint variant. `blockId` is the owning container/root block; `index` is the child boundary position.
- `ISelectionPointJSON` accepts `{ blockId, type: 'boundary', index }`.
- `BlockSelection.getBoundarySelectedChildIds(): string[] | null` returns direct child ids covered by a same-container boundary range.

### Behavior Changes

- Drag or browser-created selections that start/end on a container block's child wrapper can now become boundary-to-boundary selections instead of collapsing to `null` or degrading to descendant text endpoints.
- `doc.selection.getSelectedText()` for a boundary range returns covered child block text joined by newlines.
- `createFakeRange()` and selected CSS painting cover the selected child blocks for same-container boundary ranges.
- Same-container boundary selections inside renderUnit containers that accept paragraphs are now Yjs-controlled for input: typing / printable keydown replaces the covered children with one paragraph, IME first materializes an empty paragraph before `CompositionSession` starts, Backspace/Delete delete the covered children, and Enter replaces them with an empty paragraph.
- Boundary selections in containers that cannot safely host paragraphs remain fail-closed: input prevents default and clears the editor selection instead of allowing browser-native DOM mutation.
- Collapsed selections on non-editable block hosts are unchanged; they still normalize as whole-block/gap-style block selections where applicable.

### Migration Recipe

Consumers with exhaustive `switch (point.type)` logic must add a `boundary` branch:

```typescript
if (selection.start.type === "boundary") {
  const container = selection.start.block;
  const index = selection.start.index;
}
```

Downstream tests that asserted container-wrapper selections were rejected or normalized to descendant text endpoints should update expectations to boundary points.

### v?.?.? - 2026-07-02 (patch) — 未识别选区输入 fail-closed

**Severity**: patch

**What changed**: selection-sourced events now still run global handlers when `doc.selection.value` is `null`. `InputTransformer` uses that path to fail closed: if editor-root `beforeInput` cannot be resolved from either the live model selection or `beforeinput.getTargetRanges()`, it prevents the native browser mutation and clears the editor selection. IME follows the same rule: `compositionStart` tries to recover a model selection, refuses to start `CompositionSession` if recovery fails, and composing `beforeInput` is prevented when no active session owns it.

**Why**: browsers can paint complex native selections across container blocks / nested editable children that BlockCraft cannot yet express safely. Letting input proceed in that state mutates DOM outside Yjs, creating phantom content and selection drift. Failing closed keeps DOM and Yjs consistent while the richer container-selection model is being built.

**Affected ai-skills files**:

- `blockcraft-input.md` — documented the fail-closed input guard and IME behavior
- `blockcraft-event.md` — documented global handler dispatch when selection-sourced events have no model selection

### Behavior Changes

- Global `@EventListen('beforeInput')` / composition handlers can now run even when `doc.selection.value` is `null`.
- Editor-root `beforeInput` with an un-normalizable selection now calls `preventDefault()` instead of silently returning and allowing browser-native DOM mutation.
- `compositionStart` without a recoverable model selection is rejected; a matching idle `compositionEnd` is ignored after `preventDefault()`.

### Migration Recipe

No code migration required. Plugins that register global selection-sourced handlers should tolerate `doc.selection.value === null`; this was already possible for defensive code, but those handlers may now be invoked in that state.

### v?.?.? - 2026-07-02 (patch) — gap 光标模型同步与 trailing filler 稳定性

**Severity**: patch

**What changed**: `SelectionManager.setGapCursor(block, side, scrollIntoView?)` now updates the canonical `BlockSelection` synchronously before applying the derived native DOM `Range`. The zero-gap helpers that resolve leading/trailing filler spans now enumerate direct gap children instead of relying on `:first-of-type` / `:last-of-type`, so an appended FakeRange cursor span no longer hides the trailing gap filler.

**Why**: gap 光标是 void/container 块旁输入、键盘导航、粘贴和 IME materialize 的共同入口。如果 programmatic gap cursor 只写 DOM，再等浏览器 `selectionchange` 回填模型，调用方会短暂读到旧 selection；而 FakeRange overlay 追加的普通 `span` 也可能让 trailing gap 查找失败。模型优先和直接 gap 枚举能让选区状态更接近 ProseMirror 的 state-first 语义。

**Affected ai-skills files**:

- `blockcraft-selection.md` — documented the model-first `setGapCursor()` flow
- `blockcraft.md` — Quick Reference notes that `setGapCursor()` updates `doc.selection.value` synchronously

### Behavior Changes

- `doc.selection.setGapCursor()` returns with `doc.selection.value` already set to a collapsed `{type: 'gap', side}` `BlockSelection`, and `selectionChange$` has already emitted that state.
- Trailing gap anchor/caret lookup remains correct when an unrelated sibling `span` (for example a FakeRange cursor overlay) is appended after the block's gap fillers.
- `doc.selection.getSelectedText()` returns `''` for a collapsed gap cursor instead of returning the adjacent block's text content.

### Migration Recipe

No code migration required. If downstream tests assumed `setGapCursor()` only updated the native DOM selection and waited for a later `selectionchange` event before reading `doc.selection.value`, update them to assert the synchronous gap state immediately after the call.

### v?.?.? - 2026-06-30 (patch) — OrderedBlockPlugin 父节点级自动重排

**Severity**: patch

**What changed**: `OrderedBlockPlugin` now recalculates ordered-list numbering by scanning the affected parent block's sibling sequence instead of only walking around the changed ordered block. Child insert/delete changes schedule the whole parent for renumbering; ordered block `depth` / `heading` / `start` prop changes schedule that block's parent. The scan groups counters by sibling `depth + heading`, honors explicit `start`, lets same-depth ordered blocks continue across non-ordered siblings, and clears deeper counters after returning to a shallower depth.

**Why**: The old local-neighborhood algorithm missed several user-visible cases: changing the `heading` on one ordered block could leave following ordered blocks with stale order values; nested ordered items could continue under the wrong parent after the sequence returned to a shallower depth; and deletion/insert cases depended too heavily on the immediate neighboring block. Parent-level scanning makes the plugin behave closer to how users expect continuous ordered blocks to sort themselves.

**Affected ai-skills files**:

- `blockcraft-plugins-block.md` — OrderedBlockPlugin behavior notes updated for parent-level renumbering

### Behavior Changes

- Changing an ordered block's `heading`, `depth`, or `start` now renumbers following ordered siblings in the same parent during the next scheduling tick. Previously the plugin could update only the local run around the changed block.
- Ordered numbering now groups by `depth + heading`: lower-level heading ordered blocks no longer split higher-level heading numbering, and same-depth/same-heading ordered blocks continue as one sequence.
- Same-depth ordered blocks continue across non-ordered siblings. Returning to a shallower depth clears deeper counters, so nested ordered numbering restarts below the next shallower item.
- A `start`-only prop change now uses a bounded local recalculation range and stops at the next explicit `start` for the same `depth + heading`. Child changes and `depth` / `heading` changes still use parent-level scanning because they can affect multiple numbering groups.
- No public API or configuration changes. Existing `new OrderedBlockPlugin()` usage stays unchanged.

### Migration Recipe

No code migration required. If downstream tests asserted exact stale `order` props after `heading` / `depth` edits, update those expectations to the corrected renumbered sequence.

### v?.?.? - 2026-06-30 (minor) — gap 光标模型与边界场景（粘贴、undo side）

**Severity**: minor

**What changed**: 选区系统新增第三种点类型 `IGapSelectionPoint`（`type: 'gap'`），表示 **void 或容器块旁的折叠光标**（光标在块的左边界 `side: 'before'` 或右边界 `side: 'after'`）。它复用了 `BaseBlockComponent` 为非叶子 void/容器块挂载的 `contenteditable` gap **filler span**（`<span data-block-zero-space class="bc-block-gap"><br></span>`，由 `createBlockGapSpace()` 创建）：collapsed 原生 range 落在 leading filler → `gap-before`，落在 trailing filler → `gap-after`。光标定位走 `(fillerSpan, 0)`（`<br>` 之前），**由浏览器渲染真实的原生光标**（在卡片上方表示 `before`、下方表示 `after`），不再使用 CSS 伪元素假光标条。

gap 点在 `ISelectionPointJSON` 里新增可选字段 `side?: 'before' | 'after'`，并新增 `SelectionManager.setGapCursor(block, side, scrollIntoView?)` 公开方法。本次（P6）补齐两个边界场景：(1) 在 gap 处**粘贴**不再是 no-op，而是把剪贴板块作为兄弟插入到 gap 索引处（`before` = 当前块索引，`after` = 当前块索引 + 1），**保留**该 void/容器块（不替换）；(2) **undo/redo** 精确还原 gap 的 `side`，不再退化为整块 `selected` 快照。

**Why**: 语雀式编辑中，gap 光标是块间导航和输入的基本单位。在 void/容器块旁粘贴和撤销时，必须精确还原光标「在块前还是块后」的语义，否则会丢失插入位置或退化为整块选中。

**Affected ai-skills files**:

- `blockcraft-selection.md` — 新增 `IGapSelectionPoint` 类型说明、gap 光标机制小节、JSON 序列化（`side` 字段）说明、`setGapCursor` API、常见错误条目
- `blockcraft.md` — Quick Reference 选区小节新增 `gap` 点类型、`setGapCursor()` API 和 gap 类型收窄示例

### New APIs / Features

- `IGapSelectionPoint { blockId, type: 'gap', side: 'before' | 'after', block }` — 新的选区点类型；`ISelectionPoint` 联合类型从两种扩展为三种。
- `ISelectionPointJSON.side?: 'before' | 'after'` — gap 点序列化时携带侧向（`type === 'gap'` 时存在）。
- `doc.selection.setGapCursor(block, side, scrollIntoView?)` — 在 void/容器块旁设置折叠 gap 光标。
- 粘贴路径：在 gap 处同时接受 plain text 与 snapshot（内部格式 / web custom format / 有道云 / HTML adapter），统一作为兄弟块插入。

### Behavior Changes

- 粘贴到 gap 光标时：剪贴板块作为兄弟块插入到 gap 索引处，原 void/容器块保留（此前该场景是 no-op）。
- undo/redo 能精确恢复 gap 光标的 `side`；此前 gap 在 undo 快照里退化为 `selected`，丢失侧向信息。`toJSON()` / `replay()` 往返同样保持 `side` 字段。
- `toLegacyJSON()` 仍把 gap 降级为 lossy 的 `selected` 点（旧格式无法表达 gap）；新格式 `toJSON()` 不受影响。

### Migration Recipe

纯新增特性，向后兼容，现有代码无需改动。gap 选区点仅在以下场景自动或手动产生：

- 左右方向键导航 void/容器块（自动）
- 点击 void/容器块旁的空白区域（自动）
- undo/redo 还原 gap 光标（自动）
- 调用 `doc.selection.setGapCursor()`（手动）

消费者若想在 copy/paste 等事件处理里识别 gap：

```typescript
const sel = doc.selection.value;
if (sel && sel.start.type === "gap") {
  const { blockId, side } = sel.start; // side: 'before' | 'after'
  // 在 blockId 的 before/after 一侧进行操作
}
```

若要序列化选区并稍后还原（含 gap）：

```typescript
const json = selection.toJSON(); // start.type === 'gap' 时 json 含 side 字段
selection.replay(json); // 自动还原 gap 的 side
```

---

### v?.?.? - 2026-06-24 (minor) — Code block 支持用户颜色叠加；TextMarkerPlugin 新增 `colorOnlyFlavours`

**Severity**: minor

**What changed**: Code blocks (and the mermaid source block, which shares the same `CodeInlineRuntime`) now support user-applied color and background-color overlays on top of Shiki syntax highlighting. The new internal module `blocks/code-block/color-merge.ts` (`mergeColorOverShiki`, `deltaFingerprint`) merges model inline attributes `s:color` / `s:background` from `Y.Text` over Shiki token colors during the render pipeline of `CodeInlineRuntime`. Previously those attributes were ignored entirely. Colors persist natively in the Yjs document, survive collaboration and undo/redo, but are not exported to HTML or Markdown (external clipboard output remains plain text).

`TextMarkerPlugin` gains an optional second constructor parameter `colorOnlyFlavours?: BlockFlavour[]` (default `[]`). Flavours listed there pop the floating toolbar but show only the color picker (bold/italic/underline/strike hidden), backed by a new `@Input() colorOnly: boolean` on `TextMarkerComponent`. A flavour listed in both `markTextBlockFlavours` and `colorOnlyFlavours` is silently ignored in the color-only list.

The bundled `<editor>` component (`packages/editor/editor/editor.ts`) now registers `new TextMarkerPlugin([], ['code', 'mermaid-textarea'])` alongside the existing `FloatTextToolbarPlugin()`. Consumers using the pre-assembled editor component get a color toolbar on code blocks and mermaid source by default, with no overlap with the rich-text toolbar.

**Why**: Code blocks are marked `plainTextOnly`, so the existing `FloatTextToolbarPlugin` declined to format them. Users needed to color code spans (e.g., highlight a variable name) while keeping Shiki syntax highlighting. The `colorOnlyFlavours` extension point lets the host selectively enable color-only overlays on any plain-text block without exposing the full rich-text toolbar.

**Affected ai-skills files**:

- `blockcraft-plugins-toolbar.md` — 新增 TextMarkerPlugin 完整章节（`colorOnlyFlavours` 参数、`colorOnly` Input、使用示例）

### New APIs / Features

- `TextMarkerPlugin` constructor 2nd param: `colorOnlyFlavours?: BlockFlavour[] = []` — listed flavours show a color-only toolbar; mutually exclusive with `markTextBlockFlavours` (dupes silently skipped).
- `TextMarkerComponent` `@Input() colorOnly: boolean` — when `true`, hides bold/italic/underline/strike and renders only the color picker.
- Internal module `blocks/code-block/color-merge.ts`:
  - `mergeColorOverShiki(shikiDelta, modelDelta): Delta` — pure function; applies model `s:color` / `s:background` attrs over Shiki token colors.
  - `deltaFingerprint(delta): string` — content/attrs hash used for render memoization; now includes `s:background`.

### Behavior Changes

- `CodeInlineRuntime` now merges model `s:color` / `s:background` attrs over Shiki syntax colors at render time (affects both the code block and the mermaid source block, which share this runtime). Previously these attributes were stored in `Y.Text` but had no visual effect.
- The line-diff fingerprint (`deltaFingerprint`) now includes `s:background`, so background-color changes on code lines correctly invalidate the render cache.
- The bundled `<editor>` component now shows a color-only floating toolbar on code-block and mermaid-source text selections by default. Rich-text blocks are still served by `FloatTextToolbarPlugin` with no change.
- HTML/Markdown export and external clipboard continue to output plain text for code blocks — color attrs are native-doc-only and not serialized to external formats.

### Migration Recipe

纯新增，向后兼容。现有单参数 `new TextMarkerPlugin([...])` 调用零改动。

消费者自行组装编辑器（未使用捆绑 `<editor>` 组件）时，如需启用代码块颜色叠加：

```typescript
// before — code blocks get no color toolbar
new TextMarkerPlugin(["paragraph", "heading"]);

// after — add 'code' / 'mermaid-textarea' to colorOnlyFlavours; existing rich flavours unaffected
new TextMarkerPlugin(["paragraph", "heading"], ["code", "mermaid-textarea"]);
```

使用捆绑 `<editor>` 组件的消费者无需任何改动——升级即启用代码块颜色工具栏。

---

### v?.?.? - 2026-06-17 (minor) — MentionPlugin 新增 `onConfirm` 宿主认领钩子（确认时可不产生节点）

**What changed**: `MentionPluginConfig` 新增可选项 `onConfirm?: (data: IMentionData, ctx: MentionConfirmContext) => boolean | void`，并导出新接口 `MentionConfirmContext { block: EditableBlockComponent }`。确认 @ 选项时，插件在解析出 `@keyword` 范围后、插入 embed **之前**回调 `onConfirm`：返回 `true` 表示宿主已自行处理，插件只删除 `@keyword`（不插入 `{mention}` 节点、不补尾随空格，光标落在原 `@` 处）；返回假值或未配置则维持原有「替换为 `{mention}` embed + 空格」行为。纯新增、向后兼容。

**Why**: 协同场景下把「@人员」固化成 CRDT 同步的 mention 节点，会让每个打开文档的协作者都各自观察到该节点并重复执行副作用（cses 待办块「@人 → 加任务参与人」一度在 N 端各触发一次 `updateCollaborator` + 抢删同一节点）。本钩子让宿主把这类 mention 收敛成「只在点选这一端发生的副作用」，其余端通过各自领域的实时通道（如任务订阅）获知结果，而非通过文档节点。

**Affected ai-skills files**:

- `blockcraft-plugins-inline.md` — MentionPlugin 配置表新增 `onConfirm` 行 + Notes 说明宿主认领语义

### New APIs / Features

- `MentionPluginConfig.onConfirm?: (data, { block }) => boolean | void` — 确认拦截钩子；返回 `true` 时插件跳过 embed 插入，仅删除 `@keyword`
- 新增导出类型 `MentionConfirmContext`（`{ block: EditableBlockComponent }`）

### Migration Recipe

纯新增、可选，现有代码零改动。需要「@ 落地为宿主副作用而非节点」时：

```typescript
new MentionPlugin({
  panel,
  // 返回 true：插件删除 @keyword 但不插入 mention 节点，宿主自行处理（如加协作者）
  onConfirm: (data, { block }) =>
    block.flavour === "todo" &&
    (block as any).handleMentionConfirm?.(data) === true,
});
```

### Behavior Changes

- 仅当配置了 `onConfirm` 且其返回 `true` 时，确认产生的 delta 由「删 `@keyword` + 插 `{mention}` embed + 空格」变为「仅删 `@keyword`」。未配置或返回假值时，行为与改动前逐字节一致。

### v?.?.? - 2026-06-17 (minor) — `--bc-lh` 改为无单位行高比例（修复 WebKit CSS zoom 下行间重叠）

**What changed**: 主题 token `--bc-lh` 从写死的 px 长度 `24px` 改为**无单位行高比例** `1.5`（基准 `24 / 16`）。正文（`base.scss`）与各级标题（`heading-block.scss`）的 `line-height` 直接读 `var(--bc-lh)`（标题不再 `calc(var(--bc-lh) * N)`——无单位比例已对各自放大后的 `font-size` 生效）。少数把 `--bc-lh` 当「一行高度」px 用的地方改为 `calc(var(--bc-lh) * var(--bc-fs))`（attachment `__prefix` 高度、code-block 容器纵向 padding、code lang-list 行高/高度）。`base.scss` 的 `c-element[style*="font-size"]` 行高规则由硬编码 `1.5` 改为 `var(--bc-lh)`（DRY）。演示模式 `PresentationController` 改为把 `--bc-lh` 当无单位比例读写（`sourceLhRatio * lineHeightScale / fontScale`），最终视觉行高与旧实现完全等价。

**Why**: 表格全屏视图用 CSS `zoom` 缩放。实测 **WebKit / WKWebView（Tauri 桌面端、Safari）下 CSS `zoom` 只放大字号，不放大写死 px 的 `line-height`**（`getComputedStyle` 显示行高被除以 zoom 倍数，net 视觉行高恒定）——放大后字越来越大、行高纹丝不动，文字行逐渐重叠。Chromium 两者都缩放、无此问题。无单位比例随字号等比放大，跨引擎都正确，且与既有 `c-element[style*="font-size"] { line-height: 1.5 }`（v?.?.? 2026-06-15）同一思路、收敛为单一来源。zoom=1 时所有可见排版与改动前逐像素一致（已用 WKWebView 实测：正文/标题在 1×/2×/3× 比例恒为 1.5）。

**Affected ai-skills files**:

- `blockcraft-theme.md` — 「CSS Custom Properties」节新增 `--bc-lh` 无单位契约说明

### Behavior Changes

- 文档基准与标题行高现在随 `font-size` 等比缩放（无单位比例），在 CSS `zoom`（表格全屏）下不再重叠；视觉默认值不变（`16px × 1.5 = 24px`）。
- `--bc-lh` 现在是无单位数字。**下游若覆盖 `--bc-lh`，必须给无单位数字（如 `1.6`），不能再给 px 长度**——给 px 会让 `calc(var(--bc-lh) * var(--bc-fs))` 退化为非法的 `length × length`，导致 attachment 前缀 / code-block padding 等尺寸失效。这是本次唯一的破坏点；不覆盖此变量的消费者零影响。
- 演示模式（demo-presentation）的有效行高与块间距与改动前等价；`lineHeightScale` / `fontScale` 语义不变。

### Migration Recipe

仅当你在自定义主题里覆盖过 `--bc-lh`：

```scss
/* before — px 长度 */
:root {
  --bc-lh: 28px;
}

/* after — 无单位比例（28 / 16 ≈ 1.75） */
:root {
  --bc-lh: 1.75;
}

/* 若你曾依赖 var(--bc-lh) 作为「一行高度」的 px，改写为： */
.something {
  height: calc(var(--bc-lh) * var(--bc-fs));
}
```

### v?.?.? - 2026-06-16 (minor) — 有道云 HTML data-content 粘贴路径

**What changed**: 新增 `adapters/yne-adapter/youdao-html.ts` + `bulb-converter.ts`，从粘贴 HTML 的 `<article data-content="…">`（有道云 bulb JSON）解析高保真结构。解析在 **`HtmlAdapter.toBlockSnapshot` 内短路**（`isYoudaoHtml` 命中即走 bulb 解析，否则照常 HAST）——HTML→snapshot 全部归 Adapter 层，`ClipboardManager` 不再特判有道云。原因：WKWebView（Tauri）及部分浏览器会从 `paste` 事件剥离自定义剪贴板 MIME（`text/yne-json` / `text/yne-image-json`），导致原 `text/yne-json` 路径拿不到数据、回退到有损 HTML（附件变图片、行内 CSS 样式丢失）。bulb 数据嵌在 HTML 属性里不会被剥离，图片字节从可见 `<img data:base64>` 取。`resource.ts` 抽出共享 `buildImageSnapshot` / `buildAttachmentSnapshot`，两条有道云路径复用。附件异步重传留在 clipboard：转换器在 attachment snapshot 的 `meta` 打临时标记，`collectAndStripRehostMarkers` 在插入前收集并剥离（不写进 Yjs），插入后 `rehostYneAttachments` 重传。

**Why**: 桌面端（cses-client / Tauri）实测有道云粘贴走不到 `text/yne-json` 分支——WKWebView 只透传 `text/html`。需要一条基于 HTML `data-content` 的路径，覆盖所有环境；并把 HTML 解析收敛到 Adapter 层（DDD），重传这种 post-insertion/协同敏感的副作用留在 clipboard。

**Affected ai-skills files**:

- `blockcraft-adapter.md` — 「有道云笔记」节新增「有道云 HTML data-content 路径」子节

### New APIs / Features

- `parseYoudaoHtml(html, fileService): IBlockSnapshot | null` 与 `isYoudaoHtml(html)`（内部模块，从 `adapters/yne-adapter` 导出，未从包根导出；由 `HtmlAdapter` 调用）。
- `collectAndStripRehostMarkers(root): YneDeferredAttachment[]`（收集并剥离附件重传标记）。
- `buildImageSnapshot` / `buildAttachmentSnapshot`（`resource.ts` 内部共享构建器）。
- `parseYneClipboard` 返回值改为 `IBlockSnapshot | null`（原 `{snapshot, deferredAttachments}` 结构连同 `YneParseResult` 类型移除；附件重传改走 meta 标记机制）。

### Behavior Changes

- 从有道云粘贴时：浏览器优先 `text/yne-json`；被剥离自定义 MIME 的环境（Tauri 等）由 `HtmlAdapter` 内部识别 `data-content` 兜住。两者产出等价的高保真结果（标题/列表/待办/分割线/代码/合并表格/图片/附件 + 行内样式），不再回退到「附件变图片、样式丢失」的通用 HTML。
- 非有道云 HTML 不含 `data-content`/`yne-bulb-block` marker → `isYoudaoHtml` 返回 false → 完全走原通用 HTML adapter，零回归。
- 附件重传标记仅存在于内存中的 paste snapshot 上，插入前即被剥离，不进入 Yjs、不同步给协同端——只有本地粘贴者执行重传。
- **代码 / 图表块**：bulb `code`/`diagram` 把每行包成 `code-line` 子块，文本在其子节点里——转换时下钻 `code-line` 并以 `\n` 连接（此前 bulb 路径的 `code` 块取不到文本、产出空块）；语言经 `mapLang` 大小写不敏感解析，`diagram`（PlantUML/Mermaid，无原生对应）按 `PlainText` 代码块保留源码。`block-converters.ts`（`text/yne-json` 路径）同步支持 `diagram`。
- **未知块容错（throw → 降级）**：两条有道云路径的 `convertBulbBlock` / `convertBlock` 遇到不认识的块**不再抛错**，而是降级为保留其文本的段落（无文本则丢弃）。此前单个未知块（如 `diagram`）会经 catch 触发**整篇**回退到有损 HTML；现在仅真正无法解析的 payload（无 `<article>` / JSON 损坏）才整篇回退，单个生僻块不再连累全文。

### Migration Recipe

无需迁移（新增能力，向后兼容）。

### v?.?.? - 2026-06-15 (minor) — 固定工具栏字体缩放工具

**What changed**: 固定工具栏（`bc-fixed-toolbar`）新增「字体缩放」下拉工具，对选区文字按**相对比例**缩放（预设 `0.5/0.8/1.0/1.2/1.5/2.0` + 文字 `−`/`+` 步进，每次 ±0.1em），比例写入行内样式 `s:fontSize` 的 `em` 值（如 `1.2` → `1.2em`；`1` = 默认 → 清除该样式）。格式刷同步纳入 `s:fontSize`（复制源文字的字号缩放）。配套修复 `framework/block-std/inline/setAttributes.ts`：`s:` 样式 key 在写入 DOM 前做 camelCase→kebab 转换，使 `s:fontSize` / `s:fontFamily` 等驼峰 key 真正生效（此前 `style.setProperty('fontSize', …)` 被浏览器静默忽略）。新增导出组件 `BcFontScalePickerComponent`。

**Why**: 用户需要对选中词做相对比例（而非固定 px）的字号调整。实现中发现行内 `s:` 驼峰样式 key 从未真正渲染，需一并修复以保证样式正确。

配套在 base 主题加一条规则 `c-element[style*="font-size"] { line-height: 1.5 }`，让缩放后的行内文字行高随字号等比增长（文档基准比例 `--bc-lh / --bc-fs = 1.5`），避免大字号挤在固定行高里。

**Affected ai-skills files**:

- `blockcraft-plugins-formatting.md` — `FixedTextToolbarComponent` 新增「Font Scale」节
- `blockcraft-inline.md` — Attributes 节补充 `a:`/`d:`/`s:` → DOM 应用规则与 camelCase→kebab 说明

### New APIs / Features

- `BcFontScalePickerComponent`（`bc-font-scale-picker`）：相对字体缩放选择器，`@Input() current: number`、`@Output() pick: EventEmitter<number>`，从包根导出。
- 固定工具栏新增字体缩放工具——无需额外配置，随 `bc-fixed-toolbar` 自带。

### Behavior Changes

- `s:` 行内样式中的 camelCase key（`s:fontSize`、`s:fontFamily` 等）现在会正确渲染为对应的连字符 CSS 属性（`font-size`、`font-family`）；此前因 `setProperty` 不识别 camelCase 而被静默忽略。单词 key（`s:color`、`s:background`）与 CSS 自定义属性（`s:--x`）行为不变。
- 影响面极小：此前唯一写入 `s:fontSize` 的是有道云粘贴适配器，且写的是无单位数字（如 `16`），修复后仍是非法 font-size 值被忽略，现有内容观感不变。
- 固定工具栏「格式刷」现在也复制字号缩放（`s:fontSize`）；此前只复制粗斜体/下划线/删除线/代码/上下标/底纹/颜色/背景。

### Migration Recipe

无需迁移（新增能力 + 兼容性修复，向后兼容）。

### v?.?.? - 2026-06-15 (minor)

**What changed**: 新增 `adapters/yne-adapter/` 模块与 `ClipboardManager.onPaste` 的 `text/yne-json` 分支，为有道云笔记粘贴提供高保真路径（标题/列表/待办/分割线/代码/合并表格/图片/附件 + 行内样式）。向后兼容：非有道云内容不含该 MIME，完全走原路径。

**Why**: 有道云 HTML 有损，其剪贴板自带高保真 `text/yne-json`，直接翻译可大幅提升粘贴质量。

**Affected ai-skills files**:

- `blockcraft-adapter.md` — 新增「有道云笔记 `text/yne-json` 剪贴板适配器」节
- `blockcraft.md` — Doc Services Index 追加粘贴优先级说明

### New APIs / Features

- `parseYneClipboard(state, doc): YneParseResult | null`（内部模块 `adapters/yne-adapter/`，未从包根导出，外部无需改动）。
- `rehostYneAttachments(doc, deferred): Promise<void>`（同上，内部使用）。

### Behavior Changes

- 从有道云笔记粘贴时走新高保真路径；其它来源（无 `text/yne-json` MIME）完全不受影响，继续走原 HTML/plain 路径。
- 有道云附件块插入后会异步 fetch 重传；当 fetch 失败（CORS/鉴权）或上传服务未返回 http(s) URL（如无后端环境返回的 blob: 对象 URL）时保留有道云原 URL，不打断粘贴流程。仅当上传返回最终 http(s) URL 时才替换，避免附件块卡在「上传中」状态（attachment 块以 `url.startsWith('http')` 判定就绪）。

### Migration Recipe

无需迁移（新增能力，向后兼容）。

---

### v?.?.? - 2026-06-11 (minor)

**What changed**: The `divider` block gained two optional props — `text?: string`
and `align?: 'left' | 'center' | 'right'` (default `center`). When `text` is set,
the divider renders a read-only label: for line styles (solid/dashed/dotted/double)
the label sits in the middle with line segments on each side (alignment redistributes
the segments); for tape styles the label sits inside the tape band. The divider hover
toolbar (`DividerStylePopupComponent`) gained a third `文字装订` tab with a text input and
left/center/right alignment buttons. The divider block stays `BlockNodeType.void` — no
data migration, no selection/navigation change.

**Why**: Feature request — users wanted captionable dividers (chapter/section labels)
editable from the floating toolbar, without turning the divider into an editable block.

**Affected ai-skills files**:

- `blockcraft-plugins-toolbar.md` — documented the divider toolbar `文字` tab + alignment.
- `blockcraft.md` — updated the `DividerExtensionPlugin` row.

### New APIs / Features

- `DividerBlockModel.props.text?: string` — optional divider label.
- `DividerBlockModel.props.align?: 'left' | 'center' | 'right'` — label alignment (default `center`).
- `DividerBlockModel.props.color?: string` — optional label text color (empty = theme default, slightly muted `--bc-color-light`).
- Divider toolbar `文字装订` tab (text input + alignment + color swatches).

### Behavior Changes

- A divider with a non-empty `text` prop now renders a label. Existing dividers (no `text`) render exactly as before. HTML/Markdown export still drops divider props (`style` / `size` / `text` / `color`) — unchanged from prior behavior.

---

### v?.?.? - 2026-05-29 (minor)

**What changed**: Added a composable copy-filter pipeline to the clipboard.
Copies can now drop blocks by flavour, strip inline delta attributes, and run an
arbitrary transform — applied once to the snapshot so every clipboard format
(text / html / markdown / snapshot) stays consistent.

**Why**: Hosts/plugins need to filter what gets copied (e.g. exclude internal
block types, strip styling) without each format diverging.

**Affected ai-skills files**:

- `blockcraft-app.md` — documented `DocConfig.copyFilter` + `registerCopyFilter` + per-call override.
- `blockcraft-plugin.md` — documented plugins contributing copy filters in `init()` / `destroy()`.
- `blockcraft.md` — added the copy-filter line to the Doc Services Index area.

### New APIs / Features

- `DocConfig.copyFilter?: ClipboardCopyFilter` — global filter (seeds the registry).
- `ClipboardManager.registerCopyFilter(filter): () => void` — composable registration (returns disposer); used by plugins. Multiple filters compose in registration order.
- `copyFromSelection(sel, data, { filter })` / `copyBlocksModel(snapshots, { filter })` — optional per-call override (`false` = skip filtering for that call).
- Types `ClipboardCopyFilter` / `CopyFilterContext`; pure functions `applyCopyFilters` / `resolveCopyFilters`.

### Migration Recipe

Opt-in — no change needed if you don't filter.

Global (host):

```typescript
// before
const doc = new BlockCraftDoc({
  /* … */
});

// after
const doc = new BlockCraftDoc({
  /* … */
  copyFilter: { excludeFlavours: ["comment"], stripAttributes: ["s:color"] },
});
```

Plugin:

```typescript
// init()
this._disposeFilter = this.doc.clipboard.registerCopyFilter({
  excludeFlavours: ["my-block"],
});
// destroy()
this._disposeFilter?.();
```

---

### v?.?.? - 2026-05-28 (minor)

**What changed**: The `block-controller` plugin's drag-handle menu now collapses
to three items — cut / copy / delete — whenever a cross-block selection covers
the active block, and those three act on the whole selection range (copy =
whole-block snapshots; cut/delete = delete each selected block by id in one
transaction). All other menu items (alignment, heading, block-type conversion,
"在下方添加", `customTools`, custom/table sections) are hidden in multi-block
mode. Single-block selection is unchanged.

**Why**: Multi-block drag was added previously, but the menu actions still only
affected the single active block. Reducing the multi-block menu to the three
structural actions matches user expectation and avoids ambiguous multi-block
semantics for formatting/conversion items.

**Affected ai-skills files**:

- `blockcraft-plugins-block.md` — documented the multi-block menu reduction.

### Behavior Changes

- `block-controller`: opening the drag-handle menu while a cross-block selection
  is active now shows only cut / copy / delete (previously the full single-block
  menu for `selection.firstBlock`). No public API signature changed.

---

### v?.?.? - 2026-05-26 (minor)

**What changed**: The `block-controller` plugin's drag handle now supports
multi-block drag. When a cross-block selection exists and the active block is
inside it, pressing the drag handle drags the entire contiguous sibling range
as one unit. Non-contiguous or cross-parent selections (e.g. spanning columns
or table cells) automatically fall back to single-block drag of the hovered
block.

To support this, the framework adds:

- `InternalDragData` gains an `origin-blocks` variant:
  `{ kind: 'origin-blocks'; blockIds: string[] }`.
- `DocDndService.onSortBlocks(sources, target, position)` is the bulk-commit
  counterpart of the existing `onSortBlock`.

The existing `origin-block` / `onSortBlock` single-block path is unchanged.

**Why**: Notion-/feishu-style editors let users drag a multi-block selection
in one motion. Previously the BlockCraft drag handle was hidden whenever a
cross-block selection was active, forcing users to drop the selection before
dragging.

**Affected ai-skills files**:

- `blockcraft-plugins-block.md` — documented the multi-drag behavior of
  `block-controller`.

### New APIs / Features

- `InternalDragData` union now includes `{ kind: 'origin-blocks'; blockIds: string[] }`.
- `DocDndService.onSortBlocks(sources, target, position)` — bulk-commit
  multi-block drag. Defensive guards: silent no-op when sources are empty,
  target is inside sources, or schema validation fails (warn + return).

### Behavior Changes

- `block-controller` plugin: cross-block selection no longer hides the drag
  handle. The handle is anchored on `selection.firstBlock` and remains
  draggable. This is the only user-visible behavior change.
- `dragController.startDrag` silently normalizes `{ kind: 'origin-blocks',
blockIds: [] }` (refuses, stays idle) and `{ kind: 'origin-blocks',
blockIds: [singleId] }` (downgrades to `origin-block`). Callers do not need
  to pre-validate the length of `queryBlocksBetween` results.

### Migration Recipe

For framework consumers who care about the multi-block drag flow, no code
changes are required. The old single-block path is fully preserved:

```typescript
// Old (still works)
dragController.startDrag(evt, { kind: "origin-block", blockId: activeId });

// New (opt-in, for callers that want bulk drag)
dragController.startDrag(evt, { kind: "origin-blocks", blockIds: rangeIds });
```

For consumers who patched `block-controller` to react to its `hidden` state
during cross-block selection — that signal is gone. Use
`doc.selection.selectionChange$` directly to observe selection state.

---

### v?.?.? - 2026-05-23 (minor)

**What changed**: `TableBlockComponent` 新增「全屏视图」能力（页面内最大化覆盖形态）。鼠标移入表格时右上角出现悬浮按钮可进入全屏；选中单元格出现的结构工具栏内也追加了同样的全屏按钮；全屏状态下按 Esc 或再次点击同位按钮可退出。全屏期间表格 host 通过 CSS class `is-fullscreen` + `position: fixed; inset: 0` 覆盖 viewport，DOM 不搬移，因此单元格输入 / 选区 / IME / Yjs 协同 / 撤销 / 列宽拖拽 / 行列重排 / structure-toolbar / mention / float-toolbar 等所有既有能力**全部保留**。状态是本地视图状态，不写入 Yjs、不进 Undo 历史。同一时刻最多一张表格全屏；进入新表格的全屏会先退出旧的。IME composing 期间 Esc 不会退出全屏。

全屏内支持 **Ctrl/Cmd + 滚轮缩放**（针对长表格阅读场景）：50% – 300% 范围、10% 步进，退出全屏自动重置到 100%。通过 CSS `zoom` 应用到 `.table-wrapper`，layout 真实重排，scrollbar 自然适配。

**Why**: 大表格在文档内空间受限，常常需要临时全屏专注查看 / 编辑。原本只能通过浏览器原生 Fullscreen API 间接达成，但那受 iframe / Safari 限制且会打断协同；这一版选择 CSS-only 原地全屏方案，零 DOM 搬移、零框架内部状态污染、对所有插件透明。

**Affected ai-skills files**:

- `blockcraft-theme.md` — 新增「Table Block Fullscreen View」CSS 变量表 + class 公开契约说明
- `blockcraft-app.md` — Common Mistakes 表追加一条：BlockCraft 祖先节点避免使用 `transform` / `filter` / `will-change` / `perspective`（否则 `position: fixed` 被困容器内，表格全屏无法真正占满 viewport）

### New APIs / Features

`TableBlockComponent` 新增 public 接口（位于 `packages/editor/blocks/table-block/table.block.ts`）：

```typescript
// 当前是否处于全屏视图（模板友好的 getter）
get isFullscreen(): boolean

// 可观察的全屏状态流（BehaviorSubject<boolean>）
get isFullscreen$(): BehaviorSubject<boolean> | undefined

// 切换全屏状态
toggleFullscreen(): void

// 显式设置全屏状态（重复同值是 no-op）
setFullscreen(value: boolean): void

// 全屏缩放 API（仅在全屏态生效；退出全屏自动重置到 1）
get fullscreenZoom(): number
setFullscreenZoom(value: number): void   // clamp 到 [0.5, 3]
fullscreenZoomIn(): void                  // +10%
fullscreenZoomOut(): void                 // -10%
resetFullscreenZoom(): void               // 回到 100%
```

`TableFullscreenController`（内部类）也暴露同样的 API：`zoom$` / `setZoom` / `zoomIn` / `zoomOut` / `resetZoom`，以及静态常量 `ZOOM_MIN` / `ZOOM_MAX` / `ZOOM_STEP`。

新增内部类 `TableFullscreenController`（`packages/editor/blocks/table-block/table-fullscreen-controller.ts`），独立于 Angular，纯 TS 实现，承担状态机 + DOM 副作用 + Esc 监听 + IME 守卫 + 全局单例。被 `TableBlockComponent` 持有；外部消费者**不应**直接构造它。

新增 CSS 公开契约（写入 `themes/variables.scss`）：

| Variable                           | Default                       | 说明                                                                                                                    |
| ---------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `--bc-table-fullscreen-z`          | `800`                         | 全屏表格容器 z-index（故意低于 CDK Overlay 默认 1000，让 structure-toolbar / float-toolbar / mention 自然浮在表格之上） |
| `--bc-table-fullscreen-mask-z`     | `799`                         | 遮罩层 z-index                                                                                                          |
| `--bc-table-fullscreen-overlay-bg` | `rgba(0, 0, 0, 0.55)`         | 遮罩色                                                                                                                  |
| `--bc-table-fullscreen-padding`    | `40px`                        | viewport 边距                                                                                                           |
| `--bc-table-fullscreen-radius`     | `8px`                         | 圆角                                                                                                                    |
| `--bc-table-fullscreen-bg`         | `var(--bc-bg-elevated, #fff)` | 背景色                                                                                                                  |

新增 class 名（公开契约）：

- `.table-block.is-fullscreen` — 标记表格 host 处于全屏视图
- `.bc-table-fullscreen-btn` — 悬浮按钮（hover 显现，全屏态下常显）
- `body.bc-table-fullscreen-lock` — 锁滚动

字体图标复用既有资源 `bc_arrow-expand`（进入）+ `bc_x-circle-contained`（退出），未新增 iconfont 字形。

### Behavior Changes

- 同一时刻最多一张表格处于全屏。从 table A 全屏切到 table B 全屏会自动退出 A（通过模块级 `WeakRef` 单例）。
- 全屏期间 `body` 上挂 `bc-table-fullscreen-lock` 类（CSS 设 `overflow: hidden`）禁止背景滚动。如果宿主 app 依赖 body scroll 行为的代码（很少见），需感知此状态。
- 全屏期间的 `Escape` 按下被表格在 capture phase 消费（`stopPropagation` + `preventDefault`）。普通模式下 Escape 不被表格拦截。
- 全屏期间 Ctrl/Cmd + 滚轮被表格在 capture phase 消费（`passive: false` + `preventDefault`），拦截浏览器原生页面缩放，改为表格内缩放。普通模式下滚轮不被拦截。
- 全屏状态不在 Yjs 中同步；协同其他端不会因为本端进入全屏而变化。
- 全屏缩放状态同上：不同步、不进 Undo、退出全屏强制回到 100%。
- 重启浏览器 / 重新打开文档不恢复全屏状态（与 hover、滚动位置同性质）。
- 全屏 zoom ≠ 100% 时进行行/列拖拽重排，drop-line 指示位置会按 zoom 比例偏移（math 没有按 zoom 修正）。阅读场景不受影响；如确实需要在缩放下重排，先重置缩放再操作。

### Migration Recipe

无 — 升级即可使用，下游消费者无需修改任何代码。

---

### v?.?.? - 2026-06-08 (minor)

**What changed**: 新增 `PlaceholderPlugin`（默认编辑器预设的一部分），以及 schema 层的 `IBlockSchemaOptions.metadata.placeholder` 配置字段。空的、聚焦的 editable 块在 IME 非组合期、非只读模式下自动显示 placeholder 文案。架构上是 **plugin 路径**（不是基类内置）：plugin 在 doc 层维护单点订阅（selection/readonly/composition + 当前 focused block 的 onTextChange/onPropsChange），订阅数恒定 6 ≈ 与文档块数无关。

**Why**: 与上一版（2026-05-22 的 EditableBlockComponent 内置实现）对比：基类内置每个 editable block 都订阅 selection/readonly/composition 3 个全局流，N 个块 = 5N 个订阅，大文档下扩展性差。改为 plugin 后单点订阅，且 placeholder 完全可选 / 可继承 / 可定制（runtime override 不需要改 schema）。

**Affected ai-skills files**:

- `blockcraft.md` — 默认 plugin 列表 + 文件结构说明
- `blockcraft-block.md` — "Editable Block Placeholder (Schema field)" 章节（schema 层视角）
- `blockcraft-plugins-ref.md` — 索引追加 PlaceholderPlugin
- `blockcraft-plugins-util.md` — 新增 PlaceholderPlugin 完整章节（配置 / API / 显示契约）

### New APIs / Features

- **Plugin**: `PlaceholderPlugin` from `@ccc/blockcraft` (exported via `plugins/placeholder/index.ts`)
- **Plugin options**: `PlaceholderPluginOptions { overrides?: PlaceholderOverrides }`
- **Override type**: `PlaceholderOverrides = Record<string, BlockPlaceholderConfig | null>` — `null` 表示显式禁用
- **Plugin instance methods**:
  - `setOverrides(overrides)` — 整体替换 override map（适合 i18n locale 切换）并立即重渲染
  - `setOverrideFor(flavour, config)` — 增量更新单个 flavour；`null` 禁用，`undefined` 还原 schema 默认
- **Schema field**: `IBlockSchemaOptions['metadata'].placeholder?: BlockPlaceholderConfig`
- **Type**: `BlockPlaceholderConfig = string | { default?, heading?: { 1?, 2?, 3? } }`
- **Pure helper**: `resolvePlaceholderText(config, heading)` exported from `framework/block-std/schema/block-schema.ts`
- **Built-in schema defaults**: `paragraph` / `bullet` / `ordered` / `todo` 已带默认文案；`blockquote` 因自身 `::before` 引用线伪元素故不参与

### Migration Recipe

宿主应用默认 plugin 集合已包含 `PlaceholderPlugin`，**升级即可启用**，无需改动。要禁用 / 自定义：

```typescript
// 默认行为（无须显式声明）—— 读取每个 schema 的 metadata.placeholder
new PlaceholderPlugin()

// 自定义文案（典型场景：i18n）
new PlaceholderPlugin({
  overrides: {
    paragraph: { default: "Type '/' for commands", heading: { 1: 'Heading 1', 2: 'Heading 2', 3: 'Heading 3' } },
    bullet:   'List item',
    todo:     'To-do',
    callout:  null,   // 显式禁用，即使 schema 配了
  },
})

// 自定义 schema 想加 placeholder：在 metadata 上声明
metadata: {
  version: 1,
  label: 'My block',
  placeholder: '输入内容',  // string 或对象
}

// 自定义 schema 不想要 placeholder：省略字段或让 plugin override 为 null
```

`PlaceholderPlugin` 不在 plugins 数组里时，schema 的 `metadata.placeholder` 字段是惰性的 —— 不会渲染任何东西，不会报错。

### Behavior Changes

- 空的 focused `paragraph` 显示 `输入"/"呼出菜单`，heading 1/2/3 模式下分别显示 `一级标题` / `二级标题` / `三级标题`
- 空的 focused `bullet` / `ordered` 显示 `列表项`
- 空的 focused `todo` 显示 `待办事项`
- `blockquote` 不显示 placeholder（自身 `::before` 占用）
- Readonly 模式下任何 block 都不显示 placeholder
- IME composition 期间隐藏 placeholder，组合结束后立即恢复（如内容仍空）
- 跨块选区时全部隐藏 placeholder
- 宿主自定义 schema 时若未保留 `metadata.placeholder` 字段，对应默认文案会被丢弃 —— 通过 `overrides` 或重新声明字段恢复

### v?.?.? - 2026-05-21 (major)

**What changed**: 内部 block 拖拽从 HTML5 drag/drop API 切换为 PointerEvents 自实现。新增 `doc.dragController`（`DocInternalDragController`）。`DocDndService` 瘦身为"高层 commit 方法分发 + 外部文件 HTML5 路径"。

**Why**: HTML5 drag/drop API 在 WKWebView（Tauri、macOS Safari、桌面 Electron-on-WebKit）上比 Chrome 慢一档，根因在底层架构：drag image 必经 `NSDraggingSession` → `NSImage` → IOSurface 跨进程；dragover 经多进程边界；合成层抢主线程。PointerEvents 自实现让 JS 层完全控制，并且首次支持触摸 / 触控笔。

**Affected ai-skills files**:

- `blockcraft-app.md` — 新增 `doc.dragController` 服务介绍
- `blockcraft.md` — 服务索引表更新

### Breaking Changes

#### 删除：`DocDndService.startDrag(evt: DragEvent, data)`

旧（HTML5）：

```ts
fromEvent<DragEvent>(triggerBtn, "dragstart").subscribe((evt) => {
  evt.dataTransfer?.setDragImage(hostElement, 0, 0);
  this.doc.dndService.startDrag(evt, [
    { dragDataType: "origin-block", dragData: blockId },
  ]);
});
```

新（PointerEvents）：

```ts
fromEvent<PointerEvent>(triggerBtn, "pointerdown").subscribe((evt) => {
  if (evt.button !== 0) return;
  this.doc.dragController.startDrag(evt, { kind: "origin-block", blockId });
});
```

调用方还需要：

- 在 trigger 元素上加 CSS `touch-action: none`（避免触摸滚动手势抢走 pointer）
- 不要再调 `setDragImage` —— controller 自渲染 ghost
- 不要再手动 `style.opacity = '0.5'` —— 源 block 视觉由 `.bc-drag-source` class 承担

### New APIs

- `doc.dragController: DocInternalDragController`
- `DocInternalDragController.startDrag(evt, data, options?)`
- `DocInternalDragController.cancel()`
- `DocInternalDragController.state$: Observable<'idle' | 'armed' | 'dragging' | 'dropping'>`
- `DocInternalDragController.isDragging: boolean`
- 数据类型：`InternalDragData = { kind: 'origin-block', blockId } | { kind: 'new-block', flavour, initProps? }`
- 选项：`InternalDragOptions = { ghostLabel?: string, movementThreshold?: number }`

### Behavior Changes

- 内部 block 拖拽不再触发原生 `dragstart` / `dragover` / `drop` 事件（仅外部文件拖入仍触发）
- 触摸设备首次支持 block 拖拽
- 拖拽期间源 block 不再使用 `opacity: 0.5`，改用 CSS `.bc-drag-source { outline: 1px dashed var(--bc-active-color); outline-offset: 2px; border-radius: 4px; }`
- 移动阈值：mouse / pen = 4px，touch = 8px（自动按 `pointerType` 区分，可通过 `options.movementThreshold` 覆盖）

### Migration Recipe

参考上文 Breaking Changes 节的 before / after 代码。把 `dragstart` 订阅替换为 `pointerdown` 订阅，把 `dndService.startDrag(DragEvent, ...)` 替换为 `dragController.startDrag(PointerEvent, ...)`。配合 SCSS：在自定义主题中如果想覆盖源 block 拖拽视觉，定义 `.bc-drag-source { ... }` 即可。

---

### v0.2.35 — 2026-05-18 — Demo Presentation Size Scales Are Source-Relative & Configurable

**Severity**: minor

**What changed**: The demo/presentation plugin no longer hardcodes its font size, line height, or block spacing. The demo container's `--bc-fs`, `--bc-lh`, and `--bc-segments-gap` are now computed as `sourceValue * scale`, with three new optional `DemoConfig` fields — `fontScale` (default `1.5`), `lineHeightScale` (default = `fontScale`), and `segmentsGapScale` (default = `fontScale`). Table column widths (`props.colWidths`) are scaled by `fontScale` on every page render so columns stay proportional to the enlarged font. The demo SCSS no longer derives `--bc-lh` / `--bc-segments-gap` via `calc()` — JS is the single source of truth.

**Why**: Previously the demo mode hardcoded `--bc-fs: 22px`, `--bc-lh: 30px`, `--bc-segments-gap: 18px` in SCSS, which broke two assumptions: (1) it assumed the source doc was always at the default 16px, so apps that customized the source `--bc-fs` got an inconsistent jump; (2) table `colWidths` are absolute pixels in snapshots, so the column widths did not follow the enlarged font — text in cells visually overflowed or felt cramped relative to the rest of the slide. Users also asked for independent control over line height and block spacing so demo decks can be made denser or more spacious without rebuilding the source document.

**Affected ai-skills files**:

- `blockcraft-plugins-util.md`
- `MIGRATIONS.md`

### New APIs / Features

- `DemoConfig.fontScale?: number` — relative magnification of `--bc-fs` vs. source, default `1.5`. Set to `1` to disable enlargement entirely.
- `DemoConfig.lineHeightScale?: number` — relative scale of `--bc-lh` vs. source. Defaults to `fontScale`, so line height tracks the font size unless overridden.
- `DemoConfig.segmentsGapScale?: number` — relative scale of `--bc-segments-gap` vs. source. Defaults to `fontScale`, so block spacing tracks the font size unless overridden.

### Migration Recipe

If you previously relied on the demo running at exactly 22px / 30px / 18px regardless of source values:

```typescript
// before — implicit 22 / 30 / 18 px
doc.enterDemoMode();

// after — pin to the old absolutes when source uses the defaults (16 / 24 / 10)
doc.enterDemoMode({
  fontScale: 22 / 16,
  lineHeightScale: 30 / 24,
  segmentsGapScale: 18 / 10,
});
```

If you have custom CSS targeting the old fixed demo variables, they now scale instead of being constant:

```scss
/* before (assumed) — fixed values inside .demo-root */
.demo-root[data-blockcraft-root="true"] {
  --bc-fs: 22px;
  --bc-lh: 30px;
  --bc-segments-gap: 18px;
}

/* after — variables come from sourceValue * scale, injected on .presentation-stage */
/* For a hard override, set the variable inline on .presentation-stage or pass scales via DemoConfig. */
```

### Behavior Changes

- Demo mode's default font size is now `sourceFs * 1.5` (e.g. 24px for the default 16px source) instead of a hardcoded 22px.
- Demo mode's default `--bc-lh` is now `sourceLh * fontScale` (e.g. 36px for the default 24px source at default fontScale) instead of fixed 30px.
- Demo mode's default `--bc-segments-gap` is now `sourceGap * fontScale` (e.g. 15px for the default 10px source at default fontScale) instead of fixed 18px.
- Table `colWidths` are multiplied by `fontScale` for every rendered page in demo mode. The source document's stored `colWidths` are not mutated — only the demo doc's snapshots are transformed before insertion.
- The `.demo-root[data-blockcraft-root="true"]` SCSS rule no longer declares `--bc-fs`, `--bc-lh`, or `--bc-segments-gap`. Any custom CSS that previously overrode these by being more specific than the demo-root rule should be re-checked — the injected values are now inline on `.presentation-stage` and inherit down.

### v0.2.29 — 2026-05-09 — Table Paste Into Existing Cells

**Severity**: patch

**What changed**: `TableBlockBinding` now intercepts table-shaped paste while the selection is inside an existing table. BlockCraft table snapshots, external HTML tables, Markdown tables, and tab-separated table text are parsed into a source table and copied into the current table cells one-to-one from the focused cell or selected top-left cell.

**Why**: Pasting a table while focused in a table previously followed the general block paste path, which inserted a new table/block content instead of filling the current table cells. Users expect spreadsheet-style paste to map source cells onto the existing table grid.

**Affected ai-skills files**:

- `blockcraft-plugins-inline.md`
- `MIGRATIONS.md`

### Behavior Changes

- Table-shaped paste inside a table fills existing cells instead of inserting a new table block.
- Source rows/columns that exceed the current table bounds are clipped; the paste does not automatically add rows or columns.
- Cell-range selection highlights are cleared after table paste, and the cursor is restored inside the paste start cell.
- Plain non-table paste inside a table still falls back to the normal editor paste path.

### v0.2.20 — 2026-04-16 — Standalone Markdown Stream Viewer

**Severity**: minor

**What changed**: `@ccc/blockcraft` now exports `createMarkdownStreamViewer()` as a standalone display-only Markdown streaming API layered on top of snapshot-viewer. It accepts append-only chunks or full-text replacements, supports `finish()` for flushing delayed complex blocks, and stays independent from `BlockCraftDoc`, Yjs, and editor runtime state.

**Why**: Snapshot-viewer already handled direct snapshot rendering, but hosts receiving LLM or other progressive Markdown output needed a viewer-native streaming path that does not spin up the full editor runtime.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `MIGRATIONS.md`

### New APIs / Features

- `createMarkdownStreamViewer(options)`
- `append(chunk)`
- `replace(fullMarkdownText)`
- `finish()`
- `destroy()`

### Migration Recipe

```typescript
// before: wait for final markdown, then convert to snapshot
const snapshot = await markdownAdapter.toBlockSnapshot(markdown);
snapshotRenderer.render(containerEl, snapshot);

// after: progressively render markdown
const viewer = createMarkdownStreamViewer({
  container: containerEl,
});

viewer.append(markdownChunk);
viewer.finish();
```

### Behavior Changes

- Hosts can now progressively render Markdown before a final snapshot exists.
- Delayed complex blocks such as fenced code, mermaid, and tables can be flushed on `finish()`.

### v0.2.19 — 2026-04-16 — Fixed Toolbar Format Brush Hotkey

**Severity**: patch

**What changed**: The fixed-toolbar format brush now exposes the `Cmd/Ctrl+Shift+C` shortcut as a quick activation shortcut, and the toolbar button tooltip now shows the shortcut hint inline.

**Why**: The format brush had become keyboard-friendly in behavior but still required pointer access to activate. Adding a direct activation shortcut keeps it aligned with common editor workflows and makes the hint discoverable from the button itself without changing the existing cancel flow.

**Affected ai-skills files**:

- `blockcraft-plugins-formatting.md`
- `MIGRATIONS.md`

### Behavior Changes

- `Cmd/Ctrl+Shift+C` now quickly enables the fixed-toolbar format brush.
- The fixed-toolbar format brush button tooltip now displays the shortcut hint.

### v0.2.18 — 2026-04-16 — Fixed Toolbar Format Brush Source/Target Selection Rules

**Severity**: patch

**What changed**: The fixed-toolbar format brush now uses the dedicated `bc_geshishua` icon, allows a collapsed text caret as the source formatting point, and only applies formatting after the user finishes a later non-collapsed target text selection. The copied payload is limited to inline formatting only, and the brush automatically exits after the first successful apply.

**Why**: The original version still behaved too much like an immediate selection-change reaction. The adjusted interaction matches the intended workflow better: pick up inline formatting from the current caret/selection, then choose a target range and apply only after that range is fully selected.

**Affected ai-skills files**:

- `blockcraft-plugins-formatting.md`
- `MIGRATIONS.md`

### Behavior Changes

- The fixed-toolbar format brush can now be activated from a collapsed text caret.
- The brush waits for a later non-collapsed target text selection to finish before applying formatting.
- After the first successful apply, the brush automatically turns off.
- The brush no longer copies heading, list flavour, or alignment.
- The brush icon now uses `bc_geshishua`.

### v0.2.17 — 2026-04-16 — Fixed Toolbar Persistent Format Brush

**Severity**: patch

**What changed**: `FixedTextToolbarComponent` now includes a persistent format-brush action. The brush captures common formatting from the current text selection and keeps applying it to later text selections until the user explicitly cancels it.

**Why**: The fixed toolbar already exposed the main formatting controls, but repeated manual re-application was still slower than common document-editor workflows. A local fixed-toolbar implementation adds the capability without widening the change into shared toolbar/plugin infrastructure.

**Affected ai-skills files**:

- `blockcraft-plugins-formatting.md`
- `MIGRATIONS.md`

### Behavior Changes

- The fixed toolbar now has a format-brush button with persistent active state.
- The brush copies heading, list flavour, alignment, and common inline text styling.
- The brush does not copy links, inline formulas, or non-text block structures.
- The brush stays active until the user clicks it again or presses `Escape`.

### v0.3.0 — 2026-04-15 — Standalone Snapshot Viewer

**Severity**: minor

**What changed**: `@ccc/blockcraft` now exports a standalone display-only snapshot viewer. The new API surface includes `createSnapshotRenderer()` for DOM-first rendering and `SnapshotViewerComponent` (`<bc-snapshot-viewer>`) for Angular hosts. This path renders `IBlockSnapshot` trees without creating `BlockCraftDoc`, plugins, selection state, input handling, or Yjs runtime objects. It also introduces `resourcePolicy`, `baseUrl`, and optional bookmark/formula/mermaid enhancement hooks for progressive rendering of heavier blocks.

**Why**: The editor runtime is optimized for interaction. Preview, feed, readonly-card, and lightweight host scenarios needed a cheaper path that can render snapshots quickly without carrying the full editing stack.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-app.md`
- `blockcraft-theme.md`
- `MIGRATIONS.md`

### New APIs / Features

- `createSnapshotRenderer(options)` export from the package barrel
- `SnapshotViewerComponent` export from the component/package barrel
- `packages/editor/snapshot-viewer/` standalone subsystem
- viewer options:
  - `baseUrl`
  - `resourcePolicy: 'eager' | 'visible' | 'off'`
  - `enhancers.bookmark.load(url, signal)`
  - `enhancers.formula.render(latex, signal)`
  - `enhancers.mermaid.render(source, signal)`

### Migration Recipe

```typescript
// before: display a snapshot by booting the full editor runtime
const doc = new BlockCraftDoc(config);
doc.initBySnapshot(snapshot, containerEl);
doc.readonlySwitch$.next(true);

// after: display-only snapshot path
const renderer = createSnapshotRenderer({
  resourcePolicy: "eager",
});
renderer.render(containerEl, snapshot);
```

```html
<!-- Angular host -->
<bc-snapshot-viewer [snapshot]="snapshot"></bc-snapshot-viewer>
```

### Behavior Changes

- Display-only hosts no longer need editor DI services or `BlockCraftDoc` just to render a snapshot preview.
- Remote media and iframe-like content can now be deferred with `resourcePolicy` instead of always loading immediately.

### v0.2.16 — 2026-04-15 — Fixed Toolbar Media Insert Actions

**Severity**: patch

**What changed**: `FixedTextToolbarComponent` now exposes more insertion actions directly in the toolbar. Table and columns keep their existing picker behavior but now show a dropdown affordance. The toolbar also adds image insertion plus a video/audio dropdown. Image creation now supports either a remote URL or local upload through the shared media-creator flow.

**Why**: The fixed toolbar already handled table and columns, but other common insert actions still required other entry points. Reusing the shared block-creator and media-creator flows keeps insertion behavior consistent while making the toolbar more complete.

**Affected ai-skills files**:

- `blockcraft-plugins-formatting.md`
- `MIGRATIONS.md`

### Behavior Changes

- Fixed-toolbar table and column insert buttons now visually communicate that they open pickers.
- Fixed-toolbar image insertion supports image URL input and local upload.
- Fixed-toolbar video/audio insertion is available from a shared dropdown entry and uses the existing media creation dialog.

### v0.2.15 — 2026-04-15 — Fixed Toolbar Cross-Block Heading/List Transforms

**Severity**: patch

**What changed**: `FixedTextToolbarComponent` now allows heading changes and list conversion (`ordered`, `bullet`, `todo`) on cross-block text selections, matching the behavior scope that users already had in the floating text toolbar. The fixed toolbar keeps its existing layout; only the selection gating for block-level transforms changed.

**Why**: The fixed toolbar previously gated too much of its behavior behind text-format selection checks, which made multi-line selections feel weaker than the floating toolbar even though the underlying `TextToolbarHelper` APIs already support multi-block block transforms.

**Affected ai-skills files**:

- `blockcraft-plugins-formatting.md`
- `MIGRATIONS.md`

### Behavior Changes

- Cross-block text selections across editable, non-`plainTextOnly` blocks can now be converted to heading styles from the fixed toolbar.
- The same selections can now be converted between `ordered`, `bullet`, `todo`, and `paragraph` from the fixed toolbar.
- Link and inline-formula actions remain same-block only; on cross-block text selections their buttons stay visible but disabled in the fixed toolbar.

### v0.2.14 — 2026-04-13 — Selection: `isAllSelected` Means Block Selection Only

**Severity**: patch

**What changed**: `BlockSelection.isAllSelected` now returns `true` only when both `anchor` and `head` are `type: 'selected'` points. A cross-block text range that happens to start at offset `0` and end at the last block's `textLength` is no longer treated as "all selected".

**Why**: The previous implementation conflated "text selection covers full block boundaries" with "the selection endpoints are block/void selections". That caused block-level behaviors to leak into normal text ranges, including the floating text toolbar disappearing for multi-paragraph text selections.

**Affected ai-skills files**:

- `blockcraft-selection.md`
- `blockcraft.md`

### Migration Recipe

```typescript
// before
if (selection.isAllSelected) {
  // this also matched text selections like paragraph-start -> paragraph-end
}

// after
if (selection.isAllSelected) {
  // only block/void-style selections reach this branch
}

// if you need the old "full text coverage" check explicitly:
const coversWholeRange = selection.isStartOfBlock && selection.isEndOfBlock;
```

### Behavior Changes

- Cross-block text selections now remain text selections even when they cover whole paragraphs.
- Plugins such as the floating text toolbar and fixed toolbar will treat those ranges as format-able text instead of block-level "all selected" state.

### v0.2.13 — 2026-04-13 — Native Input Islands Inside Void / Block Nodes

**Severity**: patch

**What changed**: Native `input`, `textarea`, and `select` elements embedded inside BlockCraft blocks now bypass the editor's document-level `beforeInput`, hotkey, composition, paste, mouse, and selection pipelines. A custom widget can opt into the same isolation by adding `data-bc-native-input` on its root element. While one of these native controls is focused, `SelectionManager` clears the active `BlockSelection` instead of leaving stale editor selection state behind.

**Why**: The previous event model assumed text input only happened inside `EditableBlockComponent`. When a `void` or `block` node hosted a native form control, browser events bubbled to the root editor and could accidentally trigger document commands such as Enter-to-split, Backspace merge, mention triggers, slash transforms, or stale toolbar state.

**Affected ai-skills files**:

- `blockcraft.md`
- `blockcraft-block.md`
- `blockcraft-event.md`
- `blockcraft-input.md`
- `blockcraft-selection.md`

### New APIs / Features

- `data-bc-native-input` marker for non-form widgets that should be treated like isolated native input hosts

### Migration Recipe

```html
<!-- before: third-party editor or custom text widget inside a void/block node -->
<div class="widget-shell"></div>

<!-- after -->
<div class="widget-shell" data-bc-native-input></div>
```

```typescript
// before: trying to route block-local form edits through InputTransformer
// (not supported for void/block native controls)

// after: treat it as block-local state and commit via props / chain
onInput(event: Event) {
  this.updateProps({ value: (event.target as HTMLInputElement).value });
}
```

### Behavior Changes

- Typing, IME composition, paste, and keyboard shortcuts inside native form controls no longer reach the editor command pipeline.
- Focusing a native form control inside the editor clears the current `BlockSelection`.
- Root-level `beforeInput` plugins such as mention/slash style triggers will no longer react to text typed inside isolated native controls.

### v0.1.38 — 2026-04-07 — AI Skill Pack External Distribution

**Severity**: minor

**What changed**: The `ai-skills/` folder is now bundled with the npm package. New entry points added: `SKILL.md` (AI discovery, with frontmatter), `README.md` (human installation guide), `install.mjs` (one-command installer for Claude Code / Codex skill directories). The `ng-package.json` `assets` array gained `ai-skills/**/*`. New L1 doc `blockcraft-app.md` covers embedding BlockCraft in a host Angular app — DI tokens, `DocConfig`, init paths, persistence, readonly mode.

**Why**: External consumers (other Angular apps, AI coding agents working in those apps) need to access the skill pack without checking out the source repo. The new app-integration L1 closes a previously-undocumented gap.

**Affected ai-skills files**:

- `blockcraft.md` — added external usage section, file index, plugin list refresh
- `blockcraft-app.md` — NEW
- `SKILL.md` — NEW
- `README.md` — NEW
- `install.mjs` — NEW
- `MIGRATIONS.md` — NEW (this file)

**New APIs / Features**: none in `framework/`. Distribution-only release.

**Migration Recipe**: no code changes required. To start using the skill pack in an external project:

```bash
node node_modules/@ccc/blockcraft/ai-skills/install.mjs
```

---

### v0.1.37 — 2026-04-07 — Selection Model: anchor/head + Discriminated Points

**Severity**: minor (legacy types kept as `@deprecated` for backward compat)

**What changed**: `BlockSelection` switched from a `from`/`to`/`index/length` shape to an `anchor`/`head` model with a discriminated `ISelectionPoint` union (`type: 'text' | 'selected'`). New derived properties: `start`, `end`, `direction`, `collapsed`, `isInSameBlock`, `isStartOfBlock`, `isEndOfBlock`, `isAllSelected`, `isEmpty`, `contains()`. The legacy `INormalizedRange`, `IBlockRange`, `IBlockInlineRangeJSON`, `IBlockSelectionJSON` types are still exported but marked `@deprecated` and parsed for backward compat by `setSelection()`, `replay()`, and `createFakeRange()`.

**Why**: The old `from`/`to`/`index` shape conflated "where I clicked first" with "what's at the start of the document order", and didn't model whole-block selection cleanly. The new model uses true anchor/head (intentional origin vs current cursor) plus a discriminated point type, which makes type narrowing safe and ordering unambiguous.

**Affected ai-skills files**:

- `blockcraft-selection.md` (L2) — major rewrite
- `blockcraft.md` (L0) — Quick Reference section
- `blockcraft-block.md` (L1) — `setInlineRange` return type, EditableBlockComponent API

#### Deprecations

| Deprecated                                            | Replacement                                                                     | Removal version       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------- |
| `BlockSelection.isCollapsed`                          | `BlockSelection.collapsed`                                                      | TBD (v0.3.x earliest) |
| `BlockSelection.getDirection()`                       | `BlockSelection.direction`                                                      | TBD                   |
| `INormalizedRange { from, to, collapsed }`            | `BlockSelection { anchor, head, ... }` or `INormalizedEndpoints { start, end }` | TBD                   |
| `IBlockRange / IBlockTextRange / IBlockSelectedRange` | `ISelectionPoint`                                                               | TBD                   |
| `IBlockInlineRangeJSON { index, length, ... }`        | `ISelectionPointJSON { offset, ... }`                                           | TBD                   |
| `IBlockSelectionJSON { from, to, ... }`               | `ISelectionJSON { anchor, head, ... }`                                          | TBD                   |
| `selection.from.* / selection.to.*` access            | `selection.anchor.* / selection.head.*` (or `start/end`)                        | TBD                   |

#### New APIs

```typescript
// On BlockSelection
selection.anchor                    // ISelectionPoint
selection.head                      // ISelectionPoint
selection.start                     // document-ordered first endpoint
selection.end                       // document-ordered last endpoint
selection.direction                 // 'forward' | 'backward'
selection.collapsed                 // boolean
selection.isInSameBlock             // boolean
selection.isStartOfBlock            // boolean
selection.isEndOfBlock              // boolean
selection.isAllSelected             // boolean
selection.isEmpty                   // boolean
selection.contains(blockId, offset?) // boolean
selection.toJSON(): ISelectionJSON
selection.toLegacyJSON(): IBlockSelectionJSON

// On SelectionManager
doc.selection.recalculate(execNext?, options?) // returns { value, next? }
doc.selection.nextChangeObserve()              // Observable, fires once
doc.selection.afterNextChange(fn)              // subscribe sugar
```

#### Migration Recipe

```typescript
// ── 1. Reading the current selection ──

// before
const sel = doc.selection.value
if (sel?.isCollapsed) { … }
const block = sel?.from.block
const offset = sel?.from.index

// after
const sel = doc.selection.value
if (sel?.collapsed) { … }
if (sel && sel.anchor.type === 'text') {        // narrow first!
  const block = sel.anchor.block                // EditableBlockComponent
  const offset = sel.anchor.offset
}

// ── 2. Building a selection JSON to save / replay ──

// before
const json: IBlockSelectionJSON = {
  from: { blockId, type: 'text', index: 0, length: 5 },
  to: null,
  collapsed: false,
  commonParent: parentId,
}

// after
const json: ISelectionJSON = {
  anchor: { blockId, type: 'text', offset: 0 },
  head:   { blockId, type: 'text', offset: 5 },
  commonParent: parentId,
}

// ── 3. setSelection / replay ──
//   Both signatures still work — legacy {from,to} is parsed by replay() and
//   createFakeRange(). New code should pass ISelectionPoint / ISelectionJSON.

// before
doc.selection.setSelection(
  { blockId, type: 'text', index: 0, length: 5 }
)

// after
doc.selection.setSelection(
  { blockId, type: 'text', offset: 0, block: editableBlock },  // anchor
  { blockId, type: 'text', offset: 5, block: editableBlock }   // head
)

// ── 4. Whole-block selection check ──

// before
sel.from.type === 'selected'   // worked but no narrowing helper

// after
if (sel.start.type === 'selected') {
  // sel.start.block: BaseBlockComponent (TS narrows automatically)
}
```

#### Behavior Changes

- Cross-parent selections (anchor and head under different parent blocks) are still rejected by `recalculate()` — that constraint hasn't changed. The constraint is documented as removable once `DocUndoManager` handles cross-parent selection snapshots.
- Root-block "gap-space" selections (zero-width spaces at document boundaries) now resolve to the first/last child block's start/end, enabling Cmd+A from any cursor position to select the whole document. This is additive — no consumer code change needed.

---

### v0.1.36 and earlier — Pre-skill-pack baseline

Releases before 2026-03-30 do not have entries in this file. For historical changes, run `git log packages/editor/framework/` and consult per-PR commit messages. Future contributors: please backfill entries here only if you're certain about the change scope.

---

## Severity Reference Card

| Change type                                            | Severity | Example                                                       |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------- |
| Bug fix in framework internals, no public API affected | patch    | Fix race in `applyDelta` blot consistency check               |
| Doc-only fix in `ai-skills/`                           | patch    | Typo in `blockcraft-block.md`                                 |
| Bundled CSS adjustment, no class rename                | patch    | Tweak callout box-shadow                                      |
| New optional `DocConfig` field with a default          | minor    | Add `theme?: string`                                          |
| New plugin / new block / new embed                     | minor    | `BlockGapCreatorPlugin`                                       |
| New method on `BaseBlockComponent`                     | minor    | `getChildrenByIndex()`                                        |
| Mark old API `@deprecated` (still works)               | minor    | Selection v0.1.37 refactor                                    |
| Rename / remove an exported symbol                     | major    | Drop `IBlockSelectionJSON` (when actually removed)            |
| Change a method signature in a non-back-compat way     | major    | `setSelection(point, point)` → `setSelection({anchor, head})` |
| Behavior reversal users could observe                  | major    | Plugin hook fires before init instead of after                |
| Removal of a previously-deprecated API                 | major    | Drop `selection.isCollapsed`                                  |

When in doubt, treat the change as one severity higher and note the reasoning in the entry's "Why" field. Conservative is cheap; under-bumping can break consumers silently.

## Tooling Note

If you bump the package version but forget to add an entry here, the framework's `CLAUDE.md` rule says reviewers should request changes. There is currently no automated check enforcing this — add one (PreCommit hook? CI script?) when the team has time.
