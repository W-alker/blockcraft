# BlockCraft: Embedding the Editor in a Host App

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Last updated: 2026-08-07

This guide explains how to **consume** BlockCraft as a library inside an Angular host application. For extending the framework (writing plugins, blocks, embeds), see `blockcraft-plugin.md`, `blockcraft-block.md`, etc. For the bundled reference editor, read `editor/editor.ts` in this repo as a worked example.

## High-Level Wiring

```
Host Angular component
  ├── Provides DI tokens (file, message, block-creator, link-previewer, adapter)
  ├── Creates the full bundled capability set, or builds a subset SchemaManager
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

Snapshot Viewer recognizes responsive image/video `props.wr/ar`. It applies
the width relative to its own root content container and uses CSS
`aspect-ratio`; legacy pixel `width/height` snapshots keep their previous
display. No media metadata load is required to establish the initial geometry.
Image/video resources use the same neutral loading skeleton and stable
failure/retry frame as the editor. `renderer.update()` replaces resource frames
atomically so live listeners are never cloned into inert markup, and
`renderer.destroy()` disposes all block and inline-image resource controllers.
`resourcePolicy: 'off'` continues to avoid mounting iframe resources.

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

Use the exported `MarkdownStreamRenderer` only when progressive Markdown must
mutate an initialized, editable `BlockCraftDoc`. It preserves compatible block
IDs, computes props/text/structure patches from `BlockModelGraph`, and writes
through `DocCRUD` in an `ORIGIN_NO_RECORD` transaction. Root blocks that are
offscreen under virtualization remain model-only; streaming does not acquire a
full-document view lease or materialize their components. The standalone stream
viewer above remains the preferred path for display-only output.

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

For the same complete capability set as `<block-craft-editor>`, use the public
factory. Call it once per Doc because Plugins and embed converters are
stateful:

```typescript
const capabilities = createBundledEditorCapabilities({
  mention: {
    panel: myMentionPanel,
    onMentionClick: handleMentionClick,
  },
  translate: {service: myTranslateService},
  blockController: {
    blockMenuResolver: resolveHostBlockMenu,
  },
  placeholder: {
    overrides: {paragraph: '输入正文…'},
  },
  pagination: {enabled: false, pageSize: 'A4'},
  openLink: link => router.open(link),
  additionalSchemas: [MyCustomBlockSchema],
  additionalEmbeds: [['my-embed', myEmbedConverter]],
})

const doc = new BlockCraftDoc({
  // ...required config
  schemas: capabilities.schemas,
  embeds: [...capabilities.embeds],
  plugins: [...capabilities.plugins],
})
```

The result also exposes `schemaDefinitions`, `blockMaterials`,
`paginationPlugin` and `translatePlugin`. `blockMaterials` is the
BlockController-aligned projection for insertion UIs; internal child schemas,
root and infrastructure blocks remain registered but hidden. The factory
throws on duplicate block flavours, embed names or plugin names, including
duplicates introduced through `additionalSchemas` / `additionalEmbeds`.

The bundled `embeds` list includes fresh `shape` and `word-art` converters, so
the bundled Shape/WordArt toolbar Plugins can switch those blocks to inline or
square-wrap representations. A manually assembled host must pair each Plugin
with `createInlineShapeEmbedConverter()` or
`createInlineWordArtEmbedConverter()` in `DocConfig.embeds`; without the
converter the Plugin warns and does not write an unrenderable Delta.

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
  documentHeader: {
    element: () => hostDocumentHeader.nativeElement,
    placement: 'top-margin',
    topInset: 20,
    gap: 16,
  },
  // Phase C opt-in; keep false when exact live pagination is required.
  experimentalSparseView: true,
})

doc = new BlockCraftDoc({
  // ...required config
  schemas,
  plugins: [pagination],
})

pagination.enable()
pagination.updateConfig({
  margins: {top: 72, right: 72, bottom: 72, left: 72},
  header: {left: 'Document', right: '{page}/{total}', distance: 48},
  footer: {center: '第 {page:chinese} 页', distance: 48},
})
pagination.disable()
```

`header.distance` 从纸张顶边计算，`footer.distance` 从纸张底边计算，二者与正文
`margins.top` / `margins.bottom` 独立。页眉/页脚位于正文页边距带内时不会额外
减少正文容量；越过正文边界时只扣除越界部分。省略 `distance` 会回退对应正文
页边距并保持旧版本布局。页码 token 支持 `{page}` / `{total}`，也支持
`{page:roman-upper}`、`{page:roman-lower}`、`{page:chinese}`，`total` 语法相同。

Do not add `pagination` to `DocConfig` and do not read `doc.pagination`. The plugin is the lifecycle owner and removes all layout DOM/CSS on disable or destroy. Host settings UI should read `pagination.config` and call `pagination.updateConfig(...)`; BlockCraft does not publish a pagination settings component. `experimentalSparseView` is a construction-time rollout option, is not included in `pagination.config`, defaults to `false`, and is effective only when root virtualization is enabled.

