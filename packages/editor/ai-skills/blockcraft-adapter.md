# BlockCraft: Creating Adapter Matchers

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Adapters handle HTML ↔ BlockSnapshot and Markdown ↔ BlockSnapshot conversion.
>
> Last updated: 2026-08-28

## Architecture

```
HTML string → rehype-parse → HAST → ASTWalker → BlockSnapshot[]
BlockSnapshot[] → ASTWalker → HAST → rehype-stringify → HTML string

Markdown string → remark-parse → MDAST → ASTWalker → BlockSnapshot[]
BlockSnapshot[] → ASTWalker → MDAST → remark-stringify → Markdown string
```

Each block type needs a **matcher** for each adapter (HTML and/or Markdown). A matcher defines:
- `toMatch` — Does this AST node correspond to this block type?
- `fromMatch` — Does this block snapshot correspond to this block type?
- `toBlockSnapshot` — Convert AST node → BlockSnapshot (import)
- `fromBlockSnapshot` — Convert BlockSnapshot → AST node (export)

Matchers are owned by their domain, not by the global AST walker. Keep them in
`blocks/<block>/adapter/`; Inline Embed format adapters belong in
`embeds/<embed-key>/adapter/`. Each directory exports one contribution record,
which the immutable `AdapterRegistry` aggregates at the composition root:

```text
blocks/my-block/
├── index.ts
└── adapter/
    ├── html.ts             # concrete HAST matcher
    ├── markdown.ts         # concrete MDAST matcher
    └── index.ts            # contribution only

embeds/my-embed/
├── index.ts                # DOM EmbedConverter
└── adapter/
    └── index.ts            # HTML + Markdown Delta/AST matchers
```

`packages/editor/adapters/` is the core anti-corruption layer only. It may
define walkers, matcher interfaces, registry/indexing, generic factories,
bounded metadata codecs, and the HTML/Markdown engines, but it must not import
from `blocks/`, `embeds/`, `editor/`, or a source-application adapter. The
built-in application assembles concrete contributions in
`editor/bundled-adapter-registry.ts`.

Built-in ownership is exposed through
`BUNDLED_BLOCK_ADAPTER_CONTRIBUTIONS`,
`BUNDLED_INLINE_EMBED_ADAPTER_CONTRIBUTIONS`, and
`BUNDLED_ADAPTER_REGISTRY`. Export lookup is pre-indexed by Block flavour, so
adding more adapters does not turn every export node into a scan across all
registered Block matchers.

## Template: HTML Adapter Matcher (Void Block)

```typescript
// blocks/my-block/adapter/index.ts
import type {
  BlockAdapterContribution,
  BlockHtmlAdapterMatcher,
} from '@ccc/blockcraft'
import {BlockNodeType, HastUtils} from '@ccc/blockcraft'
import {MyBlockSchema} from '..'

export const myBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  // Import: match HAST node → should we handle this?
  toMatch: (o) => HastUtils.isElement(o.node) && o.node.tagName === 'my-tag',

  // Export: match BlockSnapshot → should we handle this?
  fromMatch: (o) => o.node.flavour === MyBlockSchema.flavour,

  // Import: HAST → BlockSnapshot
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) return;
      const { walkerContext } = context;

      const src = o.node.properties?.['src'] as string || '';

      walkerContext
        .openNode(
          {
            id: MyBlockSchema.createSnapshot(src).id,
            flavour: 'my-block',
            nodeType: BlockNodeType.void,
            props: { src },
            meta: {},
            children: [],
          },
          'children'
        )
        .closeNode();
    },
  },

  // Export: BlockSnapshot → HAST
  fromBlockSnapshot: {
    enter: (o, context) => {
      const { walkerContext } = context;
      const props = o.node.props as any;

      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'my-tag',
            properties: { src: props.src || '' },
            children: [],
          },
          'children'
        )
        .closeNode();
    },
  },
};
```

## Template: HTML Adapter Matcher (Editable Block with Inline Content)

