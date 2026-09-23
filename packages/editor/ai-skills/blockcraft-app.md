# BlockCraft: Embedding the Editor in a Host App

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Last updated: 2026-09-22

This guide explains how to **consume** BlockCraft as a library inside an Angular host application. For extending the framework (writing plugins, blocks, embeds), see `blockcraft-plugin.md`, `blockcraft-block.md`, etc. For the bundled reference editor, read `editor/editor.ts` in this repo as a worked example.

## High-Level Wiring

```
Host Angular component
  ├── Provides DI tokens (file, message, block-creator, link-previewer, adapter)
  ├── Creates the full bundled capability set, or builds a subset SchemaManager
  ├── Constructs a BlockCraftDoc({ yDoc, docId, schemas, plugins, embeds, … })
  ├── Calls doc.initBySnapshot(snapshot, containerEl), doc.initByDocumentSnapshot(complete, containerEl), OR doc.initByYBlock(yRoot, containerEl)
  └── Loads a theme stylesheet (light, dark, …)
```

## Step 1 — Install & Import

The editor lives in `packages/editor` and is published as `@ccc/blockcraft`. External consumers import from the package barrel `index.ts` which re-exports framework, blocks, plugins, services and types.

BlockCraft's built-in editor chrome consumes the exact peer
`@cses/ui@4.29.0`. Install that version beside `@ccc/blockcraft`; do not add
`ng-zorro-antd` for BlockCraft. Angular Material remains a peer only for the
existing SVG/brand-icon path.

```bash
pnpm add @ccc/blockcraft @cses/ui@4.29.0
```

发布依赖以 `packages/editor/package.json` 及构建产物为准：

- `hast`、`rehype`、`y-websocket` 不再是 editor 的 peer。HTML 适配器使用
  `unified`、`rehype-parse`、`rehype-stringify`；需要 WebSocket 协同的宿主自行声明 `y-websocket`。
- editor 不强制安装 `@angular/animations`。宿主若调用 `provideAnimations()` 或使用其他动画组件，仍须自行安装匹配 Angular 版本的动画包。
- `@types/hast`、`@types/mdast` 随普通依赖安装，供公开 `.d.ts` 使用；不需要安装同名空壳包 `hast` / `mdast`。
- `collapse-white-space`、`lib0` 是产物直接引用的内部运行时依赖，由 editor 自行声明。
- `@angular/router` 仍是 `@cses/ui` 所需的 peer。Mermaid、Shiki、KaTeX、Konva 等仍被完整编辑器实际引用，不能仅为缩短依赖列表而移除。

`pnpm build:editor` 会检查所有 FESM 分块和公开类型的外部导入，拦截漏声明的依赖及冗余 peer；不依赖 monorepo 根目录碰巧安装的包补齐发布契约。

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

## 轻量公共工具入口

`global/utils` 的全部导出统一提供独立构建入口，涵盖文件/MIME、函数控制、Delta、
URL、fetch、DOM、颜色、文本、比较、对象和图片尺寸工具，以及 `IPoint`、`ImageIntrinsicSize` 类型：

```typescript
import {
  extMimeMap,
  mimeExtMap,
  getSafeFileName,
  getFilenameFromContentDisposition,
  getImageExt,
  downloadFile,
  debounce,
  sliceDelta,
  getLinesByRange,
  type IPoint,
} from '@ccc/blockcraft/global/utils';

extMimeMap.get('pdf'); // application/pdf
mimeExtMap.get('image/jpeg'); // jpeg
```

该入口无 Angular、Yjs 或其他第三方运行时依赖，导入时不访问 DOM；文件映射、
字符串和 Delta 等纯工具可在 Node/SSR 中使用。需要宿主能力的工具保持原要求：
`downloadFile()`、`nextTick()`、滚动容器/计算样式工具及带代理的 `FetchUtils.fetchImage()`
仍需浏览器 API；图片尺寸读取沿用原有 `Image`/`createImageBitmap` 检测和失败返回值。
它仍属于同一个 npm 包，不改变整包安装时的 peerDependencies。

原来的 `@ccc/blockcraft` 导入继续可用，主入口和独立入口共享同一组 Map 实例。
映射仍区分大小写、不接收点前缀，未知项返回 `undefined`；重复扩展名保持后项覆盖
（例如 `xml → text/xml`、`3gp → video/3gpp`）。不新增别名或 MIME 猜测规则。

### 其他 global 独立入口

以下入口均使用 `@ccc/blockcraft/global/<目录>`，与源码目录层级一致。
它们可以在没有 Angular/Yjs 的环境中导入，仍属于同一个 npm 包；安装依赖声明不变。

`@ccc/blockcraft/global` 是这七个子入口（包含 `utils`）的统一聚合入口：

```typescript
import {
  extMimeMap, debounce, IS_MAC, ConsoleLogger, BlockCraftError,
  ResourcePlaceholderController,
  type SimpleRecord,
} from '@ccc/blockcraft/global';
```

聚合入口仅转导出子入口，未使用 DOM 或加载编辑器。单独使用一类能力时仍可选择
对应子入口以缩小模块依赖范围；聚合入口、子入口和编辑器主入口共享同一份实现。

| 子路径 | 导出内容 | 调用环境 |
|--------|----------|----------|
| `global/env` | `IS_WEB`、`IS_MAC`、`IS_SAFARI` 等既有平台标志 | 导入时读取当前环境，保持原检测规则 |
| `global/logger` | `ConsoleLogger`、`NoopLogger`、`Logger` 类型 | `ConsoleLogger` 使用宿主 `console` |
| `global/exceptions` | `BlockCraftError`、`ErrorCode`、`handleError` | 保持原有异常类型、错误码和抛出行为 |
| `global/decorators` | `performanceTest` | 使用宿主 `performance.now()` 和 `console` |
| `global/types` | `SimpleBasicType`、`SimpleValue`、`SimpleRecord` 等既有类型 | 使用 `import type`，无运行时代码 |
| `global/resource-placeholder` | 控制器、销毁函数、图片/视频/iframe 适配器及相关类型 | 导入无需 DOM，实例化及资源操作需要浏览器 |

```typescript
import {IS_MAC} from '@ccc/blockcraft/global/env';
import {ConsoleLogger, type Logger} from '@ccc/blockcraft/global/logger';
import {BlockCraftError, ErrorCode} from '@ccc/blockcraft/global/exceptions';
import type {SimpleRecord} from '@ccc/blockcraft/global/types';
import {
  ResourcePlaceholderController,
  imageResourcePlaceholderAdapter,
} from '@ccc/blockcraft/global/resource-placeholder';
```

既有主入口导出保持兼容，同一个异常类支持跨入口 `instanceof`，资源适配器和编辑器
内部使用同一份控制器缓存。`ResourcePlaceholderController` 和
`destroyResourcePlaceholder` 可从资源子入口、global 聚合入口或编辑器主入口导入；
主入口原有的资源适配器及类型导出不变。
`BcResourcePlaceholderDirective` 仍从编辑器主入口导入。

直接使用资源占位器时，须保留 `themes/base.scss`（包含
`themes/components/resource-placeholder.scss`）、所选主题变量及 iconfont 样式/字体；
JS 子入口不会自动注入这些样式。`env/iframe-sandbox` 仍为包内实现，不新增公共导出。

## 轻量领域能力与基础类型入口

共享内容契约统一使用 `@ccc/blockcraft/framework/model`，不为每种数据类型创建子入口：

```typescript
import {
  BlockNodeType, InlineNodeType, INLINE_TYPOGRAPHY_ATTRS,
  type IBlockProps, type IEditableBlockProps, type InlineModel,
  type DeltaInsert, type DeltaOperation, type IInlineNodeAttrs,
  type TypographyFontFamilyId, type BlockDescriptor, type BlockSnapshot, type IMetadata,
} from '@ccc/blockcraft/framework/model';
```

