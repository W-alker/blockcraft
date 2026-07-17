# BlockCraft: Embedding the Editor in a Host App

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Last updated: 2026-07-17

This guide explains how to **consume** BlockCraft as a library inside an Angular host application. For extending the framework (writing plugins, blocks, embeds), see `blockcraft-plugin.md`, `blockcraft-block.md`, etc. For the bundled reference editor, read `editor/editor.ts` in this repo as a worked example.

## High-Level Wiring

```
Host Angular component
  ├── Provides DI tokens (file, message, block-creator, link-previewer, adapter)
  ├── Builds a SchemaManager with the block schemas it wants to support
  ├── Constructs a BlockCraftDoc({ yDoc, docId, schemas, plugins, embeds, … })
  ├── Calls doc.initBySnapshot(snapshot, containerEl) OR doc.initByYBlock(yRoot, containerEl)
  └── Loads a theme stylesheet (light, dark, …)
```

## Step 1 — Install & Import

The editor lives in `packages/editor`. Inside this monorepo it's published as `@org/blockcraft-editor` (consult the `package.json`). External consumers import from the package barrel `index.ts` which re-exports framework, blocks, plugins, services and types.

```typescript
import {
  BlockCraftDoc,
  SchemaManager,
  // DI tokens
  DOC_FILE_SERVICE_TOKEN,
  DOC_MESSAGE_SERVICE_TOKEN,
  BLOCK_CREATOR_SERVICE_TOKEN,
  DOC_LINK_PREVIEWER_SERVICE_TOKEN,
  DOC_ADAPTER_SERVICE_TOKEN,
  // Service base classes
  DocFileService,
  DocMessageService,
  BlockCreatorService,
  DocLinkPreviewerService,
} from '@org/blockcraft-editor'

import {
  ParagraphBlockSchema,
  RootBlockSchema,
  // … any other block schemas the app wants to enable
} from '@org/blockcraft-editor/blocks'
```

## Snapshot Viewer (Display-Only Path)

When the host only needs to display a block snapshot, use the standalone snapshot-viewer path instead of constructing `BlockCraftDoc`.

### Angular wrapper

```typescript
import { SnapshotViewerComponent, IBlockSnapshot } from '@org/blockcraft-editor'

@Component({
  selector: 'doc-preview',
  standalone: true,
  imports: [SnapshotViewerComponent],
  template: `
    <bc-snapshot-viewer
      [snapshot]="snapshot"
      [options]="{
        baseUrl: cdnBaseUrl,
        resourcePolicy: 'eager',
        enhancers: viewerEnhancers
      }"
    />
  `,
})
export class DocPreviewComponent {
  snapshot!: IBlockSnapshot
  cdnBaseUrl = 'https://cdn.example.com/'
  viewerEnhancers = {
    bookmark: {
      load: (url: string) => this.previewApi.query(url),
    },
    formula: {
      render: (latex: string) => this.katexService.renderToString(latex),
    },
    mermaid: {
      render: (source: string) => this.mermaidService.renderToSvg(source),
    },
  }
}
```

### Standalone renderer

```typescript
import { createSnapshotRenderer, IBlockSnapshot } from '@org/blockcraft-editor'

const renderer = createSnapshotRenderer({
  baseUrl: 'https://cdn.example.com/',
  resourcePolicy: 'visible', // use 'off' to keep remote resources unloaded
  enhancers: {
    bookmark: {
      load: (url, signal) => previewService.query(url, signal),
    },
    formula: {
      render: (latex, signal) => formulaService.render(latex, signal),
    },
    mermaid: {
      render: (source, signal) => mermaidService.render(source, signal),
    },
  },
})

renderer.render(containerEl, snapshot as IBlockSnapshot)
renderer.update(nextSnapshot)
renderer.destroy()
```

The snapshot viewer is:

- display-only
- independent from `BlockCraftDoc`, plugins, Yjs, selection, and input modules
- optimized for snapshot-first rendering, not editing

## Markdown Stream Viewer

When the host receives Markdown progressively, use the standalone Markdown stream viewer instead of building snapshots manually.

```typescript
import { createMarkdownStreamViewer } from '@org/blockcraft-editor'

const streamViewer = createMarkdownStreamViewer({
  container: containerEl,
  viewerOptions: {
    baseUrl: 'https://cdn.example.com/',
    resourcePolicy: 'eager',
  },
})

streamViewer.append('# Hello\\n\\n')
streamViewer.append('Streaming paragraph\\n\\n')
streamViewer.replace('# Hello world\\n\\nStreaming paragraph\\n\\n')
streamViewer.finish()
streamViewer.destroy()
```