```typescript
import {
  BlockNodeType,
  HastUtils,
  generateId,
  type BlockHtmlAdapterMatcher,
} from '@ccc/blockcraft'

export const myEditableBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: (o) =>
    HastUtils.isElement(o.node) && o.node.tagName === 'div' &&
    (o.node.properties?.['className'] as string[])?.includes('my-editable'),

  fromMatch: (o) => o.node.flavour === 'my-editable',

  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) return;
      const { walkerContext, deltaConverter } = context;

      // Convert child HAST nodes to delta operations
      const deltas = deltaConverter.astToDelta(o.node);

      walkerContext.openNode(
        {
          id: generateId(),
          flavour: 'my-editable',
          nodeType: BlockNodeType.editable,
          props: { delta: deltas },
          meta: {},
          children: [],
        },
        'children'
      );
      walkerContext.skipAllChildren();  // We consumed the children via deltaConverter
    },
    leave: (o, context) => {
      context.walkerContext.closeNode();
    },
  },

  fromBlockSnapshot: {
    enter: (o, context) => {
      const { walkerContext, deltaConverter } = context;
      const deltas = (o.node.props as any).delta || [];

      // Convert delta operations to HAST children
      const children = deltaConverter.deltaToAst(deltas);

      walkerContext.openNode(
        {
          type: 'element',
          tagName: 'div',
          properties: { className: ['my-editable'] },
          children,
        },
        'children'
      );
    },
    leave: (o, context) => {
      context.walkerContext.closeNode();
    },
  },
};
```

## Template: Markdown Adapter Matcher

```typescript
// blocks/my-block/adapter/index.ts
import {
  BlockNodeType,
  generateId,
  type BlockMarkdownAdapterMatcher,
} from '@ccc/blockcraft'

export const myBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  // Import: match MDAST node
  toMatch: (o) => o.node.type === 'myCustomNode',  // or standard MDAST types

  // Export: match block snapshot
  fromMatch: (o) => o.node.flavour === 'my-block',

  // Import: MDAST → BlockSnapshot
  toBlockSnapshot: {
    enter: (_, context) => {
      const { walkerContext } = context;
      walkerContext
        .openNode(
          {
            id: generateId(),
            flavour: 'my-block',
            nodeType: BlockNodeType.void,
            props: {},
            meta: {},
            children: [],
          },
          'children'
        )
        .closeNode();
    },
  },

  // Export: BlockSnapshot → MDAST
  fromBlockSnapshot: {
    enter: (_, context) => {
      const { walkerContext } = context;
      walkerContext
        .openNode({ type: 'thematicBreak' }, 'children')  // Standard MDAST node
        .closeNode();
    },
  },
};
```

## WalkerContext API

```typescript
walkerContext.openNode(node, childrenField)   // Push node onto stack
walkerContext.closeNode()                      // Pop and attach to parent
walkerContext.skipAllChildren()                // Don't traverse children (leaf node optimization)
walkerContext.currentNode()                     // Read/mutate the current output node for a transparent root
walkerContext.getNodeContext(key)               // Get property from nearest ancestor
walkerContext.setNodeContext(key, value)        // Store state on the current output-node frame
walkerContext.setGlobalContext(key, value)      // Set global state
walkerContext.getGlobalContext(key)             // Get global state
```

## Contribution and Registration

Export one record from the Block's `adapter/` directory. `id` and every owned
flavour must be unique; construction fails fast when two contributions claim
the same identity or flavour.

```typescript
// blocks/my-block/adapter/index.ts
export const myBlockAdapters: BlockAdapterContribution = {
  id: 'my-block',
  flavours: ['my-block'],
  html: [myBlockHtmlAdapterMatcher],
  markdown: [myBlockMarkdownAdapterMatcher],
}
```

Sibling domains still own separate contribution records even when one grammar
matcher recognizes the whole family. For example, `ordered`, `bullet`, and
`todo` each publish their own contribution, while all three may reference the
same list matcher object. `AdapterRegistry` de-duplicates identical matcher
objects once for import, but keeps the per-flavour export index and ownership
invariant. Do not make one sibling directory claim another sibling's flavour.

A claimed flavour is not sufficient evidence of an adapter. Except for an
explicitly transparent infrastructure node, every contribution must have an
import path (`toMatch` + `toBlockSnapshot`) and an export path (`fromMatch` +
`fromBlockSnapshot`) for both HTML and Markdown. Add a representative
round-trip fixture for the flavour; a coverage test that only compares string
sets will not detect a matcher that always returns `false` or reads props the
Schema never defines.

Compose external contributions without editing global matcher arrays:

