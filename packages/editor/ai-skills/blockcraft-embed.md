# BlockCraft: Creating Inline Embeds

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> For inline system internals, see L2: `blockcraft-inline.md`
>
> Last updated: 2026-08-28

## What is an Inline Embed?

An inline embed is a non-text element rendered inside an editable block's text flow. Examples: `@mention`, `latex formula`. Each embed occupies exactly 1 character position in the delta model.

> **Note:** plain hyperlinks are *not* an embed — they are an attribute on a text delta (`{ insert: "label", attributes: { "a:link": "https://…" } }`) and are styled by `InlineLinkExtension`. Reserve embeds for non-text widgets (mention chips, formulas, …).

## Delta Format

```typescript
// Text: { insert: "hello" }
// Embed: { insert: { embedKey: value }, attributes?: { ... } }

// Examples:
{ insert: { mention: "Alice" }, attributes: { mentionId: "u123", mentionType: "user" } }
{ insert: { latex: "E=mc^2" } }
```

The `insert` object has exactly one non-empty key. Its value and every optional
attribute are primitive JSON values. The key (for example, `"mention"`) must
match the string key used when registering the converter, and the whole Embed
still occupies exactly one model offset regardless of payload size.

Treat that key as a canonical data contract, not just a renderer lookup. The
value shape and semantic attributes belong to the key. A host may override a
same-key converter to render the data differently, but the replacement must
read and write the same value/attributes shape. Use a new Embed key (and a new
Agent capability, when applicable) for a new data shape.

## EmbedConverter Interface

```typescript
type EmbedConverter = {
  toView: (delta: DeltaInsertEmbed) => HTMLElement;     // Render embed → DOM
  toDelta: (element: HTMLElement) => DeltaInsertEmbed;  // Parse DOM → delta
  onDestroy?: (element: HTMLElement, delta: DeltaInsertEmbed) => void;  // Cleanup
};
```

## Source Layout and Public Exports

Built-in Embed implementations live under one source boundary and are
aggregated by `packages/editor/embeds/index.ts`:

```text
packages/editor/embeds/
├── index.ts
├── defaults.ts
└── <embed-key>/
    ├── index.ts
    ├── adapter/index.ts    # HTML + Markdown Delta/AST contribution
    └── agent/index.ts      # optional: only when the document Agent needs semantics
```

The former scattered `framework/block-std/inline/*-embed.ts` and
`blocks/*/*-embed.ts` source modules have been removed. Package consumers
should import public converter, key, helper, and Agent declaration exports from
the `@ccc/blockcraft` root entry; that entry re-exports the central `embeds`
barrel. Do not deep-import the old source paths.

An external Embed package should use the same ownership rule: keep the DOM
converter in `embeds/<embed-key>/index.ts`, HTML/Markdown serialization in
`embeds/<embed-key>/adapter/index.ts`, optionally keep its Agent contract in
`embeds/<embed-key>/agent/index.ts`, and export them from the package's public
barrel. `InlineEmbedAdapterContribution.key` must equal the converter's
canonical Delta key. The bundled registry rejects duplicate keys.

All seven built-ins (`icon`, `image`, `date`, `mention`, `latex`, `shape`, and
`word-art`) provide co-located adapter contributions. HTML uses specialized
portable markup where one exists and a bounded `data-bc-inline-*` envelope for
otherwise lossy payloads. The default Markdown profile is `hybrid`, but its
Inline Embed output stays portable-first. Mention uses a standard Markdown link
whose destination is a stable BlockCraft URN; other Embed types may use a
private inline directive only in the explicit `blockcraft` profile when no
interoperable representation exists. See
`blockcraft-adapter.md` for registry composition and profile setup.

## Template: Custom Inline Embed

