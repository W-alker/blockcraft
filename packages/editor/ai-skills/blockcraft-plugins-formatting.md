# BlockCraft: Text Formatting Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-08-20

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

- The fixed toolbar presents font family and relative font scale as one
  adjacent, iconless Word-style control pair. Character spacing and paragraph
  line height remain independent dropdowns, with character spacing immediately
  before line height. The floating text toolbar keeps its previous compact
  formatting actions and does not add these typography controls. Neither
  surface owns document defaults.
- Font, scale, character spacing, alignment and line-height menus reuse the same
  `BcFloatToolbarComponent` / `BcFloatToolbarItemComponent` vertical menu chrome
  as the heading dropdown; typography does not introduce a parallel picker UI.
- Every fixed-toolbar dropdown is hosted by `CsDropdownDirective` and
  `CsDropdownMenuComponent`; the compact **更多格式** branches use
  `CsSubmenuComponent`. All first-level dropdowns and nested submenus open on
  hover, while CSES retains click/touch and keyboard activation. The inner
  BlockCraft picker/menu components remain the content surface. Tooltip overlays
  opened from a menu item therefore do not dismiss the owning dropdown merely
  because the pointer enters the Tooltip. Open first-level triggers retain the
  same background as their hover state; nested picker wrappers become
  backgroundless content so the CSES submenu draws the only popup card.
  Responsive second-level pickers add no extra host gap; the CSES panel and the
  inner 4px content padding are the only spacing owners.
- First-level overlays use the trigger width as their minimum and expand only
  when menu content needs more room. Font-scale quick choices are
  `0.75/0.875/1/1.25/1.5/1.75/2/2.5/3`; character-spacing quick choices are
  `-0.05/-0.025/0.025/0.05/0.1em` plus default. The complete numeric range
  remains available through **更多设置…**.
- Split controls use one hover surface across their main action and caret. The
  caret adds a second local highlight on hover/open so its separate dropdown
  action remains discoverable. Ordered-list style and superscript/subscript use
  this pattern; the baseline main action repeats the active or most recently
  chosen command, and choosing one baseline clears the other.
- Each corresponding menu ends with **更多设置…** and the
  `bc_version_settings` icon. Font family, relative scale and character spacing
  open the CSES font modal at that field; alignment and line height open the
  CSES paragraph modal at that field. Modal, tabs, selects, numeric inputs,
  segmented controls, color pickers and buttons come from `@cses/ui`.
- Font settings include family, relative scale, bold/italic style, text and
  highlight colors, underline/strike/code and character spacing. The character
  spacing tab stays limited to scale, spacing and preview; it does not duplicate
  baseline effects or preset buttons. Paragraph settings include alignment,
  space before/after and line height. Paragraph values persist as `psb/psa/lh`;
  adjacent spacing is
  `max(previous.psa, next.psb)` and is not stored as a redundant third value.
- Dialog edits are drafts: preview changes immediately, but Yjs changes only
  after **确定**. **取消**, Escape, mask policy and readonly transitions do not
  commit. A saved model Selection is replayed before applying the result, and
  every confirm uses one transaction. Paragraph settings always target the
  complete eligible selection.
- Mixed fields remain untouched until the user changes that field. This keeps
  a single known setting from flattening unrelated mixed formatting across the
  selection. Individual fields expose document-default values where applicable;
  the dialogs do not expose a whole-dialog reset action.
- Paragraph style keeps its current heading icon. The paired font-family and
  relative-scale fields intentionally omit leading icons; responsive
  **更多格式** uses `bc_zihao` for the scale submenu. Character spacing uses
  `bc_zijianju` and stays adjacent to paragraph line height.
- Font size stays relative rather than absolute. A complete editable block
  persists compact paragraph scale `pfs`; a partial range or collapsed caret
  persists/queues inline `t:fs`. Effective text scale is `pfs × t:fs`, so list
  markers and todo controls follow full-block scaling. Family and letter
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
  viewport. Each actual width change first tries the complete surface and then
  degrades one tier only when the two visible toolbar sections truly overflow;
  projected dropdown-template hosts do not participate in this measurement. The first
  tier moves the paired font family/scale control, character spacing and
  paragraph line height into **更多格式**, while superscript/subscript, inline
  link and inline formula leave the fixed surface. If that still does not fit,
  the narrow tier collapses bold, italic, underline, strike-through, inline
  code, superscript and subscript into one **文字格式** dropdown. The observer is
  created once per component and disconnected on destroy.
