# BlockCraft: Built-in Plugin Reference (Index)

> **Level 1: Reference** — Read `blockcraft.md` first for context.
>
> For creating new plugins, see `blockcraft-plugin.md`.
>
> Last updated: 2026-06-08

This index covers all 23 built-in plugins. Pick the category file that matches your task — don't read all files at once.

## Category Router

| Category | File | Plugins |
|----------|------|---------|
| Text Formatting | `blockcraft-plugins-formatting.md` | FloatTextToolbarPlugin, TextMarkerPlugin, FixedTextToolbarComponent |
| Block Management | `blockcraft-plugins-block.md` | BlockControllerPlugin, BlockGapCreatorPlugin, BlockTransformerPlugin, OrderedBlockPlugin |
| Block Toolbars | `blockcraft-plugins-toolbar.md` | AttachmentExtensionPlugin, ImgToolbarPlugin, BookmarkBlockExtensionPlugin, CalloutToolbarPlugin, DividerExtensionPlugin, EmbedFrameExtensionPlugin, FormulaBlockExtensionPlugin |
| Inline & Keyboard | `blockcraft-plugins-inline.md` | InlineLinkExtension, MentionPlugin, CodeInlineEditorBinding, TableBlockBinding |
| Utilities | `blockcraft-plugins-util.md` | PlaceholderPlugin, FindReplacePlugin, PasteFormatSelectorPlugin, DemoPresentationPlugin, TranslatePlugin |

## Quick Lookup

| Plugin | Category File | Has Config? |
|--------|--------------|-------------|
| `FloatTextToolbarPlugin` | `formatting` | `extraItems`, `onExtraItemClick` |
| `TextMarkerPlugin` | `formatting` | `markTextBlockFlavours` (required) |
| `FixedTextToolbarComponent` | `formatting` | Angular component inputs |
| `BlockControllerPlugin` | `block` | `blockMenuResolver`, `blockMenuActionHandler`, `positionResolver` |
| `BlockGapCreatorPlugin` | `block` | none (zero-config) |
| `BlockTransformerPlugin` | `block` | `transformList` |
| `OrderedBlockPlugin` | `block` | none (zero-config) |
| `AttachmentExtensionPlugin` | `toolbar` | `extraItems`, `onPreview`, `onExtraItemClick` |
| `ImgToolbarPlugin` | `toolbar` | `extraItems`, `onExtraItemClick` |
| `BookmarkBlockExtensionPlugin` | `toolbar` | none (zero-config) |
| `CalloutToolbarPlugin` | `toolbar` | none (zero-config) |
| `DividerExtensionPlugin` | `toolbar` | none (zero-config) |
| `EmbedFrameExtensionPlugin` | `toolbar` | none (zero-config) |
| `FormulaBlockExtensionPlugin` | `toolbar` | none (zero-config) |
| `InlineLinkExtension` | `inline` | `openLink` callback |
| `MentionPlugin` | `inline` | `panel` (required), `trigger`, `onMentionClick` |
| `CodeInlineEditorBinding` | `inline` | none (zero-config) |
| `TableBlockBinding` | `inline` | none (zero-config) |
| `PlaceholderPlugin` | `util` | `overrides` (optional per-flavour text override map) |
| `FindReplacePlugin` | `util` | none (zero-config) |
| `PasteFormatSelectorPlugin` | `util` | none (zero-config) |
| `DemoPresentationPlugin` | `util` | none (zero-config) |
| `TranslatePlugin` | `util` | `service` (required), language options |

## Plugin Composition Pattern

Many plugins are designed to work together:

```typescript
const translatePlugin = new TranslatePlugin({ service: myService });

const plugins = [
  new FloatTextToolbarPlugin({ extraItems: [...] }),
  new BlockControllerPlugin({
    ...translatePlugin.createBlockControllerOptions(),
  }),
  new BlockGapCreatorPlugin(),
  new BlockTransformerPlugin(),
  new OrderedBlockPlugin(),
  new AttachmentExtensionPlugin({ onPreview: handlePreview }),
  new ImgToolbarPlugin(),
  new BookmarkBlockExtensionPlugin(),
  new CalloutToolbarPlugin(),
  new DividerExtensionPlugin(),
  new EmbedFrameExtensionPlugin(),
  new FormulaBlockExtensionPlugin(),
  new InlineLinkExtension(),
  new MentionPlugin({ panel: mentionPanelFactory }),
  new CodeInlineEditorBinding(),
  new TableBlockBinding(),
  new FindReplacePlugin(),
  new PasteFormatSelectorPlugin(),
  translatePlugin,
];
```

## Checklist

- [ ] All required services provided via DI (`DOC_FILE_SERVICE_TOKEN`, `DOC_ADAPTER_SERVICE_TOKEN`)
- [ ] `MentionPlugin` has a `panel` factory (required)
- [ ] `TranslatePlugin` has a `service` (required to activate)
- [ ] `TranslatePlugin.createBlockControllerOptions()` spread into `BlockControllerPlugin` options
- [ ] All plugins passed to `DocConfig.plugins[]`
