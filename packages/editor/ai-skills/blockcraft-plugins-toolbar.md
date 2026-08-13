# BlockCraft: Block Toolbar Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-08-13

These plugins provide floating toolbars that appear when specific block types are selected.

## AttachmentExtensionPlugin

> `plugins/attachment-extension/` — Attachment block interactions and toolbar.

Manages click behavior on attachment blocks (file picker for empty blocks, upload-in-progress warnings), shows a connected toolbar with rename/download/preview/delete actions, and handles file paste. Rename mode keeps the attachment visually active with the private `.bc-attachment-renaming` class while the native rename input owns focus; whole-block `.selected` remains owned by `SelectionManager`.

### Configuration

```typescript
new AttachmentExtensionPlugin(options?: AttachmentExtensionOptions)
```

| Option             | Type                                | Default                          | Description                          |
| ------------------ | ----------------------------------- | -------------------------------- | ------------------------------------ |
| `extraItems`       | `IAttachmentToolbarItem[]`          | `[]`                             | Extra toolbar buttons                |
| `onExtraItemClick` | `(itemName, block, doc) => boolean` | —                                | Handler for custom button clicks     |
| `onPreview`        | `(block, doc) => void`              | —                                | If provided, adds a "Preview" button |
| `previewIcon`      | `string`                            | `'bc_eye-open'`                  | Icon for the preview button          |
| `previewLabel`     | `string`                            | `'预览'`                         | Label for the preview button         |
| `uploadingTip`     | `string`                            | `'文件可能正在上传中，暂不可用'` | Tooltip shown during upload          |

### Extension Points

| Name               | Purpose                            |
| ------------------ | ---------------------------------- |
| `onPreview`        | Custom file preview implementation |
| `onExtraItemClick` | Handle custom toolbar actions      |

### Dependencies

- **Requires** `DOC_FILE_SERVICE_TOKEN` to be provided via DI. Throws `BlockCraftError` if absent.

### Usage Example

```typescript
new AttachmentExtensionPlugin({
  onPreview: (block, doc) => {
    const url = block.props.url;
    window.open(url, "_blank");
  },
  extraItems: [{ name: "share", icon: "bc_icon bc_share", label: "分享" }],
  onExtraItemClick: (name, block, doc) => {
    if (name === "share") {
      /* ... */ return true;
    }
    return false;
  },
});
```

---

## ImgToolbarPlugin

> `plugins/img-toolbar/` — Image block toolbar and interactions.

Handles image drag, Enter key behavior, double-click preview (readonly mode),
and shows a connected toolbar with align/object-layout/caption/download/
copy-url actions. The shared object layouts are **嵌入型 / 上下型 /
衬于文字下方 / 浮于文字上方** with the same iconfont glyphs used by
BlockController and future shapes. Top-bottom images use the shared Pointer
Events block reorder controller; floating images live below the root placement
layout and use the Pointer Events-only document placement coordinator. Native
HTML5 drag/drop is not used for either position adjustment. An `under`
image selected from its visible edge opens the same toolbar. Returning a
floating image to top-bottom flow and converting it to an inline image both
resolve the same nearest visual flow anchor, so neither jumps back to the
pre-floating model position. Absolute images additionally expose a direct
**四周型环绕** action. When the image visually overlaps a compatible editable
text block, the action inserts the wrapped image Embed at that covered text
line in one Yjs transaction, recalculates normalized `x` against the target
text container, and preserves a non-empty image caption as following inline
text. Merely being the nearest block is insufficient, and editable descendants
of the source image are excluded. If no text block is actually covered, the
action falls back to a new wrapped paragraph at the nearest visual flow anchor.
Both paths start with `side: 'auto'` plus the standard gap.
Absolute images also expose one-step
**上移一层 / 下移一层** controls using `bc_cengji-shangyi` and
`bc_cengji-xiayi`. The controls traverse one total stack and can cross ordinary
flow content; they are disabled only at the highest `over` and lowest `under`
boundaries.

Block images use the shared root-relative object resizer. The persisted width
is `props.wr` (root content percentage) and height is derived from
`props.ar`; the aspect ratio is locked by default. Left/right handles use
Pointer Events, animation-frame-coalesced DOM preview and one props write on
pointerup. An old pixel-sized image remains unchanged until that first completed
resize, which atomically migrates `width/height` to `wr/ar`. Converting a
responsive block image to an inline image resolves its current pixel dimensions
before replacement because inline images keep their existing pixel attribute
contract.

