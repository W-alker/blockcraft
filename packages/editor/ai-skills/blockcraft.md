# BlockCraft Editor - AI Skill Pack

> **Level 0: Overview & Router** — Always read this first. Load sub-skills on demand.
>
> Last updated: 2026-08-03 | Source: `packages/editor/` (also published inside `@ccc/blockcraft/ai-skills/`)
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
| **Object Layout** | Word-like inline/top-bottom/under/over object states projected onto Schema-gated block placement | `BlockPlacementManager` in `framework/services/` |
| **Object Sizing** | Root-relative `wr/ar` sizing with legacy pixel compatibility | `BlockObjectSizingManager` in `framework/services/` |
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
| `block` | Has block children | `BaseBlockComponent` | callout, columns, column, table, table-row, table-cell, frame, shape, render-unit, placement-layout (infrastructure) |
| `root` | Special — top-level container | `BaseBlockComponent` (root-block) | root |

> **Heading is a prop, not a flavour.** H1/H2/H3 styles live in `props.heading` on `paragraph` blocks. There is no `heading-block` flavour.

### Currently Registered Block Schemas (from `editor/bundled-capabilities.ts`)

`paragraph, ordered, bullet, todo, callout, code, divider, page-divider, image, table, table-row, table-cell, attachment, bookmark, figmaEmbed, juejinEmbed, caption, root, mermaid-textarea, mermaid, blockquote, columns, column, formula, video, audio, shape, shape-text, word-art, placement-layout, render-unit`

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
    overscan: 6,
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

Before a built-in table mounts, continuous virtualization and sparse
pagination estimate its model height from direct `table-row` children instead
of treating every table as one fixed-height card. Each row uses a positive
`props.height`, then `estimatedHeights['table-row']`, then the built-in 60px
fallback; `estimatedHeights.table` remains a floor for the total. This is an
`O(rows)` cold calculation on initial projection, table-row structure changes
and direct row-height prop changes. Nested cell text/props changes do not rescan
the rows on each keystroke. The estimate is not exact print geometry and does
not yet virtualize the table's nested row/cell Component subtree.

