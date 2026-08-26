# BlockCraft: Theme Customization

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Last updated: 2026-08-26

## Theme Structure

```
themes/
├── base.scss           # CSS custom properties foundation
├── light.scss          # Light theme variable overrides
├── dark.scss           # Dark theme variable overrides
├── function.scss       # Utility SCSS mixins
├── variables.scss      # Shared design tokens
├── blocks/             # Per-block styles
│   ├── _paragraph.scss
│   ├── _divider.scss
│   ├── _callout.scss
│   └── ...
├── components/         # Per-component styles (toolbar, pickers)
└── plugins/            # Per-plugin styles loaded after ordinary block styles
    └── pagination.scss # Live/print pagination layout and block overrides
```

## Theme Switching

```typescript
// Toggle theme programmatically
doc.toggleTheme('dark');   // Sets body[blockcraft-theme="dark"]
doc.toggleTheme('light');  // Sets body[blockcraft-theme="light"]
```

## Placeholder Styling Contract

`PlaceholderPlugin` uses this DOM contract for editable blocks:

- block host: `.bc-placeholder-empty` plus compatibility `.empty`;
- target element: `.bc-placeholder-target[data-placeholder]`;
- text color: `--bc-placeholder-color`, falling back to `--bc-color`.

The base theme renders
`.bc-placeholder-empty .bc-placeholder-target::before`. A block that supports
placeholder rendering should not reuse `::before` on that target for
decorative chrome. Put the decoration on the host or a sibling, or use a
non-conflicting property such as an inset `box-shadow`.

```scss
[data-blockcraft-root='true'] {
  --bc-placeholder-color: color-mix(
    in srgb,
    var(--bc-color) 72%,
    transparent
  );
}
```

## Block Lock Styling Contract

The editor projects effective block lock state onto each block host:

- `data-bc-readonly="self|inherited"` identifies the effective lock scope;
- `data-bc-lock-kind="user|template"` identifies the persisted lock origin;
- document-level readonly has no lock kind.

The base theme decorates an explicit user lock with the readonly border,
background and lock icon. An explicit template lock keeps the same readonly
behavior but is visually neutral by default. Template-authoring surfaces can
reveal that decoration by placing `data-bc-reveal-template-locks` on any
ancestor of the document root:

```html
<section data-bc-reveal-template-locks>
  <div data-blockcraft-root="true">...</div>
</section>
```

Do not remove or rewrite `data-bc-lock-kind` to change permissions. It is a
rendered projection of Yjs metadata; use
`doc.setBlockReadonly(blockId, readonly, {kind})` for model changes. Likewise,
the reveal attribute changes only appearance and never grants unlock access.

## Ordered Marker DOM Contract

Live rendering and Snapshot rendering share this marker structure:

```html
<button class="ordered-block-prefix">
  <span class="ordered-block-prefix__text">1.</span>
</button>
```

The circle preset adds `data-bc-marker-enclosure="circle"` to the button. Its
compact ring is theme-owned CSS geometry using `currentColor`, and even a
single digit is optically reduced inside it. The ring includes print color
adjustment and is not a Unicode circled-number glyph. Hosts may style the
documented classes and attribute but must keep the inner text span because live
and Snapshot views use the same contract. Pointer handlers should resolve the
button with `closest('.ordered-block-prefix')` instead of assuming it is the
direct event target.

## Collaboration Cursor Colors

`BlockCraftAwareness.setLocalUser()` accepts an optional concrete CSS
`color`. When omitted or invalid, the stable user ID maps to a curated
medium-dark palette. The runtime applies:

- the solid color to the 2px remote caret and `.blockcraft-cursor-tag`;
- the same color at 18% opacity to non-collapsed remote ranges;
- white label text, so it does not inherit the light theme's dark
  `--bc-color`.

Color is written to the collaboration overlay as runtime user state rather than
a theme token. A host that needs a product/account color should send
`{id, name, color}` through Awareness; ordinary theme overrides should focus on
the tag's typography, radius and shadow.

## Revision Markup Contract

Inline projection uses
`c-element[data-bc-revision-kind][data-bc-revision-state]`. Block insertion,
deletion and structural boundaries use the same state/kind attributes on the
block host plus `data-bc-revision-boundary-before`. Conflict state never reuses
comment markers; comments and revisions remain separate visual channels.

Hosts can override the light/dark defaults through these tokens:

```scss
--bc-revision-insert-color
--bc-revision-insert-bg
--bc-revision-delete-color
--bc-revision-delete-bg
--bc-revision-boundary-color
--bc-revision-conflict-color
--bc-revision-conflict-bg
```

The reusable review components use the existing iconfont and these variables;
do not replace their single-color icons with inline SVG or image assets.

Absolute objects keep their persisted `under` / `over` stacking layer while
marked. Because their image/canvas/frame descendants may be opaque, the base
theme does not use the ordinary host fill or inset stripe for them: pending
insertions use an external solid outline, pending deletions a dashed outline,
and conflicts a double outline. Host overrides must not raise `z-index` merely
to expose a marker, because that would change document placement semantics.

## Snapshot Viewer Styling

The standalone snapshot-viewer reuses the same block class naming and `[data-blockcraft-root="true"]` readonly styling model as the editor wherever practical.

Current viewer-specific entrypoints:

- `packages/editor/themes/components/snapshot-viewer.scss`
- `packages/editor/themes/base.scss` imports that file automatically

Practical rules:

- Keep viewer-only styles scoped under `.bc-snapshot-viewer`
- Reuse existing block classes such as `.paragraph-block`, `.table-block`, `.bookmark-block`, `.embed-frame-block`
- Prefer existing `--bc-*` tokens instead of hardcoded colors or spacing
- Treat viewer inline embeds (`.bc-snapshot-inline-embed`) as a lightweight display shell, not an interactive widget

## Adding Styles for a New Block

### 1. Create the style file

```scss
// themes/blocks/_my-block.scss
.my-block {
  padding: var(--bc-block-padding, 8px 0);
  border-radius: var(--bc-border-radius, 4px);

  .my-block-content {
    // Block-specific styles
  }

  // Dark theme overrides
  [blockcraft-theme="dark"] & {
    // Dark-specific styles
  }
}
```

### 2. Import in theme entry

```scss
// In the main theme file that imports all block styles
@import './blocks/my-block';
```

## CSS Custom Properties (Key Variables)

Read `themes/base.scss` and `themes/variables.scss` for the current variable list. Common patterns:

```scss
// Typography
--bc-font-family
--bc-font-size
--bc-line-height
--bc-fs                         // document base font size; root `fs` may override
--bc-lh                         // document unitless line-height; root `lh` may override
--bc-block-fs-scale             // editable paragraph `pfs` ratio
--bc-block-lh                   // editable block line-height override

// Spacing
--bc-segments-gap               // default inter-block gap in CSS px
--bc-block-sb                   // persisted paragraph space-before in pt
--bc-block-sa                   // persisted paragraph space-after in pt
--bc-next-block-sb              // following editable sibling's space-before
--bc-block-leading-sb           // first-child leading space-before
--bc-block-padding
--bc-block-margin

// Colors
--bc-text-color
--bc-bg-color
--bc-border-color
--bc-accent-color
--bc-selection-color
--bc-revision-insert-color
--bc-revision-insert-bg
--bc-revision-delete-color
--bc-revision-delete-bg
--bc-revision-boundary-color
--bc-revision-conflict-color
--bc-revision-conflict-bg
--bc-block-background-color         // current block's persisted backColor
--bc-block-border-color             // current block's persisted borderColor
--bc-render-unit-background-color   // content region's persisted backColor
--bc-render-unit-border-color       // content region's persisted borderColor
--bc-render-unit-padding-top        // resolved content padding in layout px
--bc-render-unit-padding-right
--bc-render-unit-padding-bottom
--bc-render-unit-padding-left
--bc-text-box-writing-mode        // vertical-rl on vertical frames; unset = horizontal-tb
--bc-text-box-background-color    // text-box persisted backColor
--bc-text-box-border-color        // text-box persisted borderColor
--bc-text-box-padding-top         // resolved fixed-frame reserve (applied as an offset, not padding)
--bc-text-box-padding-right
--bc-text-box-padding-bottom
--bc-text-box-padding-left
--bc-text-box-shape-inset-top       // Shape catalog text-safe frame
--bc-text-box-shape-inset-right
--bc-text-box-shape-inset-bottom
--bc-text-box-shape-inset-left
--bc-text-box-word-art-*            // optional WordArt presentation projection
--bc-solid-block-background-opacity // default 82%; solid block surface opacity

// Border
--bc-border-radius
```

## Document Background Compatibility

