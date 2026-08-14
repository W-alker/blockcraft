# BlockCraft: Text Formatting Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-08-14

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

**Not a `DocPlugin`** — this is an Angular standalone component (`<bc-fixed-toolbar>`) meant to be placed directly in the host application's template. Provides heading selection, inline formatting, font/relative-scale/character-spacing dropdowns, paragraph line-height and consolidated alignment dropdowns, color pickers, list conversion, shape/text-box/table/column insertion, image insertion, video/audio insertion, and link editing.

### Typography groups

- The fixed toolbar uses separate dropdowns for font family, relative font
  scale, character spacing, alignment and paragraph line height. The floating
  text toolbar keeps its previous compact formatting actions and does not add
  these typography controls. Neither surface owns document defaults.
- Font, scale, character spacing, alignment and line-height menus reuse the same
  `BcFloatToolbarComponent` / `BcFloatToolbarItemComponent` vertical menu chrome
  as the heading dropdown; typography does not introduce a parallel picker UI.
- Fixed-toolbar dropdown triggers retain their iconfont leading icons. Paragraph
  style reflects the current heading icon; font family, relative scale and
  character spacing use the existing text/size/spacing glyphs.
- Font size is displayed and persisted as the compact relative `t:fs` ratio;
  the toolbar does not write absolute selection font sizes. Family and letter
  spacing use `t:ff` / `t:ls`; paragraph line height uses block prop `lh`.
- Relative font scale exposes dense presets from `0.5×` through `3×`. Character
  spacing exposes `-0.1em` through `0.5em`; menu items and toolbar state show
  the real numeric `em` value rather than descriptive names. The neutral item
  is shown as `默认（0em）` and is still omitted from persisted Delta attrs.
- Mixed selections display a mixed state; inherited/default values are `null`.
  Picker mousedown preserves the live editor selection. A collapsed caret writes
  pending insert attrs, so subsequent input inherits selection typography.
- Line-height is enabled when a multi-block selection contains at least one
  editable rich-text block. Applying it updates every eligible editable block
  in one transaction and skips container, void and plain-text-only blocks;
  other inline-format controls retain their all-blocks-editable requirement.
- The fixed toolbar observes its own container width rather than the browser
  viewport. At `1480px` and above it exposes the complete formatting surface;
  from `720px` to `1479px` font family, character spacing and paragraph line
  height move into one **更多格式** menu while superscript, subscript, inline
  link and inline formula leave the fixed surface. Below `720px` the same
  priority set remains and explicit previous/next buttons browse the formatting
  row. The observer is created once per component and disconnected on destroy.
- Word-like semantic groups keep related commands together with visual dividers
  and accessible group names, but do not render persistent group-caption text.
  The surface remains one lightweight document-toolbar row instead of adopting
  a full multi-row Office Ribbon.
- Every responsive tier centers the visible formatting and insertion groups.
  Scrollable rows use safe centering so an overflowing row falls back to its
  reachable inline start instead of clipping the first command.

### Insertion Actions

- Shape, text box, WordArt, Table, columns, image and video/audio remain
  individually visible insertion actions at every responsive width; they are
  never consolidated into one Insert menu. Unavailable actions retain their
  existing Schema, selection and readonly disabled states.
- When the document registers `ShapeBlockSchema`, the toolbar shows a Shape
  action using the existing `bc_tuxing` iconfont glyph. Click or keyboard
  activation opens the bounded categorized shape picker. Its 103
  entries come from eight `SHAPE_CATEGORIES` backed by the shared
  `SHAPE_DEFINITIONS`; each compact icon-only item renders its actual
  main/detail geometry through `ShapeIconComponent` and exposes its label by
  Tooltip plus `aria-label` instead of visible per-cell text.
- Picking a shape, WordArt or text-box preset arms a one-shot drawing surface over the
  document without requiring a focused block, active Selection or saved
  selection snapshot; it does not write Yjs or create a block yet. A
  primary-pointer drag shows a theme-colored rectangle preview and commits that
  rectangle's scale-normalized width, height and absolute position only on
  pointer release. A press/release without a drag commits the selected type at
  its normal default size.
- The inserted shape is whole-block selected. A text box is selected, revealed
  and enters its initial paragraph. Inserted WordArt is selected,
  revealed and enters text editing with its default text selected. Escape,
  pointer cancellation, window blur, scrolling, readonly transitions and
  toolbar destruction cancel an armed or active drawing gesture without a
  model mutation. Shape/text-box/WordArt entries remain hidden when their Schema is not
  registered and are disabled only while the document is readonly; a missing
  or detached drawing surface fails safely when the preset is picked.
- Table and column actions open their existing picker overlays directly.
- Image insertion remains a direct action and supports either a direct image
  URL or local image upload.
- Video and audio remain grouped under their own dropdown and reuse the shared
  media-creator flow.

### Format Brush

- The fixed toolbar includes a one-shot format-brush action.
- Activating it can use either a collapsed text caret or a normal text selection as the source format.
- After activation, the brush waits for the user to finish a later non-collapsed target text selection before applying formatting, then automatically exits.
- The brush copies common inline text styling — including compact font family,
  scale and letter spacing — plus paragraph `lh`. It does not copy document
  defaults, heading, list flavour, alignment, links, inline formulas, or
  non-text block contents.
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
