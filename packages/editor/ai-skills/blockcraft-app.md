# BlockCraft: Embedding the Editor in a Host App

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Last updated: 2026-04-15

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
  ImageBlockSchema,
  // … pick what you need
])
```

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
    ['link', linkConverter],
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
  scrollContainer?: HTMLElement           // walked upward if omitted
}
```

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

```typescript
// Control readonly via the BehaviorSubject
this.doc.readonlySwitch$.next(true)   // entering readonly mode
this.doc.readonlySwitch$.next(false)  // back to editable

// Read current value
this.doc.isReadonly                   // boolean

// Plugins / blocks should subscribe to react
this.doc.readonlySwitch$.subscribe(readonly => { /* hide UI, etc. */ })
```

`updateProps` and most CRUD operations short-circuit when `isReadonly === true`. Some plugins also check explicitly — see the readonly template in `blockcraft-plugin.md`.

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
provider.once('synced', () => {
  const yRoot = this.doc.yDoc.getMap('blocks').get(this.rootId) as YBlock
  this.doc.initByYBlock(yRoot, this.containerRef.nativeElement)
})
```

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
doc.vm                     // DocVM — block ↔ Angular component bridge
doc.event                  // UIEventDispatcher
doc.selection              // SelectionManager
doc.clipboard              // ClipboardManager
doc.inputManger            // InputTransformer (sic — note typo in field name)
doc.overlayService         // DocOverlayService — CDK Overlay wrapper
doc.dndService             // DocDndService — drag & drop coordination
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
doc.afterInit(fn)          // run fn once root is ready
```

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
- All 3 reference embed converters (mention, link, latex)
- The full plugin stack
- A custom block-controller `customTools` extension (`copyBlockLink`)
- Mouse-down at the empty bottom area to append a paragraph