```typescript
// embeds/my-embed/index.ts
import type {EmbedConverter} from '@ccc/blockcraft'

export const MY_EMBED_KEY = 'myEmbed'

export const myEmbedConverter: EmbedConverter = {
  toView: (delta) => {
    // delta.insert = { myEmbed: "some-value" }
    // delta.attributes = { someAttr: "..." }
    const span = document.createElement('span');
    span.classList.add('inline-my-embed');
    span.textContent = delta.insert[MY_EMBED_KEY] as string;
    span.setAttribute('data-my-attr', delta.attributes?.['someAttr'] as string || '');
    // The element will be wrapped in <c-element><span ce="false">YOUR_ELEMENT</span>...</c-element>
    return span;
  },

  toDelta: (element) => {
    return {
      insert: { [MY_EMBED_KEY]: element.textContent || '' },
      attributes: {
        someAttr: element.getAttribute('data-my-attr') || '',
      },
    };
  },

  onDestroy: (element, delta) => {
    // Optional: cleanup listeners, subscriptions, etc.
  },
};
```

The same domain must publish its HTML/Markdown contribution. The generic
directive factory provides a readable portable fallback and a bounded,
lossless BlockCraft-profile directive; replace its HTML matchers only when the
Embed has a real portable HTML element contract:

```typescript
// embeds/my-embed/adapter/index.ts
import {createInlineDirectiveAdapterContribution} from '@ccc/blockcraft'
import {MY_EMBED_KEY, myEmbedConverter} from '..'

export const myEmbedAdapters = createInlineDirectiveAdapterContribution({
  key: MY_EMBED_KEY,
  createDomConverter: () => myEmbedConverter,
  displayText: delta => String(delta.insert[MY_EMBED_KEY] ?? ''),
})
```

With `createDomConverter`, one `additionalInlineEmbedAdapters` entry is enough
for `createBundledEditorCapabilities()` to install both serialization and the
runtime converter returned by that factory. Data-bound converters may omit the factory, but then
the host must also pass an explicit same-key `additionalEmbeds` tuple. The
factory rejects a converter without an adapter, an adapter without a converter,
and duplicate keys before document initialization.

## Optional Inline Embed Agent Contract

Converter registration controls rendering. It does **not** grant a document
Agent permission to generate that Embed. Add `agent/index.ts` only when the
Embed needs an authoritative AI semantic contract:

```typescript
// embeds/my-embed/agent/index.ts
import {defineInlineEmbedAgentCapability} from '@ccc/blockcraft'
import {MY_EMBED_KEY} from '..'

export const MY_EMBED_AGENT_CAPABILITY =
  defineInlineEmbedAgentCapability({
    id: 'acme.inline-embed.my-embed',
    kind: 'inline-embed',
    embedKey: MY_EMBED_KEY,
    title: 'My inline object',
    description: 'A stable external entity reference.',
    semanticRoles: ['entity-reference'],
    insert: {
      value: {type: 'string', minLength: 1, maxLength: 256},
      attributes: {
        type: 'object',
        properties: {
          label: {type: 'string', maxLength: 256},
        },
        additionalProperties: false,
      },
    },
    examples: [{value: 'entity-123', attributes: {label: 'Example'}}],
  })
```

The host must install both sides under the same canonical key:

```typescript
import {MY_EMBED_AGENT_CAPABILITY, myEmbedConverter} from '@acme/my-embed'
import {BlockCraftDoc} from '@ccc/blockcraft'
import {
  BlockCraftEditorAgent,
  type DocumentAgentHostExtension,
} from '@ccc/blockcraft-agent'

const doc = new BlockCraftDoc({
  // schemas, plugins, ...
  embeds: [['myEmbed', myEmbedConverter]],
})

const extension: DocumentAgentHostExtension = {
  id: 'acme.embeds',
  version: '1',
  description: 'ACME Inline Embed contracts',
  capabilities: [MY_EMBED_AGENT_CAPABILITY],
}

const agent = new BlockCraftEditorAgent(doc, runner, {
  extensions: [extension],
})
```