Method semantics:

- `append(chunk)` — append-only convenience for chunk streams
- `replace(fullMarkdown)` — replace the current full Markdown text, useful when the producer rewrites prior content
- `finish()` — flush pending complex blocks such as fenced code, tables, and mermaid blocks
- `destroy()` — clear viewer resources

## Step 2 — Provide DI Services

> Snapshot-viewer does **not** need the editor DI token graph. The DI section below applies only to `BlockCraftDoc` / full editor embedding.

The framework reads several services from Angular's injector via `InjectionToken`s. The host **must** provide all of them.

```typescript
@Component({
  selector: 'my-doc-shell',
  template: `<div #container></div>`,
  providers: [
    { provide: DOC_FILE_SERVICE_TOKEN, useClass: MyDocFileService },
    { provide: DOC_MESSAGE_SERVICE_TOKEN, useClass: MyDocMessageService },
    { provide: BLOCK_CREATOR_SERVICE_TOKEN, useClass: MyBlockCreatorService },
    { provide: DOC_LINK_PREVIEWER_SERVICE_TOKEN, useClass: DocLinkPreviewerService },
    { provide: DOC_ADAPTER_SERVICE_TOKEN, useClass: MyAdapterService },
  ],
  standalone: true,
})
export class MyDocShellComponent { /* ... */ }
```

### Required Service Contracts

#### `DocFileService` — file uploads, previews, ObjectURLs

```typescript
abstract class DocFileService {
  abstract uploadImg(file: File, onProgress?: (n: number) => void): Promise<string>
  abstract uploadVideo(file: File, onProgress?: (n: number) => void): Promise<DocAttachmentInfo>
  abstract uploadAttachment(file: File, onProgress?: (n: number) => void): Promise<DocAttachmentInfo>
  abstract previewImg(options: Record<string, unknown>): void
  abstract previewAttachment(options: any): void
  // Local ObjectURL helpers (used for optimistic preview while uploading)
  abstract createObjectURL(file: File): string
  abstract getFileByObjectURL(url: string): File | undefined
  abstract getFilePreviewURLByObjectURL(url: string): string
  abstract removeObjectURL(url: string): void
  abstract isLocalObjectURL(url: string): boolean
  abstract isOverMaxSize(size: number): boolean
  // (Provided base impl) inputFiles(accept, multiple): Promise<FileList>
}

interface DocAttachmentInfo { name: string; type: string; url: string; size: number }
```

#### `DocMessageService` — toast notifications

```typescript
abstract class DocMessageService {
  abstract success(message: string): void
  abstract error(message: string): void
  abstract info(message: string): void
  abstract warn(message: string): void
}
```

#### `BlockCreatorService` — interactive block parameter prompts

Used by the slash-menu / block transformer when a block needs parameters before insertion (e.g. ask for an image URL, or open a file picker).

```typescript
abstract class BlockCreatorService {
  abstract getParamsByScheme<T extends IBlockSchemaOptions>(
    schema: T
  ): Promise<BlockCraft.BlockCreateParameters<T['flavour']> | null>
}
```

Return `null` if the user cancels, otherwise the tuple matching the schema's `IBlockCreateParameters`.

#### `DocLinkPreviewerService` — bookmark/link card metadata

Used by the bookmark block + inline link preview. The framework ships a default `DocLinkPreviewerService` you can extend or replace.

#### `DocAdapterService` — HTML/Markdown round-trip

Wraps the bundled `HtmlAdapter` and `MarkdownAdapter`. The host can subclass it to inject custom matchers (see `blockcraft-adapter.md`).

## Step 3 — Build a Schema Manager

Pick the block flavours your app supports. **`RootBlockSchema` is mandatory.**

```typescript
const schemas = new SchemaManager([
  RootBlockSchema,           // required
  ParagraphBlockSchema,      // recommended baseline
  BulletBlockSchema,
  OrderedBlockSchema,
  TodoBlockSchema,
  CodeBlockSchema,
  DividerBlockSchema,
  PageDividerBlockSchema,  // optional manual page break
  ImageBlockSchema,
  // … pick what you need
])
```

### Optional Pagination Plugin

Pagination is a registered plugin, not a `BlockCraftDoc` service:

```typescript
const pagination = new PaginationPlugin({
  enabled: false,
  pageSize: 'A4',
  printShortcut: true,
})

