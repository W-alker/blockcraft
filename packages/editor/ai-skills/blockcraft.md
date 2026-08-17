# BlockCraft Editor - AI Skill Pack

> **Level 0: Overview & Router** — Always read this first. Load sub-skills on demand.
>
> Last updated: 2026-08-17 | Source: `packages/editor/` (also published inside `@ccc/blockcraft/ai-skills/`)
>
> **How to use this pack**:
> 1. Read this file (L0) — get the mental model and find the right sub-skill via the routing table.
> 2. Read the L1 task guide for your task — copy templates, follow checklists.
> 3. Read L2 deep dives only when L1 isn't enough or you're modifying framework internals.
>
> **External users**: this skill pack is bundled with the npm package. AI agents can discover it via `SKILL.md` (frontmatter present); humans see `README.md` for installation and the one-command installer (`install.mjs`).

## What is BlockCraft?

A block-based rich text editor built on **Angular (standalone components)** + **Yjs (CRDT)**. It provides:
- A tree of typed blocks (paragraph, image, table, callout, etc.)
- Real-time collaboration via Yjs
- Plugin system for extensibility
- Inline editing with a custom Blot tree (not Quill/ProseMirror)
- HTML and Markdown import/export via AST walkers

## Core Concepts

| Concept | Description | Key Class/File |
|---------|-------------|----------------|
| **Doc** | Central orchestrator; owns all subsystems | `BlockCraftDoc` in `framework/doc/` |
| **View Scale** | Host-controlled 50%–200% visual scale with normalized editor geometry | `DocumentViewScaleManager` at `doc.viewScale` |
| **Model Graph** | DOM-free, read-only Yjs tree queries for mounted or unmounted blocks | `BlockModelGraph` in `framework/doc/model-graph.ts` |
| **Block Readonly** | Owner-aware, inherited write protection resolved from `meta.lock` against the model graph | `BlockReadonlyManager` in `framework/doc/block-readonly-manager.ts` |
| **Mutation Policy** | Optional host-defined guard for structural, instance-meta and undo/redo mutations | `BlockMutationPolicyManager` in `framework/doc/block-mutation-policy.ts` |
| **Block** | A node in the document tree; has flavour, nodeType, props | `BaseBlockComponent` / `EditableBlockComponent` |
| **Plugin** | Extends editor behavior; event handlers + hotkeys | `DocPlugin` in `framework/plugin/` |
| **Inline** | Rich text within editable blocks; Blot tree on Y.Text | `InlineRuntime` in `framework/block-std/inline/` |
| **Selection** | Anchor/head selection model over blocks | `SelectionManager` in `framework/modules/selection/` |
| **Input** | Intercepts `beforeInput`, writes to Y.Text directly | `InputTransformer` in `framework/modules/input/` |
| **Table Model** | DOM-free table coordinates, merged-cell closure and stable-ID rectangle targets | package-internal `framework/modules/table/` |
| **Virtualization** | Optional model-first root-child windowing; nested subtrees stay atomic | `RootVirtualizationManager` in `framework/modules/virtualization/` |
| **Object Layout** | Word-like inline/top-bottom/under/over states plus fixed-pixel object grouping, projected onto Schema-gated block placement | `BlockPlacementManager` in `framework/services/` |
| **Object Sizing** | Placement-plane-relative `wr/ar` sizing with legacy pixel compatibility | `BlockObjectSizingManager` in `framework/services/` |
| **Resource Placeholder** | Reusable image/video/iframe loading, failure, retry and intrinsic-size coordination | `BcResourcePlaceholderDirective` in `components/resource-placeholder/` |
| **Block Navigation** | Mode-independent stable-ID reveal without changing selection or focus | `BlockCraftDoc.navigateToBlock()` |
| **Pagination** | Pure page layout + reversible live view + print/PDF | `PaginationPlugin` + `framework/modules/pagination/` |
| **Event** | Three-tier event dispatcher (block→flavour→global) | `UIEventDispatcher` in `framework/block-std/event/` |
| **Chain** | Fluent builder for sequencing mutations | `DocChain` in `framework/chain/` |
| **Schema** | Block registration: flavour, component, createSnapshot | `SchemaManager` in `framework/block-std/schema/` |
| **Bundled Capabilities** | Fresh full-editor schemas, embeds, plugins and insert-material projection for each Doc/surface | `createBundledEditorCapabilities()` in `editor/bundled-capabilities.ts` |
| **Adapter** | HTML/Markdown ↔ BlockSnapshot conversion | `adapters/html-adapter/`, `adapters/markdown-adapter/` |

## Block Types Taxonomy

Three `nodeType` categories:

| nodeType | Description | Base Class | Examples |
|----------|-------------|------------|----------|
| `editable` | Has inline text (Y.Text), no children | `EditableBlockComponent` | paragraph, code, bullet, ordered, todo, blockquote, caption, mermaid-textarea, word-art |
| `void` | No children, no text | `BaseBlockComponent` | divider, image, bookmark, attachment, formula, video, audio, mermaid, embed-blocks (figma, juejin) |
| `block` | Has block children | `BaseBlockComponent` | callout, columns, column, table, table-row, table-cell, frame, shape, text-box, render-unit, object-group, placement-layout (infrastructure) |
| `root` | Special — top-level container | `BaseBlockComponent` (root-block) | root |

> **Heading is a prop, not a flavour.** H1/H2/H3 styles live in `props.heading` on `paragraph` blocks. There is no `heading-block` flavour.

### Currently Registered Block Schemas (from `editor/bundled-capabilities.ts`)

`paragraph, ordered, bullet, todo, callout, code, divider, page-divider, image, table, table-row, table-cell, attachment, bookmark, figmaEmbed, juejinEmbed, caption, root, mermaid-textarea, mermaid, blockquote, columns, column, formula, video, audio, shape, shape-text, text-box, word-art, object-group, placement-layout, render-unit`

A host application can register a subset or extend this list — see `blockcraft-app.md`.
Hosts that need the complete reference-editor surface should call
`createBundledEditorCapabilities()` instead of copying this list. The factory
creates new stateful Plugin/converter instances for every Doc and validates
duplicate block flavours, embed names and plugin names. Never reuse one
factory result across multiple documents.

## Project File Structure

```
packages/editor/
├── framework/              # Core engine
│   ├── doc/                # BlockCraftDoc, BlockModelGraph, DocCRUD, DocVM, DocUndoManager
│   ├── block-std/          # BaseBlockComponent, EditableBlockComponent
│   │   ├── block/          #   component base classes
│   │   ├── event/          #   UIEventDispatcher, @EventListen, @BindHotKey
│   │   ├── inline/         #   InlineRuntime, Blot tree, EmbedConverter
│   │   ├── schema/         #   SchemaManager, IBlockSchemaOptions
│   │   └── reactive/       #   proxyMap, YBlock, NativeBlockModel
│   ├── modules/            # Selection, Input, Clipboard, Pagination, Virtualization
│   ├── plugin/             # DocPlugin base class
│   ├── chain/              # DocChain fluent builder
│   └── services/           # DI tokens (file, message, blockCreator, etc.)
├── blocks/                 # All block implementations (one dir per block)
├── plugins/                # All plugin implementations (one dir per plugin)
├── components/             # Reusable UI components (toolbar, pickers)
├── snapshot-viewer/        # Standalone display-only snapshot renderer
├── adapters/               # HTML/Markdown import/export
├── themes/                 # CSS themes (base, light, dark, per-block styles)
├── tools/                  # Export utilities (PDF, print)
└── global/                 # Logger, error codes, decorators, types, utils
```

## Task Routing Table

**Read the corresponding sub-skill file before starting the task:**

| Task | Sub-Skill File | Level |
|------|----------------|-------|
| **Embed BlockCraft in a host Angular app** | `blockcraft-app.md` | L1 |
| Configure / use existing plugins | `blockcraft-plugins-ref.md` | L1 |
| Create a new plugin | `blockcraft-plugin.md` | L1 |
| Create a new block | `blockcraft-block.md` | L1 |
| Create an inline embed (mention, latex, …) | `blockcraft-embed.md` | L1 |
| Add HTML/Markdown import/export for a block | `blockcraft-adapter.md` | L1 |
| Create/modify toolbars or overlay UI | `blockcraft-toolbar.md` | L1 |
| Customize themes or block styles | `blockcraft-theme.md` | L1 |
| Render a snapshot without creating an editor runtime | `blockcraft-app.md` | L1 |
| Debug data flow, events, or sync issues | `blockcraft-debug.md` | L1 |
| Optimize performance | `blockcraft-perf.md` | L1 |
| Write tests | `blockcraft-test.md` | L1 |
| Understand/modify selection behavior (anchor/head model) | `blockcraft-selection.md` | L2 |
| Understand/modify input/IME behavior | `blockcraft-input.md` | L2 |
| Understand/modify inline blot system | `blockcraft-inline.md` | L2 |
| Understand/modify event system | `blockcraft-event.md` | L2 |
| Understand/modify Yjs data model | `blockcraft-data.md` | L2 |
| **Upgrade `@ccc/blockcraft` and find what changed** | `MIGRATIONS.md` | — |
| **Add a new framework feature and document the version bump** | `MIGRATIONS.md` (mandatory for every architectural change) | — |

### Routing Decision Rules

- **Don't read every file.** Pick one L1 task guide. Only descend to L2 if the L1 doesn't answer your question or you're touching framework internals.
- **Architectural changes** (e.g. modifying `DocPlugin` base, `BaseBlockComponent`, selection model): read the L2 *and* update the L2 file when done — see `CLAUDE.md` "文档同步规则".
- **Plugin/Block creation**: stay at L1. Templates are copy-paste ready.
- **Stuck on a runtime error**: jump to `blockcraft-debug.md` for tracing strategies.

## Quick Reference: Common APIs

### Model-First Document Reads