### Configuration

```typescript
new ImgToolbarPlugin(options?: ImgToolbarPluginOptions)
```

| Option             | Type                                | Default | Description                      |
| ------------------ | ----------------------------------- | ------- | -------------------------------- |
| `extraItems`       | `IImageToolbarItem[]`               | `[]`    | Extra toolbar buttons            |
| `onExtraItemClick` | `(itemName, block, doc) => boolean` | —       | Handler for custom button clicks |

### Built-in Toolbar Actions

| Action                      | Behavior                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `align`                     | Set image alignment (left/center/right)                                                                           |
| `object-layout: inline`     | Convert to **嵌入型** near the current visual flow anchor                                                         |
| `object-layout: wrap`       | On an absolute image, insert **四周型环绕** into covered text; otherwise create it near the visual flow anchor   |
| `object-layout: top-bottom` | Use **上下型** and automatically return to relative flow                                                          |
| `object-layout: under`      | Use **衬于文字下方** and automatically enter absolute placement                                                   |
| `object-layout: over`       | Use **浮于文字上方** and automatically enter absolute placement                                                   |
| `move-forward`              | Move an absolute image one step toward the foreground, crossing from highest `under` to lowest `over` when needed |
| `move-backward`             | Move an absolute image one step toward the background, crossing from lowest `over` to highest `under` when needed |
| `caption`                   | Toggle caption child block                                                                                        |
| `download`                  | Download the image file                                                                                           |
| `copy-url`                  | Copy image `src` URL to clipboard                                                                                 |

The inline-image toolbar emits the same `object-layout` action. Switching an
inline image directly to under/over measures its current DOM box before
replacement and persists those coordinates on the new image block.
Clicking an inline image selects its one-character Embed range through
`EditableBlockComponent.setInlineRange(offset, 1)`. This updates the canonical
`BlockSelection` and native DOM Range together, so copy/cut act on the inline
image rather than a stale text cursor. Readonly documents create the same
selection for copy, but do not open editing controls.
An Embed-only inline selection does not open FloatTextToolbar or TextMarker;
mixed text-plus-Embed ranges retain the normal text toolbar behavior.
Inline images without persisted dimensions reserve a 4:3 frame while loading.
On first success this Plugin fills only missing `width/height` delta attributes
inside an `ORIGIN_NO_RECORD` transaction, so the correction is collaborative
and virtual-rendering-safe without adding an Undo step.

The default inline-image converter additionally exposes an inline-only
**四周型环绕** action; it does not extend global block object-layout options.
Choosing it keeps the image as the same one-length Embed and persists
`wrap: true`, `side: 'auto' | 'left' | 'right'`, normalized `x`, and optional
pixel `gap`. **嵌入型** removes those four attributes without moving the Embed.
The secondary controls are **自动环绕（auto） / 文字在左 / 文字在右**.
Eligible `auto` geometry lays real editable text on both sides; near-edge auto
and explicit left/right use one side. The visible `.bc-inline-image-frame` is
the resize and connected-overlay target. Both ordinary and wrapped inline-image
resize gestures keep that committed frame and the owning editable layout fixed,
while an inert body-level outline with a live `width × height` label previews
the proportional target size. The opposite horizontal edge stays fixed, the
preview is clamped to the owning editable content width, and pointerup commits
one `width/height` Delta format; wrapped images also update their existing
normalized `x` when the preview's left edge moves. Escape, pointercancel,
window blur, readonly or
stale-anchor teardown cancels without a model write and releases the layout and
virtual-view leases. Dragging a selected wrapped frame
uses Pointer Events outside Angular and holds both an InlineRuntime
layout-freeze lease and a source virtual-view lease. The committed frame,
selection and text fragments stay fixed while an accessibility-inert,
RAF-coalesced proxy follows x/y outside contenteditable. Pointerup converts the
proxy x to normalized `x` and y to a Delta anchor. The anchor may move within
the paragraph or to another compatible mounted editable block; block gaps and
non-editable hits snap to the nearest compatible editable, while an
editor-external drop cancels. Same/cross-block writes use one Yjs transaction
and preserve the complete Embed payload. Cancel/Escape/blur/readonly teardown
removes the proxy and releases both leases without a model write.
Themes may refine the presentation-only proxy through
`.bc-inline-image-drag-proxy`; it is never part of serialized editor content.