The Agent runtime exposes the capability only when its `embedKey` is also
installed in `DocConfig.embeds`. Conversely, an installed converter without a
registered capability can still render existing Delta and its raw Delta stays
visible in Agent context, but the Agent cannot generate that Embed. Omitting
`insert` creates an understanding-only declaration: the Agent can inspect its
semantics but cannot insert or semantically rewrite it.

Built-in `mention`, `shape`, and `word-art` capabilities are
understanding-only by default. Mentions require host-side entity resolution;
Shape and WordArt carry complex lossless payloads that the model must not
invent. Generic range deletion may still remove any Embed, including an
understanding-only one, just as a generic Block deletion can remove a Block
without granting creation of that Block.

For Agent-authored `apply-text-delta` operations:

- each object insert must contain exactly one registered Embed key and pass the
  capability's complete `insert.value` / `insert.attributes` JSON Schemas;
- `retain + attributes` may apply only canonical general text-format keys; it
  cannot mutate Embed-semantic attributes such as IDs, formats, dimensions, or
  wrapping metadata;
- a semantic Embed change is expressed as deletion of its one-offset range
  followed by a separately validated insert.

## Built-in Embeds

The `icon` embed used by document-library content is built in and needs no
registration:

```typescript
{
  insert: {icon: 'bc_icon bc_document'},
}
```

Its renderer preserves the complete iconfont class string on an `<i>` element
and mirrors it to `data-icon` for DOM-to-Delta round-trips. BlockCraft exports
`inlineIconEmbedConverter` and `INLINE_ICON_EMBED_KEY` for hosts that need to
inspect or explicitly override the default representation. Registering an
`icon` converter in `DocConfig.embeds` keeps the existing host-wins behavior.
The built-in Agent schema validates only the `bc_icon bc_*` class-string shape;
it cannot prove that a glyph exists in the host's installed catalog, so an
Agent must select a class from host-provided evidence rather than invent one.

Selection presentation is converter-independent. While a local selection fully
covers any inline Embed's one model unit, `SelectionSelectedManager` adds
`.bc-inline-embed--selected` to its mounted outer `c-element`; the base theme
supplies a background-only selection state. This makes Shift+Arrow selection
visible even when the current range contains only an atomic Embed whose inner
content is not natively selectable. The ephemeral class does not alter the
converter-owned view or Delta data.

The `image` embed is built in and needs no registration:

```typescript
{
  insert: { image: 'https://cdn.example.com/a.png' },
  attributes: {
    width: 320,
    height: 180,
    wrap: true,
    side: 'auto',
    x: 0.24,
    gap: 12,
  },
}
```

`width` and `height` are optional positive numbers. They are embed-semantic
attributes rather than text formatting. BlockCraft exports
`createInlineImageDelta`, `readInlineImageDelta`,
`inlineImageEmbedConverter`, and `INLINE_IMAGE_EMBED_KEY` for hosts that need
to create or inspect the default representation. It also exports
`InlineImageWrapOptions`, `InlineImageWrapSide` and
`normalizeInlineImageWrapOptions`. The optional fourth
`createInlineImageDelta(src, width, height, wrapOptions)` argument enables
square wrapping without changing existing three-argument calls. `x` is
normalized to `[0, 1]`, `gap` must be non-negative, and missing `side`
normalizes to `auto`.

The default renderer uses a stable `.bc-inline-image-shell[data-bc-inline-image]`
around a stable `.bc-inline-image-frame > img.bc-inline-image`. The frame owns
the visible size, loading placeholder, selection outline and resize controls;
the shell remains the atomic Embed and, while wrapped, owns the float exclusion
geometry. `InlineRuntime` contains the float by deriving
`data-bc-inline-float-owner` on the editable container. When
`ImgToolbarPlugin` is registered, clicking this default shell exposes
proportional resize handles, the ordinary/wrapped layout switch and reverse
block conversion. The toolbar does not expose automatic/left/right text-side
actions. Horizontal Pointer Events dragging
uses a body-level inert x/y proxy while the committed frame stays fixed;
pointerup may update normalized `x` and move the one-length Delta anchor in the
same or another compatible editable block through one Yjs transaction. The
default `<img>` has `draggable="false"`, and its shell capture-cancels any
residual native `dragstart` before it reaches editor DnD/Input handling. Native
`deleteByDrag` / `insertFromDrop` therefore never own inline-image movement.
The selection outline is an ephemeral DOM class and is never stored in Delta
attributes. A custom same-key converter owns its own interaction UI and is not
matched by the built-in plugin.

