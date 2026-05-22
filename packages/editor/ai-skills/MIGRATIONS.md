# BlockCraft Migration Guide

> **Version adaptation reference.** Each entry documents a framework change that affects external consumers — including breaking API changes, deprecations, removed exports, behavior changes, and any rename/move that downstream code might depend on.
>
> Last updated: 2026-05-22 | Tracks `@ccc/blockcraft` npm releases.

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

### v?.?.? - 2026-05-22 (minor)

**What changed**: 新增 `IBlockSchemaOptions.metadata.placeholder` 字段（`BlockPlaceholderConfig` 类型，`string` 或 `{ default?, heading?: { 1?, 2?, 3? } }` 结构）。所有 `EditableBlockComponent` 派生块在「聚焦 + `textLength === 0`」时会自动从 host element 上读取该字段，渲染 `data-placeholder` attribute + `.empty` class，触发既有 CSS。内置 `paragraph` / `bullet` / `ordered` / `todo` / `blockquote` schema 已带默认文案；未配置 placeholder 的 schema 不受影响、不显示任何占位符。

**Why**: BlockCraft 主题 `themes/base.scss` 早已为 `[data-node-type="editable"].empty .edit-container::before { content: attr(data-placeholder); }` 准备好样式，但缺少 TS 行为支撑。本次补齐，使空段落 / 列表项 / 引用等具备 Notion 风格的输入引导。

**Affected ai-skills files**:
- `blockcraft.md` — Conventions 章节追加一条 placeholder 约定
- `blockcraft-block.md` — 新增 "Editable Block Placeholder" 章节

### New APIs / Features

- `BlockPlaceholderConfig` exported type
- `resolvePlaceholderText(config, heading)` pure helper (exported from `framework/block-std/schema/block-schema.ts`)
- `IBlockSchemaOptions['metadata'].placeholder?: BlockPlaceholderConfig`
- `EditableBlockComponent` 新增 protected 方法 `_resolvePlaceholderText` / `_isSelfFocused` / `_syncPlaceholderState` / `_initPlaceholderSubscriptions`（默认在 `ngAfterViewInit` 末尾自动调用，子类如有覆盖请确保调用 `super.ngAfterViewInit()`）

### Migration Recipe

Existing schemas need no changes (the field is optional). To enable a placeholder:

```typescript
// Before
metadata: {
  version: 1,
  label: '基础段落',
  icon: 'bc_icon bc_wenben',
}

// After
metadata: {
  version: 1,
  label: '基础段落',
  icon: 'bc_icon bc_wenben',
  placeholder: {
    default: '输入"/"呼出菜单',
    heading: { 1: '一级标题', 2: '二级标题', 3: '三级标题' },
  },
}
```

### Behavior Changes

Empty focused `paragraph` blocks now show `输入"/"呼出菜单`（以及在 heading 1/2/3 模式下 `一级标题` / `二级标题` / `三级标题`）。`bullet` / `ordered` show `列表项`. `todo` shows `待办事项`. `blockquote` shows `引用`. 如果宿主应用在自定义 schema 时未保留这些字段，对应默认文案会被丢弃 —— 显式在 schema 上设置 `metadata.placeholder` 即可恢复或自定义。

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
