# BlockCraft: Creating Adapter Matchers

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Adapters handle HTML ↔ BlockSnapshot and Markdown ↔ BlockSnapshot conversion.
>
> Last updated: 2026-08-04

## Architecture

```
HTML string → rehype-parse → HAST → ASTWalker → BlockSnapshot[]
BlockSnapshot[] → ASTWalker → HAST → rehype-stringify → HTML string

Markdown string → remark-parse → MDAST → ASTWalker → BlockSnapshot[]
BlockSnapshot[] → ASTWalker → MDAST → remark-stringify → Markdown string
```

Each block type needs a **matcher** for each adapter (HTML and/or Markdown). A matcher defines:
- `toMatch` — Does this AST node correspond to this block type?
- `fromMatch` — Does this block snapshot correspond to this block type?
- `toBlockSnapshot` — Convert AST node → BlockSnapshot (import)
- `fromBlockSnapshot` — Convert BlockSnapshot → AST node (export)

## Template: HTML Adapter Matcher (Void Block)

```typescript
// adapters/html-adapter/block-matchers/my-block-matcher.ts
import { BlockHtmlAdapterMatcher } from "../../types";
import { HastUtils } from "../../utils";
import { MyBlockSchema } from "../../../blocks/my-block";

export const myBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  // Import: match HAST node → should we handle this?
  toMatch: (o) => HastUtils.isElement(o.node) && o.node.tagName === 'my-tag',

  // Export: match BlockSnapshot → should we handle this?
  fromMatch: (o) => o.node.flavour === MyBlockSchema.flavour,

  // Import: HAST → BlockSnapshot
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) return;
      const { walkerContext } = context;

      const src = o.node.properties?.['src'] as string || '';

      walkerContext
        .openNode(
          {
            id: MyBlockSchema.createSnapshot(src).id,
            flavour: 'my-block',
            nodeType: BlockNodeType.void,
            props: { src },
            meta: {},
            children: [],
          },
          'children'
        )
        .closeNode();
    },
  },

  // Export: BlockSnapshot → HAST
  fromBlockSnapshot: {
    enter: (o, context) => {
      const { walkerContext } = context;
      const props = o.node.props as any;

      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'my-tag',
            properties: { src: props.src || '' },
            children: [],
          },
          'children'
        )
        .closeNode();
    },
  },
};
```

## Template: HTML Adapter Matcher (Editable Block with Inline Content)

```typescript
import { BlockHtmlAdapterMatcher } from "../../types";
import { HastUtils } from "../../utils";
import { generateId } from "../../../framework";
import { BlockNodeType } from "../../../framework";

export const myEditableBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: (o) =>
    HastUtils.isElement(o.node) && o.node.tagName === 'div' &&
    (o.node.properties?.['className'] as string[])?.includes('my-editable'),

  fromMatch: (o) => o.node.flavour === 'my-editable',

  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) return;
      const { walkerContext, deltaConverter } = context;

      // Convert child HAST nodes to delta operations
      const deltas = deltaConverter.astToDelta(o.node);

      walkerContext.openNode(
        {
          id: generateId(),
          flavour: 'my-editable',
          nodeType: BlockNodeType.editable,
          props: { delta: deltas },
          meta: {},
          children: [],
        },
        'children'
      );
      walkerContext.skipAllChildren();  // We consumed the children via deltaConverter
    },
    leave: (o, context) => {
      context.walkerContext.closeNode();
    },
  },

  fromBlockSnapshot: {
    enter: (o, context) => {
      const { walkerContext, deltaConverter } = context;
      const deltas = (o.node.props as any).delta || [];

      // Convert delta operations to HAST children
      const children = deltaConverter.deltaToAst(deltas);

      walkerContext.openNode(
        {
          type: 'element',
          tagName: 'div',
          properties: { className: ['my-editable'] },
          children,
        },
        'children'
      );
    },
    leave: (o, context) => {
      context.walkerContext.closeNode();
    },
  },
};
```

## Template: Markdown Adapter Matcher

