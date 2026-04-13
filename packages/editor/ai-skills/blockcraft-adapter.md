# BlockCraft: Creating Adapter Matchers

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Adapters handle HTML ↔ BlockSnapshot and Markdown ↔ BlockSnapshot conversion.
>
> Last updated: 2026-04-13

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