When constructed with `enabled: true`, pagination waits until document
initialization completes and activates on the following animation frame. This
prevents sparse pagination from re-entering root virtualization while its
continuous projection is still being wired. Hosts may keep their loading mask
until that first paginated frame is painted.

`documentHeader` is a construction-time live-layout option. It accepts an
element or lazy resolver plus an optional gap. `placement: 'content'` keeps the
legacy behavior: the document header precedes and deducts from first-page body
content. `placement: 'top-margin'` positions it from the sheet top using
`topInset` (default 20px); only the part extending past the ordinary body start
is deducted, so a compact host header can live entirely inside the top margin.
On enable the plugin temporarily
moves the connected element into the root pagination surface, constrains it to
page content width, observes its border-box height and deducts that height only
from the first page. Disable/destroy restores the original parent, sibling
position and inline style; host code must not reparent it while pagination is
enabled. If removing the header from its original normal flow moves the root,
the plugin measures that displacement once and applies it only to the live
`placement-layout` origin. Persisted root-relative `placement.x/y`, undo history
and collaborative data are not rewritten when the view changes.

### Whole-document view scale

Visual zoom is a document service rather than pagination configuration. Attach
the host-owned element that contains the document header and editor surface:

```typescript
doc.viewScale.attach(documentPage.nativeElement, {wheel: true})
doc.viewScale.setScale(1.1)

const subscription = doc.viewScale.change$.subscribe(change => {
  // Persist per-user/per-document preferences in the host application.
  console.log(change.scale, change.source)
})
```

`setScale()` accepts a ratio and clamps it to 0.5–2.0. `zoomIn()`, `zoomOut()`
and `reset()` use 10% steps. `scale$`, `change$`, `value` and `geometryScale`
are public reads. `layoutToVisual()` / `visualToLayout()` are available for
host-owned pointer geometry; BlockCraft's virtualization and placement paths
already normalize themselves. Call `attach()` again to move ownership to a new
surface, or destroy the document to restore the original inline `zoom` style
and wheel listener. Print/PDF use a separate readonly render and remain at 100%.

Fit-width and fit-page are intentionally not framework modes because available
space belongs to the host chrome. Persist the mode in the host, observe its
viewport, recompute the ratio, and pass it to `setScale()`.

### Paginated PDF and Printing

```typescript
const exports = new DocExportManager(doc)

// Browser: opens the system print dialog; the user can choose "Save as PDF".
await exports.exportToPdf('document.pdf')

// Explicit pagination means reflow export; it is not the current-view contract.
await exports.exportToPdf('letter.pdf', {
  pagination: {pageSize: 'Letter', orientation: 'landscape'},
})

// Business blocks may reload fresh data inside the isolated export copy.
await exports.exportToPdf('document.pdf', {
  prepareDocument: async ({doc, root, signal}) => {
    await businessExportCoordinator.reloadAndWait(doc, {root, signal})
  },
  stability: {quietFrames: 2, timeoutMs: 10000},
})

// Screen-consistent in-page print; live breakpoints are reused when enabled.
await pagination.print()
```

With an enabled plugin and no explicit `options.pagination`, `exportToPdf()` captures the current stable page result, then renders the same snapshot through a readonly `BlockCraftDoc`. This preserves page count, block placement and table fragments without cloning the focused editor or using snapshot-viewer. In experimental sparse mode, an estimated (`exact: false`) live result is never reused: export falls back to the complete readonly reflow. Passing `options.pagination` intentionally requests a new reflow. If the plugin is disabled, its config is used for an offscreen readonly reflow; without a plugin the fallback is A4.

`prepareDocument` runs after that readonly copy is initialized and receives only
the copy's `doc` and `root`. Use it to trigger and await business-block data/view
readiness; it may fetch fresh data and must not depend on the live collaborative
document. After it resolves, BlockCraft prepares images/fonts and waits for DOM
and block dimensions to remain quiet before measuring. `stability` tunes that
generic quiet barrier; it does not replace the semantic ready Promise required
for blocks whose empty state is otherwise indistinguishable from “not loaded”.

BlockCraft no longer exposes `DocExportManager.exportToJpeg()` or a DOM-to-image rendering dependency. Browser PDF export installs the fixed page boxes as a print-only mirror in the current top-level document; this preserves the business blocks' viewport and container-query context. Browser code cannot silently save a PDF or reliably detect whether the user cancelled the dialog. `printPagesVector()` remains available as an explicit iframe-oriented low-level API, but it is not the default export path. Hosts that need bitmap screenshots should own that application-specific rendering path separately.

