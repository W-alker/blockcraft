# BlockCraft: Theme Customization

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Last updated: 2026-07-28

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

### Table Block Fullscreen View

Defined in `themes/variables.scss`; theme-neutral defaults (override per theme if needed):

| Variable | Default | Purpose |
|---|---|---|
| `--bc-table-fullscreen-z` | `800` | z-index of the fullscreen table container (kept below `1000` so CDK Overlay panes — structure-toolbar, float-toolbar, mention panel — naturally float above the table) |
| `--bc-table-fullscreen-mask-z` | `799` | z-index of the dimming mask (just below the table) |
| `--bc-table-fullscreen-overlay-bg` | `rgba(0, 0, 0, 0.55)` | Dimming color over the underlying document |
| `--bc-table-fullscreen-padding` | `40px` | Inner padding between viewport edge and the table |
| `--bc-table-fullscreen-radius` | `8px` | Corner radius (overridden to `0` in the default `is-fullscreen` rule) |
| `--bc-table-fullscreen-bg` | `var(--bc-bg-elevated, #fff)` | Background color behind the table while fullscreen |

Companion class names (also part of the public CSS contract):

- `.table-block.is-fullscreen` — applied to the table host while in fullscreen view
- `.bc-table-fullscreen-btn` — hover button at the top-right of every table block
- `body.bc-table-fullscreen-lock` — applied to `<body>` to suppress background scrolling while a table is fullscreen

Override examples (dark theme could darken the mask, adjust bg):

```scss
body[blockcraft-theme="dark"] {
  --bc-table-fullscreen-overlay-bg: rgba(0, 0, 0, 0.7);
  --bc-table-fullscreen-bg: var(--bc-bg-primary, #171d24);
}
```

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

Runtime classes are `.bc-paginated` on the document root, `.bc-paginated-scroll` on the scroll container, `.bc-pagination-backdrop`, `.bc-page-sheet`, `.bc-page-header` and `.bc-page-footer`. They are plugin-owned state: host code may style them but must not add/remove them directly.

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
