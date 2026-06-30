# BlockCraft: Block Management Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-06-30

## BlockControllerPlugin

> `plugins/block-controller/` — Drag handle, context menu, and block-level operations.

Renders a floating trigger button that follows the hovered block. Provides drag-and-drop, a built-in context menu for table operations, and fully extensible custom menu sections.

### Configuration

```typescript
// Object form (recommended)
new BlockControllerPlugin(options?: BlockControllerPluginOptions)

// Legacy form
new BlockControllerPlugin(customTools?: IContextMenuItem[], customToolHandler?: customToolHandler)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `customTools` | `IContextMenuItem[]` | `[]` | Extra items in the context menu |
| `customToolHandler` | `customToolHandler` | — | Click handler for `customTools` |
| `blockMenuResolver` | `(ctx: BlockMenuContext) => BlockMenuSection[]` | — | Return custom menu sections per block |
| `blockMenuActionHandler` | `(event: BlockMenuActionEvent, ctx: BlockMenuContext) => boolean` | — | Handle clicks on custom menu items |
| `positionResolver` | `BlockControllerPositionResolver` | — | Override trigger button positioning |

### Extension Points

| Name | Type | Purpose |
|------|------|---------|
| `blockMenuResolver` | `(ctx) => BlockMenuSection[]` | Dynamic menu sections based on block context |
| `blockMenuActionHandler` | `(event, ctx) => boolean` | Handle menu item actions; return `true` to consume |
| `positionResolver` | `BlockControllerPositionResolver` | Custom positioning logic for the trigger button |

### Usage Example

```typescript
new BlockControllerPlugin({
  blockMenuResolver: (ctx) => {
    if (ctx.block.flavour === 'paragraph') {
      return [{
        title: 'AI 操作',
        items: [
          { key: 'summarize', label: '总结', icon: 'bc_icon bc_ai' },
          { key: 'translate', label: '翻译', icon: 'bc_icon bc_fanyi' },
        ],
      }];
    }
    return [];
  },
  blockMenuActionHandler: (event, ctx) => {
    if (event.key === 'summarize') {
      // handle...
      return true;
    }
    return false;
  },
})
```

### Notes

- Hidden in readonly mode
- Interacts with `TranslatePlugin` which provides its own `blockMenuResolver`/`blockMenuActionHandler` pair via `createBlockControllerOptions()`

### Multi-block drag (since v?.?.?)

The drag handle now respects an active cross-block selection: when the user
drag-selects multiple blocks and then presses the drag handle, the entire
selected range is dragged as one unit.

- Behavior triggers only when:
  - `doc.selection.value` is cross-block (`!isInSameBlock`),
  - The hovered active block is **inside** the selection, AND
  - All selected blocks share the same `parentId` (a contiguous sibling range).
- Otherwise the plugin falls back to single-block drag of the hovered block.
- Cross-block selection no longer hides the drag handle; instead it anchors
  the handle on `selection.firstBlock`.

The drag is dispatched as `{ kind: 'origin-blocks', blockIds: string[] }` to
`doc.dragController.startDrag(...)`, and committed via the new
`DocDndService.onSortBlocks(sources, target, position)` API.

### Multi-block menu

When a cross-block selection covers the active block, the drag-handle menu
collapses to just **cut / copy / delete**, and those three operate on the whole
selection range:

- **copy** copies whole-block snapshots of every selected block
  (`clipboard.copyBlocksModel`), not an offset-sliced text range.
- **cut** copies all then deletes every selected block by id in one transaction.
- **delete** deletes every selected block by id in one transaction.

All other menu items — alignment, heading, block-type conversion, "在下方添加",
`customTools`, and custom `blockMenuResolver` sections such as the table tools —
are hidden in multi-block mode. Single-block selection keeps the full menu
unchanged. The multi/single judgment mirrors the drag dispatch: a cross-block
selection whose range includes the active block (otherwise the single-block menu
shows). If the multi-selection collapses to fewer than two blocks between opening
the menu and clicking, the action falls back to the single-block path.

---

## BlockGapCreatorPlugin

> `plugins/block-gap-creator/` — Resolves blank-area clicks to a sensible caret (gap cursor / line-end / nearest block).

Detects clicks in blank areas that the browser wouldn't otherwise place a caret in, and routes them via the gap-cursor model:

- **Beside a void/container block** (inside the block's host but outside its `[data-gap-anchor]` content box) → drops a **gap cursor** (`setGapCursor(block, 'before' | 'after')`, side by click position). Typing there inserts an adjacent paragraph and **keeps** the block (it no longer eagerly creates an empty paragraph on click).
- **Right of a text line** (block padding, outside `.edit-container`) → places a text caret at that line's end (feature-detected `caretRangeFromPoint`).
- **Root gutter / below all content** → focuses the nearest root-level child: editable → its text end/start; void → its `gap-after`/`gap-before`.

Includes a mousedown+click same-target anti-drag guard so a drag-select never drops a gap cursor. Content clicks pass through to native handling unchanged.

### Configuration

No configuration options. Zero-config plugin.

```typescript
new BlockGapCreatorPlugin()
```

---

## BlockTransformerPlugin

> `plugins/block-transformer/` — Slash menu, block-type conversion, and Markdown shortcuts.

Enables slash-command (`/` or `、`) to open a block-type picker, Markdown shortcuts (e.g., `# ` for heading, `- ` for bullet), and `Cmd/Ctrl+0–4` to set heading levels.

### Configuration

```typescript
new BlockTransformerPlugin(transformList?: IBlockTransformConfig[])
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `transformList` | `IBlockTransformConfig[]` | `blockTransforms` (built-in list) | Block types available for conversion |

Each `IBlockTransformConfig`:

| Field | Type | Description |
|-------|------|-------------|
| `flavour` | `BlockFlavour` | Target block flavour |
| `description` | `string` | Display name in the slash menu |
| `hotkey` | `HotkeyConfig` | Optional keyboard shortcut |
| `markdown` | `RegExp` | Optional Markdown trigger pattern |
| `onConvert` | `(doc, block, text) => void` | Optional custom conversion logic |

### Built-in Hotkeys

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+0` | Remove heading (plain paragraph) |
| `Cmd/Ctrl+1` | Heading 1 |
| `Cmd/Ctrl+2` | Heading 2 |
| `Cmd/Ctrl+3` | Heading 3 |
| `Cmd/Ctrl+4` | Heading 4 |

### Static API

```typescript
// Convert a block to a different type, preserving text content
BlockTransformerPlugin.transformEditableBlock(doc, fromBlock, toFlavour)
```

### Usage Example

```typescript
// Add a custom "note" block type to the slash menu
new BlockTransformerPlugin([
  ...blockTransforms,  // keep defaults
  {
    flavour: 'note',
    description: '笔记',
    markdown: /^:::$/,  // trigger on typing :::
    onConvert: (doc, block, text) => {
      // custom conversion logic
    },
  },
])
```

---

## OrderedBlockPlugin

> `plugins/ordered-extension/` — Auto-numbering for ordered list blocks.

Maintains correct sequential numbering across ordered list blocks. Recalculates `order` props when blocks are inserted, deleted, or have `depth`/`heading` changed. Also shows a prefix-click toolbar to change list style and start number.

### Configuration

No configuration options.

```typescript
new OrderedBlockPlugin()
```

### Notes

- Subscribes to `doc.onChildrenUpdate$` and `doc.onPropsUpdate$` for automatic renumbering
- Shows `OrderedPrefixToolbar` when the list prefix button is clicked