```typescript
import {
  HtmlAdapter,
  MarkdownAdapter,
  createBundledAdapterRegistry,
} from '@ccc/blockcraft'
import {myBlockAdapters} from '@acme/my-block/adapter'

const registry = createBundledAdapterRegistry({
  additionalBlocks: [myBlockAdapters],
})
const html = new HtmlAdapter(fileService, new Map(), registry)
const markdown = new MarkdownAdapter(fileService, new Map(), registry)
```

When the host uses the bundled capability factory, pass the same contribution
arrays with its custom Schemas and Embed converters. The factory validates the
pairing before a document is initialized and returns the composed registry:

```typescript
const capabilities = createBundledEditorCapabilities({
  additionalSchemas: [myBlockSchema],
  additionalBlockAdapters: [myBlockAdapters],
  additionalEmbeds: [['my-embed', myEmbedConverter]],
  additionalInlineEmbedAdapters: [myEmbedAdapters],
})

capabilities.adapterRegistry // bundled + host contributions
```

`AdapterService` resolves `EDITOR_ADAPTER_REGISTRY_TOKEN`. A custom Angular
host must provide the registry created from those same arrays in the injector
that provides `DOC_ADAPTER_SERVICE_TOKEN`; otherwise the document can render a
custom type while its HTML/Markdown service still uses only bundled adapters.
See `blockcraft-app.md` for the complete provider example.

The third constructor argument is mandatory: pass either an explicit matcher
array or an `AdapterRegistry`. The core adapters intentionally have no knowledge
of the bundled Block set. New code should use `AdapterRegistry`; only
registry-backed export gets O(1) flavour routing and duplicate ownership
validation. Matcher `priority` orders import candidates; `consumes: true` stops
lower-priority matchers after a match.

## Markdown Profiles and Custom Inline Syntax

The default `hybrid` profile combines a portable Markdown base with selective
custom Block syntax. A standard renderer, plain-text reader and language model
still encounters meaningful text, links, images, tables and fenced code;
registered Block types opt into a private directive only when flattening would
erase their core container semantics. Use Snapshot or `.bcdoc` when exact
model/layout recovery is required.

The three export profiles are:

- `portable`: emit only ordinary, readable Markdown; custom containers flatten;
- `hybrid` (default): use ordinary Markdown first, plus directives only for
  Block adapters with `markdownDirective: true`;
- `blockcraft`: includes hybrid Block behavior and permits registered private
  Inline Embed directives where no portable representation exists.

Markdown import is intentionally a superset in every profile: it recognizes
legacy and explicitly authored BlockCraft directives through the normal
Markdown MIME adapter. Select a non-default profile only when the consumer has
a stricter portability or Inline Embed fidelity requirement:

```typescript
import {
  BUNDLED_ADAPTER_REGISTRY,
  MARKDOWN_ADAPTER_PROFILE_CONFIG,
  MarkdownAdapter,
} from '@ccc/blockcraft'

const markdown = new MarkdownAdapter(
  fileService,
  new Map([[MARKDOWN_ADAPTER_PROFILE_CONFIG, 'portable']]),
  BUNDLED_ADAPTER_REGISTRY,
)
```

When a private extension is genuinely needed, BlockCraft follows the
generic-directives convention implemented by `remark-directive`; these markers
are an extension, not CommonMark/GFM syntax:

- `:bc-*` is a text/inline directive for an Inline Embed that has no useful
  standard representation; the legacy `:bc-mention[...]` form is accepted on
  import but is no longer emitted;
- `::bc-*` is a leaf directive for a custom Block representation with no
  meaningful Markdown body and no parameters;
- `:::bc-* ... :::` is a container directive for a Block representation that
  owns text or child Blocks, for example Callout, Text Box, Render Unit,
  Columns, Frame and Object Group. Shape and Word Art use containers for their
  text.

Custom Block parameters are a YAML front-matter section at the start of the
container:

```markdown
:::bc-text-box

---
width: 320
height: 160
p: [8,12]
position:
  x: 12
  y: 24
---

Readable **Markdown content** remains ordinary Markdown.

:::
```