```typescript
// BlockModelGraph reads the complete reachable Yjs tree. A block does not need
// an Angular component or DOM host to be queried here.
const path = doc.model.getPath(blockId)
const parentId = doc.model.getParentId(blockId)
const childrenIds = doc.model.getChildrenIds(blockId)
const textLength = doc.model.getTextLength(blockId)
const richText = doc.model.getTextDeltas(blockId)
const snapshot = doc.model.toSnapshot(blockId)
const documentSnapshot = doc.exportSnapshot()

// Model-first mutation: writes Yjs and returns stable IDs without requiring a
// parent ComponentRef or resolving inserted child components.
const insertedIds = doc.crud.insertBlockSnapshots(parentId, index, snapshots)
const allowed = doc.canInsertChild(parentId, childFlavour)

// ID/index structural mutations also resolve against the complete model graph.
doc.crud.deleteBlocks(parentId, index, count)
doc.crud.deleteBlockById(blockId)
doc.crud.moveBlocks(parentId, index, count, targetParentId, targetIndex)

// Rendering-mode-independent reveal; preserves model/native selection + focus.
const revealed = await doc.navigateToBlock(blockId)
```

Typography ownership is layered and compact: root `ff/fs/lh` defines document
defaults; editable block `pfs/lh/psb/psa` defines paragraph base scale, line
height and spacing; inline `t:ff/t:fs/t:ls` defines selection font, relative
multiplier and character spacing. Effective text scale is `pfs × t:fs`.
Complete-block font scaling writes `pfs` so ordered/bullet/todo prefixes inherit
it; partial ranges and collapsed carets keep `t:fs`. This selection/model rule
requires no DOM measurement or resize listener, and old inline-only documents
are not migrated automatically.
The fixed toolbar presents font family and relative scale as one adjacent,
iconless Word-style control pair. Character spacing sits immediately before
paragraph line height, while superscript/subscript share a split action whose
main half repeats the active or most recently chosen baseline command. Each
typography menu ends in a CSES **更多设置…** dialog focused on its originating
field. Dialog edits remain draft-only until confirm. The floating text toolbar
keeps its existing compact selection-format surface. Document defaults belong
in a host document-settings/styles surface and mutate through `DocCRUD`.

Ordered blocks optionally persist compact `ms` (marker style), selected from a 12-preset
Word-like marker library (`1.`, `1)`, `(1)`, `1、`, `01.`, alphabetic, Roman,
Chinese and circled forms). Missing / `null` keeps the historical depth cycle.
Preset IDs are stable two-character codes: `n1..n5`, `a1..a2`, `r1..r2`,
`c1..c2`, and `o1`.
Use `resolveOrderedMarker()` for live or custom rendering and
`applyOrderedMarkerStyle()` for a model-first, one-transaction numbering-group
update. A marker group follows the automatic counter's `depth + heading` and
structural-pruning rules: same-level non-ordered siblings do not break it,
while a shallower boundary, relevant heading boundary, or explicit positive
`start` does. The fixed toolbar exposes a split ordered-list button, and the
live marker toolbar remains limited to continue / restart / recalculate.
When a newly inserted ordered block joins an existing counter group and omits
`ms`, it inherits the group's valid marker preset even across same-level
non-ordered siblings. Explicit `start` begins a new group and does not inherit.

The root block exposes optional document appearance props. `background` keeps
the CSS shorthand as one string so color, image, position/size, repeat,
attachment and origin/clip remain CSS-native and compact in Yjs/snapshots.
`color` is applied to the root host and synchronized to its `--bc-color` theme
token, so normal text and headings share the document default; explicit
inline/block colors still win. Hosts own background projection because flow
view and paginated page sheets use different DOM surfaces:

```typescript
doc.crud.updateBlockProps(doc.rootId, {
  background: '#f7f7f7 url("https://cdn.example.com/bg.png") center / cover no-repeat',
  color: '#182230',
})

const appearance = doc.model.getProps(doc.rootId)

// Remove both document appearance overrides.
doc.crud.updateBlockProps(doc.rootId, {background: null, color: null})
```

Every editable block also accepts the common block-surface props `backColor`
and `borderColor`. `BaseBlockComponent` projects them through
`--bc-block-background-color` / `--bc-block-border-color` and
`data-bc-block-background` / `data-bc-block-border`; Snapshot Viewer uses the
same contract. Persist the opaque palette value and use `null` to remove an
override:

```typescript
doc.crud.updateBlockProps(blockId, {
  backColor: '#FBF3DB',
  borderColor: '#DFAB01',
})
doc.crud.updateBlockProps(blockId, {backColor: null, borderColor: null})
```

The bundled `BlockControllerPlugin` exposes these two fields for its current
editable flow block. When a multi-block selection contains one or more eligible,
writable editable flow blocks, the same menu resolves the complete range from
`BlockModelGraph` and writes that eligible subset by stable ID in one Yjs
transaction; non-editable and protected selected blocks remain untouched. Mixed
colors among the targets display with no active swatch until the user chooses a
value. It does not cascade to ancestors, appear for internal leaf blocks, or
reclaim absolute objects from their object-specific toolbars. Concrete
`borderColor` values render as a 1px outline
without changing block geometry, while block-specific focused/selected
highlights retain priority. Every editable block host receives a 4px radius.
Blockquote treats `borderColor` specially as the color of its 1px left accent
bar and draws no rectangular outline.

The bundled non-editable `render-unit` content region persists the same
`backColor` / `borderColor` field names through its block-specific appearance
contract. `CalloutToolbarPlugin` reuses its container toolbar for a cursor in a
direct editable child of either Callout or `render-unit`; a whole-block
`render-unit` selection also opens it so an empty region remains configurable.
The current container toolbar exposes background and border controls only;
those fields project through
`--bc-render-unit-background-color` / `--bc-render-unit-border-color`, and uses
the same 82% solid-surface composition in the live editor and Snapshot Viewer.

`render-unit` also implements the opt-in `BlockSurfaceProps` contract. Its
persisted keys follow compact CSS-style abbreviations: `p` is a numeric CSS
padding shorthand with one to four layout-pixel values;
`bgi/bgs/bgx/bgy/bgo` are background image, size/fit, x/y position and opacity.
Create or update the region through normal Schema/CRUD boundaries:

```typescript
const region = RenderUnitBlockSchema.createSnapshot({}, {
  p: [16, 24], // vertical, horizontal
  bgi: 'https://cdn.example.com/paper.png',
  bgs: 'cover',
})

doc.crud.updateBlockProps(regionId, {p: [16, 32]})
doc.crud.updateBlockProps(regionId, {bgi: null})
```

The live editor and Snapshot Viewer render the image as an actual decorative
`<img>`, allowing existing print/PDF resource waiting to decode it. HTML
round-trips the complete surface in a BlockCraft data envelope; standard
Markdown intentionally retains only readable children. `render-unit` remains a
geometry-neutral content region; use the separate bundled `text-box` Block when
fixed geometry, placement, rotation, resizing and insertion UI are required.

`doc.model` is read-only. Use `DocCRUD` / `DocChain` for every mutation. Model
existence means the YBlock is reachable from the current root; it does not mean
`doc.vm` has mounted a component. `getBlockById()` keeps its mounted-component
semantics and can still throw for an unmounted block. Structure/order/snapshot
queries should prefer `doc.model` when component capabilities are not required.
Use `doc.exportSnapshot()` for full-document persistence/export; it reads the
complete model without mounting virtualized block views.
Use `doc.crud.insertBlockSnapshots()` for imports or bulk/model workflows that
only need inserted IDs. Existing parent views still synchronize through the
normal Yjs observer. Keep `insertBlocks()` for interaction code that needs its
synchronous `BlockComponent[]` compatibility result.

The host may attach the document's visual surface to `doc.viewScale` and keep
its own user preference. The manager applies CSS `zoom`, normalizes
virtualization/placement geometry, and optionally handles Ctrl/Cmd+wheel:

```typescript
doc.viewScale.attach(documentPageElement, {wheel: true})
doc.viewScale.setScale(1.25) // clamped to 0.5–2.0
doc.viewScale.zoomIn()
doc.viewScale.zoomOut()
doc.viewScale.reset()
doc.viewScale.change$.subscribe(({scale, source}) => savePreference(scale, source))
```

Fit-width and fit-page are host layout policies: measure the available viewport,
derive a scale, then call `setScale()`. Do not persist dynamic fitting as a
single percentage if it should react to later viewport changes.

Built-in table rectangle selection and editing use a package-internal
`TableModelGrid` derived from `doc.model`. Coordinates, merged-cell closure,
TSV/snapshot shape and edit targets remain valid when selected middle cells have
no ComponentRef. TableBlock paints only mounted cells; malformed grids fail
closed. This is an internal domain projection, not a public host API.
Column resizing also preserves the committed model and table layout throughout
the gesture: mouse movement updates only an inert active-color viewport guide
outside the clipped table subtree, then mouse release resolves the stable
source-cell ID against the current model grid and writes `colWidths` once.
Escape, window blur, a readonly release and stale model anchors cancel without
a model write. No live `<col>` width or Angular change detection runs on the
mouse-move path.
`deleteBlocks()`, `deleteBlockById()` and `moveBlocks()` likewise operate on
reachable YBlocks and do not require source or target ComponentRefs. Mounted
views receive the same transaction through the normal observer; unmounted
subtrees stay model-only until they are mounted.

`BlockModelGraph` also exposes transaction-coalesced model change facts for
view-independent consumers. `contentChange$` reports reachable text changes
(including inline attribute changes), nested props changes and whole-block
replacement as `"text"` / `"props"` kinds, together with Yjs `origin`, `local`
and `isUndoRedo` context. The existing `textChange$` contract is unchanged.
`structureChange$` adds optional `affectedRootIds`, which current runtimes
always populate with the direct-root render units whose layout content was
affected; a pure direct-root reorder reports an empty array.

### Root Virtualization

```typescript
const doc = new BlockCraftDoc({
  // ...required config
  virtualization: {
    enabled: true,
    overscanViewports: 1,
    segmentMergeGap: 2,
    retainedViewLimit: 12,
    estimatedHeights: {paragraph: 32, table: 240},
    resolveViewRetention: ({flavour}) =>
      flavour === 'custom-player' ? 'keep-alive' : undefined,
  },
})
```

Pagination/virtualization Phase A introduced the package-internal
`VerticalLayoutProjection` read seam and its continuous `HeightMap` adapter.
Phase B added a stable-ID GeometryIndex, LayoutCoordinator, paginated
Projection and bounded legacy/shadow comparison. These implementation types
remain absent from the public barrel.

Phase C adds an internal exclusive Projection transition to
`RootVirtualizationManager`. The transition captures the old-coordinate scroll
anchor before paginated DOM changes, validates root ID order, pauses continuous
height observation while the custom Projection is active, and restores the
continuous Projection on release or bounded failure. Gap, table-break and
height-lock appliers cache pure layout state but touch only mounted root IDs;
their state is replayed when a root view remounts.

