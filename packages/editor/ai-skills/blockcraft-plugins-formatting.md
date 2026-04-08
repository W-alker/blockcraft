# BlockCraft: Text Formatting Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-04-08

## FloatTextToolbarPlugin

> `plugins/float-text-toolbar/rich-text-toolbar.ts` — Floating rich-text formatting toolbar shown on text selection.

Shows a formatting toolbar 350ms after user makes a non-collapsed text selection. Provides bold/italic/underline/strikethrough/code shortcuts and extensible custom buttons.

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

**Not a `DocPlugin`** — this is an Angular standalone component (`<bc-fixed-toolbar>`) meant to be placed directly in the host application's template. Provides heading selection, inline formatting, color pickers, alignment, list conversion, table/column insertion, and link editing.

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
