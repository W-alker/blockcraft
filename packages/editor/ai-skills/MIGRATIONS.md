# BlockCraft Migration Guide

> **Version adaptation reference.** Each entry documents a framework change that affects external consumers — including breaking API changes, deprecations, removed exports, behavior changes, and any rename/move that downstream code might depend on.
>
> Last updated: 2026-07-17 | Tracks `@ccc/blockcraft` npm releases.

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
> - `patch` (e.g. 0.1.37 → 0.1.38): bug fix, doc-only change, internal refactor that doesn't touch any exported surface
> - `minor` (e.g. 0.1.37 → 0.2.0): additive — new APIs, new plugins, new blocks, new optional schema fields, new exports
> - `major` (e.g. 0.1.37 → 1.0.0): breaking — removed APIs, renamed exports, signature changes, behavior reversals
>
> **Deprecations are minor**, not major — they only become major when the deprecated API is actually removed.
>
> The version in `packages/editor/package.json` MUST be bumped according to this rule before running `pnpm publish:editor`.

---

## Releases

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
  embeds: [['image', customImageEmbedConverter]],
})
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
doc.toggleReadonly(true)
```

Use the block API for a persisted section lock:

```typescript
doc.setBlockReadonly(calloutId, true)

if (doc.isBlockReadonly(paragraphInsideCalloutId)) {
  // inherited from the callout
}

doc.setBlockReadonly(calloutId, false)
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
block.props.title = nextTitle
block.yText.insert(index, text)

// do
block.updateProps({title: nextTitle})
block.insertText(index, text)
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
const block = doc.getBlockById(blockId)
const parentId = block.parentId
const path = doc.getBlockPath(block)

// after: works for any root-reachable YBlock, mounted or not
const parentId = doc.model.getParentId(blockId)
const path = doc.model.getPath(blockId)
```

Keep component lookup for view work:

```typescript
// unchanged: toolbar geometry, focus and DOM Range still need a mounted view
const mountedBlock = doc.getBlockById(blockId)
mountedBlock.hostElement.focus()
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
const exports = new DocExportManager(doc, {scale: 2, bgcolor: '#fff'})
await exports.exportToJpeg('document.jpg', {scale: 2})

// after: BlockCraft-owned document/PDF export
const exports = new DocExportManager(doc)
await exports.exportToPdf('document.pdf')

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
  pagination: {enabled: true, pageSize: 'A4'},
})
doc.pagination.updateConfig({orientation: 'landscape'})

// after
const pagination = new PaginationPlugin({
  enabled: true,
  pageSize: 'A4',
})
const doc = new BlockCraftDoc({
  // ...required config
  plugins: [pagination],
})
pagination.updateConfig({orientation: 'landscape'})
pagination.disable() // return to continuous layout without rebuilding the doc
```

Register `PageDividerBlockSchema` only when the host wants explicit manual page breaks. Existing documents and hosts remain on continuous layout when the plugin is absent or disabled.

To export the page layout currently visible on screen, stop passing a duplicate pagination config:

```typescript
// before: always reflows using this separate config
await exports.exportToPdf('document.pdf', {
  pagination: {pageSize: 'A4', margins: {top: 72, right: 72, bottom: 72, left: 72}},
})

// after: enabled PaginationPlugin supplies the current stable layout
await exports.exportToPdf('document.pdf')

// Tauri/host application: run this inside a dedicated top-level export WebView
await exports.exportToPdf('document.pdf', {
  backend: async ({suggestedName, page, pageCount}) => {
    const path = await choosePdfPath(suggestedName)
    if (!path) return {status: 'cancelled'}
    await invokeNativePdfPrint({path, page, pageCount})
    return {status: 'saved', path}
  },
})
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
const range = doc.selection.normalizeRange(staticRange)
doc.inputManger.deleteByRange(range, true)

// after
const selection = doc.selection.value
if (selection) {
  doc.inputManger.deleteByRange(selection, true)
}
```

For browser DOM adapters:

```typescript
// before
const range = doc.selection.normalizeRange(staticRange)
if (range.from.type === 'text') {
  useOffset(range.from.index)
}

