# BlockCraft Editor - AI Skill Pack

> **Level 0: Overview & Router** — Always read this first. Load sub-skills on demand.
>
> Last updated: 2026-03-30 | Source: `packages/editor/`

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
| **Event** | Three-tier event dispatcher (block→flavour→global) | `UIEventDispatcher` in `framework/block-std/event/` |
| **Chain** | Fluent builder for sequencing mutations | `DocChain` in `framework/chain/` |
| **Schema** | Block registration: flavour, component, createSnapshot | `SchemaManager` in `framework/block-std/schema/` |
| **Adapter** | HTML/Markdown ↔ BlockSnapshot conversion | `adapters/html-adapter/`, `adapters/markdown-adapter/` |

## Block Types Taxonomy

Three `nodeType` categories:

| nodeType | Description | Base Class | Examples |
|----------|-------------|------------|----------|
| `editable` | Has inline text (Y.Text) | `EditableBlockComponent` | paragraph, code, bullet, ordered, todo, blockquote, heading |
| `void` | No children, no text | `BaseBlockComponent` | divider, image, bookmark, attachment, formula, video, audio |
| `block` | Has block children | `BaseBlockComponent` | root, callout, columns, column, table, table-row, table-cell |

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
├── adapters/               # HTML/Markdown import/export
├── themes/                 # CSS themes (base, light, dark, per-block styles)
├── tools/                  # Export utilities (PDF, print)
└── global/                 # Logger, error codes, decorators, types, utils
```

## Task Routing Table

**Read the corresponding sub-skill file before starting the task:**

| Task | Sub-Skill File | Level |
|------|----------------|-------|
| Create a new plugin | `blockcraft-plugin.md` | L1 |
| Create a new block | `blockcraft-block.md` | L1 |
| Create an inline embed | `blockcraft-embed.md` | L1 |
| Add HTML/Markdown import/export for a block | `blockcraft-adapter.md` | L1 |
| Create/modify toolbars or overlay UI | `blockcraft-toolbar.md` | L1 |
| Customize themes or block styles | `blockcraft-theme.md` | L1 |
| Debug data flow, events, or sync issues | `blockcraft-debug.md` | L1 |
| Optimize performance | `blockcraft-perf.md` | L1 |
| Write tests | `blockcraft-test.md` | L1 |
| Understand/modify selection behavior | `blockcraft-selection.md` | L2 |
| Understand/modify input/IME behavior | `blockcraft-input.md` | L2 |
| Understand/modify inline blot system | `blockcraft-inline.md` | L2 |
| Understand/modify event system | `blockcraft-event.md` | L2 |
| Understand/modify Yjs data model | `blockcraft-data.md` | L2 |

## Quick Reference: Common APIs

### DocChain (Fluent Mutations)

```typescript
doc.chain()
  .insertAfter(currentBlock, 'paragraph', 'Hello')
  .setCursorAtBlock(newBlock)
  .run()
```

### Block Property Updates

```typescript
// Inside a block component
this.updateProps({ color: '#ff0000' })  // Creates undo history
this.setInitProps({ color: '#ff0000' }) // No undo history

// From outside
block.updateProps({ style: 'dashed' })
```

### Selection

```typescript
doc.selection.setCursorAt(block, offset)
doc.selection.setSelection(anchorBlock, anchorOffset, headBlock, headOffset)
doc.selection.selectBlock(block)
doc.selection.getSelectedText()
```

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
- Container blocks include a `<div class="children-render-container">` for child blocks
- Editable blocks set `host: { '[class.edit-container]': 'true' }` with empty template
- All mutations go through Yjs transactions (via `DocCRUD` or `DocChain`)
- Global type declarations use `declare global { namespace BlockCraft { ... } }`

## Architecture Docs (L2 Source of Truth)

When you need deep understanding of a subsystem, read these files in the project:

| Document | Path | Content |
|----------|------|---------|
| Full Architecture | `packages/editor/ARCHITECTURE.md` | Complete technical architecture (~1230 lines) |
| Selection System | `packages/editor/SELECTION.md` | Selection subsystem deep dive |
| Virtual Rendering | `packages/editor/VIRTUAL_RENDERING.md` | Planned virtual rendering design |
| Synced Blocks | `packages/editor/SYNCED_BLOCK.md` | Planned shared content design |
