# BlockCraft: Creating Inline Embeds

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> For inline system internals, see L2: `blockcraft-inline.md`
>
> Last updated: 2026-08-01

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

## Registration

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
proportional resize handles, the ordinary/wrapped layout switch, text-side
controls and reverse block conversion. Horizontal Pointer Events dragging
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
| `image` | `framework/block-std/inline/image-embed.ts` | Built-in inline image; custom same-key converter wins |
| `mention` | `editor/editor.ts` (inline) | @mention with user ID |
| `latex` | `editor/editor.ts` (inline) | KaTeX formula rendering |

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

## Checklist

- [ ] `EmbedConverter` implements `toView` and `toDelta`
- [ ] `toView` returns an `HTMLElement` (not a string)
- [ ] `toDelta` correctly reconstructs the delta from the DOM element
- [ ] Embed key in `insert` object matches the registration key
- [ ] Converter registered in `DocConfig.embeds` array
- [ ] CSS styles added for the embed element class
- [ ] `onDestroy` implemented if the embed creates subscriptions or listeners
