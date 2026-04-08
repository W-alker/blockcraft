# BlockCraft: Utility Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-04-08

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

| Config Field | Type | Description |
|-------------|------|-------------|
| `preview.showToolbar` | `boolean` | Whether to show toolbar in presentation mode |

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