This is a bounded YAML 1.2 subset: records use two-space indentation and arrays
use JSON-compatible YAML flow values. Import does not enable YAML tags, anchors,
implicit timestamps or executable types, and the parsed record still passes
through the existing depth, size, prototype and active-content sanitizer. The
former percent-encoded `props="..."` directive attribute is not imported.
HTML adapters continue to use bounded `data-bc-*` attributes because HTML has
no equivalent metadata body.

Nested containers follow generic-directives fence-length rules. The serializer
automatically uses a longer outer fence, so Columns/Column output resembles
`::::bc-columns ... :::bc-column ... ::: ... ::::`. Each container owns only
the YAML front matter at the start of its own body. Canonical export leaves
exactly one blank line after every container opening fence and before its
closing fence; import tolerates zero or more blank lines so manually authored
directives remain usable.

Native Markdown wins in every profile whenever it carries the user-facing
meaning. Images stay `![]()`, Divider stays a thematic break, Mermaid stays a
fenced code block, and Video/Audio/Attachment/bookmark/iframe cards stay normal
links with a minimal `blockcraft:<type>` title hint. These forms render in other
Markdown tools and remain easy for AI to interpret. Presentation-only fields
such as dimensions, placement, colors, preview payloads and toolbar state are
allowed to degrade; do not serialize them into an opaque `props=` payload just
to claim a lossless Markdown round trip.

Do not manufacture an HTTP hyperlink solely to hide an internal identity.
Mention is the bounded exception because its identity is its core semantic
contract: it exports as
`[@label](urn:blockcraft:mention:<type>:<id> "blockcraft:mention")`, with each
URN component percent-encoded. The built-in Mention matcher recognizes that
URN with or without the title and rebuilds the Mention Embed; a missing ID
degrades to plain `@label`. An inline Date still exports as formatted date text.
A host that owns a genuine user/profile or calendar URL may replace this with a
domain adapter. Inline images are images (`![alt](url)`), not links.

Directives are reserved for semantic custom structures such as Callout,
Columns, Frame, Render Unit, Text Box and Object Group, where flattening would
erase the authored container relationship. Shape and Word Art may also use a
container directive because their text belongs to a typed visual object.
`createGenericBlockAdapterContribution()` and
`createGenericMarkdownBlockMatcher()` therefore require the explicit
`markdownDirective: true` option before the `hybrid` or `blockcraft` profile
emits a directive; omission keeps the readable portable fallback in every
profile.
Import accepts either leaf or container form for registered block-level
directives where structurally valid. YAML properties use the bounded,
prototype-safe codec; URL-like fields reject active-content schemes. Do not
invent raw HTML or execute decoded metadata.

Use native Markdown whenever it already has an unambiguous representation.
For example, the Mermaid Block imports and exports a standard fenced code block
whose language info string is `mermaid` in every profile; it does not use a
private directive. Its `mermaid-textarea` child is the source payload and is
consumed with the parent, so it must not be emitted as a second paragraph or
directive. Import also tolerates the common transposition `mermiad`, but export
always canonicalizes the language back to `mermaid`.

The standalone Markdown Stream Viewer uses the same `MarkdownAdapter` and
`AdapterRegistry`; it has no second Markdown grammar or source-window planner.
On each coalesced render it sends the complete accumulated source through that
adapter exactly once. This is important for multiline/nested container
directives, tilde or long backtick fences, and host-defined fenced matchers:
adding a contribution must not require a Stream-specific parser branch. The
streamed snapshot is therefore the same semantic result as parsing the current
complete source once with the same registry/profile, ignoring generated IDs and
meta.

### Resource side-effect boundary

HTML/Markdown AST matching must not fetch, decode, upload, or rehost remote
resources. A resource matcher synchronously creates a snapshot with the
validated source URL and enough persisted geometry for a stable frame. The
mounted Block or Snapshot Viewer then owns browser loading, loading/error/retry
UI, intrinsic-size backfill, and any host-specific post-insert workflow. This
keeps one-shot import and Markdown Stream parsing deterministic and prevents a
slow or failed resource from delaying or deleting unrelated parsed content.

The built-in Image Block matchers follow the same rule as direct file paste: an
ordinary HTML `<img>` or Markdown image produces the Image snapshot immediately.
Direct file paste may first use a local Object URL so the block is visible while
its component uploads; ordinary adapter input keeps its original safe relative,
`http:`, `https:`, `blob:` or image `data:` source and is not silently
copied into host storage. Active-content and non-image data schemes are rejected.
If a host requires rehosting, schedule it after insertion at the Clipboard or
application boundary and write the result through DocCRUD/Yjs. Do not perform
that side effect from `toBlockSnapshot`.