`PaginationPlugin({experimentalSparseView: true})` opts into this Phase C path
when root virtualization is enabled. The paginated Projection drives viewport
range and spacers, mounted roots upgrade from estimated to measured geometry,
and offscreen model text/props changes schedule one animation-frame-coalesced
pure recomputation without DOM lookup. The first implementation still performs
an `O(N)` scan of cached numbers and keeps all lightweight page-frame DOM.
The option defaults to `false`: the product compatibility path continues to
hold an exact full-document view lease until Phase D. Printing/PDF never reuse
a non-exact sparse layout; they fall back to the complete readonly reflow path.

The bundled reference `<block-craft-editor>` accepts the initialization-only
`[virtualizationEnabled]` input (default `true`) and
`[paginationSparseView]` input (default `false`). Recreate that component to
change either construction mode; direct framework integrations configure
`DocConfig.virtualization` and `PaginationPlugin.experimentalSparseView`.

Before a built-in table mounts, continuous virtualization and sparse pagination
use a bounded content-aware model estimate instead of treating the table as one
fixed-height card. The estimator intentionally ignores legacy
`table-row.props.height`: it is not stable geometry in the dual continuous /
paginated layout. It samples at most 96 rows, 24 cells per sampled row and 12
children per sampled cell; `colWidths`, cell padding, visible merge masters,
`colspan` / `rowspan` and child counts participate in the projection. Editable
children use O(1) `Y.Text.length`, with average glyph width derived from the
document `baseFontSize` and line height taken from document layout metrics.
Nested text input does not rescan the table on every keystroke; mounted DOM
measurement remains the exact correction path.

`DocConfig.layoutMetrics` can provide `{baseFontSize, lineHeight}` in resolved
CSS pixels. Otherwise BlockCraft reads root computed typography once during
document initialization. After changing `--bc-fs` / `--bc-lh`, hosts must call
`doc.updateLayoutMetrics(...)` or change CSS and call
`doc.refreshLayoutMetrics()`; the update invalidates virtualization and sparse
pagination estimates without adding computed-style reads to estimator paths.

Custom Schemas can participate in the same DOM-free path through
`metadata.virtualization.estimateHeight(context)`. The context supplies
readonly props, direct child IDs, a cycle-safe child estimator, cached root
width, document `baseFontSize` / `lineHeight`, and the requesting `layoutMode`
(`'flow' | 'paginated'`). Finite
non-negative results are model-driven and refresh while offscreen; invalid
results and thrown errors fall back to object-sizing, built-in rules and
`DocConfig.virtualization.estimatedHeights`. Keep callbacks synchronous and
persist every async layout fact in model props. The built-in `page-divider`
uses this seam to reserve its visual marker in flow layout while remaining a
zero-height manual break in paginated layout.
Built-in Shape and WordArt blocks also use this seam: their normalized,
persisted `props.height` is the O(1) offscreen estimate, so a custom host does
not need a per-flavour fallback merely to preserve their fixed object frame.
Mounted DOM measurement remains the exact correction for surrounding layout
stride and browser projection.

This is opt-in and disabled by default. Direct root children are windowed;
their nested tables/columns/callouts remain complete atomic subtrees. Selection
pins only the direct-root units containing its ordered start/end while it is
active. For `boundary(i) -> boundary(j)`, those are the children adjacent to the
two half-open edges; a collapsed root boundary owns the nearest caret-bearing
unit, while a nested selection owns only its containing root unit. The selected
middle remains virtualized and is represented by the canonical model range;
small endpoint gaps may still be coalesced by `segmentMergeGap`, but only when
their projected height is at most one quarter of the viewport. The default
`overscanViewports: 1` uses a pure height budget: one viewport before and after
the visible viewport, for a three-viewport mounted window. It never expands by
root count, so adjacent oversized tables do not accidentally become a full-DOM
window. Both Snapshot
and YBlock initialization build the complete Yjs/model tree before creating
only the root view. Root-order transactions rebuild root indices and re-evaluate
selection/projection leases from stable endpoint IDs plus root boundary indices,
then restore the first visible block's viewport offset after
insert/delete/move/undo/redo. Undo/redo and `doc.model` continue to cover the
full document. History restoration transiently materializes only its bookmark
endpoints before relative resolution and measures the resolved head before
native Selection replay. A fully visible head leaves the viewport untouched;
an offscreen or unavailable head is replayed and then centered through
`doc.navigateToBlock(head.blockId)`. Verification waits for that
projection instead of restarting and canceling it.
Component-oriented navigation and programmatic Selection helpers
materialize only explicitly targeted root units. Their preflight distinguishes
retained components from mounted DOM through `DocVM.isMounted()`, so a newly
created empty block is mounted before its zero-offset caret is projected. This
transient view does not become a persistent pin unless the resulting Selection
or viewport owns it.
Unmounted component subtrees are kept in a bounded LRU cache
(`retainedViewLimit`, default `12`; use `0` for immediate destruction) and are
rebuilt from current Yjs state after eviction. Do not retain component
references across virtual reconciliation frames.
Stateful schemas can set
`metadata.virtualization.viewRetention: 'keep-alive'`. Once such a
view first materializes, its containing root render unit stays mounted until
block deletion or document disposal; no initial document scan is performed.
Built-in audio, video and iframe embed flavours opt in. Hosts can override a
schema through `virtualization.resolveViewRetention(context)`, including forcing
a built-in block back to `'virtual'`. Policy resolution and lease updates are
cold mount/structure work and add no callback or layout read to scroll frames.
Schemas can independently opt into free block positioning with
`metadata.placement: {modes: ['relative', 'absolute']}`. This is a capability
declaration, not persisted layout state. Placement mode is structural: an
ordinary direct root child is relative flow, while a direct child of the root
`placement-layout` or `object-group` is absolute. Absolute objects persist one atomic
`props.position: {x, y}` value in their parent plane's layout pixels and an independent
optional `props.placementLayer: 'under'`; omission means `over`. Relative
objects persist neither field. Root padding is never part of either coordinate.
`doc.placement.setMode()` preserves the current visual position when switching
to absolute. The standard transition is root-only: it lazily moves the object
under one hidden, zero-height `placement-layout` at the end of `root.children`.
`doc.placement.insertAbsoluteSnapshot()` creates a new object directly in that
layout. When materializing the first layout, it inserts the layout and object as
one nested snapshot, so no temporary root-flow object exists.
That infrastructure block is registered by the bundled editor, excluded from
ordinary sibling navigation and BlockController, and removed after its final
object returns to flow. `object-group` is the one bounded nested exception: it
is itself a fixed-pixel absolute object and its direct children use local
absolute coordinates. Group members cannot switch to relative/inline layout
until the group is dissolved.
When returning an absolute block to relative flow, the manager uses the
block's current visual center to find the nearest mounted ordinary flow sibling
and inserts before/after that sibling's midpoint instead of jumping back to the
old logical position. `resolveFlowAnchor()` and `reanchorToFlow()` expose the
same stable-id operation for atomic conversions such as block image → inline
image. Absolute → inline/wrap always performs that root-flow reanchor before
representation replacement; an overlapping absolute object's editable child
is never used as the conversion target. Within the root placement layout,
`under` and `over` each use
`placement-layout.children` order from back to front, with ordinary flow
content acting as a virtual boundary between the two tiers.
`canMoveForward()` / `canMoveBackward()` query the total stack, while
`moveForward()` / `moveBackward()` persist one adjacent step. Moving the
highest `under` object forward crosses it to the lowest `over` position;
moving the lowest `over` object backward crosses it to the highest `under`
position. Same-tier movement changes only child order; boundary movement
changes order and `placementLayer` in one Yjs transaction. Same-tier and layer
changes never rewrite `position`. `setLayer()` remains the
low-level direct tier setter, and `startDrag()`
previews with a transform before committing one `updateProps()` write on
pointer release. That write replaces the whole `{x, y}` position object, so
collaborators never observe a torn coordinate pair. Object positioning never
uses native HTML5 drag/drop:
`pointercancel`, Escape and window blur all abort through the same cleanup.
These geometry reads only occur on explicit conversion, not
on drag or render hot paths. A host with its own layout domain can adapt mode transitions
through `DocConfig.placement.transitionMode`; returning `true` means the host
completed the transition. A paginated host `documentHeader` that moves the root
when projected receives a view-only placement-origin correction; it never
rewrites root-relative `position.x/y`. With root virtualization enabled, a model-only
vertical index projects each absolute child's root-relative `position.y` and
estimated height. The zero-height layout mounts when any projected band
intersects the root-relative viewport plus one viewport of pre-rendering, and
can detach when no band or interaction lease owns it. This projection does not
change the normal-flow `HeightMap` and performs no child DOM reads on scroll.
The layout remains one atomic root render unit, so one visible absolute child
currently materializes all of its layout siblings; descendants do not acquire
duplicate per-object leases.
`doc.placement.group(ids)` groups two or more contiguous, same-layer root
absolute objects in one Yjs transaction; `ungroup(groupId)` restores their root
coordinates. The group frame is the rotation-aware union of the members' visual
bounds plus a fixed 8-layout-pixel inset on every side. Persisted group
`width/height` describe this outer frame; member coordinates and ratio sizing
use the inset content plane. A ratio-sized image changes `wr` once when crossing
the boundary, so its pixel size stays stable while its new percentage basis
becomes the fixed group content width. Built-in member move/resize/rotation commits use
`doc.placement.updateObjectGeometry()`: one model-only O(n) pass tightens the
rotation-aware group frame, rebases local positions and converts ratio members
inside the same Yjs transaction. Pointer movement remains an O(1) transform
preview. Each pass logs `[ObjectGroup][performance]` with elapsed milliseconds,
member count, write count and reason through `doc.logger.info`.
User-driven group resize, group rotation and nested groups are intentionally
absent. The bundled `ObjectGroupToolbarPlugin` exposes Shift-click
multi-selection, rotation-aware object alignment/distribution, 组合/取消组合,
first-click-group/second-click-member interaction and a four-edge move band on
the selected group. Two objects enable left/horizontal-center/right,
top/vertical-center/bottom and combined center alignment. Horizontal and
vertical distribution require three objects. Alignment changes only root-local
`position` in one transaction; responsive/fixed size fields and layers remain
unchanged. A selection on any nested
descendant keeps the ancestor group frame visible. After the group or one of
its descendants owns Selection, its document-capture listener no longer
consumes member `pointerdown`, leaving local member dragging to the image,
Shape, TextBox or WordArt Plugin.
Only the group participates in the root placement stack. Direct members cannot
set `placementLayer`, move forward/backward, or change representation/layout.
Their image, Shape and WordArt toolbars omit the complete layout-control set;
the TextBox toolbar omits its entire 布局 rail entry and panel.
The toolbar uses `bc_combination` for 组合 and `bc_quxiaozuhe` for 取消组合.
Object layout UI uses `bc_buju` for the layout entry,
`bc_tuwenraopaiqianrushi` for 嵌入型,
`bc_tuwenraopaishangxiashi` for 上下型 and `bc_tuwenraopai` for
四周型环绕.