Content surfaces that intentionally carry a solid fill must preserve the
document background context. Every editable `BaseBlockComponent` projects
`props.backColor` and `props.borderColor` through the public
`--bc-block-background-color` / `--bc-block-border-color` variables and
`data-bc-block-background` / `data-bc-block-border` attributes. The base theme
uses `color-mix()` with `--bc-solid-block-background-opacity` (default `82%`)
for the fill and paints a 1px solid outline only when a concrete border color is
present, so persisted appearance does not change block geometry or replace a
block's own border. No common padding is added. Every
`data-node-type="editable"` block host receives a 4px radius whether or not it
has a persisted outline. Block-specific focused/selected highlights keep their
existing priority when they use outline, border, box-shadow or an internal
overlay. Selection may still provide its existing background feedback without
rewriting the persisted appearance.
Blockquote is the deliberate exception: its `borderColor` colors the 1px left
accent bar and does not add a rectangular host outline.

Non-editable blocks do not receive the common variables or state attributes,
even if an older snapshot contains these props. A block-specific compatibility
surface such as Callout may continue consuming its own legacy variable. The
bundled `render-unit` content region deliberately owns
`--bc-render-unit-background-color` and `--bc-render-unit-border-color`: its
fill uses the shared solid-surface opacity, while its 1px inner outline does not
change region geometry. Live blocks and Snapshot Viewer shells project the same
opaque props into these variables; `transparent`, empty and missing values
render as no visible override.

The same region projects resolved surface insets through
`--bc-render-unit-padding-top/right/bottom/left` (each defaults to `0px`) onto
`.render-unit-content`. A persisted background image is an absolutely
positioned `.render-unit-background-image` sibling behind that content, not a
CSS `background-image`; it is non-interactive, inherits the region radius and
uses `object-fit/object-position/opacity` from the normalized model. Do not move
the image inside `.render-unit-content`, where padding would shrink it, and do
not replace it with raw `url(...)` CSS because print/PDF resource waiting tracks
real images.

The bundled `text-box` projects the same resolved surface contract through
`--bc-text-box-background-color`, `--bc-text-box-border-color` and
`--bc-text-box-padding-top/right/bottom/left`. Shape catalog geometry is painted
as fill and outline SVG layers around the child viewport. Its decorative
`.text-box-block__background-image` is a real image between those layers and is
clipped to the same Shape path. `--bc-text-box-shape-inset-*` carries the text-safe
frame — from the artwork registry when `bgi` names a drawing, otherwise from the
Shape definition and is summed with the padding variables into the
viewport's own `top/right/bottom/left`, with `padding: 0` — the reserve is
geometry on all four sides. As real padding it only held on the two start
edges: padding offsets where the first line begins, while the end edges are
trailing space in the flow and `overflow` clips at the padding box, so text
taller than the frame painted straight through the bottom reserve. Layout is
unchanged while the text fits. Segment spacing inside the frame is
restated logically (`margin-block-start` / `margin-block-end`) so a vertical
frame stacks on the right axis, and keeps base.scss's `--bc-block-sb` /
`--bc-block-sa` fallbacks — writing the gap literally there outranks those two
variables and breaks 段落设置 spacing inside text boxes only.
`--bc-text-box-word-art-*`
projects an optional WordArt presentation without moving text ownership out of
ordinary child Blocks. The fixed paint viewport owns clipping/scrolling so the
outer shell does not clip resize and rotation handles. Live editing may scroll
overflowing prose, while readonly, Snapshot Viewer and print output clip to the
persisted frame. Keep exactly one `data-bc-print-visual-surface` on the painted
object and mark transform handles `data-bc-print-exclude`. While a descendant
text selection owns the frame, the frame shows no selection chrome at all:
resize/rotation handles and the active-color outline are exclusive to the
whole-object `.selected` state, matching the shape block convention, and the
hidden browser focus outline and scrollbar chrome on the editable viewport stay
suppressed. The intentional nested
`contenteditable=false → true` editing island remains in place. Ordinary
text-box prose uses a column layout whose last real child grows across remaining
block-axis space, so native caret hit testing reaches the paragraph throughout
the frame without a blank-area event handler. The WordArt presentation variant
does not grow its last child because it owns vertical alignment itself.

TextBox and editable WordArt share the internal `object-focus-handle` theme
mixin, which renders their 24×14 top select/move handles straddling the frame
edge so the contenteditable root cannot steal their hit target. Neither object
adds an editing-state frame outline. TextBox hides its handle for `.selected`; WordArt uses the
Plugin-owned `.word-art-block--object-selected` class because editable Blocks
otherwise use `.focused` for both caret and whole-block coverage. Only that
WordArt object class reveals `shape-resizer`; ordinary WordArt text focus keeps
the resizer hidden.