doc = new BlockCraftDoc({
  // ...required config
  schemas,
  plugins: [pagination],
})

pagination.enable()
pagination.updateConfig({
  margins: {top: 72, right: 72, bottom: 72, left: 72},
  header: {left: 'Document', right: '{page}/{total}'},
})
pagination.disable()
```

Do not add `pagination` to `DocConfig` and do not read `doc.pagination`. The plugin is the lifecycle owner and removes all layout DOM/CSS on disable or destroy. Host settings UI should read `pagination.config` and call `pagination.updateConfig(...)`; BlockCraft does not publish a pagination settings component.

### Paginated PDF and Printing

```typescript
const exports = new DocExportManager(doc)

// Browser: opens the system print dialog; the user can choose "Save as PDF".
await exports.exportToPdf('document.pdf')

// Explicit pagination means reflow export; it is not the current-view contract.
await exports.exportToPdf('letter.pdf', {
  pagination: {pageSize: 'Letter', orientation: 'landscape'},
})

// Screen-consistent in-page print; live breakpoints are reused when enabled.
await pagination.print()
```

With an enabled plugin and no explicit `options.pagination`, `exportToPdf()` captures the current stable page result, then renders the same snapshot through a readonly `BlockCraftDoc`. This preserves page count, block placement and table fragments without cloning the focused editor or using snapshot-viewer. Passing `options.pagination` intentionally requests a new reflow. If the plugin is disabled, its config is used for an offscreen readonly reflow; without a plugin the fallback is A4.

BlockCraft no longer exposes `DocExportManager.exportToJpeg()` or a DOM-to-image rendering dependency. Browser PDF export prints the fixed page boxes through a same-origin iframe; browser code cannot silently save a PDF or reliably detect whether the user cancelled the dialog. Hosts that need bitmap screenshots should own that application-specific rendering path separately.

### Tauri native backend

Use a dedicated **top-level export WebView**, initialize a readonly BlockCraft document there, and pass a host backend. The backend runs while the current WebView's print mirror and `@page { margin: 0 }` rules are still mounted:

```typescript
const result = await exports.exportToPdf('document.pdf', {
  backend: async ({suggestedName, page, pageCount, signal}) => {
    const path = await choosePdfPath(suggestedName)
    if (!path) return {status: 'cancelled'}

    await invokeNativePdfPrint({
      path,
      pageWidthPt: page.widthPt,
      pageHeightPt: page.heightPt,
      pageCount,
      signal,
    })
    return {status: 'saved', path}
  },
})
```

`choosePdfPath()` and `invokeNativePdfPrint()` belong to the host. A Tauri implementation can map the latter to `WKWebView` print operations on macOS and WebView2 `PrintToPdf` on Windows. BlockCraft does not import `@tauri-apps/*`, create windows, choose file paths, or infer the platform. Do not run this backend in an iframe: native WebView printing targets the current top-level WebView. Small font-hinting and color differences between platform print engines are expected; page size, margins, page count and block/fragment placement come from the shared fixed print surface.

## Step 4 — Create the Doc

```typescript
import * as Y from 'yjs'

doc = new BlockCraftDoc({
  // Yjs document — supply your own to enable collaboration / sync
  yDoc: new Y.Doc({ guid: this.docId, gc: false }),
  docId: this.docId,
  schemas,
  logger: this.logger,        // any object implementing the Logger interface
  injector: this.injector,    // Angular Injector — used to resolve DI tokens
  embeds: [
    // [name, EmbedConverter] — see blockcraft-embed.md
    ['mention', mentionConverter],
    ['latex', latexConverter],
  ],
  plugins: [
    new FloatTextToolbarPlugin(),
    new BlockTransformerPlugin(),
    new BlockControllerPlugin(),
    // … any subset of bundled or custom plugins
  ],
  readonly: false,            // optional — initial readonly state
  scrollContainer: undefined, // optional — auto-detected if not given
  theme: 'light',             // optional — initial theme
})
```

### `DocConfig` Reference

```typescript
interface DocConfig {
  docId: string
  schemas: SchemaManager
  logger: Logger
  injector: Injector
  yDoc: Y.Doc
  theme?: string                          // default: 'light'
  embeds?: [string, EmbedConverter][]     // inline embed converters
  plugins?: DocPlugin[]
  readonly?: boolean                      // default: true (set false on init or via switch later)
  copyFilter?: ClipboardCopyFilter        // global copy filter; seeds ClipboardManager registry. Omit = no filtering
  scrollContainer?: HTMLElement           // walked upward if omitted
}
```

### 复制过滤（Copy Filter）

`DocConfig.copyFilter?: ClipboardCopyFilter` 配置全局复制过滤器；不传则不过滤。
运行时可用 `doc.clipboard.registerCopyFilter(filter): () => void` 追加过滤器（返回 disposer，可组合，多个按注册顺序叠加）。

```ts
const doc = new BlockCraftDoc({
  // …
  copyFilter: {
    excludeFlavours: ['comment'],            // 复制时丢弃整块（含子树）
    stripAttributes: ['s:color', 'a:link'],  // 清除行内属性
    // transform: (root, ctx) => root,       // 逃生舱：任意转换，返回新 snapshot
  },
})
```

复制入口可临时覆盖：`copyFromSelection(sel, data, { filter })` / `copyBlocksModel(snapshots, { filter })`；传 `false` 表示本次完全不过滤。过滤作用于序列化前的 snapshot，所有产出格式（text/html/markdown/snapshot）一致。

## Step 5 — Initialise the Document

The doc has **two** init paths. Pick one based on whether you have a local snapshot or a Yjs root block already in `yDoc`.

```typescript
@ViewChild('container', { read: ElementRef }) containerRef!: ElementRef<HTMLElement>

// Path A: from a JSON snapshot (e.g. fresh document)
ngAfterViewInit() {
  const rootSnapshot = this.buildEmptyRootSnapshot()
  this.doc.initBySnapshot(rootSnapshot, this.containerRef.nativeElement)
}

// Path B: from an existing Yjs root block (e.g. after sync)
ngAfterViewInit() {
  const yRoot = this.doc.yDoc.getMap('blocks').get(this.rootId) as YBlock
  this.doc.initByYBlock(yRoot, this.containerRef.nativeElement)
}
```

> Both methods append the editor's root component element into your container as a child. The host element is created and managed by the framework — never replace its innerHTML.

### Building an empty root snapshot

```typescript
private buildEmptyRootSnapshot(): IBlockSnapshot {
  const paragraph = ParagraphBlockSchema.createSnapshot([''])
  return {
    ...RootBlockSchema.createSnapshot(),
    id: this.docId,
    children: [paragraph],
  }
}
```

## Step 6 — Theme

The bundled themes live in `packages/editor/themes/`. Import the entry SCSS in your app's global stylesheet, or load CSS files dynamically.

```scss
// styles.scss
@use '@org/blockcraft-editor/themes/light';
// or
@use '@org/blockcraft-editor/themes/dark';
```

You can switch themes at runtime:

```typescript
this.doc.toggleTheme('dark')   // emits doc.themeChange$
```

See `blockcraft-theme.md` for design tokens and how to customize colors/typography.

## Step 7 — Readonly Mode

### Whole document

```typescript
this.doc.toggleReadonly(true)         // entering readonly mode
this.doc.toggleReadonly(false)        // back to editable

// Read current value
this.doc.isReadonly                   // boolean

// Plugins / blocks should subscribe to react
this.doc.readonlySwitch$.subscribe(readonly => { /* hide UI, etc. */ })
```

Prefer `toggleReadonly()` to writing `readonlySwitch$` directly because it also
keeps `DocConfig.readonly` aligned.

### A block and its subtree

```typescript
doc.setBlockReadonly(blockId, true)

