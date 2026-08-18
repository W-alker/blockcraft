# BlockCraft: Block Toolbar Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-08-18

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
The canonical icon mapping is `bc_tuwenraopaiqianrushi` for **嵌入型**,
`bc_tuwenraopaishangxiashi` for **上下型**, and `bc_tuwenraopai` for
**四周型环绕**.
Root absolute images also expose one-step
**上移一层 / 下移一层** controls using `bc_cengji-shangyi` and
`bc_cengji-xiayi`. The controls traverse one total stack and can cross ordinary
flow content; they are disabled only at the highest `over` and lowest `under`
boundaries. An image inside `object-group` omits both the object-layout and
stack control sets because only its group owns root placement.

Block images use the shared placement-plane-relative object resizer. The
persisted width is `props.wr` (normally root-content percentage; group-width
percentage for a direct `object-group` member) and height is derived from
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
Choosing it keeps the image as the same one-length Embed and uses the automatic
text-wrapping policy. The toolbar exposes no 自动环绕 / 文字在左 / 文字在右
secondary actions. **嵌入型** removes wrapping without moving the Embed.
Eligible geometry lays real editable text on both sides; near an edge it uses
the wider readable side. The visible `.bc-inline-image-frame` is the resize and
connected-overlay target. Both ordinary and wrapped inline-image
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

## ObjectGroupToolbarPlugin

> `plugins/object-group-toolbar/` — Multi-object selection and fixed grouping.

Shift-click extends a whole-object selection to one contiguous range of direct
root placement children. With two or more objects, the toolbar exposes
**左对齐 / 水平居中 / 右对齐 / 顶端对齐 / 垂直居中 / 底端对齐 / 中心对齐**.
With three or more it also enables **横向分布 / 纵向分布**. The icons are
`bc_align2left`, `bc_align2center`, `bc_align2right`, `bc_align2top`,
`bc_align2middle`, `bc_align2bottom`, `bc_zhongxinduiqi`,
`bc_hengxiangfenbu` and `bc_zongxiangfenbu`.
The **组合** action calls `doc.placement.group(ids)`;
selecting an `object-group` shows **取消组合** and calls `ungroup(groupId)`.
Their toolbar glyphs are `bc_combination` and `bc_quxiaozuhe`, respectively.
All structural moves, coordinate rebasing and image ratio conversions occur in
one Yjs transaction.
Alignment and distribution also use one model-only Yjs transaction, but write
only `position`. They preserve responsive/fixed size fields and placement
layers. Single-axis center and combined center use the average of the selected
visual centers; distribution keeps the two endpoint centers fixed and spaces
the intermediate centers evenly.
The selected group toolbar exposes **上下型 / 衬于文字下方 / 浮于文字上方**
for the group as one atomic object. Top-bottom moves the fixed group frame into
root flow without changing member-local coordinates; under/over restores root
absolute placement. It also exposes **上移一层 / 下移一层** while absolute;
copy/delete use the standard whole-block paths. The absolute frame-edge drag
regions are hidden in top-bottom flow so ordinary block reorder owns movement.
Because dissolving a group projects its members back into the root absolute
plane, **取消组合** is enabled only while the group is under/over; the layout
buttons remain available in top-bottom flow so the state is always reversible.

The Plugin's document-capture pointer listener must register before image,
Shape, TextBox and WordArt object Plugins. The bundled capability factory
already guarantees that order. On grouped content, the first click selects and
shows the whole group; dragging any of the selected frame's four edge bands
moves the group. Clicking a member again while the group is selected lets that
member's existing toolbar and local drag behavior take over. Once the group or
any nested descendant owns Selection, the capture listener leaves member
`pointerdown` events untouched, so later member drags cannot be reclaimed as a
new first click. A selection anywhere in the mounted group subtree keeps the
ancestor group outline visible; this walks only the two endpoint ancestry
chains and does not scan descendants or measure DOM.
Member styling and local resize stay available; member-level object-layout
controls remain omitted because flow/inline/layer transitions would break the
group boundary. Only the selected group frame owns the three block-layout
choices.
Independent **上移一层 / 下移一层** controls are omitted from every member
toolbar; only the selected group can move through the root placement stack.
Member move/resize/rotation commits tighten the group frame through
`updateObjectGeometry()` without measuring DOM. The pointer-move phase remains
transform-only.
The frame reserves 8 layout pixels on each side between its outline and the
local member plane, so an edge-aligned member does not overlap group chrome.