```typescript
// adapters/markdown-adapter/block-matchers/my-block-matcher.ts
import { BlockMarkdownAdapterMatcher } from "../../types";
import { generateId } from "../../../framework";
import { BlockNodeType } from "../../../framework";

export const myBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  // Import: match MDAST node
  toMatch: (o) => o.node.type === 'myCustomNode',  // or standard MDAST types

  // Export: match block snapshot
  fromMatch: (o) => o.node.flavour === 'my-block',

  // Import: MDAST → BlockSnapshot
  toBlockSnapshot: {
    enter: (_, context) => {
      const { walkerContext } = context;
      walkerContext
        .openNode(
          {
            id: generateId(),
            flavour: 'my-block',
            nodeType: BlockNodeType.void,
            props: {},
            meta: {},
            children: [],
          },
          'children'
        )
        .closeNode();
    },
  },

  // Export: BlockSnapshot → MDAST
  fromBlockSnapshot: {
    enter: (_, context) => {
      const { walkerContext } = context;
      walkerContext
        .openNode({ type: 'thematicBreak' }, 'children')  // Standard MDAST node
        .closeNode();
    },
  },
};
```

## WalkerContext API

```typescript
walkerContext.openNode(node, childrenField)   // Push node onto stack
walkerContext.closeNode()                      // Pop and attach to parent
walkerContext.skipAllChildren()                // Don't traverse children (leaf node optimization)
walkerContext.setNodeValue(key, value)          // Set property on current open node
walkerContext.getNodeContext(key)               // Get property from nearest ancestor
walkerContext.setGlobalContext(key, value)      // Set global state
walkerContext.getGlobalContext(key)             // Get global state
```

## Registration

### HTML Adapter Matchers

```typescript
// adapters/html-adapter/block-matchers/index.ts
export const blockHtmlAdapterMatchers: BlockHtmlAdapterMatcher[] = [
  paragraphBlockHtmlAdapterMatcher,
  myBlockHtmlAdapterMatcher,  // Add here
  // ...
];
```

### Markdown Adapter Matchers

```typescript
// adapters/markdown-adapter/block-matchers/index.ts
export const blockMarkdownAdapterMatchers: BlockMarkdownAdapterMatcher[] = [
  paragraphBlockMarkdownAdapterMatcher,
  myBlockMarkdownAdapterMatcher,  // Add here
  // ...
];
```

## Media Blocks: Recommended Mapping

- **HTML export**: `video` / `audio` blocks should emit native media tags. Wrapping them in `<figure>` is recommended so generic paragraph matchers don't accidentally flatten them as inline content.
- **HTML import**: Prefer reading `src` from the media element first, then fall back to the first `<source>` child. Preserve useful metadata through `data-*` attributes such as `data-source-type`, `data-name`, `data-size`, `data-type`.
- **Markdown export**: Markdown has no stable native media syntax. Export media blocks as links and add a lightweight title hint, for example `[Clip](https://cdn.example.com/demo.mp4 "blockcraft:video")`.
- **Markdown import**: Recognize the media hint title first. If there is no hint, fall back to URL heuristics such as common media extensions or known video platform hosts.
- **Paragraph matcher interaction**: If your markdown/html paragraph matcher also accepts raw `html`, `div`, or `paragraph` nodes, explicitly exclude media-only nodes so both matchers do not consume the same source node.

Responsive object blocks preserve root-relative sizing in HTML with
`data-bc-wr` and `data-bc-ar`; CSS `width`/`aspect-ratio` is emitted for
portable display:

```html
<video
  src="https://cdn.example.com/demo.mp4"
  data-bc-wr="60"
  data-bc-ar="1.7777777778"
  style="width: 60%; aspect-ratio: 1.7777777778"></video>
```

Import prefers valid `data-bc-wr/data-bc-ar`, then falls back to legacy
`width/height` or `data-width`. Standard Markdown does not gain private size
syntax; an imported Markdown image therefore uses its Schema defaults.

## Shape Block Mapping

`placement-layout` is a BlockCraft-internal snapshot container. HTML/Markdown
walkers deliberately do not emit a visible wrapper for it; they continue into
its children. HTML therefore preserves an equivalent recoverable structure on
the object itself:

- image blocks emit `<figure data-bc-block="image">` with
  `data-image-placement-mode/x/y/layer`;
- shape blocks keep the placement fields described below;
- importing those objects produces root-level absolute snapshots, and
  `BlockPlacementManager` normalizes them below the root layout when the
  document initializes.

