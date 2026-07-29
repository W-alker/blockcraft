# BlockCraft Editor - AI Skill Pack

> **Level 0: Overview & Router** — Always read this first. Load sub-skills on demand.
>
> Last updated: 2026-07-28 | Source: `packages/editor/` (also published inside `@ccc/blockcraft/ai-skills/`)
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
| **Block** | A node in the document tree; has flavour, nodeType, props | `BaseBlockComponent` / `EditableBlockComponent` |
| **Plugin** | Extends editor behavior; event handlers + hotkeys | `DocPlugin` in `framework/plugin/` |
| **Inline** | Rich text within editable blocks; Blot tree on Y.Text | `InlineRuntime` in `framework/block-std/inline/` |
| **Selection** | Anchor/head selection model over blocks | `SelectionManager` in `framework/modules/selection/` |
| **Input** | Intercepts `beforeInput`, writes to Y.Text directly | `InputTransformer` in `framework/modules/input/` |
| **Virtualization** | Optional model-first root-child windowing; nested subtrees stay atomic | `RootVirtualizationManager` in `framework/modules/virtualization/` |
| **Block Navigation** | Mode-independent stable-ID reveal without changing selection or focus | `BlockCraftDoc.navigateToBlock()` |
| **Pagination** | Pure page layout + reversible live view + print/PDF | `PaginationPlugin` + `framework/modules/pagination/` |
| **Event** | Three-tier event dispatcher (block→flavour→global) | `UIEventDispatcher` in `framework/block-std/event/` |
| **Chain** | Fluent builder for sequencing mutations | `DocChain` in `framework/chain/` |
| **Schema** | Block registration: flavour, component, createSnapshot | `SchemaManager` in `framework/block-std/schema/` |
| **Adapter** | HTML/Markdown ↔ BlockSnapshot conversion | `adapters/html-adapter/`, `adapters/markdown-adapter/` |

## Block Types Taxonomy

Three `nodeType` categories:

| nodeType | Description | Base Class | Examples |
|----------|-------------|------------|----------|
| `editable` | Has inline text (Y.Text), no children | `EditableBlockComponent` | paragraph, code, bullet, ordered, todo, blockquote, caption, mermaid-textarea |
| `void` | No children, no text | `BaseBlockComponent` | divider, image, bookmark, attachment, formula, video, audio, mermaid, embed-blocks (figma, juejin) |
| `block` | Has block children | `BaseBlockComponent` | callout, columns, column, table, table-row, table-cell, frame |
| `root` | Special — top-level container | `BaseBlockComponent` (root-block) | root |

> **Heading is a prop, not a flavour.** H1/H2/H3 styles live in `props.heading` on `paragraph` blocks. There is no `heading-block` flavour.

### Currently Registered Block Schemas (from `editor/editor.ts`)

`paragraph, ordered, bullet, todo, callout, code, divider, page-divider, image, table, table-row, table-cell, attachment, bookmark, figmaEmbed, juejinEmbed, caption, root, mermaid-textarea, mermaid, blockquote, columns, column, formula, video, audio`

A host application can register a subset or extend this list — see `blockcraft-app.md`.

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
  canUnlockBlock: ({currentUserId}) =>
    currentUserId !== null && permissions.isAdmin(currentUserId),
})

doc.setBlockReadonly(blockId, true)

doc.isBlockReadonly(blockId)                  // effective: self / ancestor / document
doc.canUnlockBlock(blockId)                   // explicit owner or host override
doc.readonlyManager.isExplicitReadonly(blockId)
doc.readonlyManager.resolve(blockId)          // { readonly, source, lockUserId }
doc.readonlyManager.containsReadonly(blockId) // locked block anywhere in subtree

doc.setBlockReadonly(blockId, false)
```

`meta.lock?: string` persists the explicit lock owner's non-empty user ID and
is synchronized through Yjs. `DocConfig.currentUserId` owns new locks; only the
same user or a host `canUnlockBlock` override can remove them. Without a current
user, unlocked content remains editable but lock control is disabled. A lock is
inherited by every descendant. Text/format/props changes, insertion into the
protected subtree, removal/move of the protected block, and removal/move of an
unlocked ancestor containing a protected descendant are rejected with
`BlockReadonlyError`. Unauthorized lock control throws `BlockLockError`.
Selection, copy, link activation, media preview and download remain available;
copied snapshots deliberately omit `meta.lock`. Root cannot receive a
persistent block lock—use
`doc.toggleReadonly(true)` for whole-document mode.

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
)
// { insert: { image: url }, attributes: { width: 320, height: 180 } }
```

`image` is available without explicit `DocConfig.embeds` registration. A host
can override the renderer by registering its own same-key converter. Mixed
HTML/Markdown images round-trip as inline embeds; standalone Markdown images
and `<figure><img></figure>` retain image-block semantics.

With `ImgToolbarPlugin`, clicking the default inline image shows proportional
resize handles, a temporary theme-colored selection outline, plus **转为图片块**.
The outline is DOM-only; resize commits the short `width` / `height` attributes
once on mouseup. Reverse conversion preserves the formatted text on both sides
as separate editable blocks and inserts the image block between them; it does not
create a caption.

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
- Icons use the iconfont class system: `<i class="bc_icon bc_xxx"></i>` (no PNGs, no inline SVGs except for multi-color)
- Hotkey decorators use `shortKey: true` for cross-platform Cmd/Ctrl — never hardcode `metaKey`/`ctrlKey`
- Empty editable blocks show placeholder text from `metadata.placeholder` on focus (see `blockcraft-block.md` → Editable Block Placeholder)

## Plugins Currently Bundled (from `editor/editor.ts`)

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
| `PlaceholderPlugin` | `plugins/placeholder/` | Renders schema-declared placeholder on focused empty editable blocks; supports per-flavour overrides |
| `PaginationPlugin` | `plugins/pagination/` | Opt-in live pagination, page settings, print shortcut and WYSIWYG printing |

> A host app can pass any subset of these (plus its own custom plugins) into `DocConfig.plugins`. See `blockcraft-app.md`.

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
├── blockcraft-plugins-toolbar.md    # L1: 块工具栏插件（Attachment, Img, Bookmark, Callout, Divider, Embed, Formula）
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