An unregistered Inline Embed must never crash an entire export or silently
vanish. The core Delta converter degrades it to its primitive value when that
is readable, otherwise to a visible `[embed-key]` marker. This fallback is not
lossless: importing the marker produces text. Register the same-key Inline
Embed contribution when round-trip reconstruction is required.

## Media Blocks: Recommended Mapping

- **HTML export**: `video` / `audio` blocks should emit native media tags. Wrapping them in `<figure>` is recommended so generic paragraph matchers don't accidentally flatten them as inline content.
- **HTML import**: Prefer reading `src` from the media element first, then fall back to the first `<source>` child. Preserve useful metadata through `data-*` attributes such as `data-source-type`, `data-name`, `data-size`, `data-type`.
- **Markdown export (every profile)**: Markdown has no stable native media element syntax. Export media blocks as links and add a lightweight title hint, for example `[Clip](https://cdn.example.com/demo.mp4 "blockcraft:video")`. Keep poster, dimensions and other presentation props out of the Markdown source.
- **Markdown import**: Recognize registered leaf/container directives and the media hint title first. If there is no hint, fall back to URL heuristics such as common media extensions or known video platform hosts.
- **Paragraph matcher interaction**: If your markdown/html paragraph matcher also accepts raw `html`, `div`, or `paragraph` nodes, explicitly exclude media-only nodes so both matchers do not consume the same source node.

Responsive object blocks preserve placement-plane-relative sizing in HTML with
`data-bc-wr` and `data-bc-ar`; CSS `width`/`aspect-ratio` is emitted for
portable display:

```html
<video
  src="https://cdn.example.com/demo.mp4"
  data-bc-wr="60"
  data-bc-ar="1.7777777778"
  style="width: 60%; aspect-ratio: 1.7777777778"></video>
```

Import prefers valid `data-bc-wr/data-bc-ar`, then falls back to legacy
`width/height` or `data-width`. Standard Markdown does not gain private size
syntax; an imported Markdown image therefore uses its Schema defaults.

## Render Unit Surface Mapping

The built-in `render-unit` matcher uses
`<section data-bc-block="render-unit">` as a surface-preserving HTML container. Its
children remain ordinary nested block elements. Optional shell colors use
`data-bc-back-color` / `data-bc-border-color`; surface data uses compact keys
that map one-to-one to persisted props:

- `data-bc-p`, containing one to four space-separated numeric values;
- `data-bc-bgi` and `data-bc-bgs`. A text-box `bgi` holding a `bc:<id>` artwork
  reference is **expanded** into its inline SVG on export so the HTML stands on
  its own in whatever opens it, and **collapsed** back to the reference on
  import — otherwise a round trip would leave the expanded copy in the document,
  which is exactly what the reference exists to keep out of snapshots;
- `data-bc-bgx/bgy/bgo`.

Import passes all fields through `normalizeRenderUnitBlockProps()`, which also
applies the shared bounded surface normalizer and rejects active script URL
schemes. Raw inline `background` CSS is neither emitted nor trusted. Register
this matcher before generic paragraph-like containers so its children attach
to the open region snapshot.

Standard Markdown has no portable container-surface syntax. The `portable`
profile therefore walks through the region and preserves readable child blocks
while dropping padding, colors and the background image. The default `hybrid`
and `blockcraft` profiles preserve the registered `render-unit` envelope with a
container directive. Internal BlockCraft snapshot copy/paste remains lossless.

## Object Group Mapping

The built-in `object-group` matcher uses
`<figure data-bc-block="object-group">` as a lossless HTML envelope. Fixed
group geometry is stored in `data-object-group-width/height`; root placement is
stored in `data-object-group-placement-mode/x/y/layer`. Its nested object
elements retain their native sizing fields and local `position` values, so a
ratio-sized image keeps `wr/ar` relative to the fixed group width.

Import rejects nested groups and infrastructure children, then restores the
surviving direct objects under one `object-group` snapshot. Register this
matcher before the image, shape, text-box and WordArt matchers so their output
attaches to the open group. The `portable` profile intentionally walks through
the container and keeps only the children’s readable degradation; `hybrid` and
`blockcraft` retain the registered container directive.