Schemas can independently opt into responsive object sizing with
`metadata.objectSizing: {defaultWr, defaultAr}`. Such blocks persist `props.wr`
as a percentage of the nearest sizing plane width and `props.ar` as
width/height. The normal plane is the root children content width; a direct
`object-group` child uses its fixed outer `props.width` minus the two 8px
horizontal insets. `doc.objectSizing`
owns the single root `ResizeObserver`, resolves
live dimensions for mounted blocks, and supplies model-only height estimates to
virtualization and sparse pagination. Built-in image and video blocks opt in;
mounted legacy images migrate pixel `width/height` to `wr/ar` after their first
successful intrinsic-size load while preserving the current capped visual
width. Other object types retain legacy pixels until their own explicit
migration path.
Visual resource loading is composed on top of that stable frame through
`BcResourcePlaceholderDirective`; it is not a `DocConfig`, Schema or
`doc.*` capability. The built-in image/video blocks and Snapshot Viewer show
the same neutral skeleton while loading and preserve the frame on error with
an in-place retry action. Built-in local image creation inserts the block
immediately, preserves the local preview plus upload-progress state, then uses
the first successful preview dimensions to persist `ar` and a placement-plane-
relative `wr` capped by the current parent content width. Remote and legacy images
without stored responsive dimensions start from the Schema default and
backfill complete `wr/ar` on the first successful mounted load without adding
Undo history. Continuous virtualization and
sparse pagination share one DOM-free model estimator for `wr/ar` media and
inline-object `width/height`. Wrapped inline images, shapes and WordArt
additionally reserve their contained object-plus-gap height and estimate
constrained text lines. Images read persisted `side/x/gap`; Shape and WordArt
read `x/gap` and always use automatic wrapping geometry. Eligible centered
automatic objects use the combined left-plus-right interval capacity;
sequential wrapped anchors reserve non-overlapping exclusion bands. Ordinary
measured text heights are not overwritten by fallback estimates.
The layout and absolute descendants have no gap-cursor eligibility. Stale gap
selection snapshots degrade to whole-object selection, and normal gaps are
restored when an object returns to relative flow. While a whole absolute object
is selected, ordinary typing, IME, Enter, Tab and paste are isolated from the
document input path; Delete/Backspace and object tools remain available.
Under-content blocks can be selected again from a narrow
visible edge band through model selection. Placement containers use explicit
background / under / flow / over tiers, so under blocks remain visible and
over blocks stay above text, image, video, audio and bookmark blocks regardless
of DOM order. The built-in image Schema opts in.
Ordinary reconciliation also performs only constant-time local
revision/length checks. Detected index/height drift is rebuilt on a cold path;
three consecutive reconciliation failures permanently switch that document to
complete root mounting and issue one host message warning, preserving editing
when sparse rendering cannot recover. The fallback first reconciles canonical
root order, clears all virtual spacers and stops height/scroll window work so a
failed mount cannot leave stale blank geometry behind.
`doc.virtualization.viewChange$` emits only when the mounted root-ID window
actually changes, allowing view plugins to bind and release DOM projections
without subscribing directly to scroll events.
Scroll frames still resolve the projected range, but a frame whose projection,
segments, mounted/retained IDs and absolute-placement visibility are unchanged
skips component, `HeightObserver`, spacer and `viewChange$` reconciliation.
`HeightObserver` retains the last layout stride per `Element` across
detach/reattach and ignores drift of at most `0.5px`; a replacement element or
larger change is measured normally. Sparse pagination applies the same boundary:
a warm retained host performs no pagination measurement, while a recreated host
is verified once and equal canonical geometry stops before full pagination or
scroll-anchor restoration.
Local selection classes consume the same signal. Explicit whole-block
selections keep their generic selected/focused interaction state. Native-backed
ranges, including mixed whole-block↔text endpoints, add no generic block
pseudo-selection to covered editable,
void or structural blocks; a text range wholly inside one editable keeps only
that owning block's `.focused` editing chrome. Inline Embeds use their separate
atomic fallback class. Root ranges therefore leave the model-only absolute
placement plane unpainted, and virtual scrolling cannot reveal object handles
or stack block-sized fills over the native highlight. Newly mounted fragments
are reconciled from the current model selection without enumerating the complete
range. A
non-collapsed virtual-root boundary Range anchors inside its adjacent pinned
block edges rather than mutable offsets on the root container, so replacing
intermediate DOM cannot shrink it. The Range is also reasserted from the
canonical model after each changed mounted-ID window as an endpoint-rerender
safety net. The repair preserves
anchor/head direction, touches only endpoint views, and is skipped during
an actual held primary-pointer drag and IME composition. While its bounded
endpoint projection is pending, transient browser `selectionchange` cannot
shrink the canonical model selection; a new pointer intent cancels that retry.
`await doc.navigateToBlock(blockId)` is the public stable-ID navigation API for
both full and virtual rendering. It can be called before document
initialization, waits for the view lifecycle, and resolves `true` only when the
reachable target is mounted and revealed. A newer request supersedes an older
one; missing, stale, or destroyed targets resolve `false`. Navigation never
writes model/native Selection or focus. In virtual mode it delegates to the
lower-level `doc.virtualization.scrollToBlock(blockId)`, which uses the height
index for an estimated jump, mounts only the containing root unit, then measures
the requested nested/root host until its center is stable (or bounded by the
document edge). The operation owns only a bounded transient pin.
Collaboration cursors consume that deduplicated window to reproject only their
mounted `FakeRange` fragments. Remote selections never pin local block views;
scroll coordination is bounded by remote cursor count and mounted root count,
not document or selected-range length.
Temporary view-bound interactions can hold
`doc.virtualization.acquireBlockViewLease(blockIds)`. The lease mounts only the
containing root units, follows stable IDs across structure changes, and must be
released from symmetric teardown. Internal block dragging uses it for sources
after Selection is cleared, without adding work to pointer movement.
Exact whole-document view consumers can hold
`doc.virtualization.acquireFullDocumentViewLease()` and must release the
returned function. The default live-pagination compatibility path manages this
automatically; experimental sparse pagination does not acquire it. Ordinary
model-only capabilities must stay on `doc.model` / `doc.exportSnapshot()`.

### Block-Level Readonly

```typescript
const doc = new BlockCraftDoc({
  // ...
  currentUserId: currentUser.id,
  defaultBlockLockKind: 'user', // optional; template authoring hosts may use 'template'
  canUnlockBlock: ({currentUserId, lockKind}) =>
    lockKind === 'template'
      ? templatePermissions.canEditTemplate(currentUserId)
      : currentUserId !== null && permissions.isAdmin(currentUserId),
})

doc.setBlockReadonly(blockId, true)
doc.setBlockReadonly(templateRegionId, true, {kind: 'template'})

doc.isBlockReadonly(blockId)                  // effective: self / ancestor / document
doc.canUnlockBlock(blockId)                   // resolved owner / host permission
doc.readonlyManager.isExplicitReadonly(blockId)
doc.readonlyManager.resolve(blockId)          // { readonly, source, lockUserId, lockKind }
doc.readonlyManager.containsReadonly(blockId) // locked block anywhere in subtree

doc.setBlockReadonly(blockId, false)
```

`meta.lock?: string` persists the explicit lock owner's non-empty user ID and
is synchronized through Yjs. `meta.lockKind?: 'template'` distinguishes a
template-authored invariant from an ordinary user lock; missing or unknown
values resolve as `'user'` for backward compatibility. `DocConfig.currentUserId`
owns new locks. An ordinary user lock can be removed by the same user or a host
`canUnlockBlock` grant. A template lock always requires that host grant—even
when `currentUserId === lockUserId`—so an instantiated document cannot become
unlockable merely because the template creator later uses it.
`DocConfig.defaultBlockLockKind` changes the kind created by generic editor
lock controls; an explicit `setBlockReadonly(..., {kind})` wins. Without a
current user, unlocked content remains editable but lock control is disabled.
A lock is inherited by every descendant. Text/format/props changes, insertion into the
protected subtree, removal/move of the protected block, and removal/move of an
unlocked ancestor containing a protected descendant are rejected with
`BlockReadonlyError`. Unauthorized lock control throws `BlockLockError`.
Selection, copy, link activation, media preview and download remain available;
copied snapshots deliberately omit both `meta.lock` and `meta.lockKind`. Root
cannot receive a persistent block lock—use
`doc.toggleReadonly(true)` for whole-document mode.

Rendered block hosts expose `data-bc-readonly` plus
`data-bc-lock-kind="user|template"`. The base theme decorates ordinary explicit
locks. Template locks remain visually neutral unless an authoring ancestor has
`data-bc-reveal-template-locks`, while their write guards remain identical.

Legacy `meta.readonly` is not read or migrated.

Rejected user writes (`input`, clipboard, drag, menu and undo/redo triggers)
are forwarded once per second to `DocMessageService.warn` with the built-in
"内容已锁定，无法修改" feedback. Programmatic `api` writes only throw
`BlockReadonlyError` and do not create UI messages.

Readonly is a trusted-client editing policy, not a server authorization
boundary. Every collaborating client must run compatible guards; validate
permissions again on the persistence/server boundary when security matters.

### Pagination Plugin