The print surface is the only owner of pagination paper geometry and chrome:
hosts must not layer a second export margin/header/footer/page-number config over
it. Every named `PageSizeName`, including A0/A1/A2 and Tabloid, is emitted as
explicit standard physical CSS dimensions (`mm` for ISO A sizes, `in` for US
sizes), so browser print cannot silently fall back to A4 because of unsupported
paper keywords. Native backend metadata still uses exact physical point values
(for example A4 is `595.28 × 841.89pt`) while screen layout retains subpixel
geometry. Forward `page.widthPt` / `page.heightPt` unchanged. The print mirror
uses the same explicit physical `mm`/`in` width as `@page`; do not replace it
with `100%` of the WebView viewport. A native backend printing this already
paginated surface must preserve `1:1` scale and disable shrink-to-fit (for
example, use AppKit horizontal pagination `clip`). Otherwise the horizontal
scale also changes the slot height, so later logical pages drift across physical
paper boundaries and may create a trailing blank page. Fixed-height slots already
advance naturally at the physical page edge; adding a sibling `break-before` or
`break-after` advances again and creates alternating blank pages in WebKit.

Root-level `placement-layout` is a global absolute-position plane, not a flow
block. The print surface projects a clone into every paper box and subtracts the
screen stride (`sheetHeight + pageGap`) for each page. Hosts must leave these
projected planes inside the page's relative, clipped containing block; moving the
tail zero-height layout by its pagination slot would relocate all absolute blocks
to the last page. For a host document header, return the real DOM through
`PrintRenderResult.leadingContent`. BlockCraft stages it inside the final paper
and content width, waits for resources and dimensions to stabilize, checks that
height against the captured `firstPageContentHeight`, then mounts it as a z=2
leading layer above the z=1 body. This keeps wrapping, internal absolute elements,
and placement origin aligned with the live page; do not create a synthetic flow
block or pre-measure the header in the host window.
The generated `.bc-print-content` remains a `data-bc-placement-container`, so
hosts must not strip that attribute when mounting or cloning print pages; it
owns the normal under/flow/over stacking tiers. BlockCraft expands the plane
from the narrower content box back to full sheet width before applying
percentage x coordinates. A non-empty placement snapshot without its readonly
DOM plane is a strict `layout-diverged` failure, not a silent content drop.
When the host rebuilds print pages from an already projected isolated view,
capture the computed top of its root `placement-layout` before disabling
pagination and return it as `PrintRenderResult.placementOriginY`. This makes the
print plane consume the actual layout origin rather than recomputing one from
the same config and host-header height.

WordArt display is SVG-native in editable, readonly and snapshot surfaces. Its
HTML contenteditable keeps only input-geometry and caret styles as a transparent
interaction layer; fill, gradient, outline, shadow and effect transforms belong
to SVG. Print
reuses the same vector node instead of performing a second visual conversion.

The print surface fits an oversized image/video and an over-wide non-breakable
atomic block into the page content box as a whole. It does not apply that policy
to normal paragraphs or tables, whose own split/overflow policies remain in
control.

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

`choosePdfPath()` and `invokeNativePdfPrint()` belong to the host. A Tauri implementation can map the latter to `WKWebView` print operations on macOS and WebView2 `PrintToPdf` on Windows. A host that requires pixel-identical paginated output can instead capture each mounted `.bc-print-page` through a native WebView snapshot API and let Rust create exactly one PDF page per capture; this avoids asking the platform print engine to paginate the fixed boxes again. Do not substitute `html2canvas`: it is a second CSS renderer and cannot guarantee parity for arbitrary business blocks. BlockCraft does not import `@tauri-apps/*`, create windows, choose file paths, or infer the platform. Do not run this backend in an iframe: native WebView printing/snapshot APIs target the current top-level WebView.

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
  currentUserId: currentUser.id, // optional — required for block lock control
  defaultBlockLockKind: 'user',  // optional — use 'template' in template authoring
  canUnlockBlock: ({currentUserId, lockKind}) =>
    lockKind === 'template'
      ? templatePermissions.canEdit(currentUserId)
      : currentUserId !== null && permissions.isAdmin(currentUserId),
  blockMutationPolicy: context => {
    // Optional host-owned synchronous document invariant.
    if (context.operation === 'delete' &&
        context.blockIds.some(id => templateShellIds.has(id))) {
      return {allowed: false, message: '模板结构不可删除'}
    }
    return true
  },
  scrollContainer: undefined, // optional — auto-detected if not given
  virtualization: {           // optional — disabled by default
    enabled: true,
    overscanViewports: 1,
    segmentMergeGap: 2,
    retainedViewLimit: 12,
    estimatedHeights: {paragraph: 32, table: 240},
    resolveViewRetention: ({flavour}) =>
      flavour === 'custom-player' ? 'keep-alive' : undefined,
  },
  placement: {                // optional — adapt mode changes to a host layout domain
    transitionMode: ({block, to}) => {
      if (!isHostLayoutBlock(block)) return false
      moveInHostLayout(block, to)
      return true             // complete transition handled by the host
    },
  },
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
  currentUserId?: string                  // stable block-lock owner identity
  defaultBlockLockKind?: BlockLockKind     // generic lock controls; default: 'user'
  canUnlockBlock?: (context: BlockUnlockContext) => boolean // synchronous additional grant
  blockMutationPolicy?: BlockMutationPolicy // synchronous structural/meta invariant
  copyFilter?: ClipboardCopyFilter        // global copy filter; seeds ClipboardManager registry. Omit = no filtering
  scrollContainer?: HTMLElement           // walked upward if omitted
  layoutMetrics?: {                       // resolved document typography in CSS px
    baseFontSize?: number                 // --bc-fs; measured once when omitted
    lineHeight?: number                   // resolved root line-box height
  }
  virtualization?: VirtualizationConfig   // root-child view virtualization; default disabled
  placement?: BlockPlacementConfig        // optional synchronous mode-transition adapter
}
```

The configured `readonly` value is published synchronously before `afterInit`
callbacks run and before plugins register. The initial protected bootstrap state
is therefore never exposed as the initialized document policy; immediate model
writes from initialization observers are accepted or rejected against
`DocConfig.readonly`.

`layoutMetrics` is the document-wide typography source for model-first height
projection. When omitted, BlockCraft reads the initialized root's computed
`font-size` and `line-height` exactly once. Estimators never call
`getComputedStyle()` themselves. A host that changes `--bc-fs` / `--bc-lh`
after initialization must use one of the explicit refresh paths:

```typescript
// Make the supplied pixel metrics authoritative and update the root CSS vars.
doc.updateLayoutMetrics({baseFontSize: 18, lineHeight: 27})

