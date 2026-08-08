# BlockCraft: Utility Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-08-07

## PlaceholderPlugin

> `plugins/placeholder/index.ts` — Renders focused and opt-in persistent placeholders on empty editable blocks.

Resolves per-block `meta.plh`, Plugin flavour overrides and
`IBlockSchemaOptions.metadata.placeholder` (see `blockcraft-block.md` →
"Block Instance Metadata") and renders the result via the generic
`.bc-placeholder-target::before` contract.

The plugin holds a constant set of doc-wide subscriptions regardless of block
count. Persistent mode maintains only a `Set` of opted-in mounted block IDs;
text, props, meta, structure and virtualization events fan into those IDs. It
does not allocate one observer per document block.

### Resolution order

1. `block.meta.plh` when it is a string.
2. `overrides[block.flavour]`.
3. `schema.metadata.placeholder`.
4. Nothing rendered.

An empty `meta.plh` explicitly disables the current block's placeholder.
Deleting the key restores flavour/Schema fallback. Malformed persisted
non-string values are ignored safely.

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

// Per-block persistent override
const snapshot = ParagraphBlockSchema.createSnapshot()
snapshot.meta.plh = '请输入摘要'
snapshot.meta.plhMode = 'always'

block.updateMeta({plh: '请输入摘要'})
block.updateMeta({plhMode: 'always'}) // persistent while semantically empty
block.updateMeta({plhMode: 'focused'})
block.updateMeta({plh: ''})    // disable only this block
block.updateMeta({plh: null})  // delete instance override and restore fallback

```

### Display Contract

- Focused mode is visible only when the current selection is a same-block text
  selection in an empty editable block and that block is writable.
- Persistent mode requires `meta.plhMode === 'always'` plus a non-empty string
  `meta.plh` on an editable block. Non-editable containers do not render
  placeholders; content regions should put these fields on their empty
  editable child.
- Persistent hints remain visible in readonly mode. Both modes hide during IME
  composition.
- Emptiness is model-first and checks the editable block's `Y.Text` length,
  including while its view is outside the virtualized window.
- `meta.plh`, `meta.plhMode`, text, relevant props, structure and root
  mount/unmount changes refresh affected placeholders.
- Hidden during IME composition — plugin listens to native `compositionstart` / `compositionend` on the root host in capture phase (bypassing the framework dispatcher because `InputTransformer._handleCompositionStart` is a global handler that stops propagation).
- DOM state: `data-placeholder` and `.bc-placeholder-target` on the editable
  container;
  `.bc-placeholder-empty` and compatibility `.empty` on the block host.

### Notes

- Bundled in the default editor preset (`editor/editor.ts`). To disable, omit it from `DocConfig.plugins`.
- Instance metadata, runtime flavour overrides and Schema defaults are
  decoupled; neither higher-priority layer mutates the lower-priority source.
- Avoid using `::before` for other decoration on the same
  `.bc-placeholder-target`; put block chrome on the host or a sibling element.

---

## FindReplacePlugin

> `plugins/findReplace/findReplace.ts` — Find and replace dialog.

Binds `Cmd/Ctrl+F` to open a global overlay find-and-replace dialog. Also exposes a `FindReplaceHelper` for programmatic use.

Search indexes the complete `BlockModelGraph`, including virtualized blocks
without Angular components. In virtual mode only the active result and matched
blocks inside mounted windows receive `FakeRange` DOM highlights. Navigation
materializes the active root unit; replacement writes through block-ID based
`DocCRUD` methods, so replace-all does not mount the document.

Model text updates are coalesced and rescan only affected block IDs. Structural
changes are a cold path and rebuild model order without DOM traversal. A
`FindReplaceMatch` created by the helper always includes stable `blockId`;
reading its compatibility `block` property materializes and resolves the view,
so model-only integrations should use `blockId`.

### Configuration

```typescript
new FindReplacePlugin()

// Host supplies its own panel and delegates behavior to plugin.helper.
new FindReplacePlugin({defaultDialog: false})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultDialog` | `boolean` | `true` | Whether Cmd/Ctrl+F is consumed to open BlockCraft's bundled dialog. Set `false` for a host-rendered UI; the plugin still owns and exposes the fully initialized `helper`. |

### Built-in Hotkeys

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+F` | Open find & replace dialog |

### Public API

| Property | Type | Description |
|----------|------|-------------|
| `helper` | `FindReplaceHelper` | Programmatic find/replace without UI |

The bundled dialog and host-rendered panels should reuse `plugin.helper`; do
not create another helper for the same document. The plugin owns
`listen()` / `destroy()`. A host panel may call `clearAll()` when it closes, but
must not destroy the shared helper.

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

## PaginationPlugin

> `plugins/pagination/` — Optional Word-style live pagination, page settings and print/PDF coordination.

### Configuration

