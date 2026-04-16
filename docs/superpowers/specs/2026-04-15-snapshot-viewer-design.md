# Snapshot Viewer Design

Date: 2026-04-15
Status: proposed and user-approved in chat
Scope: new standalone snapshot-viewer subsystem alongside `packages/editor/framework/` and an Angular wrapper for host usage

## Goal

Add a new rendering path that can display BlockCraft block snapshots as fast as possible without creating editor runtime state.

The new path should:

- accept a root `IBlockSnapshot` or `IBlockSnapshot[]`
- render all supported blocks in a readable, stable way without editor interaction
- stay visually close to the current readonly block appearance
- allow remote resources to load so media and embeds can progressively approach the real rendered result
- remain fully independent from the existing editor runtime

## Non-goals

- Do not reuse `BlockCraftDoc`, `DocPlugin`, `SelectionManager`, `InputTransformer`, `DocChain`, or Yjs runtime objects.
- Do not make the viewer editable, selectable, collaborative, or undoable.
- Do not require DOM parity with existing editor internals when simpler DOM can achieve the same readonly visual result.
- Do not block first paint on heavy resources such as iframe embeds, mermaid rendering, formula layout, or remote preview fetches.
- Do not introduce a viewer-only snapshot format.

## Problem Summary

The current editor rendering path is designed for interactive editing. Even readonly rendering still sits inside the editor architecture: block components, inline runtime, selection rules, plugins, and document lifecycle.

That path is too heavy for the new use case: quickly rendering a block snapshot for display-only scenarios such as previews, feeds, side panels, or lightweight host pages.

The new feature therefore needs a separate rendering subsystem that shares snapshot contracts and visual language, but not editor runtime behavior.

## Approaches Considered

### A. Reuse existing readonly block components

Create a stripped-down fake doc/runtime and mount existing block components in readonly mode.

Pros:
- highest theoretical visual parity

Cons:
- still carries editor lifecycle and inline rendering cost
- hard to keep minimal and independent
- contradicts the requirement that the new core be fully separate from existing internals

### B. New standalone snapshot renderer

Build a dedicated snapshot-to-DOM rendering engine with its own block registry and async enhancers.

Pros:
- cleanest performance model
- truly independent architecture
- easiest to use in non-editor contexts later
- easiest to optimize for first paint and incremental patching

Cons:
- requires dedicated renderers for each block flavour
- some visual logic must be re-expressed instead of inherited

### C. Hybrid fallback model

Prefer the new renderer but temporarily fallback to existing readonly components for unfinished block types.

Pros:
- phased rollout is easier at first

Cons:
- mixed runtime model
- unclear performance expectations
- risks permanent architectural debt

## Recommended Approach

Use approach B: build a new standalone snapshot-viewer subsystem and keep it fully separate from the existing editor runtime.

The viewer should share only:

- snapshot type contracts
- stable block flavour names
- theme tokens and readonly visual conventions
- pure helper utilities when they are runtime-independent

It should not depend on the current editor execution model.

## Proposed Architecture

### Subsystem boundaries

Create a new subsystem tentatively named `snapshot-viewer`.

It should live beside existing editor internals rather than inside them. The implementation should avoid importing editor runtime classes such as:

- `BlockCraftDoc`
- `BaseBlockComponent`
- `EditableBlockComponent`
- `DocPlugin`
- `InlineRuntime`
- selection, input, event, and Yjs services

The subsystem has one responsibility: render snapshot content for display.

### Layers

1. `SnapshotRenderEngine`
   - framework-agnostic core
   - renders snapshot trees into DOM
   - computes incremental updates
   - owns async enhancement lifecycle

2. `renderer registry`
   - maps `flavour` to a dedicated static renderer
   - each renderer knows how to synchronously create DOM and optionally register async enhancement

3. `resource/enhancer layer`
   - loads remote or expensive content after initial paint
   - handles cancellation, caching, and stale-result protection

4. `SnapshotViewerComponent`
   - Angular wrapper only
   - owns container lifecycle and input binding
   - delegates actual rendering to the engine

## Rendering Model

### Two-phase rendering

The viewer should use a two-phase model.

#### Phase 1: synchronous static render

Immediately render a stable DOM tree from snapshot data only.

Goals:
- fast first paint
- complete document structure
- no dependency on editor runtime
- no blocking on remote requests

#### Phase 2: async enhancement

After static render completes, selected blocks may enhance themselves asynchronously.

Examples:
- `image` loads the real image source
- `video` and `audio` attach media elements or metadata-driven UI
- `formula` renders formatted output
- `mermaid` renders SVG
- `bookmark` fetches or resolves preview data
- `figmaEmbed` and `juejinEmbed` mount richer preview/iframe content when allowed

If enhancement fails, the static placeholder remains visible and the rest of the document stays intact.

## Block Rendering Strategy

### Structural blocks

Blocks such as `root`, `columns`, `column`, `callout`, `frame`, `table`, `table-row`, and `table-cell` should render synchronously from the snapshot tree.

These renderers focus on:
- layout structure
- nesting
- spacing
- borders and background treatment
- readonly visual parity

### Textual blocks

Blocks such as `paragraph`, `bullet`, `ordered`, `todo`, `blockquote`, `caption`, `code`, and `mermaid-textarea` should use a viewer-owned readonly inline renderer.

The viewer must not rely on the current editable inline runtime.

Instead it should translate snapshot inline content directly into readonly DOM spans, marks, and inline embeds.