## Text Box Mapping

The built-in `text-box` matcher uses
`<figure data-bc-block="text-box">` as a lossless HTML envelope. Unified object
format is carried by bounded semantic `data-bc-object-*` attributes for width,
height, rotation, lock ratio, shape, fill, outline, effects, text frame and text style.
attributes. Structured attributes contain the compact primitive record encoded
as JSON only because HTML attributes are strings; importing them restores the
record directly rather than writing a JSON string into Yjs. Built-in catalog
artwork uses the separate `data-bc-object-artwork` attribute and is collapsed back to
its `bc:<id>` reference. Absolute placement remains on the same element with
the text-box placement mode/x/y/layer attributes. Preset IDs never enter HTML
or Snapshot data.

Ordinary paragraph/list/blockquote elements stay nested inside the figure.
Import opens the text-box snapshot before walking those children and restores a
default paragraph only when none survive. All external surface, geometry,
Shape and WordArt values pass through the shared normalizers; unsupported
line/connectors fall back to a rectangle and oversized/malformed object-format
metadata is discarded. Inline `background` CSS is not trusted as model data. Register
this matcher before the generic paragraph-like matchers.

In Markdown, `portable` flattens the Text Box into its readable paragraphs and
lists. The default `hybrid` and `blockcraft` profiles emit
`:::bc-text-box ... :::`, preserving the custom container while leaving its
body as ordinary Markdown and its parameters in the leading YAML front matter.

Standard Markdown intentionally emits only the readable child blocks. It drops
fixed geometry, placement and surface appearance, and Markdown import never
guesses a text box from ordinary prose. Internal Snapshot and HTML paths remain
lossless.

## Typography Mapping

HTML round-trips document root `ff/fs/lh`, editable paragraph
`pfs/lh/psb/psa`, and inline `t:ff/t:fs/t:ls` through bounded
`data-bc-*` fields plus portable CSS. Paragraph fields map to
`data-bc-pfs/lh/sb/sa` and relative `font-size`, `line-height`,
`margin-top/bottom`. `pfs` accepts only bounded `em`/percent relative values;
it is not inferred from an absolute font size. Paragraph spacing is
stored as typographic points;
plain external `px` values import through the standard `0.75pt/px` conversion.
Paragraph padding and `text-indent` are not imported as BlockCraft typography.
Import accepts only the shared font catalog (or supported safe legacy stacks),
relative inline `em` values and bounded numeric root/block values. Raw arbitrary
CSS properties and expressions such as `url()`, `var()`, `calc()` or
`expression()` are ignored. Legacy `s:fontFamily`, `s:fontSize` and
`s:letterSpacing` export read-compatibly and normalize to compact semantic keys
on supported HTML import. Standard Markdown intentionally drops typography.

## Ordered Marker Mapping

Ordered blocks persist the compact semantic `ms` field, not generated marker
text. HTML does not emit a private marker-style attribute. The five styles with
a native equivalent split `<ol>` groups as needed and emit
`type="1|a|A|i|I"`; import maps those standard values back to `ms`. The other
seven presets intentionally degrade to ordinary HTML numbering. Standard
Markdown likewise has no marker-style syntax and emits ordinary `1.` numbering.

## Shape Block Mapping

`placement-layout` is a BlockCraft-internal snapshot container. HTML/Markdown
walkers deliberately do not emit a visible wrapper for it; they continue into
its children. HTML therefore preserves an equivalent recoverable structure on
the object itself:

- image blocks emit `<figure data-bc-block="image">` with
  `data-image-placement-mode/x/y/layer`;
- shape blocks keep the placement fields described below;
- importing those objects produces root-level absolute snapshots, and
  `BlockPlacementManager` normalizes them below the root layout when the
  document initializes.

Markdown has no portable absolute-layout primitive and continues to use the
existing readable degradation. Internal BlockCraft snapshot copy/paste retains
the complete `placement-layout` subtree.