### Dependencies

- Uses `DOC_FILE_SERVICE_TOKEN` for `previewImg()` on double-click in readonly mode

### Usage Example

```typescript
new ImgToolbarPlugin({
  extraItems: [{ name: "edit", icon: "bc_icon bc_edit", label: "编辑" }],
  onExtraItemClick: (name, block, doc) => {
    if (name === "edit") {
      // open image editor...
      return true;
    }
    return false;
  },
});
```

---

## ShapeToolbarPlugin

> `plugins/shape-toolbar/` — Word-like shape selection, styling and object layout.

Registers pointer selection and connected-toolbar behavior for the built-in
`shape` block. The compact object toolbar exposes fill color and opacity,
outline color/width/style, deletion, and the complete object-layout set.
Shape type is chosen only from the fixed toolbar's **插入形状** picker. Text
color and horizontal/vertical alignment remain compatible block properties but
are not shown in the default object toolbar. An absolute shape additionally
shows **上移一层 / 下移一层** with `bc_cengji-shangyi` and
`bc_cengji-xiayi`; the same document placement APIs and total-stack boundary
rules used by images determine whether each control is enabled.

The outline-width picker uses the shared `BcOverlayTriggerDirective` and
column `BcFloatToolbarComponent`; the shape toolbar contains no native
`select` elements.

```typescript
new ShapeToolbarPlugin();
```

The layout actions are:

| Action          | Behavior                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `inline`        | **嵌入型**; serializes shape props plus its `shape-text` Delta into one `shape` Embed           |
| `wrap`          | **四周型环绕**; creates the same Embed with `wrap/side/x/gap`; an overlapping absolute shape enters the covered text line directly |
| `top-bottom`    | **上下型**; clears absolute coordinates and reanchors to relative flow                          |
| `under`         | **衬于文字下方**; enters absolute placement below ordinary content                              |
| `over`          | **浮于文字上方**; enters absolute placement above ordinary content                              |
| `move-forward`  | Move an absolute shape one step toward the foreground, including crossing ordinary flow content |
| `move-backward` | Move an absolute shape one step toward the background, including crossing ordinary flow content |

Clicking an inline shape selects its one-character Embed in both
`BlockSelection` and the native Range, then opens a layout-only toolbar with
inline/wrap, text-side and reverse block conversion actions. The Embed keeps
all shape props and nested text Delta; detailed text/style editing stays on the
block representation, so switch back to top-bottom/under/over to edit it.
Both plain inline and wrapped shapes can be dragged immediately from their
selected frame. The Pointer Events proxy maps release x/y back to a same- or
cross-editable-block Delta anchor in one Yjs transaction; wrapped shapes also
update normalized `x`, while plain inline shapes keep no float coordinates.
HTML preserves the object payload and wrap metadata; Markdown emits readable
shape text. Clicking the block object edge selects the whole shape and opens
the styling toolbar. While that absolute whole-object selection
is active, printable input, IME, Enter, Tab and paste are isolated from the
normal document input pipeline; Delete/Backspace and object toolbar operations
remain available. A newly inserted shape has no placeholder text child;
double-clicking creates its single `shape-text` child through `DocChain` and
focuses it, while later double-clicks focus the existing child. That nested
editing surface has no independent border, outline, shadow or background.
Relative shapes use the shared Pointer Events block drag controller. Absolute
shapes live below the root placement layout and use the Pointer Events-only
placement drag coordinator; native HTML5 drag/drop is not involved. Eight
resize handles and the top-center drag-rotation handle share one gesture
coordinator. Rotation previews per animation frame, Shift snaps to 15°, and
pointerup commits one `updateProps()` transaction. The toolbar's top placement
keeps clearance for the rotation handle; pointerdown inside `shape-resizer`
never starts object movement.