```typescript
new ObjectGroupToolbarPlugin()
```

Selection remains one contiguous range of root absolute objects. Alignment can
cross `under`/`over` layers and can treat an existing group as one object;
组合 stays independently disabled unless the selected range is same-layer and
contains no existing group. V1 does not expose group resize/rotation or nested
groups.

---

## ShapeToolbarPlugin

> `plugins/shape-toolbar/` — Word-like shape selection, styling and object layout.

Registers pointer selection and connected-toolbar behavior for the built-in
`shape` block. The compact object toolbar exposes fill color and opacity,
outline color/width/style, deletion, and the complete object-layout set.
Shape type is chosen only from the fixed toolbar's **插入形状** picker. Text
color and horizontal/vertical alignment remain compatible block properties but
are not shown in the default object toolbar. A root absolute shape additionally
shows **上移一层 / 下移一层** with `bc_cengji-shangyi` and
`bc_cengji-xiayi`; the same document placement APIs and total-stack boundary
rules used by images determine whether each control is enabled. A grouped shape
omits the complete layout and stack control sets.

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
| `wrap`          | **四周型环绕**; creates the same Embed with `wrap/x/gap`; an overlapping absolute shape enters the covered text line directly      |
| `top-bottom`    | **上下型**; clears absolute coordinates and reanchors to relative flow                          |
| `under`         | **衬于文字下方**; enters absolute placement below ordinary content                              |
| `over`          | **浮于文字上方**; enters absolute placement above ordinary content                              |
| `move-forward`  | Move an absolute shape one step toward the foreground, including crossing ordinary flow content |
| `move-backward` | Move an absolute shape one step toward the background, including crossing ordinary flow content |

Clicking an inline shape selects its one-character Embed in both
`BlockSelection` and the native Range, then opens a layout-only toolbar with
inline/wrap and reverse block conversion actions. **四周型环绕** is the one
shape text-wrapping mode; the toolbar does not expose 自动环绕 / 文字在左 /
文字在右. Shape Delta persists `wrap/x/gap` only and always resolves wrapping
with the automatic geometry policy. The Embed keeps all shape props and nested
text Delta; detailed text/style editing stays on the block representation, so
switch back to top-bottom/under/over to edit it.
Both plain inline and wrapped shapes can be dragged from their selected frame,
but a plain click only selects and opens the toolbar. The drag
proxy is created only after pointer movement crosses the 2px threshold. The
Pointer Events proxy maps release x/y back to a same- or
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
keeps clearance for the rotation handle; pointerdown inside `shape-resizer` or
`shape-geometry-editor` never starts object movement. Selected line, connector
and scribble shapes additionally expose endpoint/node handles; cubic shapes
expose their two control handles and guide lines. The gesture updates only the
SVG preview until pointerup, then writes one validated atomic `customGeometry`
value so collaboration and Undo never observe partial curves.
Common catalogue shapes use the same gesture boundary with yellow round
adjustment handles. Rounded rectangles, triangle, parallelogram, trapezoid,
cardinal/bidirectional block arrows and rectangular/rounded callouts persist
only a flat `adjustments` record; blue square handles remain reserved for cubic
curve controls.
All other catalogue shapes project their trusted static path into yellow
editable nodes on selection. Quadratic/smooth segments expose equivalent blue
cubic controls; catalogue arcs are split into cubic segments so their nodes and
controls remain usable. The projection becomes atomic `customGeometry` only
after the first completed gesture.

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
surface. Their geometry endpoints are editable, but automatic attachment to
another shape remains outside this visual shape contract.