```typescript
const pagination = new PaginationPlugin({
  enabled: false,
  pageSize: 'A4',
  margins: {top: 72, right: 72, bottom: 72, left: 72},
  header: {center: '{page:roman-upper}', distance: 48},
  footer: {right: '第 {page:chinese} 页 共 {total:chinese} 页', distance: 48},
  printShortcut: true,
  experimentalSparseView: true, // Phase C opt-in; requires root virtualization
})

plugins: [pagination]

pagination.enable()
pagination.updateConfig({orientation: 'landscape'})
await pagination.exportToPdf('document.pdf') // browser print dialog; current stable page layout
await pagination.print()
pagination.disable()
```

`PageChrome.distance` 独立表示页眉距纸张顶部、或页脚距纸张底部的像素距离。
`PageChrome.content` 可以为左/中/右区域提供可序列化的图片与文本项；结构化文本项同样支持
`{page}` / `{total}` token，且 live 页框与固定 PDF 页盒使用同一个 DOM 构建器。宿主应先把品牌、
日期等业务参数解析成最终 content，框架不识别业务 token。`separator` 可为页眉/页脚增加通用分隔线。
缺省时继续沿用对应上/下页边距以兼容旧布局；显式距离让页眉/页脚优先占用页边距带，
只有越过正文边界的部分才压缩正文。除 `{page}` / `{total}` 外，数字 token 还支持
`:roman-upper`、`:roman-lower`、`:chinese` 样式，live、打印和 PDF 使用同一套解析。

分页启用状态属于插件，不属于 `DocConfig`；不要使用 `DocConfig.pagination` 或 `doc.pagination`。插件关闭时会移除页框、块间距、表格视图断点和高度锁定，且不会写入 Yjs。`experimentalSparseView` 默认 `false`，默认路径仍持有整文档视图租约以保证实时精确几何；设为 `true` 且开启根虚拟化后，分页 Projection 驱动窗口与 spacer，离屏块允许先用估算几何并在挂载后收敛。该实验路径不会把非 exact 结果交给打印/PDF，而会使用完整只读重排。`exportToPdf()` 使用真实只读 BlockCraft 组件，snapshot-viewer 不参与分页 PDF；浏览器走系统打印，Tauri 等宿主通过 `PaginationPdfHostBackend` 打印当前顶层导出 WebView，正文不经过 DOM 栅格化。

宿主业务块若需要在导出副本中重新取数，应传入
`PaginationPdfOptions.prepareDocument({doc, root, signal})`：该回调只接收由同步快照创建的
readonly 隔离文档，并且必须在所有业务视图达到可测量状态后 resolve。BlockCraft 随后统一等待
图片、字体以及 DOM/块尺寸连续静默，再开始分页计算；不要让回调读取或等待 live doc。

Word 式一致性下，页面稳定布局是唯一分页真相：宿主可在隔离副本上调用
`PaginationPlugin.captureStableLayout()`，并把它原样传给打印面。确定页槽本身已占满一张物理纸，
所以只依靠固定槽高自然分页，严禁再给相邻槽叠加 `break-before` / `break-after`，否则 WebKit 会在
每两个逻辑页之间生成一张空白纸。`@page`、镜像根和页槽共用同一物理 `mm`/`in` 尺寸；宿主原生
后端必须保持 1:1，不能再做 shrink-to-fit。
统一打印面会在资源等待和稳定布局校验前，幂等地给每个 render provider 的根流补入
零尺寸尾哨兵。宿主因此无需自己伪造辅助节点；即使自定义 provider 返回的是关闭分页后的纯文档
root，末个块也不会因重新命中 `:last-child` 而在校验前丢失 `margin-bottom`。

root 尾部的 `placement-layout` 是全局 absolute 平面，导出会按 `sheetHeight + pageGap` 逐页投影，
不作为普通零高 slot 搬到末页。宿主文档头通过 `PrintRenderResult.leadingContent` 传入；BlockCraft 会
先把同一 DOM 挂进最终纸张、最终正文宽度的 staging context，等待资源与尺寸稳定，再与
`firstPageContentHeight` 校验，并以独立 z=2 层放回首页。不要复制成 synthetic block，也不要在宽度
不同的宿主容器里提前测高。打印正文根保留
`data-bc-placement-container`，确保 under / flow / over 层级与编辑界面一致；plane 在 flow、live
分页和打印中都固定以 root content box 的 `0/0` 为原点并占满 content width。固定
`position.x/y` 不包含 root padding，也不存在百分比坐标兼容分支。
非空 placement 快照缺少只读 DOM 时，strict 导出以 `layout-diverged` 失败，不能静默丢对象。
自定义 render provider 若会在分页稳定后关闭分页或改写 root 尺寸，必须先调用
`captureStablePrintPlacementPlanes(root)`，再通过 `PrintRenderResult.placementPlanes` 返回 detached
plane 快照。此后打印只消费这份快照，不回退读取切换后的 root；快照同时保存每个 absolute block
相对 plane content-box、已抵消宿主缩放的可视 bounds。构页仅验收第一页规范投影，strict 漂移失败、
best-effort 记录 warning，复杂度保持 O(objects)。
`PaginationPlugin.captureStableLayout()` 会在同一个同步导出屏障中，直接把分页模型解析出的
content-box 原点和宽度写入 `StablePaginationLayout`：X 来自左页边距，Y 来自正文起点与首页
documentHeader 占位，宽度来自纸宽扣除左右页边距。这里不读取 DOMRect，宿主 padding、CSS zoom
与 WebView transform 不会进入布局数据。打印面仅用该稳定几何验收 content-box 契约；第一页 plane
固定 `top/left=0/0`，后续页只应用连续分页步长的纵向投影。
`PrintRenderResult.placementOriginX/Y/placementWidth` 仅保留为兼容诊断输入。稳定布局已经扣除首页
documentHeader、但只读 provider 无法重建其 DOM 时，固定页盒仍会保留相同的首页正文起点，
不能让 flow 上移而 absolute plane 留在原处。
分页 surface 的 `min-width` 固定为当前纸宽：窄宿主中不能只让绝对定位的 sheet 居中、却让
过宽 flex root 因 Chromium safe alignment 回退到左对齐，否则整个 root content box 会相对纸张
右移半个溢出宽。分页 root、sheet 和外部 document header 统一使用同一包含块内的
`left:50% + translateX(-50%)` 中线公式；root 不再依赖 flex center。超出宿主的纸张通过横向
滚动查看，不压缩或改变模型坐标。

WordArt 的编辑、只读、snapshot 与行内展示统一使用真实 CSS 文字节点；字体几何、填充、渐变、
描边、阴影、艺术变形、caret 与选区不再拆成 HTML/SVG 两套字形。WordArt 是 plain-text block，
其后代 blot 强制继承同一 presentation；该直连规则不依赖 `[data-blockcraft-root]`，所以选中态与
挂到 `document.body` 的拖拽 proxy 也不会恢复黑色行内样式。分页打印保留稳定 clone 的真实文字盒，
不读取 Range/DOMRect。WKWebView 原生 PDF 对 `background-clip:text` 渐变存在整块矩形误绘，
因此打印时只把渐变填充确定性降级为首个 gradient color；solid fill、字体尺寸、描边、阴影和
transform 保持不变。

内置标题段落不再自动与下一块绑定。任一可拆顶层文本块只要自身不高于一张完整正文页，
就始终作为完整 Block 放置：当前页放不下时整块移到下一页，即使当前页剩余空间能容纳
若干视觉行也不会提前拆分。只有文本块自身高过完整正文页时，分页器才惰性解析安全视觉
行首，并以“布局像素切点 + Y.Text offset”计划跨页；屏幕插入零模型长度透明页缝，打印/PDF
消费同一稳定 fragment。若段落含四周型环绕对象，对象与它占用的 shell/group 视觉带作为
一个不可拆的行内区间，但区间前后的安全视觉行仍可跨页。该投影不写 Yjs，也不创建
Undo 历史。

当一个真实表格行因超长单元格而高过页面内容区时，分页器会惰性收集单元格直属 Block 边界和 Editable Block 的视觉行首，在同一逻辑单元格内生成可逆续排。各列可以在不同安全锚点换页，屏幕投影只插入零模型长度页缝，不拆 Yjs 行/单元格，也不创建 Undo 历史。表格的虚拟内容高度、屏幕内部页缝和后续顶层 Block 共同进入同一布局坐标系，因此表格下方内容不会再沿用表格的自然高度而向上漂移。IME composition 期间保留上一版稳定布局，结束后再重排；打印/PDF 消费同一稳定锚点快照。

`DocExportManager` 只提供 JSON、Markdown 与 PDF/打印导出，不再提供 `exportToJpeg()` 或 DOM-to-image 渲染配置。需要位图截图的宿主应在应用层选择并维护独立的截图方案。

### Snapshot Viewer (Display Only)

```typescript
import { createSnapshotRenderer } from '@ccc/blockcraft'

const renderer = createSnapshotRenderer({
  resourcePolicy: 'eager',
})

renderer.render(containerEl, rootSnapshot)
renderer.update(nextRootSnapshot)
renderer.destroy()
```

```html
<bc-snapshot-viewer [snapshot]="snapshot"></bc-snapshot-viewer>
```

### Markdown Stream Viewer

```typescript
import { createMarkdownStreamViewer } from '@ccc/blockcraft'

const viewer = createMarkdownStreamViewer({
  container: hostEl,
  viewerOptions: {
    resourcePolicy: 'eager',
  },
})

viewer.append('# Hello\\n\\n')
viewer.replace('# Hello world\\n\\nUpdated paragraph\\n')
viewer.finish()
viewer.destroy()
```

Use this path when the source arrives as Markdown chunks or full-text rewrites rather than prebuilt snapshots.

### Default Inline Embeds

Document-library icon deltas are available without explicit registration:

```typescript
const icon = {insert: {icon: 'bc_icon bc_document'}}
```

The default converter preserves the complete iconfont class string on an
`<i data-icon="…">` element. `INLINE_ICON_EMBED_KEY` and
`inlineIconEmbedConverter` are public exports, and an explicit same-key entry
in `DocConfig.embeds` overrides the built-in converter.

Every mounted inline Embed, including host-registered converters, receives the
ephemeral `.bc-inline-embed--selected` class on its outer `c-element` while a
local model selection fully covers that Embed's one-length range. The base
theme paints a background for the otherwise invisible native selection across
`contenteditable=false` content. This also keeps the first Shift+Arrow step
across an Embed visible. The class is presentation state only and is never
serialized into Delta content.

Inline images are also built in:

```typescript
import {createInlineImageDelta} from '@ccc/blockcraft'

const image = createInlineImageDelta(
  'https://cdn.example.com/a.png',
  320,
  180,
  {wrap: true, side: 'auto', x: 0.24, gap: 12},
)
// {
//   insert: { image: url },
//   attributes: {
//     width: 320, height: 180,
//     wrap: true, side: 'auto', x: 0.24, gap: 12,
//   },
// }
```

`image` is available without explicit `DocConfig.embeds` registration. A host
can override the renderer by registering its own same-key converter. Mixed
HTML/Markdown images round-trip as inline embeds; standalone Markdown images
and `<figure><img></figure>` retain image-block semantics.

The optional fourth argument enables square text wrapping for the existing
one-length inline Embed. `side` is `'auto' | 'left' | 'right'`, `x` is the
normalized horizontal start inside the owning editable container, and `gap`
is a non-negative CSS-pixel distance. Missing `wrap` keeps the previous
ordinary inline behavior. HTML preserves these fields as `data-bc-wrap*`;
Markdown intentionally degrades to a normal inline image.

`side: 'auto'` uses Word-like text flow on both sides when both intervals are
at least 96 CSS pixels wide; near an edge it falls back to the wider side.
Explicit `left` and `right` remain single-sided. Multiple anchors are processed
in Delta order, and a later overlapping exclusion band is pushed below the
earlier one without changing either Embed offset.

An inline image reserves its persisted `width/height` immediately. Missing
dimensions reserve `320 × 240` (4:3) until the first successful load, then
`ImgToolbarPlugin` backfills both short delta attributes in an
`ORIGIN_NO_RECORD` transaction. Loading failure keeps that frame visible and
offers the same retry control as block media. Embed teardown destroys the
resource controller both on blot detach and when semantic attributes replace
the embed view. The default renderer marks the real `<img>` non-draggable and
capture-cancels residual native `dragstart`; inline-image movement never relies
on browser `deleteByDrag` / `insertFromDrop` DOM mutation.

With `ImgToolbarPlugin`, clicking the default inline image shows proportional
resize handles, a temporary theme-colored selection outline, plus the shared
object-layout choices: **嵌入型 / 四周型环绕 / 上下型 / 衬于文字下方 /
浮于文字上方**. Four-sided wrapping stays inside the same editable block:
`InlineRuntime` moves real TextBlot DOM into reversible local left/right row
fragments while the image remains the same one-length Delta anchor. Unsafe or
explicit single-side cases use the contained CSS-float fallback. Selection is
reprojected from the unchanged anchor/head model; IME, native pointer selection
and image dragging hold layout-freeze leases. Wrapped-image dragging moves only
an inert translucent proxy while the committed frame and text layout stay
fixed. The proxy follows both x/y. Pointerup persists normalized `x` and maps y
to a Delta anchor in the same or another compatible editable block, with a
single Yjs transaction; no pixel `y` is stored. Drops on block gaps snap to the
nearest compatible editable block, and drops outside the editor cancel.
Inline-image resize also keeps the committed frame and text layout frozen. An
inert body-level outline with a live `width × height` label follows the target
proportional size without entering the editable row fragments; pointerup commits
the short `width` / `height` attributes once and, for a moved wrapped left edge,
updates the existing normalized `x`. Escape, pointercancel, window blur,
readonly and stale-anchor teardown cancel without a model write. Reverse
conversion preserves the formatted text on both sides
as separate editable blocks and inserts the image block between them; it does
not create a caption. Choosing under/over creates the block directly at the
inline image's current visual coordinates.

### Bundled Inline Shape and WordArt

`createBundledEditorCapabilities()` includes fresh `shape` and `word-art`
Embed converters. `ShapeToolbarPlugin` and `WordArtToolbarPlugin` expose
**嵌入型 / 四周型环绕** in addition to their block layouts. The conversion
stores normalized object props and text Delta in one primitive JSON Embed value
and keeps compact layout attributes. Shape and WordArt use
`width/height/wrap/x/gap` and have no persisted `side`. An absolute
object visibly covering editable text enters that covered line directly;
otherwise it uses the nearest visual flow anchor.

Clicking either inline object calls `setInlineRange(offset, 1)`, so the
canonical selection and DOM Range both cover the Embed for copy/cut. The
layout-only toolbar can restore a top-bottom/under/over block. Neither inline
Shape nor WordArt exposes 自动环绕 / 文字在左 / 文字在右 controls:
**四周型环绕** is the sole text-wrapping mode. A click selects and opens the
toolbar without creating a drag proxy; movement must cross 2px before dragging
starts. Detailed object editing resumes on the restored block. HTML preserves
the payload and wrap metadata, while Markdown degrades to readable text.

The block shape catalog exposes 103 `SHAPE_KINDS` through eight
`SHAPE_CATEGORIES`: rectangles, basic shapes, lines, block arrows, equation
shapes, flowchart, stars/banners and callouts. The fixed insertion toolbar uses
the categorized picker; the selected-shape toolbar does not expose a
change-shape control. Line/connector appearances are visual, non-filled and
textless; they deliberately do not claim semantic endpoint attachment. WordArt
exposes 16 visual presets, 10 safe font families and 15 allowlisted whole-text
transforms without adding raw CSS to the model. Picking a shape or WordArt
preset from the fixed toolbar now arms a one-shot document drawing surface
instead of inserting immediately. This path does not require a focused block or
active Selection. Dragging previews and commits an exact scale-normalized
rectangle on pointer release; clicking without a drag uses the selected
object's default dimensions. Cancel, blur, viewport movement, readonly and
teardown paths leave Yjs unchanged.

The selected WordArt block uses the same compact two-level toolbar structure as
TextBox: a left/right vertical rail keeps **布局 / 艺术字格式 / 删除** visible,
while layout and formatting open as one click-owned secondary card inside the
same connected Overlay. Both secondary cards are capped at 288px; the format
card groups the existing controls into 字体、填充与轮廓、效果 sections. Its generic form fields
use CSES Select、Segmented、InputNumber、ColorPicker、Slider and Switch
components. Opening or switching a card writes no model data; slider previews
stay local, and only a concrete or completed control action emits the existing
props update.

### DocChain (Fluent Mutations)

```typescript
doc.chain()
  .insertAfter(currentBlock, 'paragraph', 'Hello')
  .setCursorAtBlock(newBlock)
  .run()
```

### Collaboration Cursor Lifecycle

```typescript
import { BlockCraftAwareness } from '@ccc/blockcraft'

const cursorAwareness = new BlockCraftAwareness(doc, provider.awareness, {
  shouldRenderRemoteCursor: state => state['status'] !== 'viewing',
})
cursorAwareness.setLocalUser({
  id: currentUser.id,
  name: currentUser.name,
  color: currentUser.profileColor, // optional concrete CSS color
})
cursorAwareness.setLocalCursorEnabled(canEdit)

// With root virtualization, offscreen remote selections remain model-only and
// reappear automatically when their root units enter this client's view.

// Required when leaving a room without destroying the document.
cursorAwareness.destroy()
```

`setLocalCursorEnabled(false)` clears only this client's broadcast cursor;
remote cursor projection and the Awareness connection stay active. Re-enabling
publishes the current canonical BlockCraft selection immediately, so host
presence layers can model editing/viewing without forking the cursor runtime.

When `color` is omitted or invalid, the user ID maps deterministically to the
built-in collaboration palette. The same user therefore keeps the same color
across clients and reconnects. Labels and collapsed carets use the solid color;
remote ranges use the same color at 18% opacity. Color resolution is cold
user-state work and never runs from selection, scroll, or view refresh paths.

### Doc Services Index

Key services accessible on `doc.*` (see `blockcraft-app.md` for full API details):

| Service | Description | Source file |
|---------|-------------|-------------|
| `doc.dragController` | 内部 block 拖拽（PointerEvents） | `framework/services/internal-drag.controller.ts` |
| `doc.dndService`     | 外部文件拖入 + commit 类方法分发  | `framework/services/dnd.service.ts` |
| `doc.objectSizing`   | root 相对对象尺寸解析与宽度观测 | `framework/services/block-object-sizing.manager.ts` |
| `doc.viewScale`      | 文档视觉缩放、快捷滚轮与布局/视觉坐标换算 | `framework/services/document-view-scale.manager.ts` |
| `doc.overlayService` | CDK Overlay wrapper | `framework/services/overlay.service.ts` |
| `doc.clipboard`      | ClipboardManager | `framework/modules/clipboard/` |
| `doc.selection`      | SelectionManager (anchor/head model) | `framework/modules/selection/` |
| `doc.event`          | UIEventDispatcher | `framework/block-std/event/` |

- 复制过滤：`DocConfig.copyFilter` / `doc.clipboard.registerCopyFilter()`（按 flavour/属性过滤 + transform 逃生舱；详见 blockcraft-app.md / blockcraft-plugin.md）
- 粘贴优先级：internal snapshot → 有道云 `text/yne-json`（`adapters/yne-adapter/`）→ `text/html` → 纯文本。有道云内容走专用高保真路径，失败回退 HTML。

### Block Property Updates

```typescript
// Inside a block component
this.updateProps({ color: '#ff0000' })  // Creates undo history
this.setInitProps({ color: '#ff0000' }) // No undo history

// From outside
block.updateProps({ style: 'dashed' })
```

### Selection (anchor/head model)