This is opt-in and disabled by default. Direct root children are windowed;
their nested tables/columns/callouts remain complete atomic subtrees. Selection
pins only the direct-root units containing its ordered start/end while it is
active. For `boundary(i) -> boundary(j)`, those are the children adjacent to the
two half-open edges; a collapsed root boundary owns the nearest caret-bearing
unit, while a nested selection owns only its containing root unit. The selected
middle remains virtualized and is represented by the canonical model range;
small endpoint gaps may still be coalesced by `segmentMergeGap`. Both Snapshot
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
Stateful schemas can set `metadata.viewRetention: 'keep-alive'`. Once such a
view first materializes, its containing root render unit stays mounted until
block deletion or document disposal; no initial document scan is performed.
Built-in audio, video and iframe embed flavours opt in. Hosts can override a
schema through `virtualization.resolveViewRetention(context)`, including forcing
a built-in block back to `'virtual'`. Policy resolution and lease updates are
cold mount/structure work and add no callback or layout read to scroll frames.
Schemas can independently opt into free block positioning with
`metadata.placement: {modes: ['relative', 'absolute']}`. Placement is persisted
in `props.placement`; absolute state can also carry
`layer: 'under' | 'over'` (`over` is the default and is omitted when persisted).
`doc.placement.setMode()` preserves the current visual position when switching
to absolute. The standard transition is root-only: it lazily moves the object
under one hidden, zero-height `placement-layout` at the end of `root.children`.
`doc.placement.insertAbsoluteSnapshot()` creates a new object directly in that
layout. When materializing the first layout, it inserts the layout and object as
one nested snapshot, so no temporary root-flow object exists.
That infrastructure block is registered by the bundled editor, excluded from
ordinary sibling navigation and BlockController, and removed after its final
object returns to flow. Nested container objects do not support absolute mode.
When returning an absolute block to relative flow, the manager uses the
block's current visual center to find the nearest mounted ordinary flow sibling
and inserts before/after that sibling's midpoint instead of jumping back to the
old logical position. `resolveFlowAnchor()` and `reanchorToFlow()` expose the
same stable-id operation for atomic conversions such as block image → inline
image. Within the root placement layout, `under` and `over` each use
`placement-layout.children` order from back to front, with ordinary flow
content acting as a virtual boundary between the two tiers.
`canMoveForward()` / `canMoveBackward()` query the total stack, while
`moveForward()` / `moveBackward()` persist one adjacent step. Moving the
highest `under` object forward crosses it to the lowest `over` position;
moving the lowest `over` object backward crosses it to the highest `under`
position. Same-tier movement changes only child order; boundary movement
changes order and layer in one Yjs transaction. `setLayer()` remains the
low-level direct tier setter, and `startDrag()`
previews with a transform before committing one `updateProps()` write on
pointer release. Object positioning never uses native HTML5 drag/drop:
`pointercancel`, Escape and window blur all abort through the same cleanup.
These geometry reads only occur on explicit conversion, not
on drag or render hot paths. A host with its own layout domain can adapt mode transitions
through `DocConfig.placement.transitionMode`; returning `true` means the host
completed the transition. With root virtualization enabled, a model-only
vertical index projects each absolute child's root-relative `placement.y` and
estimated height. The zero-height layout mounts when any projected band
intersects the root-relative viewport plus one viewport of pre-rendering, and
can detach when no band or interaction lease owns it. This projection does not
change the normal-flow `HeightMap` and performs no child DOM reads on scroll.
The layout remains one atomic root render unit, so one visible absolute child
currently materializes all of its layout siblings; descendants do not acquire
duplicate per-object leases.
Schemas can independently opt into responsive object sizing with
`metadata.objectSizing: {defaultWr, defaultAr}`. Such blocks persist `props.wr`
as a percentage of the root children content width and `props.ar` as
width/height. `doc.objectSizing` owns the single root `ResizeObserver`, resolves
live dimensions for mounted blocks, and supplies model-only height estimates to
virtualization and sparse pagination. Built-in image and video blocks opt in;
legacy pixel `width/height` remains visually stable until the first completed
resize migrates it to `wr/ar`.
Visual resource loading is composed on top of that stable frame through
`BcResourcePlaceholderDirective`; it is not a `DocConfig`, Schema or
`doc.*` capability. The built-in image/video blocks and Snapshot Viewer show
the same neutral skeleton while loading and preserve the frame on error with
an in-place retry action. Built-in local image creation inserts the block
immediately, preserves the local preview plus upload-progress state, then uses
the first successful preview dimensions to persist `ar` and a root-relative
`wr` capped by the current parent content width. Remote and legacy images
without a stored ratio start from the Schema default and backfill the first
successful ratio without adding Undo history. Continuous virtualization and
sparse pagination share one DOM-free model estimator for `wr/ar` media and
inline-image `width/height`. Wrapped inline images additionally reserve their
contained image-plus-gap height and estimate constrained text lines from
persisted `side/x/gap`. Eligible centered `side: 'auto'` images use the
combined left-plus-right interval capacity; sequential wrapped anchors reserve
non-overlapping exclusion bands. Ordinary measured text heights are not
overwritten by fallback estimates.
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
Local selection classes consume the same signal: only mounted covered blocks
receive `.selected` / `.focused`, and newly mounted fragments are repainted
from the current model selection without enumerating the complete range. A
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

