# BlockCraft: Inline / Blot System Deep Dive

> **Level 2: Mechanism Deep Dive** — Only read this when modifying the inline editing system.
>
> Last updated: 2026-07-31

## Architecture Overview

```
Y.Text (Yjs, source of truth)
  → toDelta() → DeltaInsert[]
  → InlineRuntime.render(deltas) or applyDelta(ops)
  → ScrollBlot tree (runtime middle layer)
  → DOM (<div.edit-container> with <c-element>/<c-text> tags)
```

## Key Files

| File | Purpose |
|------|---------|
| `framework/block-std/inline/index.ts` | `InlineManager` (static utils) + `EmbedConverter` type |
| `framework/block-std/inline/runtime/` | `InlineRuntime` — per-block blot coordinator |
| `framework/block-std/inline/blot/scroll-blot.ts` | `ScrollBlot` — root container blot |
| `framework/block-std/inline/blot/text-blot.ts` | `TextBlot` — renders text with attributes |
| `framework/block-std/inline/blot/embed-blot.ts` | `EmbedBlot` — renders inline embeds (length=1) |
| `framework/block-std/inline/blot/break-blot.ts` | `BreakBlot` — end-of-block break (length=0) |
| `framework/block-std/inline/blot/cursor-blot.ts` | `CursorBlot` — temporary IME blot (length=0) |
| `framework/block-std/inline/position/` | `InlinePositionMapper` — model ↔ DOM position |
| `framework/block-std/inline/const.ts` | Constants, attribute helpers |

## Blot Tree Structure

```
ScrollBlot (root)
├── TextBlot { text: "Hello ", attrs: {} }           length=6
├── TextBlot { text: "world", attrs: { bold: true } } length=5
├── EmbedBlot { embed: { mention: "Alice" } }         length=1
├── TextBlot { text: " end", attrs: {} }              length=4
└── BreakBlot                                          length=0
```

## DOM Output

```html
<div class="edit-container">
  <c-element><c-text>Hello </c-text></c-element>
  <c-element class="bold"><c-text>world</c-text></c-element>
  <c-element>
    <span contenteditable="false"><span class="inline-mention">Alice</span></span>
    <span data-zero-space>​</span>
  </c-element>
  <c-element><c-text> end</c-text></c-element>
  <c-element class="bc-end-break"><br></c-element>
</div>
```

## InlineRuntime API

```typescript
class InlineRuntime {
  scrollBlot: ScrollBlot;         // Root of the blot tree
  mapper: InlinePositionMapper;   // Position conversion

  render(deltas: DeltaInsert[]);           // Full rebuild from delta array
  applyDelta(ops: DeltaOperation[]);       // Incremental patch (preferred)

  modelPointToDom(index: number);          // Char offset → { node, offset }
  domPointToModel(node: Node, offset: number); // DOM → char offset

  getLength(): number;                     // Total text length
}
```

## Delta Operations

```typescript
// DeltaInsert (from Y.Text.toDelta())
{ insert: "text" }                                    // Plain text
{ insert: "text", attributes: { bold: true } }       // Formatted text
{ insert: { mention: "Alice" }, attributes: { ... } } // Embed

// DeltaOperation (for applyDelta)
{ retain: 5 }                          // Skip 5 characters
{ retain: 3, attributes: { bold: true } } // Format 3 chars
{ insert: "new" }                      // Insert text
{ insert: { embed: "val" } }           // Insert embed
{ delete: 2 }                          // Delete 2 characters
```

## InlinePositionMapper

Converts between character offsets (model space) and DOM nodes (DOM space):

```
Model: "Hello |world" (offset=6)
  → mapper.modelPointToDom(6)
  → { node: TextNode("world"), offset: 0 }

DOM: TextNode("world"), offset=3
  → mapper.domPointToModel(textNode, 3)
  → 9 (6 + 3)
```

The mapper walks the blot tree, accumulating lengths, to find the target position.

## Render vs applyDelta

| Method | When Used | Cost |
|--------|-----------|------|
| `render(deltas)` | Initial load, full rebuild | O(n) — creates all DOM |
| `applyDelta(ops)` | Incremental edits | O(delta) — patches existing DOM |

