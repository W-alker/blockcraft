# BlockCraft: Theme Customization

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Last updated: 2026-08-08

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

// Spacing
--bc-block-padding
--bc-block-margin

// Colors
--bc-text-color
--bc-bg-color
--bc-border-color
--bc-accent-color
--bc-selection-color

// Border
--bc-border-radius
```

> **`--bc-lh` is a unitless line-height *ratio* (default `1.5`), not a px length.** This is deliberate:
> CSS `zoom` (e.g. the table fullscreen view) does **not** scale a px `line-height` in WebKit / WKWebView
> (Tauri, Safari) — only the font grows, so a px line-height makes text rows overlap as you zoom in.
> A unitless ratio scales with the font on every engine.
> - When overriding it, supply a **unitless number** (`--bc-lh: 1.6`), never a px length.
> - Need a "one line tall" px length? Derive it: `calc(var(--bc-lh) * var(--bc-fs))`.
> - Headings use `line-height: var(--bc-lh)` directly — the ratio already scales against each
>   heading's enlarged `font-size`, so no `* N` multiplier is needed.

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

Fullscreen is a viewport-isolated view: while the body lock is active, the host
application tree is hidden with inherited `visibility` and only the active table
is restored. The table remains at its Angular-owned DOM position so pagination,
virtualization and collaborative block reconciliation keep ownership of the same
node. A host document scale attached through `doc.viewScale` is cancelled on the
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

### Pagination View

`PaginationPlugin` applies these public tokens only while live pagination is enabled:

| Variable | Default | Purpose |
|---|---|---|
| `--bc-page-sheet-bg` | `#fff` | Sheet background |
| `--bc-page-sheet-shadow` | subtle border/shadow | Sheet elevation |
| `--bc-pagination-backdrop-bg` | `#f5f5f4` | Scroll-container background between sheets |
| `--bc-page-chrome-color` | `#9b9b97` | Header/footer text color |
| `--bc-page-chrome-fs` | `12px` | Header/footer font size |
| `--bc-page-content-height` | runtime page content height | Maximum height inherited by top-level void/code blocks in live and print pagination |

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
