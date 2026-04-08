# BlockCraft: Block Management Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-04-08

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

- Hides during multi-block selections and in readonly mode
- Interacts with `TranslatePlugin` which provides its own `blockMenuResolver`/`blockMenuActionHandler` pair via `createBlockControllerOptions()`

---

## BlockGapCreatorPlugin

> `plugins/block-gap-creator/` — Inserts paragraph when clicking between blocks.

Detects clicks in the empty gap between blocks. When the gap between two non-editable blocks is clicked, inserts a new empty paragraph. If the adjacent block is editable, moves the cursor to that block instead.

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