Specific notes:
- `todo` shows checked state but is not clickable
- `ordered` and `bullet` compute/display readonly list markers
- `code` renders plain readonly code immediately; syntax highlight can be an optional enhancement if needed later

### Media blocks

Blocks such as `image`, `video`, `audio`, `formula`, and `mermaid` should render a stable shell synchronously and enhance later.

The shell should preserve width, aspect, label, or placeholder space as much as snapshot data allows so the layout does not shift excessively when enhancement finishes.

### Embed and preview blocks

Blocks such as `bookmark`, `figmaEmbed`, `juejinEmbed`, and iframe-style embed blocks should render a readonly card shell first.

If snapshot data already contains enough content for display, show it immediately. Otherwise the viewer may fetch or mount richer content after first paint.

For iframe-like content, use a resource policy that can defer actual iframe mounting until visible.

## Update and Diff Model

The new core should be DOM-first rather than Angular-first.

The engine keeps a lightweight internal tree with:
- block `id`
- `flavour`
- `nodeType`
- normalized `props`
- child references
- mounted DOM references
- enhancer state handles

### Initial render

`render(container, snapshot)` builds the full DOM tree directly from the snapshot and attaches it to the provided container.

### Incremental update

`update(nextSnapshot)` performs tree patching keyed by block `id`.

Rules:
- same `id`, same `flavour`, same `nodeType`: patch props and children in place
- same `id`, changed `flavour` or `nodeType`: replace that subtree
- child collections diff by `id` to minimize DOM inserts, moves, and removals
- enhancer tasks are reused only when their resource key is unchanged

This keeps updates local when only a small part of the snapshot changes.

## Public API Shape

### Core API

Keep the core API minimal:

```ts
const renderer = createSnapshotRenderer(options)
renderer.render(container, snapshot)
renderer.update(snapshot)
renderer.destroy()
```

### Angular wrapper

Provide a simple host component:

```html
<bc-snapshot-viewer [snapshot]="snapshot" [options]="viewerOptions"></bc-snapshot-viewer>
```

### Initial options

Start with a small surface area:
- `themeClass`
- `baseUrl`
- `resourcePolicy` (`eager | visible | off`)
- `enhancers`
- `placeholderPolicy`

Avoid editor-like callbacks in the first version so the viewer remains display-only.

## Delivery Scope

### Level 1: complete display coverage

Every registered block type should render without crashing or disappearing.

This includes:
- `root`
- `paragraph`
- `ordered`
- `bullet`
- `todo`
- `callout`
- `code`
- `divider`
- `image`
- `table`
- `table-row`
- `table-cell`
- `attachment`
- `bookmark`
- `figmaEmbed`
- `juejinEmbed`
- `caption`
- `mermaid-textarea`
- `mermaid`
- `blockquote`
- `columns`
- `column`
- `formula`
- `video`
- `audio`
- `frame`

### Level 2: higher-fidelity readonly parity

Prioritize readonly visual parity for the most common and user-visible blocks first:
- `paragraph`
- `bullet`
- `ordered`
- `todo`
- `callout`
- `image`
- `table`
- `code`
- `bookmark`
- `blockquote`
- `caption`

Heavy blocks such as `formula`, `mermaid`, and iframe embeds may first ship as strong shells plus async enhancement.

## Compatibility Principles

- Input remains the existing `IBlockSnapshot` contract.
- The viewer should be tolerant of incomplete or older snapshot data where possible.
- A single block render failure must not break the whole document.
- Visual consistency should come from shared tokens and readonly styling conventions, not shared component instances.

## Performance Principles

- First paint is driven by synchronous snapshot-to-DOM conversion only.
- No editor runtime initialization is allowed on the hot path.
- Remote resources must not block initial structure render.
- Updates should patch only changed subtrees.
- Expensive enhancers should support caching and cancellation.
- Default behavior for iframe-like content should avoid mounting everything eagerly when many embeds are present.

## Validation Plan

### Unit coverage

- each block renderer produces the expected DOM structure for representative snapshots
- inline readonly renderer covers text marks and inline embeds used by snapshot content
- update logic patches existing DOM instead of full replacement when ids are stable

### Snapshot/fixture coverage

- maintain a fixture document containing all supported block types
- verify the viewer can render that fixture end-to-end
- add HTML or DOM snapshot assertions for stable representative cases

### Visual comparison

Compare viewer output against current readonly editor output for common content:
- paragraph and heading-like paragraph styles
- list blocks
- callout
- table
- image
- code
- bookmark
- blockquote

### Performance comparison

For the same snapshot, compare the new viewer path against the current readonly editor path and confirm the viewer is lighter on startup and more suitable for display-only scenarios.

## Risks

### Inline fidelity risk

The current inline rendering path contains logic that the new viewer intentionally does not reuse. Reaching full readonly parity for complex inline content may require extracting or re-implementing a compact readonly inline formatter.

### Style drift risk

If viewer-specific DOM diverges too far from current readonly styling assumptions, visual parity may drift over time. The implementation should therefore anchor on shared class naming and theme tokens where practical.

### Heavy block consistency risk

Mermaid, formula, bookmark preview, and iframe embeds may each need separate enhancement lifecycles. Without a common enhancer contract, the system can become fragmented.

## Follow-up Implications

If implementation introduces new public viewer APIs under `packages/editor/`, the related BlockCraft ai-skills docs and `packages/editor/ai-skills/MIGRATIONS.md` should be updated as part of the implementation PR because this is a new external rendering capability.
