# BlockCraft: Block Toolbar Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-04-08

These plugins provide floating toolbars that appear when specific block types are selected.

## AttachmentExtensionPlugin

> `plugins/attachment-extension/` — Attachment block interactions and toolbar.

Manages click behavior on attachment blocks (file picker for empty blocks, upload-in-progress warnings), shows a connected toolbar with rename/download/preview/delete actions, and handles file paste.

### Configuration

```typescript
new AttachmentExtensionPlugin(options?: AttachmentExtensionOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `extraItems` | `IAttachmentToolbarItem[]` | `[]` | Extra toolbar buttons |
| `onExtraItemClick` | `(itemName, block, doc) => boolean` | — | Handler for custom button clicks |
| `onPreview` | `(block, doc) => void` | — | If provided, adds a "Preview" button |
| `previewIcon` | `string` | `'bc_eye-open'` | Icon for the preview button |
| `previewLabel` | `string` | `'预览'` | Label for the preview button |
| `uploadingTip` | `string` | `'文件可能正在上传中，暂不可用'` | Tooltip shown during upload |

### Extension Points

| Name | Purpose |
|------|---------|
| `onPreview` | Custom file preview implementation |
| `onExtraItemClick` | Handle custom toolbar actions |

### Dependencies

- **Requires** `DOC_FILE_SERVICE_TOKEN` to be provided via DI. Throws `BlockCraftError` if absent.

### Usage Example

```typescript
new AttachmentExtensionPlugin({
  onPreview: (block, doc) => {
    const url = block.props.url;
    window.open(url, '_blank');
  },
  extraItems: [
    { name: 'share', icon: 'bc_icon bc_share', label: '分享' },
  ],
  onExtraItemClick: (name, block, doc) => {
    if (name === 'share') { /* ... */ return true; }
    return false;
  },
})
```

---

## ImgToolbarPlugin

> `plugins/img-toolbar/` — Image block toolbar and interactions.

Handles image drag, Enter key behavior, double-click preview (readonly mode), and shows a connected toolbar with align/caption/download/copy-url actions.

### Configuration

```typescript
new ImgToolbarPlugin(options?: ImgToolbarPluginOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `extraItems` | `IImageToolbarItem[]` | `[]` | Extra toolbar buttons |
| `onExtraItemClick` | `(itemName, block, doc) => boolean` | — | Handler for custom button clicks |

### Built-in Toolbar Actions

| Action | Behavior |
|--------|----------|
| `align` | Set image alignment (left/center/right) |
| `caption` | Toggle caption child block |
| `download` | Download the image file |
| `copy-url` | Copy image `src` URL to clipboard |

### Dependencies

- Uses `DOC_FILE_SERVICE_TOKEN` for `previewImg()` on double-click in readonly mode

### Usage Example

```typescript
new ImgToolbarPlugin({
  extraItems: [
    { name: 'edit', icon: 'bc_icon bc_edit', label: '编辑' },
  ],
  onExtraItemClick: (name, block, doc) => {
    if (name === 'edit') {
      // open image editor...
      return true;
    }
    return false;
  },
})
```

---

## BookmarkBlockExtensionPlugin

> `plugins/bookmark-frame-extension/` — Toolbar for bookmark blocks.

Shows a floating `BookmarkBlockToolbar` when a bookmark block is selected. Dismissed when selection moves away.

### Configuration

No configuration options.

```typescript
new BookmarkBlockExtensionPlugin()
```

---

## CalloutToolbarPlugin

> `plugins/callout-toolbar/` — Toolbar for callout blocks.

Shows a floating `CalloutBlockToolbar` centered above/below a callout block when the cursor is inside one of its child blocks. Tracks block resize via `ResizeObserver` (100ms throttle).

### Configuration

No configuration options.

```typescript
new CalloutToolbarPlugin()
```

### Public API

| Method | Description |
|--------|-------------|
| `openToolbar(calloutBlock)` | Programmatically open toolbar for a callout |
| `closeToolbar()` | Dismiss the toolbar |

---

## DividerExtensionPlugin

> `plugins/divider-toolbar/` — Style selector for divider blocks.

Shows a `DividerStylePopupComponent` when a divider block is selected, allowing users to change the divider style.

### Configuration

No configuration options.

```typescript
new DividerExtensionPlugin()
```

---

## EmbedFrameExtensionPlugin

> `plugins/embed-frame-extension/` — Toolbar for iframe embed blocks.

Shows a floating `EmbedFrameBlockToolbar` for any block whose flavour ends with `'embed'` (e.g., `figma-embed`, `juejin-embed`) when selected.

### Configuration

No configuration options.

```typescript
new EmbedFrameExtensionPlugin()
```

---

## FormulaBlockExtensionPlugin

> `plugins/formula-extension/` — LaTeX formula editing.

Handles editing for both block-level formula blocks and inline formula embeds. Shows a `FormulaBlockToolbar` overlay with LaTeX input and preview on click.

### Configuration

No configuration options.

```typescript
new FormulaBlockExtensionPlugin()
```

### Public API

| Method | Description |
|--------|-------------|
| `closeToolbar()` | Dismiss the formula editor overlay |
| `createEmbedRange(cElement)` | Create a range for an inline formula embed element |
| `getEmbedRange(target)` | Get the range of an inline formula from a target element |

### Notes

- Block-level formula: updates `latex` prop via `updateProps()`
- Inline formula: updates via `applyDeltaOperations` on the embed range
- Overlay uses `backdrop: true` for modal-like behavior