Register `PlacementLayoutBlockSchema`, `ShapeBlockSchema`,
`ShapeTextBlockSchema`, `ShapeToolbarPlugin`, and a fresh
`createInlineShapeEmbedConverter()` together. The bundled editor already does
this.
When `ShapeBlockSchema` is registered, the bundled
`FixedTextToolbarComponent` also exposes a visible **插入形状** button. Its
picker uses the same 103 `SHAPE_DEFINITIONS` grouped by the eight
`SHAPE_CATEGORIES` and creates the selected type
directly below the root `placement-layout`, near the saved selection, with the
default `over` tier. There is no temporary root-flow shape. When the layout does
not exist yet, the layout and its first shape are inserted as one nested
snapshot; later shapes append to the existing layout. The new shape is selected
after the transaction completes. The entry keeps the existing `bc_tuxing`
iconfont glyph, while every picker item renders its actual
`ShapeDefinition.path` through the shared `ShapeIconComponent`; shape
definitions do not maintain iconfont classes. Its dense icon-only cells use
Tooltip and accessible labels; only the compact category headings remain
visible.
Line/connector appearances paint no fill and expose no editable shape-text
surface; automatic endpoint attachment is outside this visual shape contract.

---

## WordArtToolbarPlugin

> `plugins/word-art-toolbar/` — Editable WordArt styling, object placement and
> transform affordances.

```typescript
new WordArtToolbarPlugin();
```

This zero-config Plugin owns the `word-art` object/edit dual state. Clicking
text or blank space enters the direct Y.Text editor without arming object
movement; once editing, normal text clicks use the browser's native caret
placement. Relative reorder or absolute placement drag starts only from the
four invisible hit regions on the visible selection border. The eight resize
handles and rotation handle keep higher hit priority, and no separate move
handle is rendered. Enter also enters editing; Escape returns to whole-object
selection. Readonly WordArt stays selectable but does not open mutation
controls.

The connected toolbar exposes one of 10 safe font families, font size,
solid/linear-gradient fills, outline,
shadow toggle, letter spacing, horizontal/vertical alignment, safe
affine/perspective/scale effects, inline/wrap plus the three block object
layouts, absolute stack order and deletion. The 16 whole-style presets remain
in the fixed toolbar's **插入艺术字** visual dropdown; font-family selection is
also available on the selected object so existing WordArt can be restyled. The
shadow toggle uses the `bc_wenziyinying` iconfont glyph.
Horizontal and vertical alignment are two iconfont-only triggers with
iconfont-only secondary menus, active state, tooltip and accessible names. The
outline-width and letter-spacing ranges share the shape toolbar's themed
progress track, thumb and focus ring. Styling is whole-block; it does not write
per-character inline attributes.

The real WordArt surface owns `ShapeResizerComponent` and
`calculateWordArtResize()` while the Plugin creates only the connected
toolbar. Keeping text, outline and handles in one transform coordinate system
prevents rotated resize previews from drifting. Corners preserve the object
aspect ratio and preview the scaled font size; left/right reflow width,
top/bottom adjust height, and the rotation handle commits normalized degrees.
Gesture previews run outside Angular and commit once on pointerup. The
toolbar's fill, effect and alignment choices use the shared overlay menu
components rather than native selects.

Register `WordArtBlockSchema`, `PlacementLayoutBlockSchema` and
`WordArtToolbarPlugin` together with a fresh
`createInlineWordArtEmbedConverter()`. The bundled capability factory already
does this, and the bundled fixed toolbar exposes the **插入艺术字** visual preset
dropdown only when the Schema is registered. Its compact 16 `A` cards reuse the
production WordArt presentation resolver. Choosing a preset creates the
default `艺术字` with that presentation, enters editing and selects all text.

Choosing **嵌入型** or **四周型环绕** serializes normalized whole-object props
and plain-text Delta into one `word-art` Embed. An absolute object that visibly
overlaps editable text is inserted at that covered line; otherwise it falls
back to the nearest flow anchor. Clicking the Embed selects its length-one
range and opens the same layout-only inline-object toolbar used by shapes.
The selected frame supports the same immediate Pointer Events drag in both
plain inline and wrapped modes, including cross-paragraph anchor movement.
Top-bottom/under/over restores a WordArt block without losing presentation or
text. HTML round-trips the payload; Markdown degrades to readable text.

---

## BookmarkBlockExtensionPlugin

> `plugins/bookmark-frame-extension/` — Toolbar for bookmark blocks.
> Runtime plugin ID: `bookmark-block-extension`.

Shows a floating `BookmarkBlockToolbar` when a bookmark block is selected. Dismissed when selection moves away.

### Configuration

No configuration options.