Snapshot Viewer creates the same common or block-specific variables and
attributes on its block shells.
Replacement block components that extend `BaseBlockComponent` receive the live
projection automatically; themes should consume the variables instead of
writing opaque inline backgrounds.

Callout models continue to persist the original opaque `props.backColor`.
The renderer also keeps the legacy `--bc-callout-background-color` binding for
replacement-theme compatibility; do not store an alpha-adjusted replacement in
Yjs, because repeated edits or exports would otherwise compound opacity.

```typescript
host: {
  '[style.--bc-callout-background-color]': 'props.backColor',
}
```

> **`--bc-lh` is a unitless line-height *ratio* (default `1.5`), not a px length.** This is deliberate:
> CSS `zoom` (e.g. the table fullscreen view) does **not** scale a px `line-height` in WebKit / WKWebView
> (Tauri, Safari) — only the font grows, so a px line-height makes text rows overlap as you zoom in.
> A unitless ratio scales with the font on every engine.
> - When overriding it, supply a **unitless number** (`--bc-lh: 1.6`), never a px length.
> - Need a "one line tall" px length? Derive it: `calc(var(--bc-lh) * var(--bc-fs))`.
> - Headings use `line-height: var(--bc-lh)` directly — the ratio already scales against each
>   heading's enlarged `font-size`, so no `* N` multiplier is needed.

Root `ff/fs/lh` are persisted document defaults. `ff` resolves a short catalog
ID to a portable platform font stack; `fs` projects `--bc-fs`; `lh` projects
`--bc-lh`. Editable `lh` projects `--bc-block-lh` and takes precedence only for
that paragraph. Snapshot Viewer follows the same precedence.

Editable `pfs` projects `--bc-block-fs-scale` and an effective relative
`font-size` on the editable host. `resolveEditableBlockFontScale()` combines
the paragraph value with built-in heading/caption presentation scale before
that percentage is written. Inline `t:fs` remains an `em` multiplier, so
effective text size is root `fs × pfs × t:fs`; ordered/bullet/todo prefixes
inherit the same host size. This percentage projection avoids relying on
nested CSS typed-arithmetic support in older WebKit/WKWebView.
Every `[data-block-id]` resets the scale variable to `1` to prevent a container's
custom property from leaking into nested paragraphs.

Paragraph spacing and indentation use typographic points in persisted props,
then project through the variables above. The common theme owns exactly one
gap between siblings:

```scss
margin-bottom: max(
  var(--bc-block-sa, var(--bc-segments-gap)),
  var(--bc-next-block-sb, 0pt)
);
```

The last child resets that margin to zero. A first editable child's `psb`
projects as `padding-block-start` through `--bc-block-leading-sb`; later
paragraphs contribute through the previous sibling's
`--bc-next-block-sb`. Do not add an independent `margin-top` rule: it would
reintroduce browser-dependent collapse,
double gaps in flex/text-box containers and pagination stride drift. Snapshot
Viewer projects the same sibling variables after mounting or patching children.

### Whole-document visual scale

`doc.viewScale.attach(surface)` applies an inline CSS `zoom` plus the public
`data-bc-view-scale` attribute to the supplied host surface. The surface is
host-owned and should wrap only document chrome/content that must scale; fixed
toolbars and zoom controls should remain outside it. Do not add a competing
`transform: scale(...)` or CSS `zoom` to BlockCraft roots, pagination surfaces
or root block hosts—the manager uses the browser's effective layout/visual
ratio to keep virtualization and pointer placement coordinates consistent.

BlockCraft restores the surface's previous inline `zoom` value and attribute on
detach/destroy. Print and PDF rendering do not inherit this live-view scale.

### Table Block Fullscreen View

Defined in `themes/variables.scss`; theme-neutral defaults (override per theme if needed):

| Variable | Default | Purpose |
|---|---|---|
| `--bc-table-fullscreen-z` | `800` | z-index of the fullscreen table container (kept below `1000` so CDK Overlay panes — structure-toolbar, float-toolbar, mention panel — naturally float above the table) |
| `--bc-table-fullscreen-mask-z` | `799` | Reserved compatibility token for the former dimming-mask implementation |
| `--bc-table-fullscreen-overlay-bg` | `rgba(0, 0, 0, 0.55)` | Reserved compatibility token for the former dimming-mask implementation |
| `--bc-table-fullscreen-padding` | `24px` | Horizontal padding between viewport edge and the table |
| `--bc-table-fullscreen-radius` | `8px` | Corner radius (overridden to `0` in the default `is-fullscreen` rule) |
| `--bc-table-fullscreen-bg` | `var(--bc-bg-elevated, #fff)` | Background color behind the table while fullscreen |