这是 DDD 的共享内容模型（Shared Kernel），只包含数据契约与持久化标识；
字体标签、CSS 字体栈、格式计算和 DOM 应用仍归属各自能力。该入口在无 DOM 类型库、
Angular、Yjs 和 `BlockCraft` 全局注册表声明的环境中也可使用。
通用快照使用 `BlockSnapshot<P, M, F>`，通用描述使用 `BlockDescriptor<P, M, F>`：
`P` / `M` 是当前节点的专有 props / metadata，`F` 缺省为 `string`，也可指定有限 flavour 集合。
容器子块沿用 `F`，其 `P` / `M` 回到缺省数据类型，不继承父块专有字段；void 子块数组必须为空，
editable 内容必须为 Delta。`IBaseMetadata` / `IMetadata` 和 placeholder 模式同样归属模型。

`IBlockSnapshot` / `BaseBlockDesc` 仍从原主入口取得，保持注册表约束与接口增强语义：
编辑器快照可作为通用快照读取，任意通用快照并不自动成为已注册的编辑器快照。
进入编辑器仍需宿主按既有 Schema 和事务流程处理；不要用类型断言替代数据校验。
这里不新增 npm 子入口，也不放宽已有 adapters、snapshot-viewer 或 Agent API 的参数约束。

以下路径均以 `@ccc/blockcraft/` 为前缀，与源码层级一致；已有主入口导出继续可用，
并转导出同一份运行时实现。独立入口的 JavaScript 和类型声明均不需要 Angular、
Yjs、编辑器主入口或 `BlockCraft` 全局类型命名空间。

| 子路径 | 用途 | 使用边界 |
|--------|------|----------|
| `framework/block-std/typography` | 字体目录、字号/字距规范化、段落单位换算、行内排版补丁 | 导入及计算无需 DOM；`applyInlineTypographyAttribute` 需要传入真实 HTMLElement |
| `framework/block-std/block/object-format` | 对象填充、轮廓、效果、文本框/文字样式的规范化、紧凑存储和 CSS 值计算 | 不包含 Angular 组件、格式管理服务或文档写入 |
| `framework/modules/pagination/engine` | 页尺寸、分页策略、纯分页算法及其输入/输出类型 | 输入为已测量的尺寸，不包含 DOM 测量、分页视图或打印导出；同时转导出 `BlockNodeType` |
| `framework/block-std/types/block-base` | `BlockNodeType` 枚举、`IBlockProps` 基础属性类型的兼容入口 | 转导出共享内容模型；新调用方优先使用 `framework/model` |

```typescript
import {normalizeInlineFontScale} from '@ccc/blockcraft/framework/block-std/typography';
import {storeObjectPaint} from '@ccc/blockcraft/framework/block-std/block/object-format';
import {paginate, resolveBlockPolicy, BlockNodeType} from '@ccc/blockcraft/framework/modules/pagination/engine';
import type {IBlockProps} from '@ccc/blockcraft/framework/block-std/types/block-base';

const scale = normalizeInlineFontScale(1.25);
const fill = storeObjectPaint({type: 'none'});
const policy = resolveBlockPolicy({flavour: 'paragraph', nodeType: BlockNodeType.editable});
const pages = paginate([{id: 'p1', height: 100, ...policy}], {contentHeight: 800});
```

对象格式入口仅以类型依赖共享模型；分页引擎共享模型中的枚举，保持跨入口身份一致。
排版入口共享模型中的紧凑排版键和字体 ID；`global/utils` 只在类型层引用模型，不依赖 typography。
整包 peerDependencies 不变，以上结论仅说明这些子入口的导入边界，不代表实测启动耗时收益。

### 入口组织与依赖约束

每项能力统一使用“能力目录 + `index.ts` + 实现 + `ng-package.json`”组织，
公开路径与既有符号不变。对象格式的编解码、精度 helper 归入 `object-format/`，
仍属于包内实现，不新增公共子入口。基础块类型实现归属 `framework/model/block.ts`，
`types/block-base/` 只保留兼容转导出。
`typography/core.ts` 负责不依赖 DOM 的排版计算，`typography/dom.ts` 单向调用计算层，
两者由同一 `typography/index.ts` 导出；这个入口整体属于轻量排版能力。

`global/utils` 保留通用工具与 Delta 工具的兼容聚合，因此不是严格的框架无关基础层。
其 Delta 工具只依赖共享模型类型，不复制字体类型，也不允许加载排版或模型运行时。
`build:editor` 分别检查发布产物的运行时和声明依赖范围，并验证排版计算层在不包含
DOM 类型库时可编译。共享模型只允许类型依赖 `global/types`；基础 Block/Inline/Delta
契约已归位；通用快照与编辑器注册表约束分别表达，使用者按自己的数据边界选择类型。

主入口的显式转导出用于避免声明打包时外部通配导出的歧义；固定导出名单用于验证兼容性，
新增公共 API 时须同步维护。不要用从当次产物生成的名单替代这一兼容性检查。

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
`resourcePolicy` controls both source activation and placeholder timing:
`'eager'` starts image/video/audio/iframe resources after their stable frames
mount; `'visible'` waits for the resource target to enter the observer margin
before setting `src` and starting loading/error timeout state; `'off'` sets no
resource source, creates no loading placeholder, and mounts no iframe. A cached
enhancement still obeys the current visibility gate instead of applying while
offscreen.

Editable blocks carrying an always-on placeholder (`meta.plh` with
`meta.plhMode: 'always'`) render the hint when their delta is empty, using the
same CSS contract as the editor's PlaceholderPlugin (`data-placeholder` +
`.bc-placeholder-target` / `.bc-placeholder-empty`); focus-driven placeholders
are editor-only. Dividers render with full `DividerBlockComponent` parity
(text/tape variants, length/thickness/align/opacity, legacy `size` fallback)
via the shared `resolveDividerPresentation()`. Root snapshots project their
document typography (`ff`/`fs`/`lh`) and text color (`color` →
`style.color` + `--bc-color`, matching `RootBlockComponent`); document
`background` stays a host concern.

### Extending the snapshot viewer with custom renderers

Hosts that register their own block flavours or inline embeds in the editor can
teach the snapshot viewer to render them through two `SnapshotViewerOptions`
fields. Both apply to first render **and** to incremental `update()` patches,
and both flow through `createMarkdownStreamViewer({viewerOptions})` unchanged.

```typescript
import {
  createSnapshotRenderer,
  SnapshotBlockRenderer,
  SnapshotInlineEmbedRenderer,
} from '@org/blockcraft-editor'

const weatherRenderer: SnapshotBlockRenderer = {
  canRender: (snapshot) => `${snapshot.flavour}` === 'weather-material',
  render: (ctx, snapshot) => {
    const element = document.createElement('div')
    element.classList.add('weather-material')
    element.textContent = `${snapshot.props['city'] ?? ''}`
    return {element}
  },
}

const personEmbed: SnapshotInlineEmbedRenderer = (delta) => {
  const span = document.createElement('span')
  span.textContent = `@${delta.insert['person'] ?? ''}`
  return span
}

const renderer = createSnapshotRenderer({
  blockRenderers: [weatherRenderer],       // matched before the builtin registry
  inlineEmbeds: {person: personEmbed},     // keyed by the embed's insert key
})
```

Contract:

- **`blockRenderers` are matched first** (first `canRender` wins), so they can
  claim custom flavours and deliberately override builtin ones. The generic
  fallback renderer stays last. A too-broad `canRender` (e.g. `() => true`)
  swallows every builtin block — keep predicates flavour-scoped.
- **The engine stamps `data-block-id` / `data-node-type`** on the element a
  custom renderer returns (if absent). Child mapping and absolute placement
  projection identify block roots by these attributes; do not remove them.
- **Patching**: a renderer without `patch` is updated by syncing attributes and
  child nodes from a fresh render onto the mounted element, so the produced DOM
  must stay **stateless** — no captured listeners or controllers. If the DOM
  owns live resources, register cleanup via `ctx.registerDisposable(target,
  cleanup)` (runs when the element leaves the tree or the renderer is
  destroyed), or implement `patch` — then the engine delegates the whole
  update to you and stops tracking that block's children (your renderer owns
  the entire subtree, including child reconciliation).
