# BlockCraft Editor - AI Skill Pack

> **Level 0: Overview & Router** — Always read this first. Load sub-skills on demand.
>
> Last updated: 2026-07-15 | Source: `packages/editor/` (also published inside `@ccc/blockcraft/ai-skills/`)
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
| **Block** | A node in the document tree; has flavour, nodeType, props | `BaseBlockComponent` / `EditableBlockComponent` |
| **Plugin** | Extends editor behavior; event handlers + hotkeys | `DocPlugin` in `framework/plugin/` |
| **Inline** | Rich text within editable blocks; Blot tree on Y.Text | `InlineRuntime` in `framework/block-std/inline/` |
| **Selection** | Anchor/head selection model over blocks | `SelectionManager` in `framework/modules/selection/` |
| **Input** | Intercepts `beforeInput`, writes to Y.Text directly | `InputTransformer` in `framework/modules/input/` |
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
│   ├── doc/                # BlockCraftDoc, DocCRUD, DocVM, DocUndoManager
│   ├── block-std/          # BaseBlockComponent, EditableBlockComponent
│   │   ├── block/          #   component base classes
│   │   ├── event/          #   UIEventDispatcher, @EventListen, @BindHotKey
│   │   ├── inline/         #   InlineRuntime, Blot tree, EmbedConverter
│   │   ├── schema/         #   SchemaManager, IBlockSchemaOptions
│   │   └── reactive/       #   proxyMap, YBlock, NativeBlockModel
│   ├── modules/            # SelectionManager, InputTransformer, ClipboardManager
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

### Pagination Plugin

```typescript
const pagination = new PaginationPlugin({
  enabled: false,
  pageSize: 'A4',
  printShortcut: true,
})

plugins: [pagination]

pagination.enable()
pagination.updateConfig({orientation: 'landscape'})
await pagination.exportToPdf('document.pdf') // browser print dialog; current stable page layout
await pagination.print()
pagination.disable()
```

分页启用状态属于插件，不属于 `DocConfig`；不要使用 `DocConfig.pagination` 或 `doc.pagination`。插件关闭时会移除页框、块间距、表格视图断点和高度锁定，且不会写入 Yjs。`exportToPdf()` 使用真实只读 BlockCraft 组件；不传 `pagination` override 时复用当前稳定分页结果，snapshot-viewer 不参与分页 PDF。浏览器走系统打印，Tauri 等宿主通过 `PaginationPdfHostBackend` 打印当前顶层导出 WebView；正文不经过 DOM 栅格化。

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
cursorAwareness.setLocalUser(currentUser)

// Required when leaving a room without destroying the document.
cursorAwareness.destroy()
```

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
doc.selection.value                     // BlockSelection | null; stale block refs read back as null
doc.selection.selectionChange$          // BehaviorSubject<BlockSelection | null>; stale block refs are cleared to null before emit
doc.selection.getSelectedText()         // string

// A BlockSelection has:
//   .anchor / .head        — discriminated ISelectionPoint (text | selected | gap | boundary | table-cell)
//   .start / .end          — same points but document-ordered
//   .firstBlock / .lastBlock
//   .collapsed / .isInSameBlock / .isAllSelected / .isStartOfBlock / .isEndOfBlock
//   .direction             — 'forward' | 'backward'
//   .isAllSelected         — true only when both endpoints are whole-block selected points
// Programmatic writes (`setSelection`, `setCursorAt`, `extendTo`, block cursor
// helpers, block/gap/table selection, replay) synchronously publish this model
// before deriving the native DOM Range. Cross-block order/common ancestry comes
// from parentId/childrenIds, not DOM compareDocumentPosition or layout reads.
// If a live selection cannot be projected because its DOM is still mounting,
// the model remains canonical and SelectionManager performs a bounded,
// version-guarded projection retry. Explicit blur/stale endpoints still clear it.
// A revisioned internal Relative Selection Bookmark maps the current local
// selection through relevant remote Yjs text/children changes before DOM is
// considered. Text/boundary endpoints use Y.RelativePosition; ancestor-only
// changes replay only when the endpoint parent path or sibling index moved.
// Successful mapping calls replay() once. recalculate() is a guarded failure
// fallback only when the editor still owns both native Range endpoints.
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
  const editableBlock = sel.start.block        // EditableBlockComponent
  const offset = sel.start.offset              // number
}
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
| `ImgToolbarPlugin` | `plugins/img-toolbar/` | Image alignment, caption, replace |
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
| Virtual Rendering | `packages/editor/VIRTUAL_RENDERING.md` | Planned virtual rendering design |
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