Companion class names (also part of the public CSS contract):

- `.table-block.is-fullscreen` — applied to the table host while in fullscreen view
- `.bc-table-fullscreen-btn` — hover button at the top-right of every table block
- `body.bc-table-fullscreen-lock` — applied to `<body>` to suppress background scrolling while a table is fullscreen
- `.bc-table-fullscreen-isolation-container` — applied to each ancestor on the active table's DOM ownership path
- `.bc-table-fullscreen-isolation-branch` — applied to the child branch that continues from an isolation container toward the active table

Fullscreen is a viewport-isolated view. The table remains at its Angular-owned
DOM position so pagination, virtualization and collaborative block reconciliation
keep ownership of the same node. BlockCraft marks the active table's ancestor path
with the isolation classes above and hides only sibling branches. Do not hide an
ancestor on that path: Chromium can otherwise dispatch native `input` without
`beforeinput`, bypassing the editor input transformer and collaborative text model.
The markers are refreshed if pagination or virtualization reparents the table.

While a paginated table is fullscreen, BlockCraft also suspends its page-only
spacers, inline gaps and masks, and temporarily removes the paginated root's own
centering transform. This lets `position: fixed; inset: 0` use the viewport rather
than the paper coordinate system. The latest pagination projection is replayed on
exit. A host document scale attached through `doc.viewScale` is cancelled on the
fullscreen table host and restored exactly on exit; table-local fullscreen zoom
continues to work independently. CDK overlay containers remain visible for menus
opened from the table.

Override example (dark theme can adjust the isolated fullscreen background):

```scss
body[blockcraft-theme="dark"] {
  --bc-table-fullscreen-bg: var(--bc-bg-primary, #171d24);
}
```

### Inline Object Views

Bundled inline shapes and WordArt share
`.bc-inline-object-shell > .bc-inline-object-frame`. The frame is also marked
with `[data-bc-inline-float-frame]`; wrapped shells use
`[data-bc-inline-float-layout="wrap"]`. Shape-specific presentation uses
`.bc-inline-shape-frame`, `.bc-inline-shape__geometry` and
`.bc-inline-shape__text`; WordArt uses `.bc-inline-word-art-frame` and
`.bc-inline-word-art__text`.

`.bc-inline-object-shell--selected` is ephemeral Plugin UI state and controls
the default active-color outline. Host themes may refine that outline and the
presentation classes, but must not change the frame's positioned geometry,
remove the data attributes or add/remove the selected class directly.
During a Shape/WordArt Embed drag, the presentation-only
`.bc-inline-object-drag-proxy` is appended under `body`. Themes may refine its
opacity/outline, but it must remain inert and must not participate in editor
layout or serialization. Because that proxy is outside `[data-blockcraft-root]`,
the bundled theme repeats the WordArt frame/text display and box-model rules on
the proxy itself. Keep those global proxy rules aligned with the ordinary
`.bc-inline-word-art-frame` / `.bc-inline-word-art__text` rules; otherwise CSS
WordArt can change size or lose its effect transform only while dragging.

### Inline Embed Selection

Every inline Embed receives `.bc-inline-embed--selected` on its outer
`c-element` while the local model selection fully covers that one-length
Embed. This applies equally to built-in and host-registered converters. The
base theme applies `--bc-select-background-color` directly to the atomic
wrapper, without a border, outline or ring. This makes Shift+Arrow selection
visible even though the converter-owned content is
`contenteditable=false`. The class is ephemeral Selection presentation state:
host themes may refine its background color or radius, but must not add/remove
the class or persist it in document content.

### Pagination View

`PaginationPlugin` applies these public tokens only while live pagination is enabled:

| Variable | Default | Purpose |
|---|---|---|
| `--bc-page-sheet-bg` | `#fff` | Sheet background |
| `--bc-page-sheet-shadow` | subtle border/shadow | Sheet elevation |
| `--bc-pagination-backdrop-bg` | `#f5f5f4` | Scroll-container background between sheets |
| `--bc-page-chrome-color` | `#9b9b97` | Header/footer text color |
| `--bc-page-chrome-fs` | `12px` | Header/footer font size |
| `--bc-page-content-height` | runtime page content height | Maximum height inherited by oversized atomic/code blocks and direct-root fixed flow objects in live and print pagination |
| `--bc-object-group-padding` | `8px` | Object-group frame inset projected by live and Snapshot renderers; nested pagination caps subtract both block-axis sides |