- **Container-style renderers** append child blocks via `ctx.renderBlock(child)`
  and mark the hosting element with the **`data-bc-snapshot-children`**
  attribute. The patch engine locates the child container through it and
  reconciles children in place; exactly one element per block should carry it,
  the marked container must hold **only child-block elements** (reconciliation
  is positional — a decorative node inside it gets trimmed on update), and the
  marker also works when overriding a builtin container flavour. A marker
  inside a nested block never leaks to an unmarked ancestor.
- **`inlineEmbeds`** maps an embed key (the single key of the delta's `insert`
  object) to a view factory. It is consulted before the bundled inline Embed
  converters (`icon`, `image`, `date`, `mention`, `latex`, `shape`, and
  `word-art`); a factory that **throws falls back to the generic embed chip**
  instead of breaking the document. The editor-side `EmbedConverter` contract
  is DOM-compatible, so an existing readonly converter usually plugs in
  directly: `{person: personConverter.toView}`.
- Async work (fetching preview data, heavy rendering) belongs in
  `ctx.scheduleEnhancement(task)` — namespace `task.key` with your flavour to
  avoid cache collisions with builtin tasks.

## Markdown Stream Viewer

When the host receives Markdown progressively, use the standalone Markdown stream viewer instead of building snapshots manually.

```typescript
import {
  createMarkdownStreamViewer,
  createBundledEditorCapabilities,
} from '@org/blockcraft-editor'

const capabilities = createBundledEditorCapabilities({
  additionalSchemas: [weatherSchema],
  additionalBlockAdapters: [weatherAdapters],
})

const streamViewer = createMarkdownStreamViewer({
  container: containerEl,
  adapterRegistry: capabilities.adapterRegistry,
  markdownProfile: 'blockcraft',
  onError: error => reportMarkdownStreamError(error),
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

`adapterRegistry` and `markdownProfile` are optional. They default to
`BUNDLED_ADAPTER_REGISTRY` and `hybrid`. The default combines ordinary Markdown
with directives from Block adapters that explicitly opt in. A host that streams
its own directives must pass the same composed registry used by the editor;
select `portable` to forbid private export syntax or `blockcraft` when private
Inline Embed directives are also required. `viewerOptions` remains a separate rendering concern: add a
custom block/Inline Embed renderer there when the parsed custom snapshot also
needs a host-specific view.

The Stream layer does not maintain a second Block grammar or split the source
into independently parsed Markdown windows. Once per coalesced render it sends
the complete accumulated source through the same `MarkdownAdapter` and supplied
registry. Multiline or nested directives and fenced custom Blocks therefore
follow the exact matcher priority/`consumes` rules of a one-shot Markdown
import, while rapid chunks are collapsed to avoid redundant parses.

Method semantics:

- `append(chunk)` — append-only convenience for chunk streams
- `replace(fullMarkdown)` — replace the current full Markdown text, useful when the producer rewrites prior content
- `finish()` — mark the source finalized and flush the latest accumulated text; it does not change Markdown parsing semantics
- `destroy()` — clear viewer resources

If adapter parsing or snapshot rendering fails, the viewer keeps its last
successfully rendered snapshot, calls `onError(error)` when supplied, and lets
the next `append()` or `replace()` retry from the complete current source.

Use the exported `MarkdownStreamRenderer` only when progressive Markdown must
mutate an initialized, editable `BlockCraftDoc`. It preserves compatible block
IDs, computes props/text/structure patches from `BlockModelGraph`, and writes
through `DocCRUD` in an `ORIGIN_NO_RECORD` transaction. Root blocks that are
offscreen under virtualization remain model-only; streaming does not acquire a
full-document view lease or materialize their components. The standalone stream
viewer above remains the preferred path for display-only output.

`MarkdownStreamRenderer` also coalesces scheduled input around the injected
Markdown adapter. If new source arrives while parsing, the stale Snapshot is
discarded and the latest complete source is parsed before applying DocCRUD
changes. A failed call rejects its returned Promise, but does not poison later
`append()`/`replace()` calls; `destroy()` prevents in-flight work from mutating
the document.

### Read-only AI Markdown responses

`blockcraft-agent` can expose the active Markdown Adapter grammar to a model
without granting document writes. Pass the same registry/profile used by the
editor to `BlockCraftEditorAgent`; each chat request receives a fresh document
context plus `runtime.markdown` from
`adapterRegistry.createMarkdownManifest(profile)`:

```typescript
const agent = new BlockCraftEditorAgent(doc, runner, {
  markdown: {
    adapterRegistry: capabilities.adapterRegistry,
    profile: 'hybrid',
  },
})

const viewer = createMarkdownStreamViewer({
  container: messageHost,
  adapterRegistry: capabilities.adapterRegistry,
  markdownProfile: 'hybrid',
  viewerOptions: {resourcePolicy: 'visible'},
})

for await (const event of agent.streamMarkdown({
  markdownStreamVersion: 1,
  instruction: '根据当前文档给出一份提纲',
  context: agent.getContext('document')!,
})) {
  if (event.type === 'delta') viewer.append(event.delta)
  else viewer.finish()
}
```

This path is display-only: it does not create operations, Revision records or a
readonly `BlockCraftDoc`. `DocumentAgentPanelComponent` supports an opt-in
`markdownChat` config and emits `chatRequest` separately from its existing
structured edit `request`. A completed reply emits `insertMarkdown`; the host
must parse that original Markdown with its active Adapter and insert the
resulting Snapshot through `ClipboardManager.applyPasteOption()` at the
click-time text Selection. Never scrape the rendered DOM or write through
`MarkdownStreamRenderer` for a chat preview.

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
    { provide: DOC_WEATHER_SERVICE_TOKEN, useClass: MyDocWeatherService },
  ],
  standalone: true,
})
export class MyDocShellComponent { /* ... */ }
```

`DOC_WEATHER_SERVICE_TOKEN` belongs to the host component injector, not to
`DocConfig`, and follows the same Doc-injected service pattern as
`DOC_LINK_PREVIEWER_SERVICE_TOKEN`. `query()` receives no date for live weather
and an ISO `date` for a fixed document-day value:

```typescript
class MyDocWeatherService extends DocWeatherService {
  override query = (request?: DocWeatherQuery, signal?: AbortSignal) =>
    request?.date
      ? this.weather.history(request.date, signal)
      : this.weather.current(signal)
}
```

The weather block never fetches while projected as a template draft. In a
normal document it fetches after mount; fixed-date results are persisted to
`props.frozen` through Yjs when the block is writable, while live results remain
runtime-only.

### Required Service Contracts

需要独立定义宿主能力时使用一个聚合类型入口：

```typescript
import type {
  DocFilePort, DocAttachmentInfo, UploadProgressCallback,
  DocMessagePort, DocLinkPreviewPort, LinkPreviewData,
  DocWeatherPort, DocWeatherData, DocWeatherQuery, DocWeatherTone,
} from '@ccc/blockcraft/framework/ports';
```

该入口只有契约，无 Angular、Yjs、默认实现或运行时副作用；声明需要浏览器类型库，
因为保留原来的 `File`、`FileList`、`AbortSignal` 参数。上述类型也从原主入口导出。
`HtmlAdapter`、`MarkdownAdapter` 与 `AdapterContext.fileManager` 使用 `DocFilePort`，
其公开结构与原 `DocFileService` 等价，现有文件服务可直接传入。

原类与 Token 继续从 `@ccc/blockcraft` 导入，provider 写法和注入结果类型不变：

- `DocFileService` / `DocMessageService` 实现位于 `framework/host/`，实现对应 Port，保留原抽象方法要求。
  文件基类仍提供下载与文件选择默认方法；只实现 `DocFilePort` 的宿主需要自行提供全部能力。
