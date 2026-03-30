# BlockCraft: Theme Customization

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.

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
└── plugins/            # Per-plugin styles (float toolbar, controllers)
```

## Theme Switching

```typescript
// Toggle theme programmatically
doc.toggleTheme('dark');   // Sets body[blockcraft-theme="dark"]
doc.toggleTheme('light');  // Sets body[blockcraft-theme="light"]
```

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
- Any existing block style file in `packages/editor/themes/blocks/` as reference