After every `applyDelta`, the system performs a **consistency check**: it compares the blot tree against `yText.toDelta()`. If there's a mismatch, it falls back to full `render()`.

## Embed Lifecycle and Default Inline Images

`EmbedConverter.onDestroy(element, delta)` is the teardown boundary for
DOM-owned listeners/controllers. `EmbedBlot.detach()` invokes it, and a
semantic attribute update invokes it for the old view before replacing that
view with `converter.toView(nextDelta)`. A converter that allocates resources
must make `onDestroy` idempotent.

The built-in `image` converter wraps its `<img>` in
`.bc-inline-image-shell > .bc-inline-image-frame`, reserves persisted
`width/height`, and falls back to `320 × 240` (4:3) when either dimension is
missing. The frame owns the visible resource and its loading/error/retry
controller; the outer shell remains the atomic one-length Embed. On the first
successful load it emits an internal bubbling size event; `ImgToolbarPlugin`
resolves the embed's current model offset and fills only missing
`width/height` attributes inside `ORIGIN_NO_RECORD`. The model remains the
source of truth, including while the editable block is offscreen.

When an image Delta has `wrap: true`, the shell projects
`data-bc-inline-float` and persisted `side/x/gap` data. Each
`InlineRuntime` owns one package-internal `InlineFloatLayoutController`. After
full render or incremental Delta application, it derives
`data-bc-inline-float-owner` on the editable container, applies one contained
CSS float geometry, and observes only owner-size changes. The marker establishes
a `flow-root`, so the float cannot affect later sibling blocks or escape a
virtualized/paginated render unit. Resize reconciliation is animation-frame
batched and never reads layout from a scroll handler.

Native CSS still owns line breaking, caret movement, selection and IME.
`ImgToolbarPlugin` changes `wrap/side/x/gap` through one Embed
`formatText()` transaction. Horizontal pointer movement updates only the
shell/frame CSS preview; pointerup writes normalized `x` once, while
pointercancel, Escape, detach and readonly transitions restore model-derived
geometry.

## Attributes

Inline formatting is stored as delta attributes:

```typescript
{ bold: true }
{ italic: true }
{ underline: true }
{ strike: true }
{ code: true }
{ color: '#ff0000' }
{ background: '#ffff00' }
{ 'a:link': 'https://...' }  // Link
```

Attribute helpers:
```typescript
import { InlineManager } from "../../framework";

InlineManager.getAttrs(element)    // Read attributes from DOM element
InlineManager.setAttrs(element, attrs) // Apply attributes to DOM element
```

### Attribute namespaces → DOM (`setAttributes`)

`framework/block-std/inline/setAttributes.ts` applies delta attributes onto each `<c-element>` container by key prefix:

| Prefix | Example key | Applied as |
|--------|-------------|------------|
| `a:` | `a:bold`, `a:link` | HTML attribute — `element.setAttribute('bold', …)` |
| `d:` | `d:foo` | `data-*` — `element.dataset.foo = …` |
| `s:` | `s:color`, `s:fontSize` | inline CSS — `element.style.setProperty('color' / 'font-size', …)` |

A `null`/falsy value removes the attribute/style. For `s:` keys the property name is **camelCase→kebab-case** converted before `setProperty` (so `s:fontSize` → `font-size`, `s:fontFamily` → `font-family`) — `setProperty` ignores camelCase names, so this conversion is what makes those styles actually render. CSS custom properties (`s:--x`) keep their case. Relative font scaling stores `s:fontSize` as an `em` ratio, e.g. `'1.2em'` (relative to the block's base font size).

## When to Read Source Files

- **Changing how text is rendered**: Read `TextBlot`, `ScrollBlot.render()`
- **Adding new inline formatting**: Read `InlineManager.setAttrs/getAttrs`, attribute constants
- **Fixing cursor positioning**: Read `InlinePositionMapper`
- **Understanding incremental updates**: Read `InlineRuntime.applyDelta()`
- **Working with embeds**: Read `EmbedBlot`, `EmbedConverter` interface
- **IME issues**: Read `CursorBlot`, `CompositionSession`
- **Full architecture**: Read `packages/editor/ARCHITECTURE.md`, inline system section