- 文件、消息、链接、天气、Adapter、块创建器六个 Token 的唯一定义位于 `framework/angular/host-service-tokens.ts`，旧服务文件转导出同一实例。
  原服务类泛型保留为 type-only 兼容引用；不为 Angular 接入层或单个服务新增 npm 子入口。
- `DocLinkPreviewerService` / `DocWeatherService` 的实现归入 `editor/services/`；旧路径转导出同一个类。
  链接服务的供应商响应 `LinkPreviewResponseData` 与 `isAbortError` 继续由原主入口提供，
  不放入 ports；天气默认实现仍明确抛出未配置错误。

`DocAdapterService`、`BlockCreatorService` 也归属 `framework/host/`；它们依赖编辑器注册表，
不加入纯 ports。Overlay 归属 `framework/angular/`；对象操作、拖放、文档视图分别归属
`framework/modules/object/`、`framework/modules/drag-drop/`、`framework/doc/view/`。
`framework/services` 仅作旧路径转导出，所有类与 Token 共用同一份实现。

公共 `BlockCraftDoc(config)` 与 Builder 的默认装配位于 `editor/document.ts` / `editor/doc-builder.ts`。
公共 ClipboardManager 位于 `editor/clipboard-manager.ts`，缺省仍支持内置来源；无需修改现有宿主。
领域实现接收内部 `DocumentRuntime`，它不属于 DocConfig，也不是新的 npm API；不要把默认来源、
Embed 注册写成全局可变初始化。旧 Token 的两个具体服务类类型引用仍为兼容保留，
因此没有新增宣称整个 framework 可独立发布的入口。

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
  // 基类提供的默认实现；DocFilePort 中仍为必需方法。
  downloadAttachment(options: Pick<DocAttachmentInfo, 'url' | 'name'>): Promise<void>
  inputFiles(accept?: string, multiple?: boolean): Promise<FileList>
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

剪贴板来源通过可选的 `clipboardSourceAdapters` 列表装配，与双向 MIME `supportedAdapters`
分开。默认 `AdapterService` 使用 `BUNDLED_CLIPBOARD_SOURCE_ADAPTERS`；旧自定义服务不声明该字段
时仍获得原有有道云支持。宿主可显式设置 `[]` 关闭来源适配，或设置
`[mySource, ...BUNDLED_CLIPBOARD_SOURCE_ADAPTERS]` 扩展。来源 hook 与资源收尾要求见
`blockcraft-adapter.md` 的“剪贴板来源装配契约”；无需新增 provider 或 npm 子入口。

Wraps `HtmlAdapter` and `MarkdownAdapter` with `BUNDLED_ADAPTER_REGISTRY`, which
covers every bundled Block flavour and all seven Inline Embed keys. The host can
subclass it and use `createBundledAdapterRegistry({additionalBlocks,
additionalInlineEmbeds})` for external domains. New integrations should pass a
registry rather than copying or mutating legacy matcher arrays; see
`blockcraft-adapter.md`. Markdown uses the `hybrid` profile by default: native
Markdown remains the base and explicitly opted custom Block adapters retain
their container directives. Use `portable` for standard-only output and
`blockcraft` when private Inline Embed directives are also needed. Both adapter constructors require this explicit registry (or an
explicit matcher array); the core adapter layer has no implicit bundled
defaults.

Custom Block directive parameters use leading YAML front matter delimited by
`---`. Hosts should compose a contribution and let
`MarkdownAdapter` read/write that metadata; do not hand-build percent-encoded
`props` attributes. Canonical container output leaves one blank line between
the opening/closing directive fences and the body. Import accepts zero or more
blank lines at those boundaries.

The bundled `AdapterService` resolves its registry through
`EDITOR_ADAPTER_REGISTRY_TOKEN`. No override is needed for bundled-only docs.
When a host adds Block or Inline Embed domains, define the contribution arrays
once and use them both for the provider and for the capability factory:

```typescript
const HOST_BLOCK_ADAPTERS = [myCustomBlockAdapters] as const
const HOST_INLINE_EMBED_ADAPTERS = [myEmbedAdapters] as const
const HOST_ADAPTER_REGISTRY = createBundledAdapterRegistry({
  additionalBlocks: HOST_BLOCK_ADAPTERS,
  additionalInlineEmbeds: HOST_INLINE_EMBED_ADAPTERS,
})

@Component({
  // ...
  providers: [
    {provide: EDITOR_ADAPTER_REGISTRY_TOKEN, useValue: HOST_ADAPTER_REGISTRY},
    {provide: DOC_ADAPTER_SERVICE_TOKEN, useClass: AdapterService},
  ],
})
export class MyDocShellComponent {}
```

Provide both tokens in the same Angular injector boundary. Registering a
custom Schema or converter only in `BlockCraftDoc` does not mutate the adapter
service and is rejected by the bundled capability factory when the matching
contribution is missing.

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
  additionalBlockAdapters: HOST_BLOCK_ADAPTERS,
  additionalEmbeds: [['my-embed', myEmbedConverter]],
  additionalInlineEmbedAdapters: HOST_INLINE_EMBED_ADAPTERS,
})

const doc = new BlockCraftDoc({
  // ...required config
  schemas: capabilities.schemas,
  embeds: [...capabilities.embeds],
  plugins: [...capabilities.plugins],
})
```

The result also exposes `schemaDefinitions`, `adapterRegistry`, `blockMaterials`,
`paginationPlugin`, `revisionReviewPlugin` and `translatePlugin`. `blockMaterials` is the
BlockController-aligned projection for insertion UIs; internal child schemas,
root and infrastructure blocks (`placement-layout`, `object-group`) remain
registered but hidden. The factory
throws on duplicate block flavours, embed names or plugin names; it also throws
when a custom Schema/Embed has no same-flavour/key adapter contribution. An
`InlineEmbedAdapterContribution` with `createDomConverter` can be passed without
an `additionalEmbeds` tuple—the factory creates a fresh converter from it. If
the converter is data-bound and the contribution has no factory, pass the
explicit tuple as shown above.

The bundled `embeds` list includes fresh `shape` and `word-art` converters, so
the bundled Shape/WordArt toolbar Plugins can switch those blocks to inline or
square-wrap representations. A manually assembled host must pair each Plugin
with `createInlineShapeEmbedConverter()` or
`createInlineWordArtEmbedConverter()` in `DocConfig.embeds`; without the
converter the Plugin warns and does not write an unrenderable Delta.

`BlockCraftDoc` also installs the stateless `icon` and `image` converters by
default, independently of the bundled capability factory. Existing
document-library deltas such as `{insert: {icon: 'bc_icon bc_document'}}`
therefore render without host registration. An explicit same-key entry in
`DocConfig.embeds` still overrides either default converter.

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
the plugin moves the whole root instead of rewriting placement data. Absolute
`position.x/y` always use fixed layout pixels from the root content-box origin;
root padding is excluded in continuous view, pagination, readonly rendering and
fixed-page export. Undo history and collaborative data are not rewritten when
the view changes.

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

### 本地视频封面

视频创建参数 `poster` 会保存到快照，并直接绑定到视频元素；重新打开、复制和协同更新均复用该字段。
仅持有本地 `File` 的可编辑视频上传流程异步提取一张 JPEG（最长边 640px，最多等待 6 秒），
不播放视频。提帧与视频上传并行，视频成功后立即可用，封面随后通过宿主 `uploadImg()` 保存。
同一宿主和 `File` 复用上传/提帧任务，视图挂载不是远端或历史视频自动提帧的触发器。
已有封面不重新提取；封面失败不改变视频上传结果。写回前检查块存在、权限、视频 URL 和封面是否改变。
临时 blob URL 不写入 `poster`；最终 URL 的持久化能力由宿主图片上传服务保证。
此行为无需修改 `DocFileService` 契约；外链与历史无封面视频不会在打开文档时自动下载或补图。

### Paginated PDF and Printing

分页资源准备只操作导出副本：视频有非空 `poster` 时保留封面；缺省、空字符串或纯空白
封面时保留等尺寸的视频占位，不额外加载视频或提帧。
不能用 `video.poster` 判空：`poster=""` 的 URL getter 会解析为当前文档地址。
视频封面是可选资源；加载、解码或超时失败在 strict / best-effort 下均输出占位与 warning，
不中断导出。显式取消仍中止任务，普通图片与字体继续遵守原有资源策略。
封面加载/解码错误标明“视频封面”，不会误报普通图片。API 和文档模型不变，宿主升级后生效。

```typescript
const exports = new DocExportManager(doc)