---

## TextBoxToolbarPlugin

> `plugins/text-box-toolbar/` — Whole-frame selection, preset/shape/text-effect styling and
> object placement for the fixed-size `text-box` container.

```typescript
new TextBoxToolbarPlugin();
```

The Plugin keeps two explicit states. A selection on the `text-box` itself
opens its connected object toolbar with resize/rotation handles. A caret/range
whose text or child-boundary endpoints belong to the same text box keeps that
settings toolbar open alongside the normal text toolbars and adds
`.text-box-block--editing` to the frame host; the theme paints only an outer
focus outline, leaving the inner contenteditable free of browser focus chrome.
Enter or a frame double-click enters the first editable descendant, while
Escape from a direct child selects the parent frame. The intentional nested
`contenteditable=false → true` island keeps object selection and text editing
separate. Within that inner editing host, ordinary prose uses a column layout
whose last real child owns any remaining block-axis space, matching the
Callout/高亮块 rule that visible content space belongs to a child Block.
Browser caret hit testing can therefore resolve fixed-frame whitespace without
a Plugin-level blank-area click handler or synthetic caret calculation.
Relative movement uses the shared Pointer Events block drag controller;
absolute movement starts only from the frame edge and delegates to
`BlockPlacementManager`, so text selection inside the viewport remains native.

The object toolbar follows Word's object/text split. Whole-frame selection
opens a narrow vertical rail with click-owned **布局 / 样式 / 形状 / 文字**
entries; only one secondary settings card is visible at a time. **样式** applies
one catalog entry as a concrete multi-key props patch. **形状** reuses the full
Shape catalog except line/connectors that cannot own a text frame, and exposes
CSES color/slider/number controls for shape fill, picture fill, opacity,
outline and stroke style. Picture selection goes through the host
`DocFileService`; it never exposes or persists a temporary raw URL input.
**文字** combines WordArt presets with font, size, alignment, solid/gradient
fill, outline, shadow and transform controls. Preset IDs are never persisted,
and detailed `wa` edits remain one canonical serialized value-object write.
The **布局** rail entry uses the semantic `bc_buju` icon.

**文字** also owns the **文字方向** switch, which writes the frame's `wm` prop
rather than a WordArt style. Because `text-align` and the flex main axis are
logical, a vertical frame flips what each alignment control does on screen, so
the two alignment rows swap their displayed labels and options while the
underlying `horizontalAlign` / `verticalAlign` fields stay put. No stored value
is rewritten when the direction changes.

Compact `p/bgi/bgs/bgx/bgy/bgo` remains available to Schema/CRUD callers as a
low-level surface capability. Raw padding and background URL fields are not
shown in the toolbar; image fit/opacity are surfaced only as semantic picture
fill controls. Those controls — 选择图片 / 替换图片 / 移除 plus fit and opacity —
key off *uploaded* images only, meaning a `bgi` that is not a `bc:` artwork
reference. A catalog drawing shares the same field but belongs to the chosen
style, so offering to replace or remove it means one click wipes the preset's
artwork and leaves an empty frame. Slider movement stays local and commits once on pointer/key
completion to avoid Yjs/Undo flooding. The outer rail and all secondary cards
remain in one block-owned connected Overlay; CSES ColorPicker/Select sibling
panes are treated as owned interactions only while their originating control is
open inside that toolbar.

Object layout is limited to `top-bottom`, `under` and `over`; those three
choices are the layout card's only placement controls. It does not repeat them
through a separate **位置基准 / 随文字移动 / 固定在页面上** section, and it
does not advertise Square/Tight/Through wrapping. Root absolute objects also
expose one-step forward/backward stacking. A grouped text box omits the entire
**布局** rail entry and panel rather than showing unavailable choices. No
inline/wrap conversion is advertised because a multi-Block container has no
inline Embed or block-wrap representation.