```typescript
// Read
doc.selection.value                     // BlockSelection | null; ids missing from BlockModelGraph read back as null
doc.selection.selectionChange$          // BehaviorSubject<BlockSelection | null>; stale model ids are cleared before emit
doc.selection.getSelectedText()         // string

// A BlockSelection has:
//   .anchor / .head        — discriminated ISelectionPoint (text | selected | gap | boundary | table-cell)
//   .start / .end          — same points but document-ordered
//   .firstBlockId / .lastBlockId — model-safe content edge IDs
//   .firstBlock / .lastBlock     — mounted component compatibility accessors
//   .collapsed / .isInSameBlock / .isAllSelected / .isStartOfBlock / .isEndOfBlock
//   .direction             — 'forward' | 'backward'
//   .isAllSelected         — true only when both endpoints are whole-block selected points
// Programmatic writes (`setSelection`, `setCursorAt`, `extendTo`, block cursor
// helpers, block/gap/table selection, replay) synchronously publish this model
// before deriving the native DOM Range. Cross-block order/common ancestry comes
// from BlockModelGraph parentId/childrenIds, not mounted components, DOM
// compareDocumentPosition or layout reads. Liveness, boundary coverage and text
// edge predicates also stay valid while endpoint components are virtualized.
// Before broadcasting, SelectionManager checks only endpoint IDs plus
// boundary-adjacent children and synchronously materializes that neighborhood
// when a view is missing. This keeps firstBlock/lastBlock safe for synchronous
// observers without mounting the full selected range on the input hot path.
// If a live selection cannot be projected because its DOM is still mounting,
// the model remains canonical. An optional SelectionProjectionMountAdapter can
// mount only endpoint IDs plus boundary-adjacent children before SelectionManager
// performs its bounded, version-guarded projection retry. Root virtualization
// additionally leases only the root render units containing the two endpoints.
// Root boundary pairs keep [start, end) model semantics while their middle can
// unmount; a collapsed root boundary leases the adjacent caret unit. Selection
// changes or blur release units no longer owned. Copy, selected-text reads and
// toolbar formatting resolve covered middle blocks from BlockModelGraph/Yjs.
// Deduplicated mounted-window changes reassert non-collapsed cross-root DOM
// anchor/focus from the model without scanning the selected middle or running
// on every raw scroll event.
// Explicit blur/stale endpoints still clear the canonical selection.
// A revisioned internal Relative Selection Bookmark maps the current local
// selection through relevant remote Yjs text/children changes before DOM is
// considered. Text/boundary endpoints use Y.RelativePosition; ancestor-only
// changes replay only when the endpoint parent path or sibling index moved.
// Successful mapping calls replay() once. recalculate() is a guarded failure
// fallback only when the editor still owns both native Range endpoints.
// DocCRUD only publishes before/after remote view-sync facts; Selection owns
// bookmark capture/reconciliation. Undo bookmarks live on Yjs StackItem.meta,
// and SelectionHistoryRestorer owns focus + bounded DOM/model verification.
// Native Selection, focus, frame scheduling, Range creation and geometry are
// centralized behind the internal zero-cache SelectionSurfaceAdapter.
// Non-collapsed container-boundary DOM endpoints normalize to boundary points:
//   { blockId: container.id, type: 'boundary', index: childBoundaryIndex }
// Programmatic boundary ranges project to adjacent child text/gap edges so a
// nested editable container paints a visible native selection; exact DOM
// resampling retains the canonical boundary model.
// Same-container boundary ranges in paragraph-capable renderUnit containers
// support Yjs-owned replace/delete/IME materialization.
// Shift+Arrow over void/container gap blocks, and Shift+Arrow leaving a
// container from its first/last child, use parent boundary endpoints; the
// derived DOM Range prefers the block's leading/trailing gap text anchors.
// Native drags crossing a closed selection scope publish the repaired model
// and stabilize native anchor/focus on those gap-backed boundaries while
// preserving forward/backward direction.
// DOM sampling validates both native endpoints against root before normalize;
// a WebKit range leaked outside a focused editor is cleared, while a current
// model-owned table-cell rectangle remains canonical.
// Existing non-collapsed text anchors stay text points; InputTransformer safely
// replaces supported mixed text+boundary ranges without falling back to DOM input.
// Table rectangular selection can be model-owned as table-cell anchor/head:
//   { blockId: cell.id, type: 'table-cell', tableId: table.id }
// Read the rectangle intent via selection.getTableCellSelection(). Empty native
// selectionchange events do not clear it while the editor host keeps focus.
// Rectangle coordinates/merged-cell closure and data commands resolve against
// doc.model stable IDs; unmounted middle cell components are not required.
// TableBlock only paints mounted cells, and malformed model grids fail closed.
// getSelectionRect()/getSelectionRects() return null for table-cell selections
// because they are model-only and do not expose a derived DOM Range.
// Gap cursor is model-owned as a gap point; the derived DOM Range anchors inside
// the gap filler's zero-width text node for Safari/WebKit native caret painting.
// Non-collapsed boundary ranges that use a child block's gap text anchor or
// void/container chrome round-trip back to parent boundary points; same-block
// leading→trailing gap/chrome ranges stay selected.
// Recalculated cross-parent DOM ranges are accepted only inside the same
// semantic scope. Scopes come from schema `metadata.selectionScope`
// (`document`, `table`, `columns`, `container`; omitted/`transparent` inherits
// the nearest ancestor scope). root.id is the commonParent used to address
// top-level children and is the topmost document scope.
// When native drag crosses a closed scope, the internal endpoint is projected
// to the scope block's parent boundary instead of collapsing the whole range.
// Input/IME behavior reads SelectionScopePolicy; columns preserves
// cross-column text tails. Native-backed ranges do not reuse generic
// selected/focused interaction classes for their covered blocks.

// Type-narrowing example
const sel = doc.selection.value
if (sel && sel.start.type === 'text') {
  const blockId = sel.firstBlockId             // safe even when component is unmounted
  const offset = sel.start.offset              // number
}
// point.block / firstBlock / lastBlock require a mounted block component and
// may throw outside the rendered viewport. Use them only in view/DOM code.
if (sel && sel.start.type === 'gap') {
  const voidBlock = sel.start.block            // BaseBlockComponent (void/container)
  const side = sel.start.side                  // 'before' | 'after'
}
if (sel && sel.start.type === 'boundary') {
  const container = sel.start.block            // BaseBlockComponent (block/root)
  const index = sel.start.index                // child boundary index
}
if (sel && sel.start.type === 'table-cell') {
  const cell = sel.start.block                 // table-cell block
  const tableId = sel.start.tableId
  const rectangle = sel.getTableCellSelection()
}

// Write
doc.selection.setCursorAt(editableBlock, offset)
doc.selection.setCursorAtBlock(block, atStart, scrollIntoView?)
doc.selection.selectBlock(block)               // whole-block selection; updates value synchronously
doc.selection.setGapCursor(block, 'before' | 'after', scrollIntoView?)  // gap cursor; updates value synchronously
doc.selection.setTableCellSelection(table, anchorCell, headCell?, scrollIntoView?) // model-owned table rectangle
doc.selection.extendTo(editableBlock, offset)  // shift+click
doc.selection.selectAllChildren(block)         // editable text range; container/root boundary range
// Ctrl+A boundary: inside a container scope (text-box/callout), the first press
// selects the container's complete child boundary range. Repeated presses stay
// there only when the container is inside an absolute object; normal-flow
// containers continue through their parent to root.
doc.selection.blur()                           // clear

// Optional virtual-renderer bridge. The disposer and AbortSignal cancel stale
// work on renderer teardown, newer selection intent, or document destruction.
const unregisterProjectionMount = doc.selection.registerProjectionMountAdapter({
  ensureMounted(blockIds, signal) {
    return virtualRenderer.ensureBlocksMounted(blockIds, {signal})
  },
})

// Persist & restore
doc.selection.value?.toJSON()                  // ISelectionJSON
doc.selection.replay(savedJSON)                // sync model commit; DOM projection may catch up asynchronously

// Explicit browser DOM -> model sampling. Use only at native event/mutation
// boundaries, never to confirm a programmatic selection write.
doc.selection.recalculate()

// DOM adapter: prefer the exported pure normalizer and endpoint points.
const endpoints = normalizeRange(staticRange, id => doc.getBlockById(id))
// doc.selection.normalizeRange(staticRange) returns legacy INormalizedRange
// and is deprecated compatibility only.
```

> The legacy `selection.from / selection.to / selection.from.index` shape is **deprecated** but still parsed for backward compat. New code MUST use `anchor / head / start / end` and narrow on `point.type` before reading `offset`. See `blockcraft-selection.md` for details.

### Input (model-native edit planning)

`InputTransformer` adapts a live `BlockSelection` (or normalized native target endpoints) into one pure, short-lived `SelectionEditPlan`, then executes that plan through Yjs. `beforeInput`, printable fallback, Backspace/Delete, Enter, and IME composition share this planner/executor boundary. `deleteByRange()` accepts only `BlockSelection`; browser `StaticRange` adapters use the pure `normalizeRange()` function and `INormalizedEndpoints`. Post-edit cursor recipes commit through model-first selection APIs without a confirming DOM `recalculate()`. Unsupported or stale plans fail closed before native DOM mutation. See `blockcraft-input.md` for the plan kinds, IME ordering, undo grouping, and virtualization constraints.

### Event Handling (in Plugin or Block)

```typescript
@EventListen('click', { flavour: 'image' })
onClick(ctx: UIEventStateContext) {
  ctx.preventDefault()
  return true // consumed
}

@BindHotKey({ key: 'b', shortKey: true })
onBold(ctx: UIEventStateContext) { ... }
```

## Conventions

- All block components use `ChangeDetectionStrategy.OnPush`
- All block components are `standalone: true`
- Block selectors use element+class: `div.my-block`, `p.paragraph-block`
- Void blocks use `contenteditable="false"` on inner content
- Native `input` / `textarea` / `select` inside void or container blocks are treated as isolated "input islands" and bypass editor hotkeys / `beforeInput`; custom widgets can opt in with `data-bc-native-input`
- Container blocks include a `<div class="children-render-container">` for child blocks
- Editable blocks have an empty template; the inline runtime renders into the host element
- All mutations go through Yjs transactions (via `DocCRUD` or `DocChain`)
- Never write `block.props`, `block.meta`, `Y.Text`, or `Y.Map` directly from a
  plugin. The guarded Block/DocChain/DocCRUD APIs enforce block readonly and
  keep local, remote, undo, and rendering paths consistent.
- Full-document transforms must query `BlockModelGraph` and use model-first
  `DocCRUD` mutations. `MarkdownStreamRenderer` follows this boundary so an
  offscreen root block can be patched or replaced without component creation.
- `DocCRUD.deleteBlocks()` does not reposition selection after inserting the fallback paragraph for an emptied `renderUnit`. The owning Input/plugin action explicitly commits the final caret/range through model-first Selection APIs; it must not rely on write-after-`recalculate()` DOM sampling.
- Global type declarations use `declare global { namespace BlockCraft { ... } }`
- Icons use the iconfont class system: `<i class="bc_icon bc_xxx"></i>` (no PNGs,
  no inline SVGs except for multi-color). The built-in shape picker is a narrow
  geometry-preview exception: its exported `ShapeIconComponent` renders the
  same trusted `ShapeDefinition.path` and optional `detailPath` used by the
  actual shape, so it does not maintain duplicate icon resources.