- Word-like semantic groups keep related commands together with visual dividers
  and accessible group names, but do not render persistent group-caption text.
  The surface remains one lightweight document-toolbar row instead of adopting
  a full multi-row Office Ribbon.
- Every responsive tier keeps formatting and insertion as sibling, non-shrinking
  sections in one row. The toolbar centers when it fits and progressively
  condenses before scrolling. Only the narrowest tier may expose one lightweight
  horizontal scrollbar as a last resort; safe centering preserves the reachable
  inline start instead of letting insertion cover formatting.

### Insertion Actions

- Shape, text box, WordArt, Table, columns, image and video/audio remain
  individually visible insertion actions at every responsive width; they are
  never consolidated into one Insert menu. Unavailable actions retain their
  existing Schema, selection and readonly disabled states. The insertion
  section never overlays the formatting section; both travel together in the
  toolbar's horizontal scroll range.
- When the document registers `ShapeBlockSchema`, the toolbar shows a Shape
  action using the existing `bc_tuxing` iconfont glyph. Click or keyboard
  activation opens the bounded categorized shape picker. Its 103
  entries come from eight `SHAPE_CATEGORIES` backed by the shared
  `SHAPE_DEFINITIONS`; each compact icon-only item renders its actual
  main/detail geometry through `ShapeIconComponent` and exposes its label by
  Tooltip plus `aria-label` instead of visible per-cell text.
- When the document registers `TextBoxBlockSchema`, **插入文本框** opens the
  58-style catalog directly. Its `cs-tabs` categories are 办公经典 / 引言 /
  侧边栏 / 杂志 / 异形 / 气泡 / 纸张 / 文化风格 / 材质效果 / 竖排. Only the
  tab strip scrolls horizontally; the card content expands and is not placed
  in a nested vertical scroller. Vertical presets carry their own
  `vertical-rl` frame direction.
- Picking a shape, WordArt or text-box preset arms a one-shot drawing surface over the
  document without requiring a focused block, active Selection or saved
  selection snapshot; it does not write Yjs or create a block yet. A
  primary-pointer drag shows a theme-colored rectangle preview and commits that
  rectangle's scale-normalized width, height and absolute position only on
  pointer release. A press/release without a drag commits the selected type at
  its normal default size.
- The inserted shape is whole-block selected. A text box is selected and
  revealed, staying whole-object selected so its resize handles and settings
  rail are visible; entering its text is one content click or Enter away.
  Inserted WordArt is selected,
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
- The brush copies common inline text styling — including compact font family
  and letter spacing — plus context-sensitive font scale and paragraph `lh`.
  A complete target block receives `pfs`; a partial target receives `t:fs`.
  It does not copy document
  defaults, heading, list flavour, alignment, links, inline formulas, or
  non-text block contents.
- `Cmd/Ctrl+Shift+C` can be used to quickly enable the brush; cancellation still uses the toolbar button or `Escape`.

### Selection Behavior

- Heading and list transforms work on cross-block text selections as long as every covered block is editable and not `plainTextOnly`.
- The ordered-list control is a split button: its main area toggles the list, while the caret opens the ordered marker library. Picking a marker updates each automatic-numbering group reached by the selection; same-level ordinary paragraphs do not split that group.
- Link and inline-formula actions remain restricted to same-block text selections; on cross-block selections the buttons stay visible but disabled.
- Inline-format buttons still follow text-range availability; block-level transforms are more permissive than inline text formatting.

`TextToolbarHelper.transformBlocks()` accepts an optional third `props` argument
and forwards it to the target Schema snapshot. This lets one command transform
the block flavour and initialize semantic props atomically:

```typescript
helper.transformBlocks('ordered', selection, {ms: 'r2'})
```

For font scale, use `TextToolbarHelper.formatTypography()` instead of writing
an inline patch directly. `getFontScaleTargets()` is model-only and partitions
cross-block selections into complete paragraph targets and partial inline
targets; it does not read DOM geometry or install observers.

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
