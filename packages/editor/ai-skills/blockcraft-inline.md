# BlockCraft: Inline / Blot System Deep Dive

> **Level 2: Mechanism Deep Dive** — Only read this when modifying the inline editing system.
>
> Last updated: 2026-04-07

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

## When to Read Source Files

- **Changing how text is rendered**: Read `TextBlot`, `ScrollBlot.render()`
- **Adding new inline formatting**: Read `InlineManager.setAttrs/getAttrs`, attribute constants
- **Fixing cursor positioning**: Read `InlinePositionMapper`
- **Understanding incremental updates**: Read `InlineRuntime.applyDelta()`
- **Working with embeds**: Read `EmbedBlot`, `EmbedConverter` interface
- **IME issues**: Read `CursorBlot`, `CompositionSession`
- **Full architecture**: Read `packages/editor/ARCHITECTURE.md`, inline system section
