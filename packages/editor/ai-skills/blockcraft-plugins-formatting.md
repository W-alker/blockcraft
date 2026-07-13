# BlockCraft: Text Formatting Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-07-13

## FloatTextToolbarPlugin

> `plugins/float-text-toolbar/rich-text-toolbar.ts` — Floating rich-text formatting toolbar shown on text selection.

Shows a formatting toolbar 350ms after user makes a non-collapsed text selection. Provides bold/italic/underline/strikethrough/code shortcuts and extensible custom buttons. Model-owned table-cell rectangle selections do not open this toolbar, and text-shaped selections that cross different table cells are also ignored so table rectangle UI cannot be mistaken for a rich-text range. Normal text selection inside a single table cell still opens the toolbar.

### Configuration

```typescript
new FloatTextToolbarPlugin(options?: FloatTextToolbarPluginOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `extraItems` | `IToolbarMenuItem[]` | `[]` | Extra buttons appended to toolbar |
| `onExtraItemClick` | `(item, doc) => boolean` | — | Handler for custom button clicks |

Each `IToolbarMenuItem` supports an optional `visible` predicate:

```typescript
interface IToolbarMenuItem {
  name: string;
  icon: string;
  label: string;
  visible?: (selection: BlockCraft.Selection) => boolean;
}
```

### Built-in Hotkeys

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+B` | Bold |
| `Cmd/Ctrl+I` | Italic |
| `Cmd/Ctrl+U` | Underline |
| `Cmd/Ctrl+D` | Strikethrough |
| `Cmd/Ctrl+E` | Inline Code |

### Public API

| Method | Description |
|--------|-------------|
| `openToolbar()` | Programmatically open the toolbar at current selection |
| `closeToolbar()` | Dismiss the toolbar |
| `toggleFormatAttr(ctx, attrName)` | Toggle an inline format attribute |

### Usage Example

```typescript
new FloatTextToolbarPlugin({
  extraItems: [
    {
      name: 'ai-rewrite',
      icon: 'bc_icon bc_ai',
      label: 'AI 改写',
      visible: (sel) => sel.isInSameBlock && !sel.collapsed,
    },
  ],
  onExtraItemClick: (item, doc) => {
    if (item.name === 'ai-rewrite') {
      const text = doc.selection.getSelectedText();
      // call AI service...
      return true;
    }
    return false;
  },
})
```

---

## TextMarkerPlugin

> `plugins/float-text-toolbar/text-marker-toolbar.ts` — Lightweight text marker/highlighter toolbar for specific block types.

A simpler read-only-friendly toolbar shown after text selection on specified block flavours. Provides text color/highlight controls without full rich-text editing features.

### Configuration

```typescript
new TextMarkerPlugin(markTextBlockFlavours: BlockCraft.BlockFlavour[])
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `markTextBlockFlavours` | `BlockFlavour[]` | **Required.** Block flavours that activate this toolbar |

### Public API

| Method | Description |
|--------|-------------|
| `openToolbar()` | Open the marker toolbar |
| `closeToolbar()` | Dismiss the toolbar |

### Usage Example

```typescript
// Show marker toolbar only for paragraph and blockquote blocks
new TextMarkerPlugin(['paragraph', 'blockquote'])
```

---

## FixedTextToolbarComponent

> `plugins/fixed-toolbar/widgets/fixed-toolbar.component.ts` — Fixed-position toolbar embedded in host app template.

**Not a `DocPlugin`** — this is an Angular standalone component (`<bc-fixed-toolbar>`) meant to be placed directly in the host application's template. Provides heading selection, inline formatting, color pickers, font scaling (relative ratio), alignment, list conversion, table/column insertion, image insertion, video/audio insertion, and link editing.

### Font Scale

- A dropdown tool (`bc-font-scale-picker`) for **relative** font sizing of the selected text — ratios, not absolute px.
- Writes the inline style `s:fontSize` as an `em` value (e.g. ratio `1.2` → `1.2em`), so it scales relative to the block's base font size; ratio `1` removes the style (back to default).
- A base theme rule (`c-element[style*="font-size"] { line-height: 1.5 }`) makes the line-height track the scaled font (the document's `--bc-lh / --bc-fs` ratio is a uniform `1.5`), so enlarged text grows its line instead of crowding the fixed `--bc-lh`.
- Panel offers preset ratios (`0.5 / 0.8 / 1.0 / 1.2 / 1.5 / 2.0`) and a text `−`/`+` stepper that adjusts by `0.1em` per click (clamped to `0.5–3`).
- The trigger button reflects the current selection's common ratio; picks apply to the live selection (picker buttons `preventDefault` on mousedown so the editor keeps focus/selection). On a collapsed caret it sets the pending insert format, so subsequent typing inherits the size.
- `BcFontScalePickerComponent` is exported from the package root for reuse.

### Insertion Actions

- Table and column actions use picker overlays from the fixed toolbar.
- Image insertion supports either a direct image URL or local image upload.
- Video and audio insertion are grouped under one dropdown entry and reuse the shared media-creator flow.

### Format Brush

- The fixed toolbar includes a one-shot format-brush action.
- Activating it can use either a collapsed text caret or a normal text selection as the source format.
- After activation, the brush waits for the user to finish a later non-collapsed target text selection before applying formatting, then automatically exits.
- The brush only copies common inline text styling — bold/italic/underline/strike/code/sup/sub, text color, background, and font scale (`s:fontSize`); it does not copy heading, list flavour, alignment, links, inline formulas, or non-text block contents.
- `Cmd/Ctrl+Shift+C` can be used to quickly enable the brush; cancellation still uses the toolbar button or `Escape`.

### Selection Behavior

- Heading and list transforms work on cross-block text selections as long as every covered block is editable and not `plainTextOnly`.
- Link and inline-formula actions remain restricted to same-block text selections; on cross-block selections the buttons stay visible but disabled.
- Inline-format buttons still follow text-range availability; block-level transforms are more permissive than inline text formatting.

### Component Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `doc` | `BlockCraft.Doc` | **required** | Document instance |
| `utils` | `TextToolbarHelper` | — | Optional external toolbar helper |
| `readonly` | `boolean` | `false` | Disable toolbar in readonly mode |
| `stickyTop` | `number` | `0` | Top offset for sticky positioning (px) |
| `visible` | `boolean` | `true` | Show/hide the toolbar |
| `extensionActions` | `IFixedToolbarExtensionAction[]` | `[]` | Custom action buttons |

### Component Outputs

| Output | Type | Description |
|--------|------|-------------|
| `extensionAction` | `EventEmitter<IFixedToolbarExtensionActionContext>` | Fired when a custom action is clicked |

### Extension Action Interface

```typescript
interface IFixedToolbarExtensionAction {
  key: string;
  icon: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
}
```

### Usage Example

```html
<bc-fixed-toolbar
  [doc]="doc"
  [stickyTop]="48"
  [extensionActions]="customActions"
  (extensionAction)="onExtensionAction($event)">
</bc-fixed-toolbar>
```

```typescript
customActions: IFixedToolbarExtensionAction[] = [
  { key: 'export-pdf', icon: 'bc_icon bc_pdf', title: '导出 PDF' },
];

onExtensionAction(ctx: IFixedToolbarExtensionActionContext) {
  if (ctx.action.key === 'export-pdf') { /* ... */ }
}
```