Runtime classes are `.bc-paginated` on the document root,
`.bc-paginated-scroll` on the actual scroll container,
`.bc-pagination-surface` on the root's direct parent, plus
`.bc-pagination-backdrop`, `.bc-page-sheet`, `.bc-page-header` and
`.bc-page-footer`. A configured first-page host header additionally receives
`.bc-pagination-document-header` while projected. The scroll container and pagination surface can be the same
element, but need not be: the former owns scrolling/background while the latter
owns page/content centering and their shared coordinate origin. These are
plugin-owned states: host code may style them but must not add/remove them
directly.

Absolute block placement remains relative to the root children container in
both continuous and paginated views. Pagination publishes the deterministic
`--bc-placement-content-origin-y` runtime value, equal to the root's effective
top content padding, and placement rendering, pointer geometry and virtual
visibility all consume that same origin. Themes must not override it. A
projected host `documentHeader` must never introduce a separately measured
offset.

Oversized table-cell continuation additionally owns
`.bc-pagination-table-flow-mask`, `[data-bc-inline-pagination-gap]` and
`.bc-page-nested-height-locked`. Block/cell-start continuations use a reversible
inline margin on the existing Block host instead of inserting a sibling gap
element. Text-line continuation markers are transparent and contribute only
layout height; the table-level mask is the sole owner of sheet/background bands
in the shared table coordinate system. The nested-height class caps only an
irreducible nested atomic child to the page content height. Nested
media and embeds are clipped at that boundary; nested code blocks keep their
header visible and scroll `.edit-container-wrapper` inside the one-page cap. These
classes/attributes are reversible plugin state, not document data. Host themes
may change their inherited page colors through `--bc-page-sheet-bg` and
`--bc-pagination-backdrop-bg`, but must not attach, remove, resize or make the
mask/inline marker interactive.

`--bc-page-content-height` is geometry-owned: the pagination controller derives
it from paper size, margins and header/footer bands. The theme predefines the
top-level atomic/code-block cap with `max-height: var(--bc-page-content-height)`;
hosts may read the token but should change page geometry through
`PaginationPlugin.updateConfig()` rather than overriding it independently.
Direct-root top-bottom `object-group`, `text-box`, `word-art` and `shape` frames
are always capped by the same token. Their Block hosts keep overflow visible so
selection outlines, resize endpoints and rotation controls outside the frame
are not clipped; each object's existing inner content layer remains responsible
for content overflow. The selector is deliberately owned by root flow:
absolute objects below `placement-layout` remain uncapped, while members of a
top-bottom `object-group` inherit the same frame cap from that outer flow unit.
The member cap subtracts the group's block-start and block-end padding through
`--bc-object-group-padding`; local placement geometry and visible interaction
chrome remain intact.

Pagination overrides live in `themes/plugins/pagination.scss`, imported at the
end of `base.scss` so they can safely override ordinary block styles. The cap
is applied according to each block's measurement needs: code keeps its host
overflow visible and scrolls `.edit-container-wrapper`; image retains host
clipping so its uncapped `scrollHeight` remains available to pagination, and
moves its horizontal resize handles inside the clipping boundary. Other
top-level void blocks retain whole-host clipping. The same rules target `.bc-paginated` and
`.bc-print-content`; do not create a separate host-only print variant.

Live pagination normalizes every direct root block to `margin-top: 0`; the fixed
print compositor repeats that invariant after reparenting blocks into page boxes.
Themes must not reintroduce a direct-child top margin under `.bc-print-content`,
because the stable item heights and page breaks were measured without it.

## Checklist

- [ ] Block styles use CSS custom properties for theme-ability
- [ ] Dark theme overrides via `[blockcraft-theme="dark"]` selector
- [ ] Styles scoped to block class (e.g. `.my-block {}`)
- [ ] Style file imported in theme entry
- [ ] Toolbar/overlay styles don't leak to document content

## Source Files to Read

For the current variable definitions and theme patterns, read:
- `packages/editor/themes/base.scss`
- `packages/editor/themes/variables.scss`
- `packages/editor/themes/light.scss`
- `packages/editor/themes/dark.scss`
- `packages/editor/themes/plugins/pagination.scss`
- Any existing block style file in `packages/editor/themes/blocks/` as reference