// Or change CSS externally first, then perform one deliberate computed read.
doc.refreshLayoutMetrics()
```

Both APIs invalidate continuous virtualization and sparse pagination estimates;
mounted blocks still converge through their normal `ResizeObserver` path.
Schema `metadata.virtualization.estimateHeight(context)` callbacks receive the
same `baseFontSize` and `lineHeight` facts alongside `rootContentWidth`.

`blockMutationPolicy` is a host-owned document invariant evaluated before a
Yjs mutation or undo/redo replay. Its operation is one of `delete`, `move`,
`replace`, `update-meta`, `undo`, or `redo`; the context includes directly
targeted block IDs and relevant parent, destination, or metadata-key details.
Return `true` / `{allowed: true}` to continue, or `false` /
`{allowed: false, message}` to reject with `BlockMutationPolicyError`.

Keep the policy synchronous and model-first. It is suitable for protecting a
template shell while leaving children inside its content regions editable. It
is a trusted-client invariant, not server-side authorization.

### Root Virtualization

`virtualization.enabled` virtualizes direct root children only. Each root child
and its nested subtree is one atomic render unit, so tables, columns and other
container internals keep their existing selection/input semantics. Yjs and
`BlockModelGraph` remain complete; only Angular components and DOM are sparse.

The bundled reference `<block-craft-editor>` exposes the initialization-only
`virtualizationEnabled` input (default `true`) and `paginationSparseView`
input (default `false`). It forwards them when it creates `BlockCraftDoc` and
`PaginationPlugin` in `ngOnInit`:

```html
<block-craft-editor
  [virtualizationEnabled]="true"
  [paginationSparseView]="true" />