```typescript
new BookmarkBlockExtensionPlugin();
```

---

## CalloutToolbarPlugin

> `plugins/callout-toolbar/` — Shared appearance toolbar for Callout and
> `render-unit` content-region blocks.

Shows one floating container toolbar centered above/below a supported block
when the cursor is inside a direct editable child. A whole-block `render-unit`
selection also opens it, which keeps an empty content region configurable.
Callout exposes text, background and border colors; `render-unit` exposes only
background and border colors and never cascades the values to child blocks.
The plugin tracks block resize via one throttled `ResizeObserver` (100ms) while
the overlay is open.

The Callout prefix action opens the shared CSES EmojiPicker with an explicit
`zh-CN` locale and persists the selected native Emoji in `props.prefix`.

### Configuration

No configuration options.

```typescript
new CalloutToolbarPlugin();
```

### Public API

| Method                        | Description                                                    |
| ----------------------------- | -------------------------------------------------------------- |
| `openToolbar(containerBlock)` | Open for a mounted `callout` or `render-unit` block             |
| `closeToolbar()`              | Dismiss the toolbar and disconnect its block-owned observation |

---

## DividerExtensionPlugin

> `plugins/divider-toolbar/` — Style selector for divider blocks.

Shows a `DividerStylePopupComponent` when a divider block is selected, allowing users to change the divider's line, tape or decorative-edge style, monochrome line color, independent length / thickness / opacity, and an optional **text label** with typography and alignment.

The popup has four text-only style tabs — `线型` (line), `贴纸胶带` (tape), `花边` (decorative edge), and `文字装订` (text label) — plus shared appearance controls. It uses CSES `Segmented`, `Slider`, `ColorPicker`, `Button` and `Input` controls; the color fields expose only the ColorPicker's built-in theme and standard palettes, without a custom preset list or the advanced “更多颜色” entry. Alignment segments project the BlockCraft `bc_zuoduiqi`, `bc_juzhongduiqi` and `bc_youduiqi` font icons so they are not interpreted as CSES icon identifiers. Pointer and mouse events are isolated inside the popup to preserve the selected divider while its controls remain natively operable. `length` uses `short` / `medium` / `long` / `full` at 25% / 50% / 75% / 100%; `thickness` uses `thin` / `regular` / `thick`; and `opacity` is stored as 0.1–1 and exposed as a 10–100% range. The deprecated `size` prop is still read for old snapshots, but the toolbar writes only the split props. The two-column line catalog contains the original `solid`, `dashed`, `dotted` and `double` values plus six additive `DividerBlockModel.props.style` values: `fade`, `wave`, `zigzag`, `sketch`, `triple-dot` and `diamond`. The line tab writes its independent `lineColor` prop through the built-in CSES palette. Wave, zigzag and sketch use theme-colored SVG masks; all six decorative line patterns share the same renderer between the popup, a plain divider and the two segments around a text label. `lineColor` does not recolor tape textures or multicolor SVG artwork; overall `opacity` applies to every style. The `花边` tab provides six low-saturation multicolor SVG styles: `edge-grass`, `edge-flower`, `edge-vine`, `edge-daisy`, `edge-stars` and `edge-berries`.

The `文字装订` tab edits the divider block's `text` prop via a text input, `fontSize` through the 10 / 12 / 14 / 16 / 18 / 20 / 24 / 28 / 32px presets, `fontWeight` (`normal` / `bold`), `fontStyle` (`normal` / `italic`), `letterSpacing` through 0 / 0.5 / 1 / 1.5 / 2 / 3 / 4 / 6 / 8px presets, `align` (`left` / `center` / `right`) via alignment buttons, and `color` via color swatches (empty = theme default). The renderer defaults `fontSize` to 14px and clamps imported values to 10–32px; letter spacing defaults to 0 and clamps to 0–8px. Font size, emphasis and letter spacing occupy separate compact rows so the expanded presets remain readable. The divider block stays a `void` block; the label is a read-only `text` prop rendered by the block — for line and edge styles the text is centered with segments on both sides, for tape styles the text sits inside the tape band. `align` defaults to `center`. When `text` is empty the divider renders as a plain line (unchanged).

### Configuration

No configuration options.

```typescript
new DividerExtensionPlugin();
```

---

## EmbedFrameExtensionPlugin