// after
const endpoints = normalizeRange(
  staticRange,
  id => doc.getBlockById(id),
)
if (endpoints.start.type === 'text') {
  useOffset(endpoints.start.offset)
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
if (selection.start.type === 'table-cell') {
  const cell = selection.start.block
  const tableId = selection.start.tableId
  const rectangle = selection.getTableCellSelection()
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
if (selection.start.type === 'boundary') {
  const container = selection.start.block
  const index = selection.start.index
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
const sel = doc.selection.value
if (sel && sel.start.type === 'gap') {
  const {blockId, side} = sel.start   // side: 'before' | 'after'
  // 在 blockId 的 before/after 一侧进行操作
}
```

若要序列化选区并稍后还原（含 gap）：

```typescript
const json = selection.toJSON()  // start.type === 'gap' 时 json 含 side 字段
selection.replay(json)           // 自动还原 gap 的 side
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
new TextMarkerPlugin(['paragraph', 'heading'])

// after — add 'code' / 'mermaid-textarea' to colorOnlyFlavours; existing rich flavours unaffected
new TextMarkerPlugin(['paragraph', 'heading'], ['code', 'mermaid-textarea'])
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
    block.flavour === 'todo' && (block as any).handleMentionConfirm?.(data) === true,
})
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
:root { --bc-lh: 28px; }

/* after — 无单位比例（28 / 16 ≈ 1.75） */
:root { --bc-lh: 1.75; }

/* 若你曾依赖 var(--bc-lh) 作为「一行高度」的 px，改写为： */
.something { height: calc(var(--bc-lh) * var(--bc-fs)); }
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
const doc = new BlockCraftDoc({ /* … */ })

// after
const doc = new BlockCraftDoc({
  /* … */
  copyFilter: { excludeFlavours: ['comment'], stripAttributes: ['s:color'] },
})
```

Plugin:

```typescript
// init()
this._disposeFilter = this.doc.clipboard.registerCopyFilter({ excludeFlavours: ['my-block'] })
// destroy()
this._disposeFilter?.()
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
dragController.startDrag(evt, { kind: 'origin-block', blockId: activeId })

// New (opt-in, for callers that want bulk drag)
dragController.startDrag(evt, { kind: 'origin-blocks', blockIds: rangeIds })
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

| Variable | Default | 说明 |
|---|---|---|
| `--bc-table-fullscreen-z` | `800` | 全屏表格容器 z-index（故意低于 CDK Overlay 默认 1000，让 structure-toolbar / float-toolbar / mention 自然浮在表格之上） |
| `--bc-table-fullscreen-mask-z` | `799` | 遮罩层 z-index |
| `--bc-table-fullscreen-overlay-bg` | `rgba(0, 0, 0, 0.55)` | 遮罩色 |
| `--bc-table-fullscreen-padding` | `40px` | viewport 边距 |
| `--bc-table-fullscreen-radius` | `8px` | 圆角 |
| `--bc-table-fullscreen-bg` | `var(--bc-bg-elevated, #fff)` | 背景色 |

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
fromEvent<DragEvent>(triggerBtn, 'dragstart').subscribe(evt => {
  evt.dataTransfer?.setDragImage(hostElement, 0, 0)
  this.doc.dndService.startDrag(evt, [{ dragDataType: 'origin-block', dragData: blockId }])
})
```

新（PointerEvents）：

```ts
fromEvent<PointerEvent>(triggerBtn, 'pointerdown').subscribe(evt => {
  if (evt.button !== 0) return
  this.doc.dragController.startDrag(evt, { kind: 'origin-block', blockId })
})
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
.demo-root[data-blockcraft-root="true"] { --bc-fs: 22px; --bc-lh: 30px; --bc-segments-gap: 18px; }

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
const snapshot = await markdownAdapter.toBlockSnapshot(markdown)
snapshotRenderer.render(containerEl, snapshot)

// after: progressively render markdown
const viewer = createMarkdownStreamViewer({
  container: containerEl,
})

viewer.append(markdownChunk)
viewer.finish()
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
const doc = new BlockCraftDoc(config)
doc.initBySnapshot(snapshot, containerEl)
doc.readonlySwitch$.next(true)

// after: display-only snapshot path
const renderer = createSnapshotRenderer({
  resourcePolicy: 'eager',
})
renderer.render(containerEl, snapshot)
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
const coversWholeRange = selection.isStartOfBlock && selection.isEndOfBlock
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

| Deprecated | Replacement | Removal version |
|------------|-------------|------------------|
| `BlockSelection.isCollapsed` | `BlockSelection.collapsed` | TBD (v0.3.x earliest) |
| `BlockSelection.getDirection()` | `BlockSelection.direction` | TBD |
| `INormalizedRange { from, to, collapsed }` | `BlockSelection { anchor, head, ... }` or `INormalizedEndpoints { start, end }` | TBD |
| `IBlockRange / IBlockTextRange / IBlockSelectedRange` | `ISelectionPoint` | TBD |
| `IBlockInlineRangeJSON { index, length, ... }` | `ISelectionPointJSON { offset, ... }` | TBD |
| `IBlockSelectionJSON { from, to, ... }` | `ISelectionJSON { anchor, head, ... }` | TBD |
| `selection.from.* / selection.to.*` access | `selection.anchor.* / selection.head.*` (or `start/end`) | TBD |

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

| Change type | Severity | Example |
|-------------|----------|---------|
| Bug fix in framework internals, no public API affected | patch | Fix race in `applyDelta` blot consistency check |
| Doc-only fix in `ai-skills/` | patch | Typo in `blockcraft-block.md` |
| Bundled CSS adjustment, no class rename | patch | Tweak callout box-shadow |
| New optional `DocConfig` field with a default | minor | Add `theme?: string` |
| New plugin / new block / new embed | minor | `BlockGapCreatorPlugin` |
| New method on `BaseBlockComponent` | minor | `getChildrenByIndex()` |
| Mark old API `@deprecated` (still works) | minor | Selection v0.1.37 refactor |
| Rename / remove an exported symbol | major | Drop `IBlockSelectionJSON` (when actually removed) |
| Change a method signature in a non-back-compat way | major | `setSelection(point, point)` → `setSelection({anchor, head})` |
| Behavior reversal users could observe | major | Plugin hook fires before init instead of after |
| Removal of a previously-deprecated API | major | Drop `selection.isCollapsed` |

When in doubt, treat the change as one severity higher and note the reasoning in the entry's "Why" field. Conservative is cheap; under-bumping can break consumers silently.

## Tooling Note

If you bump the package version but forget to add an entry here, the framework's `CLAUDE.md` rule says reviewers should request changes. There is currently no automated check enforcing this — add one (PreCommit hook? CI script?) when the team has time.