await exports.exportToHtml('document.html')
await exports.exportToMarkdown('document.md')

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

JSON, HTML, Markdown, print and PDF are clean exports. They obtain content from
`doc.revisions.projectFinalSnapshot()`: pending revisions are projected as
accepted; imported legacy rejected revisions are reversed; and any legacy
decision or structure conflict throws `RevisionConflictError`. When pending
revision records remain, PDF does
not reuse markup-view geometry and performs a readonly final-projection reflow.

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
owns the normal under/flow/over stacking tiers. In flow, live pagination, and
print, the placement plane starts at `0/0` inside the root content box and fills
that content width. Fixed `position.x/y` never include root padding.
A non-empty placement snapshot without its readonly
DOM plane is a strict `layout-diverged` failure, not a silent content drop.
If a custom render provider disables pagination, changes root sizing, or rebuilds
the readonly view after the page layout becomes stable, capture the plane first:

```typescript
const placementPlanes = captureStablePrintPlacementPlanes(readonlyRoot)
// It is now safe to switch the readonly root into its print/flow state.
return {root: readonlyRoot, placementPlanes, dispose}
```

`PrintRenderResult.placementPlanes` is then the only placement DOM source;
BlockCraft does not fall back to the changed root when that stable set is
present. The helper deep-clones each root plane and records every absolute
block's visual bounds relative to the plane content box, with host zoom removed.
Fixed-page assembly validates the first canonical projection in O(objects):
strict mode throws `layout-diverged`, while best-effort mode emits a warning.
Assembly does not reuse the framework-owned placement host. It mounts the
captured content tree inside a fresh print wrapper whose `offsetParent` is the
page `.bc-print-content`, with `left/top = 0/0`, `width = 100%`, and `zoom = 1`.
The hidden build surface is laid out at viewport `0/0` instead of a very large
negative coordinate so WebKit cannot quantize parent and zero-height child boxes
into different coordinate ranges.
When the host rebuilds print pages from an already projected isolated view,
pass the result of `captureStableLayout()` unchanged. The snapshot now owns the
canonical root content-box placement origin in `StablePaginationLayout.placementOriginY`;
BlockCraft derives it from resolved page margins, chrome and first-page leading
geometry before pagination is disabled. It never reads DOMRect or the plane's
computed CSS `top`. The older `PrintRenderResult.placementOriginX/Y`
and `placementWidth` fields remain compatibility diagnostics.
The pagination surface has a minimum width equal to the current sheet width.
The root, host header, and page sheet all use the same `left: 50%` plus
`translateX(-50%)` centerline instead of mixing flex and absolute centering.
This keeps them aligned in narrow/custom-element hosts; overflow becomes
horizontal scrolling rather than a root-only alignment fallback.

WordArt display is CSS-text-native in editable, readonly, snapshot and inline
surfaces. The same real text node owns font geometry, fill, gradient, outline,
shadow, effect transform, caret and selection; no SVG glyph mirror is generated.
Fixed-page export keeps that cloned text box and freezes only deterministic CSS.
On WKWebView native PDF, gradient fill deliberately falls back to the first
gradient color because WebKit may otherwise paint `background-clip:text` as a
full rectangle. Solid fill and all non-gradient effects remain unchanged.

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
    idlePrefetch: true,        // optional — default false; safe text roots only
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
    segmentGap?: number                   // --bc-segments-gap; non-negative
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

`layoutMetrics` is the document-wide typography/spacing source for model-first height
projection. When omitted, BlockCraft reads the initialized root's computed
`font-size`, `line-height` and `--bc-segments-gap` exactly once. Estimators never call
`getComputedStyle()` themselves. A host that changes `--bc-fs` / `--bc-lh`
after initialization must use one of the explicit refresh paths:

```typescript
// Make the supplied pixel metrics authoritative and update the root CSS vars.
doc.updateLayoutMetrics({baseFontSize: 18, lineHeight: 27, segmentGap: 10})

// Or change CSS externally first, then perform one deliberate computed read.
doc.refreshLayoutMetrics()
```

Both APIs invalidate continuous virtualization and sparse pagination estimates;
mounted blocks still converge through their normal `ResizeObserver` path.
Schema `metadata.virtualization.estimateHeight(context)` callbacks receive the
same `baseFontSize`, `lineHeight` and `segmentGap` facts alongside
`rootContentWidth`. Paragraph `lh/psb/psa` changes invalidate the
model-first estimate; no estimator reads DOM or materializes offscreen deltas.

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
- `idlePrefetch` defaults to `false`. When enabled, BlockCraft uses idle slices
  to speculatively materialize and measure only direct-root text Schemas whose
  `metadata.virtualization.speculativeMount` is `'safe'`. It first warms the
  eligible range within one projected viewport of the mounted window, then
  sweeps more distant eligible roots as later idle budgets allow.
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
  `position.y` plus estimated height with the root-relative viewport and one
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

Idle prefetch uses `requestIdleCallback` when the browser provides it and a
cancellable short-budget timer fallback otherwise. It is deliberately narrower than
ordinary mounting: the first release excludes tables, media, iframe/resource
views, asynchronous widgets and container render units even if they are
offscreen. A custom Schema must declare `'safe'` only when constructing its text
view is deterministic and idempotent, writes no Yjs/model state, emits no
notification, starts no network/upload work or media decoding/playback, and
registers no global listener or other side effect that detach/destroy cannot
fully release; see `blockcraft-block.md`.
The audited built-ins are `paragraph`, `ordered`, `bullet`, `todo`,
`blockquote`, and `caption`.

The prefetcher never shares measured coordinates between layout modes. Flow
measurements update only continuous virtualization, while sparse-pagination
measurements update only its paginated geometry. Default live pagination already
holds the full-document view lease and therefore receives no additional benefit
or second full-document pass from `idlePrefetch`.

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

Load the CSES UI global entry for the built-in CSES inputs, buttons, menus and
overlays, then load the unchanged BlockCraft base and selected theme. The
BlockCraft `--bc-*` theme contract remains independent.

```scss
// styles.scss
@use '@cses/ui/styles/cses-ui';
@use '@ccc/blockcraft/themes/base';
@use '@ccc/blockcraft/themes/light';
// or
@use '@ccc/blockcraft/themes/dark';
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

## Revision / Track Changes

Revision is optional and document-owned. The host supplies only an identity
snapshot and initial mode; authentication, authorization, role checks, epoch
admission and provider lifecycle stay outside the editor.

```typescript
const doc = new BlockCraftDoc({
  // normal DocConfig fields...
  revision: {
    actor: {
      actorId: session.user.id,
      displayName: session.user.displayName,
      avatarUrl: session.user.avatarUrl,
    },
    mode: 'off',
  },
})