Registering an `image` converter explicitly overrides the built-in renderer:

```typescript
const doc = new BlockCraftDoc({
  // ...
  embeds: [['image', customImageEmbedConverter]],
});
```

Other custom embeds still use the normal registration path below.

Register in the `DocConfig.embeds` array when creating `BlockCraftDoc`:

```typescript
const doc = new BlockCraftDoc({
  // ...
  embeds: [
    ['myEmbed', myEmbedConverter],  // [key, converter]
    ['mention', mentionConverter],
    ['latex', latexConverter],
  ],
});

// Or via BlockCraftDocBuilder:
BlockCraftDocBuilder.create()
  .useEmbed('myEmbed', myEmbedConverter)
  .build();
```

Manual `BlockCraftDoc` / `BlockCraftDocBuilder` registration only installs the
DOM converter. If that document also uses the bundled `AdapterService`, compose
`myEmbedAdapters` into `createBundledAdapterRegistry()` and provide it through
`EDITOR_ADAPTER_REGISTRY_TOKEN`; see `blockcraft-app.md`. Prefer
`createBundledEditorCapabilities({additionalInlineEmbedAdapters: [...]})` when
using the full bundled editor so the converter/adapter invariant is checked.

## Inserting an Embed Programmatically

```typescript
// From within a plugin or block:
const block = this.doc.selection.selectionChange$.value?.firstBlock;
if (block && block instanceof EditableBlockComponent) {
  const cursorIndex = /* current cursor position */;
  block.applyDeltaOperations([
    { retain: cursorIndex },
    { insert: { myEmbed: "display-value" }, attributes: { someAttr: "data" } },
  ]);
}
```

## Revision / Track Changes Semantics

When Revision tracking is active, an Embed remains one Y.Text model unit and
uses the same temporary attributes as text revisions. The revision presentation
is applied to the outer `c-element`; Embed converters and their inner shells do
not need a second Diff frame or Revision-specific CSS.

- inserting an Embed through `applyDeltaOperations()` / `applyTextDelta()`
  creates one length-one `text-insert` revision;
- deleting one uses the existing non-destructive `text-delete` range;
- replacing the Embed payload with `delete: 1` plus an object `insert` records
  the old deletion and new insertion in one review group;
- changing unprefixed semantic attributes such as `width`, `height`, `wrap`,
  `format` or an object ID through `formatText(offset, 1, attrs)` is normalized
  to the same old/new replacement model;
- changing the current actor's uncontested pending Embed insertion updates it
  in place, so repeated resize/configuration gestures do not stack Diff layers.

General `a:` / `d:` / `s:` / `t:` formatting remains an untracked formatting
operation. Moving an Embed to a different text anchor also remains functional
without a Diff. System-owned metadata backfills such as an image's first
intrinsic dimensions explicitly bypass tracking.

## DOM Structure (Generated by Framework)

```html
<!-- Each embed in the blot tree renders as: -->
<c-element>
  <span contenteditable="false">
    <!-- Your toView() element goes here -->
    <span class="inline-my-embed" data-my-attr="...">display-value</span>
  </span>
  <span data-zero-space="">​</span>  <!-- Zero-width space for cursor positioning -->
</c-element>
```

## Existing Embed Examples