```

This input is a construction choice, not a live mode switch. Recreate the
component to change either input, and do so before initializing or attaching a
collaboration provider. Direct `BlockCraftDoc` consumers continue to use
`DocConfig.virtualization` plus
`PaginationPlugin({experimentalSparseView: true})`; their framework defaults
remain disabled/false respectively.

- `overscanViewports` sets the projected-height budget on each side of the
  visible viewport (minimum 0, default 1; fractions are allowed). The default
  yields a three-viewport mounted window. Near a document edge the unavailable
  side's budget shifts to the other side. It never expands by root count, so a
  pair of oversized tables consumes the height budget instead of forcing both
  complete subtrees into the DOM.
- `segmentMergeGap` merges nearby viewport/selection leases by omitted root
  count (default 2), but the manager rejects a merge whose projected gap is
  taller than one quarter of the viewport.
- `retainedViewLimit` bounds detached root-component subtrees in an LRU cache
  (minimum 0, default 12). `0` destroys every detached subtree after the next
  reconciliation frame; a later mount rebuilds it from current Yjs state.
- `estimatedHeights` supplies per-flavour heights until `ResizeObserver`
  measures a mounted block. Missing flavours use 48px.
- A custom Schema can take precedence with
  `metadata.virtualization.estimateHeight(context)`. The callback receives
  readonly model props, direct child IDs, `estimateChildHeight()`, cached root
  width and `layoutMode: 'flow' | 'paginated'`; it must return a synchronous,
  DOM-free finite non-negative height. Persist async layout facts in props so
  offscreen model changes can invalidate the estimate. Invalid results or
  thrown errors use the normal object-sizing / `estimatedHeights` fallback.
- `resolveViewRetention(context)` can override a schema's
  `metadata.virtualization.viewRetention`
  when that block view materializes. Return `'keep-alive'`, `'virtual'`, or
  `undefined` to preserve the schema policy. The context contains `blockId`,
  `flavour`, `nodeType`, and `schemaRetention`.
- Both `initByYBlock()` and `initBySnapshot()` create only the root component
  initially. Snapshot initialization writes the complete tree into Yjs/model in
  one transaction before the viewport mounts any root-child views.
- A local selection leases only the direct-root units containing its anchor
  and head. The selected middle remains model-only and virtualized while
  scrolling. Nested selections still lease only their owning root subtree.
- A temporary interaction that must keep specific block views alive can call
  `doc.virtualization.acquireBlockViewLease(blockIds)`. It synchronously mounts
  only the containing root units, follows stable IDs across structure changes,
  and returns an idempotent release function. Always release it from the
  interaction's common teardown; internal block dragging does this for its
  sources before clearing Selection.
- By default, live `PaginationPlugin` acquires an exact full-document view
  lease while enabled and releases it after pagination DOM cleanup.
  `experimentalSparseView: true` instead lets the paginated Projection drive
  the root window: offscreen geometry may be estimated, mounted-only page gaps
  and table breaks replay after remount, and non-exact layouts are not reused
  for print/PDF.
- A schema with `metadata.virtualization.viewRetention: 'keep-alive'` acquires a long-lived
  lease only after its view first materializes. Nested blocks pin their
  containing direct-root render unit. Built-in iframe/media schemas opt in so
  scrolling does not reset browsing context or playback; deletion and document
  disposal release the lease. These leases share one aggregated pin source and
  add no schema lookup, callback, or layout read to ordinary scroll frames.
- The hidden zero-height root `placement-layout` is projected separately from
  normal flow. A model-only index compares each child's root-relative
  `placement.y` plus estimated height with the root-relative viewport and one
  viewport of pre-rendering. A hit mounts the layout root unit; no hit allows
  it to detach unless Selection or an interaction lease owns it. The index
  reuses `wr/ar` media sizing, includes rotated fixed-size shape bounds and
  performs no child DOM reads on scroll.
- `placement-layout` remains one atomic root render unit in this phase. One
  visible absolute child therefore materializes all absolute siblings, while
  none of those descendants acquires a duplicate per-object lease.

Hosts can override built-in defaults when memory is more important than DOM
state continuity:

```typescript
virtualization: {
  enabled: true,
  resolveViewRetention: ({flavour}) =>
    flavour === 'video' ? 'virtual' : undefined,
}
```

Every materialized keep-alive block permanently increases mounted DOM and
Angular view cost until deletion. Use the policy for genuinely stateful blocks,
not as a general remount optimization.

The coordinator performs only constant-time revision/length checks on ordinary
reconciliation frames. A detected model/index/height mismatch triggers one cold
model rebuild. If mounting or reconciliation still fails for three consecutive
frames, that document switches permanently to complete root mounting and emits
one message-service warning. The fallback favors editability over memory and is
reset only when the document is disposed/recreated. Entering fallback first
reconciles the sparse root against canonical model order, removes every virtual
spacer and disconnects height observation; scroll/resize events no longer run
window reconciliation. This prevents stale estimated geometry from leaving a
mostly blank document if an individual full-mount attempt also fails.

Component-returning commands preserve their synchronous return value for the
current command, but an offscreen component can enter the retained LRU and be
permanently destroyed on a later reconciliation frame. Keep block IDs or model
data for long-lived work; resolve a fresh component only when a view capability
is actually needed.

### Stable Block Navigation

Use the document-level API for copied block links, search results, comments,
outline items, and history restoration:

```typescript
const revealed = await doc.navigateToBlock(blockId)
if (!revealed) {
  // The ID is missing/stale, the document was destroyed, or a newer request won.
}
```

The call is rendering-mode independent. With virtualization enabled it performs
an estimated jump, mounts only the target's root render unit, and corrects to
the real nested block geometry. With full rendering it centers the mounted host.
Calls made before `initBySnapshot()` / `initByYBlock()` wait for initialization;
rapid calls are latest-wins. The method does not change model Selection, native
DOM Selection, or focus, so hosts can reveal a reference without interrupting
typing.

The bundled `EditorComponent` copies the current page URL with its `blockId`
query parameter replaced. Activating a same-document link navigates directly
without changing the current URL or history. An initial URL target is queued but
does not initialize the document; after the user or host explicitly initializes
it, the pending request reveals the target. `popstate` targets follow the same
path, and successful navigation adds a short-lived target outline. Host
applications with their own routing should parse the stable ID and delegate to
`doc.navigateToBlock()`.
`doc.virtualization.scrollToBlock()` is the low-level virtual-mode primitive;
host code should normally use the document-level method.

```typescript
const release = doc.virtualization.acquireBlockViewLease([blockId])
try {
  runViewBoundInteraction()
} finally {
  release()
}
```

The configured `scrollContainer` must be the element that actually scrolls.
When omitted, BlockCraft uses its existing ancestor auto-detection.
It may be any ancestor of the editor root and may contain host-owned siblings,
such as a document header. Live pagination keeps scrolling and virtualization
bound to that element, but mounts page sheets on the root's direct parent so
the sheets and content share one coordinate surface. Hosts do not need to move
their header into the editor container or make the root a direct child of the
scroll container.

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
doc.setBlockReadonly(templateRegionId, true, {kind: 'template'})

const effective = doc.isBlockReadonly(blockId)
const canUnlock = doc.canUnlockBlock(blockId)
const detail = doc.readonlyManager.resolve(blockId)
// {
//   readonly: true,
//   source: { kind: 'self' | 'ancestor' | 'document', ... },
//   lockUserId: string | null,
//   lockKind: 'user' | 'template' | null,
// }

doc.setBlockReadonly(blockId, false)
```