doc.revisions.setMode('track')
capabilities.revisionReviewPlugin.state$.subscribe(state => {
  renderReviewPanel(state)
})
```

Programmatic assistants can write one visible, reviewable Diff without turning
on global tracking for later user input:

```typescript
doc.revisions.runAsRevision(
  {actorId: 'blockcraft-agent', displayName: 'BlockCraft AI'},
  () => {
    doc.crud.replaceText(blockId, from, length, replacement)
    doc.crud.insertBlockSnapshots(parentId, index, snapshots)
  },
  {groupId: agentRequestId},
)
```

`runAsRevision()` is a synchronous scoped write boundary. Inside the callback,
Revision-aware `DocCRUD` paths produce normal text/block and inline Embed
revision records under one review group; after it returns (or throws), the
previous actor, session and tracking state are restored. It does not emit a
`mode$` change and does not set `mode` to `track`. Keep the editor in
`viewMode: 'markup'` when the Diff should be visible. Inline Embed insertion is
one length-one insertion revision; a semantic Embed attribute update becomes
an old/new replacement pair in one group. Existing-block props, general text
formatting, block/Embed movement, table-cell structure and cross-container
structure remain available through the normal Yjs/Undo mutation path and
create no Diff; tracking mode is not a feature gate.

Calling `setMode('track')` without a non-empty `actorId` throws
`RevisionActorRequiredError`; the editor never creates anonymous revisions.
`RevisionReviewPlugin` is the optional headless review layer. It groups atomic
records by `groupId`, exposes model-only active/next/previous state and maps
`keep()` / `revert()` to immediate group materialization. The chosen content
and consumed records change in one normal Undo transaction. It creates no
component, DOM or Overlay and does not move Selection. Any host UI may bind to
`revisionReviewPlugin.state$` and obtain exact atomic type/text fragments with
`revisionReviewPlugin.readContent(itemId)`; the Plugin never decides whether the current
user may review. The host decides whether to render controls and whether to
call review commands. Internally it consumes the incremental Revision change
stream, so normal target-anchor rewrites do not force a full review-list scan.

Hosts that want the package's default UI can opt into it without changing the
headless Plugin:

```typescript
import {
  RevisionReviewPanelComponent,
  RevisionReviewUiController,
  type RevisionReviewIntent,
} from '@ccc/blockcraft'

reviewUi = new RevisionReviewUiController(doc, capabilities.revisionReviewPlugin, {
  canReview: () => this.sessionMayReview,
})

// Call after initBySnapshot/initByDocumentSnapshot has established the scroller.
reviewUi.attach()

onReviewIntent(intent: RevisionReviewIntent) {
  if (intent.type === 'close') {
    this.reviewPanelOpen = false
    return
  }
  reviewUi.handleIntent(intent)
}
```

```html
@if (reviewPanelOpen) {
  <bc-revision-review-panel
    [doc]="doc"
    [review]="capabilities.revisionReviewPlugin"
    [canReview]="sessionMayReview"
    (intent)="onReviewIntent($event)" />
}
```

Attaching the controller also enables the default connected popover when a
rendered `data-bc-revision-ids` marker is clicked. Text-only items require the
exact inline marker; their IDs are not copied to the editable block host, and
the controller defensively rejects a paragraph-host match. Whole-block and
split/merge boundary items remain block-anchored. Offscreen panel navigation
uses the document's stable block navigation and a single-block view lease; the
review panel must not acquire a full-document lease. Destroy the controller
with the host if the Doc is not destroyed at the same time. Give the panel the
same visible height as the editor viewport: it keeps review ordering model-side,
renders only anchors mounted by document virtualization, follows
`doc.scrollContainer` through coalesced animation-frame measurements and
forwards panel wheel input to that scroller. The default mini cards use
iconfont + Tooltip navigation/decision controls; the connected mini popover
shows actor, revision time and “接收修订 / 拒绝修订” icons only. These labels
still emit the headless `keep` / `revert` intents respectively.

`setViewMode('final')` validates conflicts and changes editor writeability, but
the clean document should be rendered from an isolated snapshot:

```typescript
doc.revisions.setViewMode('final')
const finalRoot = doc.revisions.projectFinalSnapshot()
const preview = new BlockCraftDoc({...previewConfig, readonly: true})
preview.initBySnapshot(finalRoot, finalContainer)
```

Pending changes are treated as proposed/accepted in Final; rejected changes are
reverse-projected. Any opposite review heads or structural overlap causes
`RevisionConflictError`, which also blocks clean HTML/Markdown/PDF export paths
that first request the final snapshot.

New review decisions no longer require a later compaction: accepting/rejecting
immediately materializes canonical content and removes the consumed records.
Undo restores that decision's content and pending records. `compactResolved()`
remains only for loading and migrating legacy snapshots that still contain
accepted/rejected records plus append-only decisions; it requires the current
epoch and exact Yjs state vector, then clears that legacy history and increments
`revisionEpoch`.

Immediate materialization intentionally makes review an online, serialized
host action. A collaboration provider must reject stale/offline review commands
or route them through an authoritative review service; unlike the legacy
append-only decision graph, two disconnected clients cannot safely make
opposite decisions and merge them later.

### BlockCraft Agent adapter contract

The separate `blockcraft-agent` package gives a model a compact, versioned
projection of the document instead of exposing Yjs internals or asking the
model to emit full Snapshots. Its v2 Document IR keeps the framework's existing
`nodeType` value, stable `blockId`, `parentId`, sibling `index`, and `childIds`.
Editable content is represented separately as `text: {plain, delta}`; ordinary
context omits recursive Snapshots. A full Snapshot is available only through
the guarded `blockcraft.get_block` read tool when a focused inspection needs it.

For structured requests with a `runTurn()` transport, `BlockCraftEditorAgent`
keeps small document contexts lossless. Once document scope exceeds its
model-context budget, it sends a DFS-ordered outline page
instead: every included block has `detail: 'outline'` plus bounded text,
property-key and child-count metadata, while `context.coverage` declares the
total range and `nextOffset`. Omitted blocks still belong to the whole-document
scope. The Master pages with `blockcraft.get_document_context({offset,
maxBlocks})`, searches the complete live model with `search_document`, and uses
`get_block` before an exact edit. The host separately retains the complete v2
context for content-fingerprint, structure, readonly, Schema and operation-plan
validation, so model payload compaction never weakens the write boundary.
`baseRevision.contentFingerprint` is an opaque fixed-size validation digest;
consumers must not parse it or treat it as document content.

After a candidate passes the complete host semantic preflight,
`BlockCraftEditorAgent` defaults to an independent quality gate for non-trivial
edits. Image-informed requests, multiple operations, structural edits, rich-text
Delta, large replacements and complex object props trigger the read-only
`quality-review` specialist. It returns a structured `review.verdict` plus
issues whose `operationIndexes` refer to the candidate. `pass` releases the
candidate; `revise` is appended to the bounded Master history as mandatory
feedback. The corrected candidate then passes semantic validation and quality
review again. By default the Master gets one repair attempt; another `revise`
fails closed without staging document changes. Simple single text replacements
and scalar prop updates avoid the extra model call.

Automatic review requires both `DocumentAgentTransport.runTurn()` and
`runSubAgent()`. In default `auto` mode, legacy transports retain their previous
behavior when either protocol is absent. `always` requires both protocols and
reviews every result containing operations; `off` disables this host gate:

```typescript
const agent = new BlockCraftEditorAgent(doc, runner, {
  orchestration: {
    qualityReview: {
      mode: 'auto',       // 'auto' | 'always' | 'off'
      maxRepairs: 1,      // clamped to 0..2
    },
  },
})
```

Uploaded and pasted images remain available to the Master, Markdown chat and
quality reviewer as source material for questions, text/fact extraction,
summarization and ordinary semantic edits. The Agent deliberately does not
reconstruct an image's visual layout, geometry or styling as BlockCraft shapes,
text boxes, WordArt, tables or other blocks. There is no candidate renderer or
screenshot step. A host should present the applied proposal through the normal
Revision Diff and batch accept/revert UI instead.

The automatic gate does not consume `maxDelegations`, which remains the
Master's manual specialist budget. Its own model-call bound is
`maxRepairs + 1` reviews. A quality specialist is still advisory and read-only:
it cannot execute tools or mutations, and only the Master may emit a repaired
`DocumentAgentResult`.

The default switch target is about 24 KB with at most 80 initial outline blocks
and 480 text characters per block. Hosts can tune these limits through
`BlockCraftEditorAgentOptions.modelContext`; `strategy: 'full'` restores the
legacy model payload for providers that already implement equivalent context
management. Calling `get_document_context` without pagination arguments remains
the complete-context compatibility path. Legacy `run()` transports and the
current Markdown stream have no read-tool loop, so they continue to receive a
complete context.

Every model-creatable Block must have a registered Agent capability. The
capability declares the Schema version, semantic roles, JSON Schema for
`createSnapshot()` parameters, JSON Schema for Agent-writable props, atomic
props, and examples. The model discovers capability IDs from context and reads
the authoritative contract with `blockcraft.get_capability`. If the capability
version no longer matches the registered Block Schema, creation fails closed.
Unknown flavours, unlisted props, invalid parent-child combinations, and raw
Snapshot insertion are rejected before document mutation.

Inline Embeds use the same opt-in rule, independently from Block creation.
`DocConfig.embeds` installs an `EmbedConverter` for rendering, while an
`InlineEmbedAgentCapabilityDefinition` provides optional Agent semantics and
an optional `insert` JSON Schema write grant. The Embed key is the canonical
value/attributes data contract: a same-key renderer override must preserve that
shape. A different data shape requires a different key and capability.

Custom and externally packaged Blocks own this declaration in
`blocks/<block>/agent/index.ts`, next to their Schema and component. The Block
package exports the declaration; the host composes it into an extension:

```typescript
import {MY_BLOCK_AGENT_CAPABILITY} from '@acme/blockcraft-my-block'
import {
  BlockCraftEditorAgent,
  type DocumentAgentHostExtension,
} from '@ccc/blockcraft-agent'