const effective = doc.isBlockReadonly(blockId)
const detail = doc.readonlyManager.resolve(blockId)
// { readonly: true, source: { kind: 'self' | 'ancestor' | 'document', ... } }

doc.setBlockReadonly(blockId, false)
```

The persistent flag is `meta.readonly === true`; Yjs synchronizes it like other
block metadata. Descendants inherit their nearest ancestor lock. The Root block
cannot be persistently locked—use whole-document mode instead.

Block readonly is a strong client-side write guard:

- text, formatting, props, insert, delete, replace, move, cut, paste and affected
  undo/redo are rejected with `BlockReadonlyError`;
- an unlocked ancestor that contains a locked descendant cannot be deleted or
  moved;
- selection, copy, links, media preview and downloads remain available;
- clipboard snapshots strip readonly metadata, so pasted copies are editable;
- an undo/redo item blocked by the current lock stays on its stack and can run
  after the block is unlocked.

Subscribe to `doc.readonlyManager.stateChange$` for UI that depends on effective
block permission. Standard `BlockCraftDoc` instances automatically forward
non-`api` violations to `DocMessageService.warn` as "内容已锁定，无法修改";
repeated feedback is coalesced to at most once per second. `violation$` remains
available for analytics or custom feedback. Programmatic `api` writes do not
show messages, while data-boundary methods still throw the typed error.

This is a trusted-client collaboration policy, not access control. A malicious
or outdated client can still write raw Yjs updates, so security-sensitive hosts
must enforce authorization when accepting/persisting updates.

## Step 8 — Listening to Document Changes

```typescript
// Children of any block changed (insert/move/delete)
this.doc.onChildrenUpdate$.subscribe(({ blockId, delta }) => { … })