The built-in `shape` matcher uses
`<figure data-bc-block="shape">` as a lossless HTML envelope. Shape type,
dimensions, fill, outline, text styling and absolute placement are stored in
`data-shape-*` attributes. Rotation is stored in
`data-shape-rotation="<degrees>"`; the collaborative child deltas are
serialized inside `<div data-bc-shape-text>`. Empty shapes omit that element,
and HTML import keeps them childless; non-empty text creates the single
`shape-text` child. Import passes untrusted attributes, including rotation,
through `normalizeShapeProps()` before creating the snapshot.

All 103 built-in `ShapeKind` values use this same envelope. Category metadata,
SVG geometry and detail paths are catalog-owned and are not serialized. Open
line/connector appearances therefore round-trip through `data-shape-type` just
like closed shapes while their non-filled/no-text behavior is recovered from
`SHAPE_DEFINITIONS`.

Markdown has no portable shape primitive. The `portable` profile degrades a
shape to one readable paragraph built from its `shape-text` deltas. `hybrid`
and `blockcraft` use a registered `:::bc-shape` container so the visual-object
identity survives while the body stays readable.

## WordArt Block Mapping

The built-in editable `word-art` matcher uses
`<figure data-bc-block="word-art">`. Its direct plain-text deltas live in
`<div data-bc-word-art-text>`; dimensions, typography, fill, gradient arrays,
outline, shadow, safe effect and absolute placement are stored in bounded
`data-word-art-*` attributes. Export also emits sanitized inline presentation
CSS so the HTML remains visually useful without BlockCraft themes.

HTML import ignores raw presentation CSS and rebuilds props only from the
allowlisted data attributes through `normalizeWordArtProps()`. Inline
formatting and embeds are stripped because WordArt styling is whole-block and
the Schema is `plainTextOnly`. Markdown has no portable WordArt primitive, so
`portable` produces a readable paragraph; `hybrid` and `blockcraft` use the
registered `:::bc-word-art` container.

The same allowlist now covers 16 built-in presets, 10 font IDs and 15 safe
effect IDs; raw CSS is still neither persisted nor accepted during import.

Inline `shape` and `word-art` representations use a separate lossless HTML
envelope: `<span data-bc-inline-object="shape|word-art">`. The payload remains
the primitive JSON string stored in the Embed, while `width/height` and
optional square-wrap fields are emitted as bounded `data-bc-*` attributes.
Import normalizes the payload through the matching `read/createInline*Delta`
helpers. Markdown cannot reconstruct object presentation and emits only the
embedded shape/WordArt text as ordinary inline text.

## Checklist

- [ ] `toMatch` correctly identifies the source AST node type
- [ ] `fromMatch` correctly identifies the block flavour
- [ ] `toBlockSnapshot` produces valid `IBlockSnapshot` with correct `flavour`, `nodeType`, `props`
- [ ] `fromBlockSnapshot` produces valid AST nodes (HAST for HTML, MDAST for Markdown)
- [ ] For editable blocks: inline content converted via `deltaConverter`
- [ ] `skipAllChildren()` called when children are consumed by deltaConverter
- [ ] `openNode`/`closeNode` are properly balanced (enter opens, leave closes)
- [ ] Resource matchers create snapshots without network or storage side effects
- [ ] Matcher and contribution exported from the owning `adapter/index.ts`

## Reference: Real Matcher Examples

| Block | HTML Matcher | Markdown Matcher |
|-------|-------------|-----------------|
| Divider | `blocks/divider-block/adapter/html.ts` | `blocks/divider-block/adapter/markdown.ts` |
| Paragraph | `blocks/paragraph-block/adapter/html.ts` | `blocks/paragraph-block/adapter/markdown.ts` |
| Image | `blocks/image-block/adapter/html.ts` | `blocks/image-block/adapter/markdown.ts` |
| Code | `blocks/code-block/adapter/html.ts` | `blocks/code-block/adapter/markdown.ts` |
| Video / Audio | `blocks/video-block/adapter/html.ts` | `blocks/video-block/adapter/markdown.ts` |
| Shape | `blocks/shape-block/adapter/html.ts` | `blocks/shape-block/adapter/markdown.ts` |
| Text box | `blocks/text-box-block/adapter/html.ts` | `blocks/text-box-block/adapter/index.ts` |
| WordArt | `blocks/word-art-block/adapter/html.ts` | `blocks/word-art-block/adapter/markdown.ts` |

## 有道云笔记 `text/yne-json` 剪贴板适配器

