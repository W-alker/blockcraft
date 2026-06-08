# BlockCraft: Utility Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-06-08

## PlaceholderPlugin

> `plugins/placeholder/index.ts` — Renders schema-declared placeholder text on the currently focused empty editable block.

Reads `IBlockSchemaOptions.metadata.placeholder` (see `blockcraft-block.md` → "Editable Block Placeholder (Schema field)") and renders the resolved text via a `::before` pseudo-element. Holds **constant** doc-wide subscriptions regardless of how many editable blocks exist — selection / readonly / IME composition each fan-in through a single handler, and only the currently focused block's `onTextChange` / `onPropsChange` are subscribed at any one time.

### Configuration

```typescript
new PlaceholderPlugin(options?: PlaceholderPluginOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `overrides` | `PlaceholderOverrides` | `{}` | Per-flavour placeholder overrides applied at render time **without mutating the Schema** |

```typescript
export type PlaceholderOverrides = Record<string, BlockPlaceholderConfig | null>
```

- key present, value = `string` or `{ default, heading }` → override the schema's placeholder
- key present, value = `null` → explicitly disable placeholder for that flavour (even if the schema declares one)
- key absent → fall back to `schema.metadata.placeholder`

### Public API

| Method | Description |
|--------|-------------|
| `setOverrides(overrides: PlaceholderOverrides)` | Replace the whole override map (e.g. on i18n locale change) and immediately re-render the active block |
| `setOverrideFor(flavour, config)` | Patch a single flavour. Pass `null` to disable, `undefined` to revert to the schema default |

### Usage Examples

```typescript
// Default — picks up every schema's metadata.placeholder
new PlaceholderPlugin()

// Override built-in text (e.g. English UI)
new PlaceholderPlugin({
  overrides: {
    paragraph: { default: "Type '/' for commands", heading: { 1: 'Heading 1', 2: 'Heading 2', 3: 'Heading 3' } },
    bullet:   'List item',
    ordered:  'List item',
    todo:     'To-do',
    callout:  null, // explicitly disabled
  },
})

// Runtime locale switch
const ph = new PlaceholderPlugin({ overrides: getOverridesForLocale('en') })
// ... later ...
ph.setOverrides(getOverridesForLocale('zh'))

// Per-flavour patch
ph.setOverrideFor('paragraph', { default: 'Write something…' })
ph.setOverrideFor('callout', null)         // disable
ph.setOverrideFor('callout', undefined)    // revert to schema default
```

### Display Contract

- Visible only when: current selection is `type: 'text'`, `start.blockId === block.id`, `sel.isInSameBlock`, AND `textLength === 0`.
- Hidden during IME composition — plugin listens to native `compositionstart` / `compositionend` on the root host in capture phase (bypassing the framework dispatcher because `InputTransformer._handleCompositionStart` is a global handler that stops propagation).
- Hidden in readonly mode (`doc.isReadonly === true` OR `doc.readonlySwitch$` emits `true`).
- DOM state: `data-placeholder` attribute on `.edit-container` (the element the CSS `::before` targets) + `.empty` class on the host element (matches the `[data-node-type="editable"].empty` selector).

### Notes

- Bundled in the default editor preset (`editor/editor.ts`). To disable, omit it from `DocConfig.plugins`.
- Schema field (`metadata.placeholder`) and runtime override are decoupled: overrides do not modify the Schema, so non-presentation consumers reading the Schema still see the original declared text.
- Blocks with their own `::before` styling (e.g. `blockquote`) must not declare `placeholder` in their schema — or pass `overrides[flavour] = null` to suppress at the plugin level.

---

## FindReplacePlugin

> `plugins/findReplace/findReplace.ts` — Find and replace dialog.

Binds `Cmd/Ctrl+F` to open a global overlay find-and-replace dialog. Also exposes a `FindReplaceHelper` for programmatic use.

### Configuration

No configuration options.

```typescript
new FindReplacePlugin()
```

### Built-in Hotkeys

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+F` | Open find & replace dialog |

### Public API

| Property | Type | Description |
|----------|------|-------------|
| `helper` | `FindReplaceHelper` | Programmatic find/replace without UI |

---

## PasteFormatSelectorPlugin

> `plugins/paste-format-selector/` — Post-paste format switcher and spreadsheet paste.

After a paste that produces multiple format options (HTML, plain text, Markdown), shows a selector overlay so the user can switch formats. Also handles spreadsheet file paste (`.xls`, `.xlsx`, `.ods`, `.csv`) by converting to table blocks.

### Configuration

No configuration options.

```typescript
new PasteFormatSelectorPlugin()
```

### Dependencies

- Uses `DOC_ADAPTER_SERVICE_TOKEN` for Markdown adapter access
- Dynamically imports `xlsx` library for spreadsheet conversion

---

## DemoPresentationPlugin

> `plugins/demo-presentation/demo-presentation.plugin.ts` — Presentation/demo mode.