The persistent owner is `meta.lock?: string`; Yjs synchronizes the non-empty
user ID like other block metadata. `meta.lockKind?: 'template'` records a
template lock; absence and unknown values resolve as the backward-compatible
`'user'` kind. `DocConfig.currentUserId` is captured when the document is
constructed and owns new locks. Ordinary locks allow that owner or an additional
synchronous `canUnlockBlock(context)` grant to unlock. Template locks always
require the grant—even when owner IDs match—so permissions survive template
instantiation independently of the current screen or route.
`DocConfig.defaultBlockLockKind` controls locks created by generic editor
controls; `setBlockReadonly(..., {kind})` can override it for one operation.
Without a current user, unlocked content remains editable but lock/unlock
controls are unavailable.
Descendants inherit their nearest ancestor lock. The Root block cannot be
persistently locked—use whole-document mode instead. Legacy `meta.readonly`
is not read or migrated.

Block readonly is a strong client-side write guard:

- text, formatting, props, insert, delete, replace, move, cut, paste and affected
  undo/redo are rejected with `BlockReadonlyError`;
- an unlocked ancestor that contains a locked descendant cannot be deleted or
  moved;
- selection, copy, links, media preview and downloads remain available;
- clipboard snapshots strip `meta.lock` and `meta.lockKind`, so pasted copies
  are editable;
- an undo/redo item blocked by the current lock stays on its stack and can run
  after the block is unlocked.

Unauthorized lock control throws `BlockLockError`. Content mutations still use
`BlockReadonlyError`.

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
// Save: serialize the complete model without requiring mounted block views
const json = this.doc.exportSnapshot()
if (!json) throw new Error('Document model is not initialized')
await this.api.save(this.docId, json)

// Load: pass to initBySnapshot
const snapshot = await this.api.load(this.docId)
this.doc.initBySnapshot(snapshot, this.containerRef.nativeElement)
```

### B) Yjs sync (multi-user / collaborative)

Connect a Yjs provider (`y-websocket`, `y-webrtc`, custom) to `doc.yDoc`. Initial state should be loaded into `yDoc` **before** calling `initByYBlock`.

```typescript
const provider = new WebsocketProvider(WS_URL, this.docId, this.doc.yDoc)
const cursorAwareness = new BlockCraftAwareness(this.doc, provider.awareness, {
  shouldRenderRemoteCursor: state => state['status'] !== 'viewing',
})
cursorAwareness.setLocalUser({
  id: currentUser.id,
  name: currentUser.name,
  color: currentUser.profileColor, // optional concrete CSS color
})
cursorAwareness.setLocalCursorEnabled(canEdit)
provider.once('synced', () => {
  const yRoot = this.doc.yDoc.getMap('blocks').get(this.rootId) as YBlock
  this.doc.initByYBlock(yRoot, this.containerRef.nativeElement)
})