```typescript
new PaginationPlugin(options?: PaginationPluginOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Initial live-layout state; held by the plugin, not `DocConfig` |
| `pageSize` | `PageSizeName \| {width, height}` | `'A4'` | Named PDF-point size or custom CSS-pixel dimensions |
| `orientation` | `'portrait' \| 'landscape'` | `'portrait'` | Page orientation |
| `margins` | `Partial<PageMargins>` | `72px` each side | Page margins |
| `pageGap` | `number` | `24` | Screen gap between sheets |
| `header` / `footer` | `PageChrome` | none | Left/center/right text, independent edge `distance`, and styled page-number tokens |
| `documentHeader` | `PaginationDocumentHeaderOptions` | none | Live host element projected into and measured on the first page |
| `widowOrphanLines` | `number` | `2` | Minimum rows/lines on both sides of a safe split |
| `printShortcut` | `boolean` | `false` | Route Cmd/Ctrl+P to plugin printing only while enabled |
| `experimentalSparseView` | `boolean` | `false` | Phase C opt-in: let paginated Projection drive root virtualization instead of acquiring the full-document view lease |

### Public API

| Member | Description |
|--------|-------------|
| `enabled` | Current live-layout state |
| `config` | Current pagination config (without enabled state) |
| `enable()` / `disable()` | Apply or fully remove the reversible pagination view |
| `updateConfig(partial)` | Merge config and schedule one frame-coalesced recompute |
| `recompute()` | Request a manual recompute while enabled |
| `print()` | Build WYSIWYG print pages; reuses live measurements when enabled |
| `exportToPdf(name, options?)` | Browser print or host-native PDF; reuses the current stable page result unless `options.pagination` requests reflow |

```typescript
const pagination = new PaginationPlugin({
  enabled: false,
  printShortcut: true,
  experimentalSparseView: true,
})
const doc = new BlockCraftDoc({/* ... */ plugins: [pagination]})