Register `TextBoxBlockSchema`, `PlacementLayoutBlockSchema`, the allowed
ordinary child schemas and `TextBoxToolbarPlugin` together. The bundled
capability factory already does this. When the Schema is present, the fixed
toolbar shows the `bc_wenbenkuang` **插入文本框** action and opens the style
catalog directly. The fixed surface does not repeat **横向** / **竖向** plain
insertion shortcuts; direction remains available from the selected text box's
**文本** settings.

The catalog is horizontal-only: it groups entries into 线框 / 矩形 / 气泡
(`CsSegmentedComponent` tabs), keeps **默认白框** first in 线框, and stamps
`wm: 'h'` on every pick. There is no separate 精选 tab. Presets are not offered
transposed because Shape
geometry and the `bgi` surface image both stretch
(`preserveAspectRatio="none"`) instead of rotating, so a tall frame smears the
ornament rather than reorienting it. `getTextBoxPresetsFor(wm, cat?)` still
filters by direction for callers that need it, and bundled speech bubbles still
declare `wm: ['h']`; the picker simply queries it as `'h'`.

Picking a style arms the shared one-shot drawing surface, creates one absolute
`over` object on pointerup, then reveals the object and enters its initial
paragraph. Gesture cancellation never writes a temporary root-flow Block.

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

The connected toolbar now follows the same two-level object pattern as TextBox.
Its narrow vertical rail exposes **布局 / 艺术字格式 / 删除** and sits on the
available left or right side of the selected object. Clicking **布局** opens a
secondary card containing inline/wrap plus the three block object layouts and,
for a root absolute object, stack order. Clicking **艺术字格式** opens a
secondary card whose local tabs group the existing controls into 字体、填充与
轮廓、效果. Only one secondary card is visible, and panel switching stays
inside the same block-owned connected Overlay without writing document data.
The Plugin repositions that Overlay on the next animation frame after card
geometry changes. Both secondary cards are capped at 288px rather than
expanding to the former wide settings surfaces. A grouped WordArt omits the
complete 布局 rail entry and card.

The formatting card continues to expose one of 10 safe font families, font
size, solid/linear-gradient fills, outline, shadow toggle, letter spacing,
horizontal/vertical alignment and safe affine/perspective/scale effects. The 16
whole-style presets remain in the fixed toolbar's **插入艺术字** visual
dropdown; font-family selection is also available on the selected object so
existing WordArt can be restyled. The shadow toggle uses the
`bc_wenziyinying` iconfont glyph. Generic form fields use CSES `Select`,
`Segmented`, `InputNumber`, `ColorPicker`, `Slider` and `Switch` controls;
BlockCraft continues to own only the editor-specific rail and layout geometry.
Letter-spacing and outline-width slider previews stay local and commit once at
the end of pointer/key interaction, avoiding Yjs and Undo flooding. Styling is
whole-block; it does not write per-character inline attributes. CSES select and
color-picker sibling panes count as owned interactions only while their
originating control is open inside this toolbar.

The real WordArt surface owns `ShapeResizerComponent` and
`calculateWordArtResize()` while the Plugin creates only the connected
toolbar. Keeping text, outline and handles in one transform coordinate system
prevents rotated resize previews from drifting. Corners preserve the object
aspect ratio and preview the scaled font size; left/right reflow width,
top/bottom adjust height, and the rotation handle commits normalized degrees.
Gesture previews run outside Angular and commit once on pointerup. The
toolbar's fill, effect and alignment choices use the standard CSES form
components rather than native controls or BlockCraft command-menu components.

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
range and opens the same layout-only inline-object toolbar used by shapes; it
does not expose text-side actions. A click creates no drag proxy. Pointer Events
drag begins only after movement crosses the 2px threshold in both plain inline
and wrapped modes, including cross-paragraph anchor movement.
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