> `plugins/embed-frame-extension/` — Toolbar for iframe embed blocks.

Shows a floating `EmbedFrameBlockToolbar` for any block whose flavour ends with `'embed'` (e.g., `figma-embed`, `juejin-embed`) when selected.

### Configuration

No configuration options.

```typescript
new EmbedFrameExtensionPlugin();
```

---

## FormulaBlockExtensionPlugin

> `plugins/formula-extension/` — LaTeX formula editing.

Handles editing for both block-level formula blocks and inline formula embeds. Shows a `FormulaBlockToolbar` overlay with LaTeX input and preview on click.

### Configuration

No configuration options.

```typescript
new FormulaBlockExtensionPlugin();
```

### Public API

| Method                       | Description                                              |
| ---------------------------- | -------------------------------------------------------- |
| `closeToolbar()`             | Dismiss the formula editor overlay                       |
| `createEmbedRange(cElement)` | Create a range for an inline formula embed element       |
| `getEmbedRange(target)`      | Get the range of an inline formula from a target element |

### Notes

- Block-level formula: updates `latex` prop via `updateProps()`
- Inline formula: updates via `applyDeltaOperations` on the embed range
- Overlay uses `backdrop: true` for modal-like behavior

---

## TextMarkerPlugin

> `plugins/float-text-toolbar/text-marker-toolbar.ts` — Floating color/format toolbar for text selections.

Shows a floating `TextMarkerComponent` toolbar when the user selects text inside designated block flavours. Supports two registration modes: **full rich-text mode** (bold, italic, underline, strike, color picker) and **color-only mode** (color picker only). The same plugin instance manages both; flavours must not appear in both lists simultaneously — duplicates in `colorOnlyFlavours` are silently ignored if the flavour is already listed in `markTextBlockFlavours`.

`plainTextOnly` blocks (e.g., `code`) are skipped by the normal floating text toolbar (`FloatTextToolbarPlugin`), making `TextMarkerPlugin` with `colorOnlyFlavours` the correct opt-in path for code-block color selection.

### Configuration

```typescript
new TextMarkerPlugin(
  markTextBlockFlavours?: BlockFlavour[],  // default []
  colorOnlyFlavours?: BlockFlavour[]       // default []
)
```

| Parameter               | Type             | Default | Description                                                                                                                               |
| ----------------------- | ---------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `markTextBlockFlavours` | `BlockFlavour[]` | `[]`    | Flavours that show the full float toolbar (bold/italic/underline/strike + color picker)                                                   |
| `colorOnlyFlavours`     | `BlockFlavour[]` | `[]`    | Flavours that show the float toolbar restricted to the color picker only; mutually exclusive with `markTextBlockFlavours` (dupes ignored) |

### TextMarkerComponent API

| Input       | Type      | Description                                                                     |
| ----------- | --------- | ------------------------------------------------------------------------------- |
| `colorOnly` | `boolean` | When `true`, hides bold/italic/underline/strike and shows only the color picker |

### Usage Examples

**Full rich-text toolbar for custom blocks:**

```typescript
new TextMarkerPlugin(["my-rich-block", "callout-body"]);
```

**Color-only toolbar for code / mermaid source blocks:**

```typescript
new TextMarkerPlugin([], ["code", "mermaid-textarea"]);
```

**Combined — rich formatting for prose, color-only for code:**

```typescript
// Typical bundled-editor setup
new TextMarkerPlugin(
  ["paragraph", "heading", "bullet", "ordered", "todo"], // full toolbar
  ["code"], // color picker only
);
```

### Notes

- The bundled `<editor>` component (from `packages/editor/editor/editor.ts`) registers `new TextMarkerPlugin([], ['code', 'mermaid-textarea'])` alongside `FloatTextToolbarPlugin`. Rich-text blocks continue to be served by `FloatTextToolbarPlugin`; code blocks and the mermaid source block (both `plainTextOnly`, sharing `CodeInlineRuntime`) get a color-only overlay. Consumers assembling their own editor must opt in manually.
- Color selections (`s:color` / `s:background`) on code blocks persist in the native Yjs document, survive collaboration and undo, but are not exported to HTML or Markdown — external clipboard output remains plain text.
- A flavour listed in both `markTextBlockFlavours` and `colorOnlyFlavours` is treated as rich-text only (the color-only registration is silently skipped).