pagination.enable()
pagination.updateConfig({
  pageSize: 'A4',
  margins: {top: 72, right: 72, bottom: 72, left: 72},
  header: {center: '{page:roman-upper}', distance: 48},
  footer: {center: '第 {page:chinese} 页 共 {total:chinese} 页', distance: 48},
})
await pagination.exportToPdf('document.pdf')
pagination.disable()
```

Async business blocks can prepare the isolated export copy before measurement:

```typescript
await pagination.exportToPdf('document.pdf', {
  prepareDocument: async ({doc, root, signal}) => {
    await businessExportCoordinator.reloadAndWait(doc, {root, signal})
  },
  stability: {quietFrames: 2, timeoutMs: 10000},
})
```

`prepareDocument` never receives the live collaborative document. It runs only
after the readonly snapshot copy has initialized and must resolve when business
views are semantically ready to measure. Business blocks may fetch fresh data;
they do not need to freeze their payload. BlockCraft then prepares images/fonts
and waits for DOM plus block-size quiet frames before pagination. Rejecting the
hook fails export with `layout-not-ready`; `resourcePolicy: 'best-effort'` only
converts the final generic stability timeout to a warning and does not swallow a
business preparation failure.

The plugin changes only local DOM/CSS view state. It never writes Yjs and produces no Undo item. `print()` and `exportToPdf()` obtain the complete document through `doc.exportSnapshot()`, so virtualized offscreen blocks are included without mounting editor views merely to serialize them.

Live pagination supports a configured scroll container that is an outer
ancestor rather than the root's direct parent. The actual scroll container
continues to drive viewport observation and virtualization; the root's direct
parent becomes the page-frame layout surface. This keeps page sheets aligned
with content even when host-owned headers or wrappers precede the editor.

`header` / `footer` customize fixed-height page chrome through the
`left` / `center` / `right` text segments. `{page}` / `{total}` render decimal
numbers; `:roman-upper`, `:roman-lower` and `:chinese` modifiers provide Word-like
number styles (for example `{page:roman-upper}`). `distance` measures a header
from the top sheet edge and a footer from the bottom edge, independently of body
margins. Chrome inside the margin band does not consume extra body capacity;
only the part crossing the body boundary is deducted. Omitting `distance`
falls back to the matching top/bottom margin and preserves the previous
margin-plus-height layout. Runtime `updateConfig()` immediately updates both
the root padding and pagination geometry. Non-finite or negative heights fall
back to the 24px default instead of corrupting the layout. Page chrome is intentionally non-wrapping. Arbitrary
Angular/DOM content that belongs only to the first page uses the separate
`documentHeader` option. The plugin temporarily projects that original element
into the root pagination surface, constrains it to content width and tracks its
border-box with one `ResizeObserver`; measured height plus the configured gap
participates in first-page capacity and page-gap projection. Disable/destroy
restores the element exactly.

An actual table row taller than `contentHeight` is no longer treated as one overflowing fragment. The live measurement path derives safe continuation anchors from direct child-Block boundaries and complete visual text lines, then runs every logical cell as a parallel flow. Block/cell-start anchors use reversible margin offsets on existing Block hosts; only text-line anchors need transparent zero-model-length Inline markers. One table-level mask paints every sheet/background band in the shared table coordinate system. The stable print layout installs a readonly compressed projection and uses the same fragment offsets. The table's virtual flow height and every internal sheet gap are included in sparse Projection extents, so blocks after the table start at the same sheet coordinate in exact live, sparse live and print layouts. Composition keeps the previous stable projection until `compositionend`.

This cell-flow path is activated only when one physical `<tr>` is itself oversized. Ordinary rowspan/colspan tables keep the existing row-boundary policy; a content-bearing rowspan spanning several otherwise normal-height rows remains keep-together at the covered row boundaries. An irreducible nested atomic block is capped locally to `--bc-page-content-height` with clipping and no cell-level scroll container.

The default `experimentalSparseView: false` path preserves the existing exact live behavior: `enable()` acquires a full-document virtualization lease and `disable()` releases it after view cleanup. With `experimentalSparseView: true` and root virtualization enabled, the paginated Projection drives viewport/spacer geometry without that lease. Mounted roots are measured; offscreen roots use configured flavour estimates until mounted. Gap, table-break and height-lock state is cached as pure layout data and replayed only for mounted roots. Model text/props/structure updates are frame-coalesced; the current pagination engine still performs an `O(N)` scan of cached numbers.

The sparse option is a Phase C rollout switch, not yet the default exact live-pagination mode. A non-exact sparse result is not reused for `print()` or `exportToPdf()`; those operations use the complete readonly reflow path. A host that creates its own isolated readonly export copy should wait until that copy is exact and call `captureStableLayout()` synchronously with its snapshot capture. That stable layout—not a second print-time measurement—is the authoritative page model. `exportToPdf()` opens a browser print dialog by default, or invokes a `PaginationPdfHostBackend` while the current top-level WebView print mirror is mounted. It does not return PDF bytes. The readonly path uses BlockCraft block components, not snapshot-viewer or DOM rasterization. Explicit `options.pagination` means a new reflow. Register `PageDividerBlockSchema` to expose manual page breaks. The package intentionally does not publish a settings component: host UI reads `plugin.config` and sends changes through `plugin.updateConfig(...)`; the playground keeps its own debug-only panel as an integration example.

Atomic block height follows painted overflow, not raw internal scroll geometry. When the top-level host's effective vertical overflow is `visible`, pagination includes `max(offsetHeight, scrollHeight)` so Safari iframe/embed cards that paint beyond their host remain intact. For `hidden`, `clip`, `auto` or `scroll`, pagination uses `offsetHeight` because the excess is clipped or contained. Live measurement, export fallback measurement and stable-layout validation all use this same rule; hosts should express intentional clipping/scrolling on the block host instead of compensating with export-only margins.

The mounted mirror already owns exact physical paper geometry. Each fixed-height
slot naturally occupies one physical page; never add an adjacent-slot forced
page break, because a browser that has already advanced at the slot boundary will
emit an empty page for the second break. A native `PaginationPdfHostBackend` must
print it at `1:1` and disable horizontal shrink-to-fit; otherwise page width
fitting also rescales slot height and breaks the captured page boundaries. The
root `placement-layout` is projected as a global absolute plane on every print
page rather than moved with its zero-height tail slot. Pass a real host document
header through `PrintRenderResult.leadingContent`. BlockCraft stages that exact
DOM inside the final paper/content width, waits for it to stabilize, validates it
against the captured first-page geometry, and mounts it at z=2 above body z=1;
do not synthesize a replacement block or measure the header in a wider host.
Keep `data-bc-placement-container` on `.bc-print-content` so under/flow/over
stacking remains identical to the editor. In flow, live pagination, and print,
the plane starts at `0/0` inside the root content box and fills its width.
Legacy percentage x is resolved once against content width; root padding is not
encoded into fixed `placement.x/y`. Strict mode reports `layout-diverged`
if a non-empty plane has no readonly DOM.
`captureStableLayout()` publishes the canonical placement content-box origin and
width from the same resolved pagination geometry as the page breaks. It never
converts a live DOMRect back into layout data, so host padding, CSS zoom, WebView
scale and transforms cannot change fixed placement coordinates. The projector
applies only the later-page vertical stride.
`PrintRenderResult.placementOriginX/Y` and `placementWidth` remain compatibility
diagnostics for older host-managed stable layouts. If stable
first-page geometry includes an external document header but a generic readonly
provider cannot render that element, the body still keeps the same leading
offset; otherwise normal flow and every absolute object would diverge by the
header height.
The pagination surface is never narrower than its sheet. This prevents Chromium
from safe-aligning an overflowing flex root to the start while the absolute page
backdrop remains centered. Root, backdrop, and external header use the same
`left:50% + translateX(-50%)` centerline; narrow hosts scroll horizontally.
WordArt now uses SVG as its final visual layer in editable, readonly and
snapshot rendering. The contenteditable host retains only font/layout metrics,
wrapping, alignment and caret styles for input and selection; fill, gradient,
outline, shadow and effect transforms are SVG-owned. Print reuses that
already-stable SVG node. Fixed-page assembly never remeasures CSS text or
creates a replacement vector; legacy/custom renderers must finish their vector
layer before layout stability, otherwise export fails with `layout-not-ready`.
SVG
text lines are anchored from the source Range's visual top with
`dominant-baseline="text-before-edge"`; do not rederive an alphabetic baseline
from Canvas font metrics, because native PDF painters interpret that y
coordinate differently and can shift CJK WordArt by roughly one ascent.

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