| Embed Key | Converter Location | Description |
|-----------|-------------------|-------------|
| `icon` | `embeds/icon/` | Built-in iconfont class embed; custom same-key renderer must preserve the class-string contract |
| `image` | `embeds/image/` | Built-in inline image; custom same-key renderer must preserve URL + semantic attributes |
| `shape` | `embeds/shape/` | Bundled inline/wrapped shape; Agent capability is understanding-only |
| `word-art` | `embeds/word-art/` | Bundled inline/wrapped WordArt; Agent capability is understanding-only |
| `date` | `embeds/date/` | Bundled frozen date/time stamp with a selectable display format |
| `mention` | `embeds/mention/` | @mention with user ID; Agent capability is understanding-only |
| `latex` | `embeds/latex/` | KaTeX formula rendering |

### Mention Markdown URN

A Mention with a non-empty `mentionId` exports in every Markdown profile as a
standard Markdown link:

```markdown
[@张三](urn:blockcraft:mention:user:u-1 "blockcraft:mention")
```

The destination contract is
`urn:blockcraft:mention:<percent-encoded-type>:<percent-encoded-id>`. Import
recognizes the URN with or without the optional `"blockcraft:mention"` title,
removes one leading `@` from the readable label, and reconstructs
`{insert:{mention:label}, attributes:{mentionId, mentionType}}`. An omitted
`mentionType` on export defaults to `user`. Invalid, incomplete or oversized
URNs remain readable link text and never fabricate an Embed. A Mention without
an ID exports as plain `@label` text because it has no stable identity.

The older `:bc-mention[...]` directive remains import-compatible, but new
exports use the URN link. This keeps the label useful in ordinary Markdown and
the identity legible to AI while avoiding an opaque payload in prose.

## Bundled Date Embed

`createBundledEditorCapabilities()` registers a fresh `date` converter per
document. The `/日期` slash command inserts one stamped with the current local
time; `DateInlineExtensionPlugin` owns click-to-edit (see
`blockcraft-plugins-inline.md`).

```typescript
{
  insert: {date: '2026-08-14T15:54'},
  attributes: {format: 'YYYY-MM-DD HH:mm'},
}
```

Two rules the shape encodes:

- **The value is frozen, not live.** It is a *local wall-clock* stamp
  (`YYYY-MM-DDTHH:mm`), never a UTC instant and never recomputed at render
  time — the embed must read the same for every collaborator in every timezone.
- **The format lives in `attributes`, not in the value.** Switching format is a
  presentation change and must never risk rewriting the frozen value.

`toView` renders a theme-aware date chip with the `@cses/ui`
`csicon csicon-date-time` icon followed by the formatted text. The chip occupies
exactly one inherited line-height while its icon and value remain slightly
smaller and quieter than surrounding text. It mirrors both fields onto
`data-bc-date-value` / `data-bc-date-format` so `toDelta` can rebuild the delta
from DOM alone (copy/paste, HTML import). The text node is derived output and
is never read back.

| Export | Purpose |
|--------|---------|
| `INLINE_DATE_EMBED_KEY` / `INLINE_DATE_CLASS` | Delta key `'date'`; view class `'bc-inline-date'` |
| `INLINE_DATE_FORMATS` / `DEFAULT_INLINE_DATE_FORMAT` | The 11 selectable formats; default `'YYYY-MM-DD HH:mm'` |
| `createInlineDateDelta(dateOrValue, format?)` | Builds the delta; unknown formats fall back to the default |
| `readInlineDateDelta(delta)` / `readInlineDateElement(el)` | Reads `{value, format}` back from a delta or a rendered element |
| `formatInlineDateValue(value, format)` | Renders a stamp; echoes unparsable input verbatim |
| `toInlineDateValue(date)` / `parseInlineDateValue(value)` | `Date` ↔ stamp; parse rejects out-of-range fields instead of rolling over |
| `createInlineDateEmbedConverter()` | Factory — one converter instance per document |