// Props of any block changed
this.doc.onPropsUpdate$.subscribe(({ blockId, changes }) => { … })

// Inline text of any editable block changed
this.doc.onTextUpdate$.subscribe(({ blockId, op, tr }) => { … })

// Selection changed
this.doc.selection.selectionChange$.subscribe(sel => { … })
```

## Step 9 — Persistence

BlockCraft does **not** persist on its own. The host owns that. Two common patterns:

### A) Snapshot-based persistence (offline / single-user)

```typescript
// Save: walk from the root and serialize
const json = this.doc.root.toSnapshot(true)   // deep snapshot tree
await this.api.save(this.docId, json)

// Load: pass to initBySnapshot
const snapshot = await this.api.load(this.docId)
this.doc.initBySnapshot(snapshot, this.containerRef.nativeElement)
```

### B) Yjs sync (multi-user / collaborative)

Connect a Yjs provider (`y-websocket`, `y-webrtc`, custom) to `doc.yDoc`. Initial state should be loaded into `yDoc` **before** calling `initByYBlock`.

```typescript
const provider = new WebsocketProvider(WS_URL, this.docId, this.doc.yDoc)
const cursorAwareness = new BlockCraftAwareness(this.doc, provider.awareness)
provider.once('synced', () => {
  const yRoot = this.doc.yDoc.getMap('blocks').get(this.rootId) as YBlock
  this.doc.initByYBlock(yRoot, this.containerRef.nativeElement)
})

// When leaving the room, release cursor overlays and global scroll/resize listeners.
cursorAwareness.destroy()
provider.destroy()
```

Import `BlockCraftAwareness` from `@ccc/blockcraft/editor/awa`. A host that enters and leaves collaboration rooms without destroying the editor document must call `destroy()` before discarding the provider.

## Step 10 — Cleanup

```typescript
ngOnDestroy() {
  // Tearing down the root block component triggers framework cleanup
  // (plugin.destroy(), Yjs unsubscribe, overlays, etc.)
  this.containerRef.nativeElement.innerHTML = ''
}
```

> The framework also subscribes to `doc.root.onDestroy$` and runs `plugins.forEach(p => p.destroy())` automatically when the root component is destroyed.

## Public Doc API (cheat sheet)

```typescript
doc.crud                   // DocCRUD — low-level Yjs mutations (use sparingly)
doc.model                  // BlockModelGraph — complete reachable Yjs tree queries
doc.readonlyManager        // BlockReadonlyManager — inherited block permission
doc.vm                     // DocVM — block ↔ Angular component bridge
doc.event                  // UIEventDispatcher
doc.selection              // SelectionManager
doc.clipboard              // ClipboardManager
doc.inputManger            // InputTransformer (sic — note typo in field name)
doc.overlayService         // DocOverlayService — CDK Overlay wrapper
doc.dndService             // DocDndService — 外部文件拖入 + commit 类方法分发
doc.dragController         // DocInternalDragController — 内部 block 拖拽（PointerEvents 实现）
doc.messageService         // DocMessageService (resolved from DI token)
doc.schemas                // SchemaManager
doc.injector               // Angular Injector
doc.logger                 // Logger
doc.plugins                // readonly DocPlugin[]
doc.theme                  // current theme name
doc.isReadonly             // boolean
doc.isInitialized          // boolean
doc.root                   // root BlockComponent (throws before init)
doc.rootId                 // root block id
doc.yDoc                   // underlying Y.Doc
doc.yBlockMap              // Y.Map of all blocks (key: id)