- Generic editor chrome consumes the exact `@cses/ui@4.26.1` peer. Hosts load
  `@cses/ui/styles/cses-ui.scss` for its component styles; standard buttons,
  tooltips, dropdown menus, EmojiPicker, empty states and messages use the
  public API. Editor-owned native text inputs and textareas keep their scoped
  BlockCraft styles so compact overlays retain their intended geometry and
  validation states. BlockCraft theme variables, editor-specific geometry
  controls and existing icon paths remain unchanged.
- Hotkey decorators use `shortKey: true` for cross-platform Cmd/Ctrl — never hardcode `metaKey`/`ctrlKey`
- Empty editable blocks can show placeholder text on focus; `meta.plhMode:
  'always'` makes it persist while the block is empty. Content regions keep
  these fields on an empty editable child rather than on the container.
  Resolution starts at per-block `meta.plh`, then falls back to the Plugin
  flavour override and Schema
  `metadata.placeholder` (see `blockcraft-block.md` → Block Instance Metadata).
- For insertion affordances, query `doc.canInsertChild(parentId, flavour)`.
  It combines the Schema's static child contract with opted-in instance
  `meta.incl` / `meta.excl`; instance metadata can narrow, never widen, the
  Schema.

## Plugins Currently Bundled (from `editor/bundled-capabilities.ts`)

| Plugin | File | Purpose |
|--------|------|---------|
| `FloatTextToolbarPlugin` | `plugins/float-text-toolbar/` | Selection-based formatting toolbar |
| `FixedTextToolbarComponent` | `plugins/fixed-toolbar/` | Top-of-editor toolbar (Angular component, not a DocPlugin) |
| `BlockTransformerPlugin` | `plugins/block-transformer/` | Slash menu / block conversion |
| `BlockControllerPlugin` | `plugins/block-controller/` | Drag handle, block appearance, hover menu, custom block-tool injection |
| `BlockGapCreatorPlugin` | `plugins/block-gap-creator/` | Click between blocks → insert paragraph |
| `PasteFormatSelectorPlugin` | `plugins/paste-format-selector/` | Choose paste format (HTML / Markdown / plain) |
| `OrderedBlockPlugin` | `plugins/ordered-extension/` | Auto-renumber ordered lists |
| `CodeInlineEditorBinding` | `plugins/codeEditorBinding.ts` | Shiki syntax highlighting binding for code blocks |
| `TableBlockBinding` | `plugins/tableBlockBinding.ts` | Table clipboard, model/explicit cell-range keyboard bindings, merge/split helpers |
| `ImgToolbarPlugin` | `plugins/img-toolbar/` | Block/inline image resize, toolbar actions, and bidirectional conversion |
| `ShapeToolbarPlugin` | `plugins/shape-toolbar/` | Shape block/inline selection, styling, inline/wrap conversion, placement, drag, resize and rotation |
| `TextBoxToolbarPlugin` | `plugins/text-box-toolbar/` | Fixed text-box frame/text dual state, Word-style vertical rail and click-owned layout/style/Shape/WordArt settings cards; style-owned editable safe area, placement, drag and stack controls |
| `WordArtToolbarPlugin` | `plugins/word-art-toolbar/` | WordArt block/inline selection, TextBox-style two-level styling toolbar, inline/wrap conversion, placement, drag, resize and rotation |
| `ObjectGroupToolbarPlugin` | `plugins/object-group-toolbar/` | Shift-select contiguous root absolute objects, align/distribute or group them, and enter a selected group's members |
| `CalloutToolbarPlugin` | `plugins/callout-toolbar/` | Callout and content-region appearance picker |
| `DividerExtensionPlugin` | `plugins/divider-toolbar/` | Divider hover toolbar (line/tape/colorful edge style, custom line color, independent length/thickness/opacity, optional text label + typography/alignment/color) |
| `AttachmentExtensionPlugin` | `plugins/attachment-extension/` | Attachment preview/download UI |
| `EmbedFrameExtensionPlugin` | `plugins/embed-frame-extension/` | Resize/replace iframe embeds |
| `BookmarkBlockExtensionPlugin` | `plugins/bookmark-frame-extension/` | Bookmark preview fetch |
| `FormulaBlockExtensionPlugin` | `plugins/formula-extension/` | KaTeX edit panel for formula blocks |
| `InlineLinkExtension` | `plugins/inline-link-extension/` | Link hover card + open behavior |
| `MentionPlugin` | `plugins/mention/` | `@`-trigger with pluggable panel factory |
| `DateInlineExtensionPlugin` | `plugins/date-inline-extension/` | Click-to-edit dialog for the `date` inline embed |
| `FindReplacePlugin` | `plugins/findReplace/` | Cmd+F find & replace |
| `TranslatePlugin` | `plugins/translate/` | Block translation via DI service |
| `PlaceholderPlugin` | `plugins/placeholder/` | Renders focused or persistent placeholders on empty editable blocks; supports per-block `meta.plh` / `meta.plhMode`, per-flavour overrides and Schema defaults |
| `PaginationPlugin` | `plugins/pagination/` | Opt-in live pagination, page settings, print shortcut and WYSIWYG printing |

> A host app can pass any subset of these (plus its own custom plugins) into `DocConfig.plugins`. See `blockcraft-app.md`.
> Hosts that want this exact stack should use
> `createBundledEditorCapabilities()`; manually constructing a subset remains
> supported.

## Architecture Docs (Background Reading)

When you need deep historical/design context beyond the L1/L2 sub-skills, read these documents in the project root:

| Document | Path | Content |
|----------|------|---------|
| Full Architecture | `packages/editor/ARCHITECTURE.md` | Complete technical architecture (~1230 lines) |
| Virtual Rendering | `framework/modules/virtualization/` | Current model-first root virtualization implementation |
| Synced Blocks | `packages/editor/SYNCED_BLOCK.md` | Planned shared content design |

> The L2 deep-dive markdowns in this folder (`blockcraft-selection.md`, `blockcraft-input.md`, etc.) are the **current** source of truth for live mechanisms. The above ARCHITECTURE/SYNCED/VIRTUAL files are background and forward-looking design docs.

## Skill Pack File Index

```
packages/editor/ai-skills/         # also shipped at node_modules/@ccc/blockcraft/ai-skills/
├── SKILL.md                # AI discovery entry (Claude/Codex frontmatter)
├── README.md               # Human installation & usage guide
├── MIGRATIONS.md           # Version-by-version breaking changes & migration recipes
├── install.mjs             # One-command installer for ~/.claude/skills/
├── blockcraft.md           # L0: this file (overview + router)
├── blockcraft-app.md       # L1: embed BlockCraft in a host Angular app
├── blockcraft-plugins-ref.md # L1: built-in插件索引 + 路由（按分类指向下方子文件）
├── blockcraft-plugins-formatting.md # L1: 文本格式化插件（FloatTextToolbar, TextMarker, FixedToolbar）
├── blockcraft-plugins-block.md      # L1: 块管理插件（BlockController, GapCreator, Transformer, Ordered）
├── blockcraft-plugins-toolbar.md    # L1: 块工具栏插件（Attachment, Img, Shape, Bookmark, Callout, Divider, Embed, Formula）
├── blockcraft-plugins-inline.md     # L1: 行内扩展 + 键盘绑定（InlineLink, Mention, Code, Table）
├── blockcraft-plugins-util.md       # L1: 工具类插件（Placeholder, FindReplace, PasteFormat, Demo, Translate）
├── blockcraft-plugin.md    # L1: create plugins
├── blockcraft-block.md     # L1: create blocks (void / editable / container)
├── blockcraft-embed.md     # L1: create inline embeds
├── blockcraft-adapter.md   # L1: HTML/Markdown matchers
├── blockcraft-toolbar.md   # L1: overlays & toolbars (CDK Overlay)
├── blockcraft-theme.md     # L1: theming & CSS tokens
├── blockcraft-debug.md     # L1: debugging strategies
├── blockcraft-perf.md      # L1: performance checklist
├── blockcraft-test.md      # L1: testing strategies
├── blockcraft-selection.md # L2: selection mechanism (anchor/head model)
├── blockcraft-input.md     # L2: input / IME pipeline
├── blockcraft-inline.md    # L2: inline blot tree & runtime
├── blockcraft-event.md     # L2: event dispatcher & decorators
└── blockcraft-data.md      # L2: Yjs data model & CRUD
```

## Versioning & Migrations

The skill pack and the framework are versioned together. Whenever the framework refactors or adds public API, three things move in lock-step in the same PR:

1. The source code in `packages/editor/`
2. The L0/L1/L2 markdowns in `packages/editor/ai-skills/`
3. A new entry at the top of `packages/editor/ai-skills/MIGRATIONS.md`

The version in `packages/editor/package.json` is bumped according to the migration severity (patch / minor / major). See `MIGRATIONS.md` for the complete severity reference card and entry format. **Project rule (`CLAUDE.md` "文档同步规则") requires this for every architectural change — no exceptions.**

If you're upgrading `@ccc/blockcraft` from an older version, open `MIGRATIONS.md` and read the entries between your current version and the new one — you'll find before/after code recipes for every breaking change.

## External Usage (Other Apps & AI Tools)

This skill pack is **bundled with `@ccc/blockcraft`** so any project that depends on the package can use it. Three integration paths:

1. **AI agents (Claude Code / Codex)** — run the installer once:
   ```bash
   node node_modules/@ccc/blockcraft/ai-skills/install.mjs               # Claude
   node node_modules/@ccc/blockcraft/ai-skills/install.mjs --target codex # Codex
   ```
   The agent then discovers `SKILL.md` and follows its routing.

2. **Cursor / Windsurf / Aider / generic agents** — add this rule to your project's `CLAUDE.md` / `.cursorrules`:
   > When working with `@ccc/blockcraft`, ALWAYS read `node_modules/@ccc/blockcraft/ai-skills/blockcraft.md` first. It's the router — it tells you which sub-skill to load for the task at hand.

3. **Human developers** — read the files directly from `node_modules/@ccc/blockcraft/ai-skills/` or browse the source repository.

Full installation options (symlink vs copy, custom paths, uninstall) are in `README.md`.