Format tokens: `YYYY` `MMM` `MM` `M` `DD` `D` `HH` `H` `mm`, plus `dddd`
(`星期五`) and `ddd` (`周五`). They are substituted in one pass, longest token
first, so a token's own output can never be re-matched by a later token.

## Inline Image Adapter Semantics

- HTML paragraphs export/import inline images as `<img class="bc-inline-image">`.
  Square wrapping is preserved through `data-bc-wrap="square"` plus
  `data-bc-wrap-side`, `data-bc-wrap-x` and optional `data-bc-wrap-gap`.
- `<figure><img></figure>` remains a block image.
- Markdown images mixed with text remain inline embeds, but Markdown does not
  preserve `wrap/side/x/gap`.
- A Markdown paragraph containing only one image remains an image block for
  backward compatibility.
- Converting a mixed inline image back to a block splits its editable block into
  `before text / image block / after text`, preserves text Delta attributes,
  and does not infer a caption.
- Reverse conversion is rejected when the parent Schema does not allow an
  `image` child.

## Bundled Shape and WordArt Embeds

`createBundledEditorCapabilities()` registers fresh `shape` and `word-art`
converters together with the unified `ObjectFormatToolbarPlugin`.
Manual host assembly must register the matching converters and Plugin:

```typescript
const doc = new BlockCraftDoc({
  // ...
  embeds: [
    ['shape', createInlineShapeEmbedConverter()],
    ['word-art', createInlineWordArtEmbedConverter()],
  ],
  plugins: [new ObjectFormatToolbarPlugin()],
})
```

Both payloads are JSON strings because `DeltaInsertEmbed` values stay within
the primitive `SimpleBasicType` contract. Short Delta attributes carry
`width/height`; Shape and WordArt wrapping add `wrap/x/gap`. This lets the
shared float layout and model-only virtualization estimator work without
parsing presentation payloads. Each object remains one model unit.
`InlineShapeData` and `InlineWordArtData` have no `side`;
`createInlineShapeDelta(..., wrapOptions)` and
`createInlineWordArtDelta(..., wrapOptions)` accept their exported
Shape/WordArt wrap-option types. Incoming `side` metadata is ignored.

The generated view uses
`.bc-inline-object-shell[data-bc-inline-object="shape|word-art"]` and
`.bc-inline-object-frame[data-bc-inline-float-frame]`. A wrapped shell also
projects `data-bc-inline-float-layout="wrap"`. Clicking it calls
`EditableBlockComponent.setInlineRange(offset, 1)`, keeping copy/cut and native
selection aligned. Both toolbars change only layout: **四周型环绕** always uses
automatic text wrapping and exposes no text-side controls. Detailed
shape/WordArt editing is restored by converting back to a block.

HTML uses a `<span data-bc-inline-object>` with the lossless payload and wrap
metadata. Shape and WordArt HTML omit `data-bc-wrap-side`. Markdown deliberately
emits only readable object text.

## Checklist

- [ ] `EmbedConverter` implements `toView` and `toDelta`
- [ ] `toView` returns an `HTMLElement` (not a string)
- [ ] `toDelta` correctly reconstructs the delta from the DOM element
- [ ] Embed key in `insert` object matches the registration key
- [ ] Same-key converter overrides preserve the canonical value/attributes contract
- [ ] Custom converter registered in `DocConfig.embeds`; built-in `icon` and `image` need no registration
- [ ] HTML/Markdown contribution is colocated in `embeds/<key>/adapter/` and uses the same key
- [ ] Bundled capability hosts pass the contribution in `additionalInlineEmbedAdapters` (and an explicit converter tuple only when it has no factory)
- [ ] If AI may generate the Embed, add/export `agent/index.ts` and explicitly register the matching capability in the host
- [ ] If AI must only understand the Embed, declare a capability without `insert`; if no AI semantics are needed, omit `agent/` entirely
- [ ] CSS styles added for the embed element class
- [ ] `onDestroy` implemented if the embed creates subscriptions or listeners