分页启用状态属于插件，不属于 `DocConfig`；不要使用 `DocConfig.pagination` 或 `doc.pagination`。插件关闭时会移除页框、块间距、表格视图断点和高度锁定，且不会写入 Yjs。`experimentalSparseView` 默认 `false`，默认路径仍持有整文档视图租约以保证实时精确几何；设为 `true` 且开启根虚拟化后，分页 Projection 驱动窗口与 spacer，离屏块允许先用估算几何并在挂载后收敛。该实验路径不会把非 exact 结果交给打印/PDF，而会使用完整只读重排。`exportToPdf()` 使用真实只读 BlockCraft 组件，snapshot-viewer 不参与分页 PDF；浏览器走系统打印，Tauri 等宿主通过 `PaginationPdfHostBackend` 打印当前顶层导出 WebView，正文不经过 DOM 栅格化。

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

### Default Inline Image Embed

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

### DocChain (Fluent Mutations)

```typescript
doc.chain()
  .insertAfter(currentBlock, 'paragraph', 'Hello')
  .setCursorAtBlock(newBlock)
  .run()
```

### Collaboration Cursor Lifecycle

```typescript
import { BlockCraftAwareness } from '@ccc/blockcraft/editor/awa'

const cursorAwareness = new BlockCraftAwareness(doc, provider.awareness)
cursorAwareness.setLocalUser({
  id: currentUser.id,
  name: currentUser.name,
  color: currentUser.profileColor, // optional concrete CSS color
})

// With root virtualization, offscreen remote selections remain model-only and
// reappear automatically when their root units enter this client's view.

// Required when leaving a room without destroying the document.
cursorAwareness.destroy()
```

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
// Input/IME and selected-class behavior read SelectionScopePolicy; columns
// preserves cross-column text tails, while table/columns use endpoint-only
// generic selected classes for text-shaped ranges.

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
// Ctrl+A ladder: partial text -> full text -> parent boundary range -> parent content
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
  same trusted `ShapeDefinition.path` used by the actual shape, so it does not
  maintain duplicate icon resources.
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
| `BlockControllerPlugin` | `plugins/block-controller/` | Drag handle, hover menu, custom block-tool injection |
| `BlockGapCreatorPlugin` | `plugins/block-gap-creator/` | Click between blocks → insert paragraph |
| `PasteFormatSelectorPlugin` | `plugins/paste-format-selector/` | Choose paste format (HTML / Markdown / plain) |
| `OrderedBlockPlugin` | `plugins/ordered-extension/` | Auto-renumber ordered lists |
| `CodeInlineEditorBinding` | `plugins/codeEditorBinding.ts` | Shiki syntax highlighting binding for code blocks |
| `TableBlockBinding` | `plugins/tableBlockBinding.ts` | Table clipboard, model/explicit cell-range keyboard bindings, merge/split helpers |
| `ImgToolbarPlugin` | `plugins/img-toolbar/` | Block/inline image resize, toolbar actions, and bidirectional conversion |
| `ShapeToolbarPlugin` | `plugins/shape-toolbar/` | Word-like shape selection, style controls, object layout, drag, resize and rotation |
| `WordArtToolbarPlugin` | `plugins/word-art-toolbar/` | Editable WordArt presets, object/edit mode, style controls, placement, drag, resize and rotation |
| `CalloutToolbarPlugin` | `plugins/callout-toolbar/` | Callout color/icon picker |
| `DividerExtensionPlugin` | `plugins/divider-toolbar/` | Divider hover toolbar (style / size / optional text label + align) |
| `AttachmentExtensionPlugin` | `plugins/attachment-extension/` | Attachment preview/download UI |
| `EmbedFrameExtensionPlugin` | `plugins/embed-frame-extension/` | Resize/replace iframe embeds |
| `BookmarkBlockExtensionPlugin` | `plugins/bookmark-frame-extension/` | Bookmark preview fetch |
| `FormulaBlockExtensionPlugin` | `plugins/formula-extension/` | KaTeX edit panel for formula blocks |
| `InlineLinkExtension` | `plugins/inline-link-extension/` | Link hover card + open behavior |
| `MentionPlugin` | `plugins/mention/` | `@`-trigger with pluggable panel factory |
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