Markdown has no portable absolute-layout primitive and continues to use the
existing readable degradation. Internal BlockCraft snapshot copy/paste retains
the complete `placement-layout` subtree.

The built-in `shape` matcher uses
`<figure data-bc-block="shape">` as a lossless HTML envelope. Shape type,
dimensions, fill, outline, text styling and absolute placement are stored in
`data-shape-*` attributes. Rotation is stored in
`data-shape-rotation="<degrees>"`; the collaborative child deltas are
serialized inside `<div data-bc-shape-text>`. Empty shapes omit that element,
and HTML import keeps them childless; non-empty text creates the single
`shape-text` child. Import passes untrusted attributes, including rotation,
through `normalizeShapeProps()` before creating the snapshot.

Markdown has no portable shape primitive. Export therefore degrades a shape to
one readable paragraph built from its `shape-text` deltas; importing that
Markdown produces a normal paragraph rather than attempting to reconstruct
geometry.

## WordArt Block Mapping

The built-in editable `word-art` matcher uses
`<figure data-bc-block="word-art">`. Its direct plain-text deltas live in
`<div data-bc-word-art-text>`; dimensions, typography, fill, gradient arrays,
outline, shadow, safe effect and absolute placement are stored in bounded
`data-word-art-*` attributes. Export also emits sanitized inline presentation
CSS so the HTML remains visually useful without BlockCraft themes.

HTML import ignores raw presentation CSS and rebuilds props only from the
allowlisted data attributes through `normalizeWordArtProps()`. Inline
formatting and embeds are stripped because WordArt styling is whole-block and
the Schema is `plainTextOnly`. Markdown has no portable WordArt primitive, so
export produces a readable paragraph and reimport intentionally produces a
normal paragraph.

Inline `shape` and `word-art` representations use a separate lossless HTML
envelope: `<span data-bc-inline-object="shape|word-art">`. The payload remains
the primitive JSON string stored in the Embed, while `width/height` and
optional square-wrap fields are emitted as bounded `data-bc-*` attributes.
Import normalizes the payload through the matching `read/createInline*Delta`
helpers. Markdown cannot reconstruct object presentation and emits only the
embedded shape/WordArt text as ordinary inline text.

## Checklist

- [ ] `toMatch` correctly identifies the source AST node type
- [ ] `fromMatch` correctly identifies the block flavour
- [ ] `toBlockSnapshot` produces valid `IBlockSnapshot` with correct `flavour`, `nodeType`, `props`
- [ ] `fromBlockSnapshot` produces valid AST nodes (HAST for HTML, MDAST for Markdown)
- [ ] For editable blocks: inline content converted via `deltaConverter`
- [ ] `skipAllChildren()` called when children are consumed by deltaConverter
- [ ] `openNode`/`closeNode` are properly balanced (enter opens, leave closes)
- [ ] Matcher registered in the corresponding matchers index file

## Reference: Real Matcher Examples

| Block | HTML Matcher | Markdown Matcher |
|-------|-------------|-----------------|
| Divider | `html-adapter/block-matchers/divider-matcher.ts` | `markdown-adapter/block-matchers/divider-matcher.ts` |
| Paragraph | `html-adapter/block-matchers/paragraph-matchers.ts` | `markdown-adapter/block-matchers/paragraph-matcher.ts` |
| Image | `html-adapter/block-matchers/image-matcher.ts` | `markdown-adapter/block-matchers/image-matcher.ts` |
| Code | `html-adapter/block-matchers/code-matcher.ts` | `markdown-adapter/block-matchers/code-matcher.ts` |
| Video / Audio | `html-adapter/block-matchers/media-matcher.ts` | `markdown-adapter/block-matchers/media-matcher.ts` |
| Shape | `html-adapter/block-matchers/shape-matcher.ts` | `markdown-adapter/block-matchers/shape-matcher.ts` |
| WordArt | `html-adapter/block-matchers/word-art-matcher.ts` | `markdown-adapter/block-matchers/word-art-matcher.ts` |

## 有道云笔记 `text/yne-json` 剪贴板适配器

有道云笔记复制时在剪贴板写入高保真私有格式 `text/yne-json`（结构化块数组）+ `text/yne-image-json`（图片 URL→base64）。`adapters/yne-adapter/` 把它直接翻译成 `BlockSnapshot`，绕过有损的 HTML。