doc.chain()                // → DocChain (fluent transactions)
doc.toggleTheme(name)
doc.toggleReadonly(readonly)                 // whole-document mode
doc.setBlockReadonly(blockOrId, readonly)    // persistent non-root block lock
doc.isBlockReadonly(blockOrId)               // effective readonly state
doc.afterInit(fn)          // run fn once root is ready
```

## doc.dragController

`DocInternalDragController` — 内部 block 拖拽控制器（PointerEvents 实现，统一鼠标 / 触摸 / 触控笔）。

```ts
// 启动一次内部拖拽（block-controller / img-toolbar 等插件的 pointerdown 入口里调）
doc.dragController.startDrag(
  pointerEvent,
  { kind: 'origin-block', blockId },        // 或 { kind: 'new-block', flavour, initProps? }
  { ghostLabel?: string, movementThreshold?: number }
)

// 主动取消
doc.dragController.cancel()

// 状态机：'idle' | 'armed' | 'dragging' | 'dropping'
doc.dragController.state$.subscribe(state => { ... })
doc.dragController.isDragging  // boolean
```

调用方需要：
- 在 pointerdown handler 里调（不是 dragstart），按钮过滤 `evt.button !== 0`
- 对触发元素加 CSS `touch-action: none`，避免触摸滚动手势抢走 pointer
- 不要再设 `setDragImage` —— controller 自渲染轻量 ghost
- 不要再手动 `opacity: 0.5` —— 源 block 视觉由 `.bc-drag-source` class 承担

外部文件（OS → 编辑器）拖入仍走 HTML5 drop，由 `doc.dndService` 内部处理。

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting to provide `DOC_MESSAGE_SERVICE_TOKEN` (or any other token) | Plugins crash with `NullInjectorError`. Provide all 5 tokens. |
| Calling `initBySnapshot` twice | Second call is a no-op — the first one wins. To swap docs, dispose the host element and create a new `BlockCraftDoc`. |
| Mutating `containerRef.nativeElement` after init | The framework owns that subtree. Use `doc.chain()` for mutations. |
| Subscribing to `selectionChange$` without `takeUntil(doc.onDestroy$)` | Memory leak. Always tie subscriptions to a destroy signal. |
| Skipping `RootBlockSchema` in `SchemaManager` | Init throws. Root is required. |
| Constructing `BlockCraftDoc` outside an Angular component | The constructor needs an `Injector`. Inject one (or use `EnvironmentInjector`). |
| Saving via `JSON.stringify(doc)` | Serialize via `doc.root.toSnapshot(true)` instead — Yjs internals are not JSON-safe. |
| Hardcoding `metaKey`/`ctrlKey` in your custom plugin hotkeys | Use `shortKey: true` for cross-platform Cmd/Ctrl mapping. |
| `transform` / `filter` / `will-change` / `perspective` on an ancestor of the BlockCraft host | Traps `position: fixed` in that ancestor, so table block's **fullscreen view** (which uses `position: fixed; inset: 0`) cannot truly fill the viewport. Move animations to sibling/descendant levels of the editor host, not above it. |

## Checklist

- [ ] All 5 DI tokens provided with concrete implementations
- [ ] `RootBlockSchema` included in `SchemaManager`
- [ ] `BlockCraftDoc` constructed with `yDoc`, `docId`, `schemas`, `logger`, `injector`
- [ ] Container element passed to `initBySnapshot` or `initByYBlock`
- [ ] Theme stylesheet imported
- [ ] Persistence wired up (snapshot save/load OR Yjs provider)
- [ ] Subscriptions tied to `doc.onDestroy$`
- [ ] Readonly state hooked into UI mode switching (if applicable)

## Reference Implementation

`packages/editor/editor/editor.ts` is the bundled demo editor — read it as a complete, working example. It shows:
- All 5 DI providers wired up (`MyDocFileService`, `MyDocMessageService`, `MyBlockCreatorService`, …)
- Full schema list
- All 2 reference embed converters (mention, latex)
- The full plugin stack
- A custom block-controller `customTools` extension (`copyBlockLink`)
- Mouse-down at the empty bottom area to append a paragraph