// When leaving the room, release cursor overlays and global scroll/resize listeners.
cursorAwareness.destroy()
provider.destroy()
```

Import `BlockCraftAwareness` from `@ccc/blockcraft`. A host that enters and
leaves collaboration rooms without destroying the editor document must call
`destroy()` before discarding the provider.
`setLocalUser()` accepts `{id, name, color?: string}`. A valid concrete CSS
`color` is used for the remote label/caret; otherwise BlockCraft maps `id`
deterministically to its curated palette. Solid label/caret color and the
18%-opacity range color are resolved only when remote user identity changes.
`setLocalCursorEnabled(false)` clears the local awareness cursor while keeping
remote cursors and the Awareness connection active. Re-enabling immediately
publishes the current canonical selection. Presence adapters should use this
for viewing/readonly states instead of forking the cursor projection runtime.
`shouldRenderRemoteCursor(state)` is an optional host presence filter. Returning
`false` suppresses that state's cursor without removing the collaborator or
disconnecting Awareness.

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
doc.mutationPolicy         // BlockMutationPolicyManager — host-owned document invariant
doc.vm                     // DocVM — block ↔ Angular component bridge
doc.event                  // UIEventDispatcher
doc.selection              // SelectionManager
doc.clipboard              // ClipboardManager
doc.inputManger            // InputTransformer (sic — note typo in field name)
doc.overlayService         // DocOverlayService — CDK Overlay wrapper
doc.dndService             // DocDndService — 外部文件拖入 + commit 类方法分发
doc.dragController         // DocInternalDragController — 内部 block 拖拽（PointerEvents 实现）
doc.placement              // BlockPlacementManager — Word-like object layout + free positioning
doc.objectSizing           // BlockObjectSizingManager — root-relative wr/ar resolution
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
doc.setBlockReadonly(blockOrId, readonly, {kind?: 'user' | 'template'})
                                               // persistent non-root block lock
doc.isBlockReadonly(blockOrId)               // effective readonly state
doc.canUnlockBlock(blockOrId)                // resolved owner / host permission
doc.canInsertChild(parentId, childFlavour)    // Schema + opted-in instance incl/excl
doc.navigateToBlock(blockId)                 // Promise<boolean>; reveal stable ID without moving selection/focus
doc.afterInit(fn)          // run fn once root is ready
```

### Persistent document appearance

`RootBlockModel.props.background?: string` stores one CSS `background`
shorthand in the root Yjs props. A single value can represent background color,
image, x/y position, size, repeat, attachment and origin/clip without a verbose
document-data object. It is included in collaboration, Undo/Redo and
`doc.exportSnapshot()` automatically. `RootBlockModel.props.color?: string`
stores the default document text color and BlockCraft applies it to the root
host so normal document text inherits it; explicit inline/block colors override
the inherited value.

```typescript
const background =
  '#f7f7f7 url("https://cdn.example.com/bg.png") center 24px / cover no-repeat scroll'

doc.crud.updateBlockProps(doc.rootId, {background, color: '#182230'})

const current = doc.model.getProps(doc.rootId)?.['background'] as string | undefined

// `null` deletes the prop instead of persisting an empty string.
doc.crud.updateBlockProps(doc.rootId, {background: null, color: null})
```

BlockCraft persists the value but deliberately does not paint it on a fixed DOM
node. The host must apply it to the flow document surface and, in paginated
mode, to each `.bc-page-sheet`; applying it to the continuous paginated root
would paint across inter-page gaps. Assign through `HTMLElement.style.background`
so the browser parses the shorthand and rejects invalid CSS consistently.

`doc.objectSizing.rootContentWidth` is the cached root children content-box
width. `widthChange$` emits deduplicated width changes and
`resolve(flavour, props)` returns responsive or legacy pixel dimensions for a
Schema that declares `metadata.objectSizing`; it returns `null` for other
flavours or before a responsive width can be measured. The document owns and
disposes this service automatically.

`doc.placement` is always constructed by `BlockCraftDoc`; hosts do not register
it as a plugin. The optional `DocConfig.placement` only adapts mode transitions
to a host layout domain. Its synchronous `transitionMode(context)` hook may call
`context.applyDefault()` or perform a complete host transition and return
`true`; `false`/`void` falls back to the standard props transition. The hook is
offered even when the current core mode equals the requested mode, so a host may
refine multiple domain states that map to core relative flow.

A block only becomes positionable when its Schema declares
`metadata.placement: {modes: ['relative', 'absolute']}`. The built-in image
and shape Schemas already do so. A custom schema assembly that enables standard
absolute placement must also register `PlacementLayoutBlockSchema`; the bundled
editor does this automatically. User-facing controls should use object-layout
semantics instead of exposing relative/absolute directly:

```typescript
const schemas = new SchemaManager([
  // existing schemas...
  PlacementLayoutBlockSchema,
  ImageBlockSchema,
  ShapeBlockSchema,
  ShapeTextBlockSchema,
])
```

```typescript
doc.placement.getObjectLayout(block) // 'top-bottom' | 'under' | 'over'
doc.placement.setObjectLayout(block, 'under') // automatically absolute
doc.placement.setObjectLayout(block, 'over')  // automatically absolute
doc.placement.setObjectLayout(block, 'top-bottom') // automatically relative
doc.placement.updateAbsolute(block, {x: 25, y: 120})
doc.placement.startDrag(pointerEvent, block)

doc.placement.canMoveForward(block)
doc.placement.canMoveBackward(block)
doc.placement.moveForward(block)
doc.placement.moveBackward(block)
```