Extends the `doc` object at runtime with `enterDemoMode()` and `exitDemoMode()` methods. Delegates to an internal `PresentationController`.

### Configuration

No constructor options, but `enterDemoMode` accepts an optional config:

```typescript
new DemoPresentationPlugin()

// After init, on the doc instance:
doc.enterDemoMode(config?: Partial<DemoConfig>)
doc.exitDemoMode()
```

| Config Field | Type | Default | Description |
|-------------|------|---------|-------------|
| `preview.showToolbar` | `boolean` | `true` | Whether to show the control toolbar in presentation mode |
| `cover` | `DemoCoverBlockModel['props']` | `undefined` | Optional cover page props (title / subtitle / etc.). When provided, a cover page is prepended as the first slide |
| `fontScale` | `number` | `1.5` | Demo container's `--bc-fs` is set to `sourceFs * fontScale`; table `colWidths` are scaled by the same factor so column widths stay consistent with the enlarged font. Must be `> 0`; set to `1` to disable enlargement |
| `lineHeightScale` | `number` | `fontScale` | Demo container's `--bc-lh` is set to `sourceLh * lineHeightScale`. Defaults to `fontScale` so line height tracks font size; override for tighter / looser line spacing. Must be `> 0` |
| `segmentsGapScale` | `number` | `fontScale` | Demo container's `--bc-segments-gap` is set to `sourceGap * segmentsGapScale`. Defaults to `fontScale` so block spacing tracks font size; override for tighter / looser paragraph gaps. Must be `> 0` |

### Font / spacing scaling behavior

The demo container reads the source doc's computed `--bc-fs`, `--bc-lh`, `--bc-segments-gap` and injects scaled versions onto `.presentation-stage`. Each axis has its own scale, and the two spacing scales default to `fontScale` so the source doc's overall rhythm is preserved when only one knob is touched. The demo SCSS no longer derives `--bc-lh` / `--bc-segments-gap` via `calc()` — the JS injection is the single source of truth and cascades down to `.demo-root`. Table column widths (`props.colWidths`) are multiplied by `fontScale` on every page render; the original `pages` data is not mutated.

```typescript
// Default 1.5× across the board
doc.enterDemoMode();

// Bigger font but keep source line height proportional (lh scales to 1.8 too)
doc.enterDemoMode({ fontScale: 1.8 });

// Compact mode: font scaled up, but line height and gap stay closer to source
doc.enterDemoMode({ fontScale: 1.5, lineHeightScale: 1.2, segmentsGapScale: 1 });

// No enlargement at all (presentation matches source exactly)
doc.enterDemoMode({ fontScale: 1 });
```

---

## TranslatePlugin

> `plugins/translate/translate.plugin.ts` — Paragraph-level translation.

Integrates with `BlockControllerPlugin` to add a "翻译段落" menu item. Calls a consumer-provided translation service, shows an inline preview below the paragraph, and lets the user apply (replace) or append the translated text.

### Configuration

```typescript
new TranslatePlugin(options?: TranslatePluginOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `service` | `TranslatePluginService` | `null` | **Required to activate.** Consumer provides `translate()` and `getSupportedLanguages()` |
| `sourceLang` | `string` | `'auto'` | Source language code |
| `defaultTargetLang` | `string` | `'chinese_simplified'` | Default target language |
| `targetLangWhenSourceIsChinese` | `string` | `'chinese_simplified'` | Fallback when source is Chinese |
| `menuSectionTitle` | `string` | `'翻译'` | Block-controller menu section heading |
| `menuLabel` | `string` | `'翻译段落'` | Menu item label |
| `menuIcon` | `string` | `'bc_fanyi'` | Menu item icon class |
| `persistLastTargetLang` | `boolean` | `true` | Persist selected language to localStorage |
| `targetLangStorageKey` | `string` | `'blockcraft.translate.lastTargetLang'` | localStorage key |

### Consumer-Provided Service Interface

```typescript
interface TranslatePluginService {
  translate(text: string, options: DocTranslateOptions): Promise<string>;
  getSupportedLanguages(): Promise<TranslateLanguageOption[]>;
}
```

### Public API

| Method | Description |
|--------|-------------|
| `setService(service)` | Replace the translation service at runtime |
| `createBlockControllerOptions()` | Returns `{ blockMenuResolver, blockMenuActionHandler }` to spread into `BlockControllerPlugin` options |

### Usage Example

```typescript
const translatePlugin = new TranslatePlugin({
  service: myTranslateService,
  defaultTargetLang: 'english',
});

// Compose with BlockControllerPlugin
new BlockControllerPlugin({
  ...translatePlugin.createBlockControllerOptions(),
})
```

### Notes

- Requires `BlockControllerPlugin` for the menu integration; use `createBlockControllerOptions()` to compose
- Shows `TranslationPreviewComponent` inline with loading/error states
- Supports multi-language selection with localStorage persistence