const acmeBlockExtension: DocumentAgentHostExtension = {
  id: 'acme.blocks',
  version: '1',
  description: 'ACME document Block contracts',
  capabilities: [MY_BLOCK_AGENT_CAPABILITY],
}

const agent = new BlockCraftEditorAgent(doc, runner, {
  extensions: [acmeBlockExtension],
})
```

External Embed packages should colocate the optional declaration with the
converter in `embeds/<embed-key>/agent/index.ts`, export it, and let the host
register it explicitly:

```typescript
import {
  MY_EMBED_AGENT_CAPABILITY,
  MY_EMBED_KEY,
  myEmbedConverter,
} from '@acme/blockcraft-my-embed'

const doc = new BlockCraftDoc({
  // schemas, plugins, ...
  embeds: [[MY_EMBED_KEY, myEmbedConverter]],
})

const acmeEmbedExtension: DocumentAgentHostExtension = {
  id: 'acme.embeds',
  version: '1',
  description: 'ACME Inline Embed contracts',
  capabilities: [MY_EMBED_AGENT_CAPABILITY],
}

const agent = new BlockCraftEditorAgent(doc, runner, {
  extensions: [acmeEmbedExtension],
})
```

Both the converter and same-key capability are required before the runtime
advertises Agent insertion. A converter without an Agent declaration remains
fully renderable; existing raw Delta remains in document context, but the
model cannot generate that Embed. A declaration without `insert` is
understanding-only. The built-in `mention`, `shape`, and `word-art`
declarations intentionally use that mode because their entity IDs or complex
lossless payloads cannot be safely invented. `BlockCraftEditorAgent`
automatically registers the built-in Block/Embed extension, then filters its
directory to the Schemas and converters actually installed in this Doc.

Both sides are required: an unregistered declaration is not discoverable at
runtime, while a registered capability whose flavour or Schema version is not
installed fails closed. If a Block needs no AI-specific understanding, omit
both its `agent/` declaration and registration. Providing a semantic-only
capability without `createParameters` and `writableProps` is also valid; the
Agent can understand it but cannot create or mutate its props.

An Inline Embed always consumes one model offset. Agent-authored object inserts
must contain exactly one installed key and validate against that capability's
complete value/attributes schemas. `retain + attributes` is restricted to
canonical general text formatting; Embed-semantic mutation is a delete of the
old one-offset range followed by a separately validated insert. A generic
range deletion can still remove an understanding-only or undeclared Embed; the
missing write grant prevents fabrication and semantic rewriting, not ordinary
document deletion.

Agent results contain only the constrained semantic operations
`replace-text`, `apply-text-delta`, `update-block-props`, `create-blocks`,
`replace-block`, `delete-blocks`, and `move-blocks`. Coordinates are sequential:
each offset or index is interpreted after earlier operations in the same
result. The host first compiles the full result against a shadow block tree,
including Schema, readonly, mutation-policy, Delta length, and cycle checks,
then applies the prepared plan in one Yjs transaction.

Revision coverage does not restrict this operation protocol. During scoped
Agent delivery, text and supported block-structure operations create visible
Revision records, while props/formatting, inline-object Delta and block movement
continue through their normal CRUD/Yjs/Undo paths with no Diff styling. A mixed
result executes as one validated plan; review decisions affect only the portion
represented by Revision records.

For ordinary tracked typing, `groupId` follows semantic continuity rather than
an idle timer. Adjacent same-actor edits in the same block and operation kind
remain one review batch even after a long pause. `setActor()`, a mode/session
reset, a different block/kind, a non-adjacent edit, or explicit `runInGroup()`
starts a new boundary.

Because Schema-generated IDs are not known to the model, `create-blocks` and
`replace-block` may bind a short `clientRef`. The generated root can then be
used as `create-blocks.parentId` for nested content or `move-blocks.targetId`
for existing content via `$ref:<clientRef>`. Initial text and props still belong
in the Schema parameters; text or prop operations cannot target a newly created
ref, and a plan cannot replace, delete, or move a block it just created. Nested
creates are folded into the owning generated Snapshot before the Yjs write, so
a new container and its contents remain one safe model-first insertion.

## Step 9 — Persistence

BlockCraft does **not** persist on its own. The host owns that. Two common patterns:

### A) Snapshot-based persistence (offline / single-user, no revisions)

```typescript
// Save: serialize the complete model without requiring mounted block views
const json = this.doc.exportSnapshot()
if (!json) throw new Error('Document model is not initialized')
await this.api.save(this.docId, json)

// Load: pass to initBySnapshot
const snapshot = await this.api.load(this.docId)
this.doc.initBySnapshot(snapshot, this.containerRef.nativeElement)
```

When revisions must survive save/load, use the complete document contract. The
inner `BlockCraftDocumentSnapshot.version` is currently `1`; any outer file or
database envelope and its migration policy belong to the host application.

```typescript
const complete = this.doc.exportDocumentSnapshot()
await this.api.save(this.docId, complete)

const restored = await this.api.load(this.docId)
this.doc.initByDocumentSnapshot(restored, this.containerRef.nativeElement)
```

`BlockCraftDocumentSnapshot` contains `root`, `revisions`, `decisions`, and
`revisionEpoch`. Existing `exportSnapshot()` / `initBySnapshot()` remain the
content-only compatibility path and intentionally do not persist review state.

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
doc.placement              // BlockPlacementManager — layout, positioning, alignment and fixed grouping
doc.objectSizing           // BlockObjectSizingManager — placement-plane-relative wr/ar resolution
doc.objectFormat           // BlockObjectFormatManager — normalized object format and mixed batch writes
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

`doc.objectFormat` is model-only: `resolve(blockId)` works for virtualized
objects, `readSelection(ids?)` returns capability intersections and mixed
values, and `updateSelection(expectedIds, patch, options?)` revalidates selection before
one Yjs transaction. `allowDetachedSelection` is reserved for an owning object
toolbar after it has verified that browser focus remains in its own panel or
CSES child overlay; a different non-empty model selection still fails closed.
Hosts should use the strict default instead of inspecting mounted Shape,
TextBox or WordArt components. A reset uses `null` for one section; an explicit
no-fill/no-outline uses a section whose `type` is `'none'`.

### Persistent document appearance

`RootBlockModel.props.background?: string` stores one CSS `background`
shorthand in the root Yjs props. A single value can represent background color,
image, x/y position, size, repeat, attachment and origin/clip without a verbose
document-data object. It is included in collaboration, Undo/Redo and
`doc.exportSnapshot()` automatically. `RootBlockModel.props.color?: string`
stores the default document text color and BlockCraft applies it to the root
host and its `--bc-color` theme token so normal text and headings inherit it;
explicit inline/block colors override the inherited value.

Document typography uses three compact root props: `ff` is a trusted font
catalog ID (`sans/hei/serif/kai/fang/mono`), `fs` is the base size in CSS pixels,
and `lh` is a unitless default line-height ratio. The live root and Snapshot
Viewer project them consistently. Updating `ff` explicitly invalidates layout
geometry even when measured font-size/line-height numbers are unchanged because
glyph metrics can rewrap text.

```typescript
const background =
  '#f7f7f7 url("https://cdn.example.com/bg.png") center 24px / cover no-repeat scroll'