- **入口**：`parseYneClipboard(state, doc): YneParseResult | null`（`adapters/yne-adapter/index.ts`）。
- **优先级**：`ClipboardManager.onPaste` 中位于 internal snapshot 之后、`text/html` 之前；解析失败/未知块返回 `null` → 回退 HTML。
- **与 html/markdown adapter 的区别**：yne-json 是纯 JSON，不走 unified/rehype/remark + `ASTWalker`，因此独立成模块，不接入 `doc.adapter` 统一管线。
- **图片**：base64 → `File` → `fileService.createObjectURL` → image block 自动上传。
- **附件**：先用有道云 URL 建块，插入后 `rehostYneAttachments` 异步 fetch 重传（best-effort，CORS/鉴权失败则保留原 URL）。
- **样式映射**：`bold/italic/strike → a:*`，`color/back-color/font-size → s:color/s:background/s:fontSize`；标题丢弃冗余 font-size。

### 有道云 HTML `data-content` 路径（Tauri/WKWebView 必需）

WKWebView（Tauri）及部分浏览器会从 `paste` 事件里**剥离自定义剪贴板 MIME**（`text/yne-json` / `text/yne-image-json`），只留 `text/html`——此时上面的 `text/yne-json` 分支拿不到数据，会回退到有损 HTML（附件变图片、行内 CSS 样式丢失）。但完整高保真结构仍嵌在 HTML 里的 `<article data-content="…bulb JSON…">`（HTML 属性，不会被剥离），图片字节也在可见 `<img data-media-type="image" src="data:…">` 中。

- **入口**：`parseYoudaoHtml(html, fileService): IBlockSnapshot | null`（`adapters/yne-adapter/youdao-html.ts`）；用 `isYoudaoHtml(html)` 先做 marker 预判。
- **位置（关键）**：解析在 **`HtmlAdapter.toBlockSnapshot` 内短路**——`isYoudaoHtml(html)` 命中就走 bulb 高保真解析、跳过通用 HAST，否则照常。**HTML→snapshot 全部归 Adapter 层**，`clipboard.ts` 不再特判有道云（符合 DDD「Block 不解析 HTML，走 Adapter 防腐层」）。浏览器仍优先 `text/yne-json` 分支；Tauri 等被剥离自定义 MIME 的环境由这条 HTML 路径兜住。
- **格式**：bulb 格式（`{name, data, nodes:[{type:'text', leaves:[{text, marks}]}]}`），见 `bulb-converter.ts`。marks 映射：`bold/italic/delete/underline → a:*`，`color/backgroundColor → s:color/s:background`，`fontSize → s:fontSize`。
- **表格**：bulb 表格是嵌套（table>row>cell，省略被合并格），转换时按 colSpan/rowSpan 重建网格并补 `display:'none'` 占位格。
- **图片**：从可见 `<img data:base64>` 按文档顺序取字节（`text/yne-image-json` 被剥离时的唯一字节来源）→ `fileService.createObjectURL` → image block 自动上传。
- **代码 / 图表**：bulb `code`/`diagram` 把每行包成 `code-line` 子块（`type:'block'`，文本在其子节点里），转换时下钻 `code-line` 并以 `\n` 连接；语言经 `mapLang` 大小写不敏感解析到 `CodeBlockLanguage`，无匹配（如 PlantUML/Mermaid）回退 `PlainText`。`diagram` 无原生对应，按代码块保留源码。
- **未知块容错**：单个不认识的 bulb 块**不会**中断整篇解析——降级为保留其文本的段落（无文本则丢弃），而非抛错。整篇回退到有损 HTML 仅用于真正无法解析的 payload（无 `<article>` / JSON 损坏）。
- **附件重传（关键拆分）**：附件的异步 fetch 重传是**插入后、协同敏感**的副作用，不在 adapter 里做。两条有道云路径都用 `buildAttachmentSnapshot` 在 attachment snapshot 的 `meta` 上打**临时重传标记**；`clipboard.ts` 在插入/克隆前用 `collectAndStripRehostMarkers` 统一**收集并剥离**标记（绝不写进 Yjs、不同步给协同端），插入后再 `rehostYneAttachments` 异步重传（只有本地粘贴者做）。
