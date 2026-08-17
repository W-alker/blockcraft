# BlockCraft: Creating Inline Embeds

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> For inline system internals, see L2: `blockcraft-inline.md`
>
> Last updated: 2026-08-17

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

The key of the `insert` object (e.g. `"mention"`) must match the string key used when registering the converter.

## EmbedConverter Interface

```typescript
type EmbedConverter = {
  toView: (delta: DeltaInsertEmbed) => HTMLElement;     // Render embed → DOM
  toDelta: (element: HTMLElement) => DeltaInsertEmbed;  // Parse DOM → delta
  onDestroy?: (element: HTMLElement, delta: DeltaInsertEmbed) => void;  // Cleanup
};
```

## Template: Custom Inline Embed

```typescript
// Define in editor setup or a dedicated file
import { EmbedConverter } from "../../framework";

export const myEmbedConverter: EmbedConverter = {
  toView: (delta) => {
    // delta.insert = { myEmbed: "some-value" }
    // delta.attributes = { someAttr: "..." }
    const span = document.createElement('span');
    span.classList.add('inline-my-embed');
    span.textContent = delta.insert['myEmbed'] as string;
    span.setAttribute('data-my-attr', delta.attributes?.['someAttr'] as string || '');
    // The element will be wrapped in <c-element><span ce="false">YOUR_ELEMENT</span>...</c-element>
    return span;
  },

  toDelta: (element) => {
    return {
      insert: { myEmbed: element.textContent || '' },
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
| `icon` | `framework/block-std/inline/icon-embed.ts` | Built-in iconfont class embed; custom same-key converter wins |
| `image` | `framework/block-std/inline/image-embed.ts` | Built-in inline image; custom same-key converter wins |
| `shape` | `blocks/shape-block/shape-embed.ts` | Bundled inline/wrapped shape with lossless props + nested text payload |
| `word-art` | `blocks/word-art-block/word-art-embed.ts` | Bundled inline/wrapped WordArt with lossless presentation + text payload |
| `date` | `framework/block-std/inline/date-embed.ts` | Bundled frozen date/time stamp with a selectable display format |
| `mention` | `editor/editor.ts` (inline) | @mention with user ID |
| `latex` | `editor/editor.ts` (inline) | KaTeX formula rendering |

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
converters together with `ShapeToolbarPlugin` and `WordArtToolbarPlugin`.
Manual host assembly must register the matching converter and Plugin:

```typescript
const doc = new BlockCraftDoc({
  // ...
  embeds: [
    ['shape', createInlineShapeEmbedConverter()],
    ['word-art', createInlineWordArtEmbedConverter()],
  ],
  plugins: [new ShapeToolbarPlugin(), new WordArtToolbarPlugin()],
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
- [ ] Custom converter registered in `DocConfig.embeds`; built-in `icon` and `image` need no registration
- [ ] CSS styles added for the embed element class
- [ ] `onDestroy` implemented if the embed creates subscriptions or listeners