The default implementation only lifts direct root children. It creates one
zero-height `placement-layout` as the final root child and moves all absolute
objects below it. Its child contract is intentionally flavour-agnostic for
future custom shapes, but normalization retains only blocks whose own Schema
supports absolute placement. The layout is hidden from insertion, ordinary
sibling navigation, Gap selection and BlockController. `under` and `over`
children remain pointer-interactive and share the root coordinate/stacking scope.
Returning to top-bottom moves the object back near its current visual position;
an empty layout is removed after the model graph settles.

Absolute objects form one total back-to-front stack: `under` children, ordinary
flow content as a virtual boundary, then `over` children. Sibling order inside
the placement layout defines order within each tier. The one-step movement APIs
swap adjacent objects in the same tier; the highest `under` object moving
forward becomes the lowest `over` object, and the lowest `over` object moving
backward becomes the highest `under` object. These crossings update child order
and `placement.layer` in one Yjs transaction. The lowest `under` and highest
`over` objects are the disabled outer boundaries.

`startDrag()` is Pointer Events-only. The initiating `pointerdown` arms the
interaction, `pointermove` previews via `translate3d`, and `pointerup` commits
one coordinate update. `pointercancel`, Escape and window blur abort. Do not
wire object positioning to native `dragstart / dragover / drop`; native HTML5
drag/drop remains reserved for external browser/file interoperability.

`BLOCK_OBJECT_LAYOUT_OPTIONS` is the shared UI vocabulary and icon mapping:
`嵌入型 / bc_fuwenben-qianruzuo`, `上下型 / bc_fuwenben-shangxia`,
`衬于文字下方 / bc_cengji-xia`, and
`浮于文字上方 / bc_cengji-shang`.

`inline` changes representation rather than placement. A block plugin can
register that capability for its flavour:

```typescript
const release = doc.placement.registerObjectLayoutAdapter('my-shape', {
  toInline: ({doc, block}) => {
    // atomically replace block with the flavour's inline representation
    return true
  },
})
```

Registration is document-local and `release()` must run with the plugin
lifecycle. BlockController shows **嵌入型** only while such an adapter is
registered. Low-level `setMode()` / `setLayer()` remain available for host
adapters and coordinate tooling, but normal UI should call
`setObjectLayout()`.

Returning an absolute block to relative flow first resolves its current visual
center against mounted ordinary root-flow siblings, then moves it before/after
the nearest sibling and clears `placement` in one transaction.
When implementing another atomic conversion, resolve the stable-id anchor
before changing DOM/model state and consume it inside the conversion
transaction:

```typescript
const anchor = doc.placement.resolveFlowAnchor(block)
doc.crud.transact(() => {
  doc.placement.reanchorToFlow(block, anchor)
  // clear placement or replace the reanchored block here
})
```

Absolute siblings and structural hosts marked
`data-bc-placement-layer-bridge` are not flow anchors. If no mounted flow
sibling exists or the anchor disappears concurrently, reanchoring returns
`false`; the default relative transition uses the end of root flow before the
layout as its safe fallback.

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
| Saving via `JSON.stringify(doc)` | Serialize via `doc.exportSnapshot()` instead — Yjs internals are not JSON-safe, and component traversal is incomplete under virtualization. |
| Hardcoding `metaKey`/`ctrlKey` in your custom plugin hotkeys | Use `shortKey: true` for cross-platform Cmd/Ctrl mapping. |
| `transform` / `filter` / `will-change` / `perspective` on an ancestor of the BlockCraft host | Traps `position: fixed` in that ancestor, so table block's **fullscreen view** (which uses `position: fixed; inset: 0`) cannot truly fill the viewport. Move animations to sibling/descendant levels of the editor host, not above it. |

## Checklist

- [ ] All 5 DI tokens provided with concrete implementations
- [ ] `RootBlockSchema` included in `SchemaManager`
- [ ] A fresh bundled capability result is used per Doc (if using the factory)
- [ ] `BlockCraftDoc` constructed with `yDoc`, `docId`, `schemas`, `logger`, `injector`
- [ ] Container element passed to `initBySnapshot` or `initByYBlock`
- [ ] Theme stylesheet imported
- [ ] Persistence wired up (snapshot save/load OR Yjs provider)
- [ ] Subscriptions tied to `doc.onDestroy$`
- [ ] Readonly state hooked into UI mode switching (if applicable)
- [ ] `currentUserId` supplied when block lock control is enabled

## Reference Implementation

`packages/editor/editor/bundled-capabilities.ts` is the full capability
catalog, while `packages/editor/editor/editor.ts` shows how the bundled
component consumes it. Together they show:
- All 5 DI providers wired up (`MyDocFileService`, `MyDocMessageService`, `MyBlockCreatorService`, …)
- Full schema list
- All 2 reference embed converters (mention, latex)
- The full plugin stack
- A custom block-controller `customTools` extension (`copyBlockLink`)
- Mouse-down at the empty bottom area to append a paragraph