有道云笔记复制时在剪贴板写入高保真私有格式 `text/yne-json`（结构化块数组）+ `text/yne-image-json`（图片 URL→base64）。`framework/modules/clipboard/adapters/yne/` 把它直接翻译成 `BlockSnapshot`，绕过有损的 HTML。

- **入口**：`parseYneClipboard(state, doc): IBlockSnapshot | null`（`framework/modules/clipboard/adapters/yne/index.ts`）。
- **优先级**：`ClipboardManager.onPaste` 中位于 internal snapshot 之后、`text/html` 之前；解析失败/未知块返回 `null` → 回退 HTML。
- **与 html/markdown adapter 的区别**：yne-json 是纯 JSON，不走 unified/rehype/remark + `ASTWalker`，因此独立成模块，不接入 `doc.adapter` 统一管线。
- **图片**：base64 → `File` → `fileService.createObjectURL` → image block 自动上传。
- **附件**：先用有道云 URL 建块，插入后 `rehostYneAttachments` 异步 fetch 重传（best-effort，CORS/鉴权失败则保留原 URL）。
- **样式映射**：`bold/italic/strike → a:*`，`color/back-color/font-size → s:color/s:background/s:fontSize`；标题丢弃冗余 font-size。

### 有道云 HTML `data-content` 路径（Tauri/WKWebView 必需）

WKWebView（Tauri）及部分浏览器会从 `paste` 事件里**剥离自定义剪贴板 MIME**（`text/yne-json` / `text/yne-image-json`），只留 `text/html`——此时上面的 `text/yne-json` 分支拿不到数据，会回退到有损 HTML（附件变图片、行内 CSS 样式丢失）。但完整高保真结构仍嵌在 HTML 里的 `<article data-content="…bulb JSON…">`（HTML 属性，不会被剥离），图片字节也在可见 `<img data-media-type="image" src="data:…">` 中。

- **入口**：`parseYoudaoHtml(html, fileService): IBlockSnapshot | null`（`framework/modules/clipboard/adapters/yne/youdao-html.ts`）；用 `isYoudaoHtml(html)` 先做 marker 预判。
- **位置（关键）**：解析由 **`ClipboardManager` 在通用 `HtmlAdapter` 之前短路**。YNE 是剪贴板来源格式而不是通用 HTML 方言，因此其识别、资源重传和回退顺序都留在 Clipboard 边界；普通 `HtmlAdapter` 不依赖任何外部应用格式。
- **格式**：bulb 格式（`{name, data, nodes:[{type:'text', leaves:[{text, marks}]}]}`），见 `bulb-converter.ts`。marks 映射：`bold/italic/delete/underline → a:*`，`color/backgroundColor → s:color/s:background`，`fontSize → s:fontSize`。
- **表格**：bulb 表格是嵌套（table>row>cell，省略被合并格），转换时按 colSpan/rowSpan 重建网格并补 `display:'none'` 占位格。
- **图片**：从可见 `<img data:base64>` 按文档顺序取字节（`text/yne-image-json` 被剥离时的唯一字节来源）→ `fileService.createObjectURL` → image block 自动上传。
- **代码 / 图表**：bulb `code`/`diagram` 把每行包成 `code-line` 子块（`type:'block'`，文本在其子节点里），转换时下钻 `code-line` 并以 `\n` 连接；语言经 `mapLang` 大小写不敏感解析到 `CodeBlockLanguage`，无匹配（如 PlantUML/Mermaid）回退 `PlainText`。`diagram` 无原生对应，按代码块保留源码。
- **未知块容错**：单个不认识的 bulb 块**不会**中断整篇解析——降级为保留其文本的段落（无文本则丢弃），而非抛错。整篇回退到有损 HTML 仅用于真正无法解析的 payload（无 `<article>` / JSON 损坏）。
- **附件重传（关键拆分）**：附件的异步 fetch 重传是**插入后、协同敏感**的副作用，不在 adapter 里做。两条有道云路径都用 `buildAttachmentSnapshot` 在 attachment snapshot 的 `meta` 上打**临时重传标记**；`clipboard.ts` 在插入/克隆前用 `collectAndStripRehostMarkers` 统一**收集并剥离**标记（绝不写进 Yjs、不同步给协同端），插入后再 `rehostYneAttachments` 异步重传（只有本地粘贴者做）。