doc.crud.updateBlockProps(doc.rootId, {
  background,
  color: '#182230',
  ff: 'serif',
  fs: 18,
  lh: 1.6,
})

const current = doc.model.getProps(doc.rootId)?.['background'] as string | undefined

// `null` deletes the prop instead of persisting an empty string.
doc.crud.updateBlockProps(doc.rootId, {
  background: null,
  color: null,
  ff: null,
  fs: null,
  lh: null,
})
```

The built-in fixed/floating text toolbars intentionally do not expose or mutate
these root defaults. Hosts should place them in a document settings or styles
surface and write through `DocCRUD`, keeping document ownership separate from
selection/paragraph formatting.

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
disposes this service automatically. Live block components should call
`resolveForBlock(blockId, flavour, props)` and `getReferenceWidth(blockId)`:
direct `object-group` children resolve against the group's fixed width without
adding another observer; all other blocks use the root width.

`doc.placement` is always constructed by `BlockCraftDoc`; hosts do not register
it as a plugin. The optional `DocConfig.placement` only adapts mode transitions
to a host layout domain. Its synchronous `transitionMode(context)` hook may call
`context.applyDefault()` or perform a complete host transition and return
`true`; `false`/`void` falls back to the standard structural transition. The hook is
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
  ObjectGroupBlockSchema,
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

doc.placement.canAlignObjects(['image-id', 'shape-id'], 'center')
doc.placement.alignObjects(['image-id', 'shape-id'], 'center')

doc.placement.canGroup(['image-id', 'shape-id'])
const groupId = doc.placement.group(['image-id', 'shape-id'])
if (groupId) doc.placement.ungroup(groupId)
```

The default implementation only lifts direct root children. It creates one
zero-height `placement-layout` as the final root child and moves all root absolute
objects below it. Its child contract is intentionally flavour-agnostic for
future custom shapes, but normalization retains only blocks whose own Schema
supports absolute placement. The layout is hidden from insertion, ordinary
sibling navigation, Gap selection and BlockController. `under` and `over`
children remain pointer-interactive and share the root coordinate/stacking scope.
Returning to top-bottom moves the object back near its current visual position;
an empty layout is removed after the model graph settles.

`object-group` is a fixed-pixel local placement plane whose outer frame can be
either a direct root top-bottom block or a root under/over object. Group members
keep their existing block IDs and group-local absolute `position`; an image's
`wr` becomes relative to group width. The bundled `ObjectFormatToolbarPlugin`
provides Shift-click selection, rotation-aware object alignment/distribution,
上下型/衬于文字下方/浮于文字上方 for the atomic group, and 组合/
取消组合. Alignment is a one-shot `position` mutation: it preserves each
object's size fields and layer.
A manual assembly must register `ObjectGroupBlockSchema` and one
`ObjectFormatToolbarPlugin`; the unified Plugin owns mixed selection, grouping
and per-flavour object formatting.

Mode is not stored in props. An ordinary direct root child is relative flow; a
direct child of `placement-layout` is absolute. Absolute children persist one
atomic `position: {x, y}` value in root-content layout pixels plus optional
`placementLayer: 'under'`; omitted layer means `over`. Relative children carry
neither field. Live and Snapshot DOM project
`data-bc-placement="absolute"` only for absolute objects. They never emit a
relative marker, and consumers must not treat that DOM attribute as model data.

Absolute objects form one total back-to-front stack: `under` children, ordinary
flow content as a virtual boundary, then `over` children. Sibling order inside
the placement layout defines order within each tier. The one-step movement APIs
swap adjacent objects in the same tier; the highest `under` object moving
forward becomes the lowest `over` object, and the lowest `over` object moving
backward becomes the highest `under` object. These crossings update child order
and `placementLayer` in one Yjs transaction without rewriting `position`. The
lowest `under` and highest
`over` objects are the disabled outer boundaries.

`startDrag()` is Pointer Events-only. The initiating `pointerdown` arms the
interaction, `pointermove` previews via `translate3d`, and `pointerup` commits
one atomic `{x, y}` coordinate-object update. `pointercancel`, Escape and window blur abort. Do not
wire object positioning to native `dragstart / dragover / drop`; native HTML5
drag/drop remains reserved for external browser/file interoperability.

`BLOCK_OBJECT_LAYOUT_OPTIONS` is the shared UI vocabulary and icon mapping:
`嵌入型 / bc_tuwenraopaiqianrushi`,
`上下型 / bc_tuwenraopaishangxiashi`,
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
the nearest sibling and clears `position` plus `placementLayer` in one
transaction.
Absolute → inline/wrap conversion follows the same root reanchor first; visual
overlap with another absolute object never makes that object's editable child a
conversion target.
When implementing another atomic conversion, resolve the stable-id anchor
before changing DOM/model state and consume it inside the conversion
transaction:

```typescript
const anchor = doc.placement.resolveFlowAnchor(block)
doc.crud.transact(() => {
  doc.placement.reanchorToFlow(block, anchor)
  // clear position/placementLayer or replace the reanchored block here
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
- [ ] Exact `@cses/ui@4.26.1` peer installed
- [ ] `@cses/ui/styles/cses-ui.scss` loaded for CSES component styles
- [ ] BlockCraft base + selected theme stylesheet imported
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

## 模板行内天气的宿主接入

行内天气与天气卡片共用 `DOC_WEATHER_SERVICE_TOKEN`，不在编辑器内引入定位/天气 API。
`createBundledEditorCapabilities()` 已带 converter、adapter 和格式编辑插件。
自建模板流程在写入新文档前调用：

```typescript
const children = await materializeInlineWeatherSnapshots(templateChildren, {
  createdAt: documentCreatedAt,
  weather: doc.injector.get(DOC_WEATHER_SERVICE_TOKEN),
  signal: creationAbort.signal,
})
// 确认创建操作仍有效后，用宿主已有 DocCRUD 初始化流程写入 children。
```

宿主负责取消已关闭的创建页面；勿在文档展示或格式切换时重复实例化。
Playground 模板面板提供「天气(行内)」，演示宿主使用 Mock 天气，真实应用继续提供业务天气服务。
显示格式/数据契约见 `blockcraft-embed.md` 的行内天气节。

## 结构变换授权（2026-09-22）

新增可选 `DocConfig.authorizeStructureTransform({purpose, operation}) => boolean`，默认拒绝；`operation` 为 `replace | undo | redo`。宿主应实时验证文档身份、所有者权限和业务资格。授权只用于 `applyDocumentStructurePlan` 及其历史回放，不改变普通编辑和用户锁行为。

```ts
// 原有宿主无需改动；需要结构切换时显式接入。
authorizeStructureTransform: ({purpose}) =>
  purpose === 'docs:switch-template' && isCurrentDocumentOwner()
```

异步加载、资源实例化和确认应在调用前完成；确认期间任何文档更新都应使预览失效。内核在同步提交和撤销/重做前拒绝只读、用户锁、活动输入法组合及未处理修订。业务 mutation policy 可识别 `context.structureTransform`，仅豁免已授权目的所需的区域保护。
