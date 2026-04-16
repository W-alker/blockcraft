# Snapshot Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `snapshot-viewer` subsystem that renders BlockCraft `IBlockSnapshot` trees quickly for display-only scenarios, plus an Angular wrapper component for host apps.

**Architecture:** Add a new DOM-first renderer under `packages/editor/snapshot-viewer/` that owns block registry, tree diffing, and async resource enhancement without importing editor runtime classes. Wrap that renderer with a lightweight Angular component under `packages/editor/components/snapshot-viewer/`, reuse readonly theme tokens/class naming where practical, and keep existing editor code changes limited to public exports, theme entrypoints, and docs.

**Tech Stack:** TypeScript, Angular 20 standalone components, Karma/Jasmine unit tests, BlockCraft snapshot contracts, SCSS theme tokens

---

## Planned File Structure

### New files

- `packages/editor/snapshot-viewer/index.ts` — public barrel for the standalone viewer subsystem
- `packages/editor/snapshot-viewer/types.ts` — public viewer options, renderer contracts, enhancer contracts, internal normalized block shape
- `packages/editor/snapshot-viewer/create-snapshot-renderer.ts` — public factory for `SnapshotRenderEngine`
- `packages/editor/snapshot-viewer/snapshot-render-engine.ts` — stateful `render/update/destroy` orchestration
- `packages/editor/snapshot-viewer/registry.ts` — builtin flavour-to-renderer registry
- `packages/editor/snapshot-viewer/dom/create-block-shell.ts` — common DOM helpers for block root creation/class/data attrs
- `packages/editor/snapshot-viewer/dom/patch-children.ts` — keyed child diff helpers by block id
- `packages/editor/snapshot-viewer/dom/normalize-snapshot.ts` — root wrapping and snapshot normalization helpers
- `packages/editor/snapshot-viewer/inline/render-inline.ts` — readonly inline delta to DOM fragment rendering
- `packages/editor/snapshot-viewer/renderers/structural-renderers.ts` — root, columns, column, callout, frame, table, table-row, table-cell, divider shells
- `packages/editor/snapshot-viewer/renderers/text-renderers.ts` — paragraph, bullet, ordered, todo, blockquote, caption, code, mermaid-textarea renderers
- `packages/editor/snapshot-viewer/renderers/media-renderers.ts` — image, audio, video, attachment, formula, mermaid shells
- `packages/editor/snapshot-viewer/renderers/embed-renderers.ts` — bookmark, figmaEmbed, juejinEmbed, iframe-style card shells
- `packages/editor/snapshot-viewer/enhancers/index.ts` — enhancer registration helpers
- `packages/editor/snapshot-viewer/enhancers/image-enhancer.ts` — image loading lifecycle
- `packages/editor/snapshot-viewer/enhancers/media-enhancer.ts` — audio/video enhancement helpers
- `packages/editor/snapshot-viewer/enhancers/bookmark-enhancer.ts` — bookmark preview fetch/update contract
- `packages/editor/snapshot-viewer/enhancers/formula-enhancer.ts` — formula output enhancement contract
- `packages/editor/snapshot-viewer/enhancers/mermaid-enhancer.ts` — mermaid SVG enhancement contract
- `packages/editor/snapshot-viewer/testing/fixtures/all-blocks.fixture.ts` — one representative snapshot tree covering all supported block flavours
- `packages/editor/snapshot-viewer/testing/fixtures/inline.fixture.ts` — inline delta fixtures for marks/links/embeds
- `packages/editor/snapshot-viewer/render-engine.spec.ts` — smoke, diff, and fixture coverage for the standalone engine
- `packages/editor/snapshot-viewer/inline/render-inline.spec.ts` — readonly inline renderer tests
- `packages/editor/snapshot-viewer/renderers/renderers.spec.ts` — structural/text/media/embed renderer behavior tests
- `packages/editor/components/snapshot-viewer/snapshot-viewer.component.ts` — Angular wrapper component
- `packages/editor/components/snapshot-viewer/index.ts` — wrapper barrel
- `packages/editor/components/snapshot-viewer/snapshot-viewer.component.spec.ts` — Angular wrapper integration test
- `packages/editor/themes/components/snapshot-viewer.scss` — viewer-specific shell/layout rules that complement existing readonly block styles

### Existing files to modify

- `packages/editor/components/index.ts` — export the wrapper component
- `packages/editor/index.ts` — export the standalone viewer package surface
- `packages/editor/themes/base.scss` — import `components/snapshot-viewer.scss`
- `packages/editor/ai-skills/blockcraft.md` — advertise the new public capability and route to the host-app doc
- `packages/editor/ai-skills/blockcraft-app.md` — document Angular usage for `<bc-snapshot-viewer>` and standalone renderer creation
- `packages/editor/ai-skills/blockcraft-theme.md` — document viewer styling/token expectations if new public classes/tokens are added
- `packages/editor/ai-skills/MIGRATIONS.md` — add a new entry for the viewer API because this is a new external capability under `packages/editor/`

### Files to reference, not modify unless required

- `packages/editor/framework/block-std/types/block.type.ts` — canonical `IBlockSnapshot` contract
- `packages/editor/framework/block-std/types/inline.type.ts` — inline attributes shape
- `packages/editor/framework/block-std/types/delta.type.ts` — delta insert shape
- `packages/editor/blocks/*/index.ts` — snapshot prop conventions per flavour
- `packages/editor/themes/blocks/*.scss` — readonly class naming and visual parity targets

### Boundary guardrails

- The new subsystem may import snapshot/delta/types and pure helpers only.
- The new subsystem must not import `BlockCraftDoc`, `BaseBlockComponent`, `EditableBlockComponent`, `DocPlugin`, `InlineRuntime`, Yjs services, or selection/input/event runtime modules.
- If any existing function, class, or method ends up needing modification during execution, run GitNexus impact analysis on that symbol first per repo policy before editing it.

---

### Task 1: Confirm blast radius and lock the standalone file layout

**Files:**
- Reference: `packages/editor/index.ts`
- Reference: `packages/editor/components/index.ts`
- Reference: `packages/editor/framework/block-std/types/block.type.ts`
- Reference: `packages/editor/themes/base.scss`
- Create: `docs/superpowers/plans/2026-04-15-snapshot-viewer.md`

- [ ] **Step 1: Inspect current public exports and snapshot contracts**

Run:
```bash
sed -n '1,160p' packages/editor/index.ts
sed -n '1,160p' packages/editor/components/index.ts
sed -n '1,220p' packages/editor/framework/block-std/types/block.type.ts
```
Expected: root exports are barrel-based, and `IBlockSnapshot` is the stable contract the new subsystem should consume without introducing a new snapshot shape.

- [ ] **Step 2: Confirm theme entrypoints and readonly visual anchors**

Run:
```bash
sed -n '1,220p' packages/editor/themes/base.scss
find packages/editor/themes/blocks -maxdepth 1 -type f | sort
```
Expected: `base.scss` is the correct import point for any viewer-specific SCSS, and existing block styles reveal the class names worth matching for readonly parity.

- [ ] **Step 3: Record the manual blast radius before coding**

Expected conclusion:
- new implementation is mostly isolated to a new `packages/editor/snapshot-viewer/` tree
- shared public entrypoints are `packages/editor/index.ts` and `packages/editor/components/index.ts`
- shared docs/theme touchpoints are `packages/editor/themes/base.scss` and `packages/editor/ai-skills/*`
- existing editor runtime files should remain untouched unless a later task proves a pure helper extraction is necessary

### Task 2: Scaffold the standalone renderer API and first smoke test

**Files:**
- Create: `packages/editor/snapshot-viewer/index.ts`
- Create: `packages/editor/snapshot-viewer/types.ts`
- Create: `packages/editor/snapshot-viewer/create-snapshot-renderer.ts`
- Create: `packages/editor/snapshot-viewer/snapshot-render-engine.ts`
- Create: `packages/editor/snapshot-viewer/dom/normalize-snapshot.ts`
- Create: `packages/editor/snapshot-viewer/testing/fixtures/all-blocks.fixture.ts`
- Create: `packages/editor/snapshot-viewer/render-engine.spec.ts`

- [ ] **Step 1: Write the failing smoke test for `createSnapshotRenderer()`**

Add a spec that proves the public core API exists and can synchronously render a root snapshot with a paragraph child.

```ts
describe('SnapshotRenderEngine', () => {
  it('renders a root snapshot into a host container', () => {
    const host = document.createElement('div')
    const renderer = createSnapshotRenderer()
    const snapshot = createAllBlocksFixture().minimalParagraphDoc

    renderer.render(host, snapshot)

    expect(host.querySelector('[data-block-id="paragraph-1"]')).not.toBeNull()
    expect(host.textContent).toContain('hello snapshot viewer')
  })
})
```

- [ ] **Step 2: Run the targeted test to capture the initial failure**

Run:
```bash
pnpm exec ng test editor --watch=false --browsers=ChromeHeadless --include='packages/editor/snapshot-viewer/render-engine.spec.ts'
```
Expected: FAIL because the new viewer files and exports do not exist yet.

- [ ] **Step 3: Add the minimal public API and engine skeleton**

Create the first pass of the public types and factory.

```ts
export interface SnapshotRenderer {
  render(container: HTMLElement, snapshot: IBlockSnapshot | IBlockSnapshot[]): void
  update(snapshot: IBlockSnapshot | IBlockSnapshot[]): void
  destroy(): void
}

export function createSnapshotRenderer(options: SnapshotViewerOptions = {}): SnapshotRenderer {
  return new SnapshotRenderEngine(options)
}
```

Also add root-wrapping normalization so both `IBlockSnapshot` root values and `IBlockSnapshot[]` input can be accepted.

- [ ] **Step 4: Make the smoke test pass with a minimal DOM render path**

Implement the smallest working `render()` path that:
- normalizes the input to a root-like tree
- creates one DOM node per block with `data-block-id`, `data-node-type`, and flavour classes
- recursively appends children
- clears and replaces host content on first render

- [ ] **Step 5: Re-run the smoke spec and commit the scaffold**

Run:
```bash
pnpm exec ng test editor --watch=false --browsers=ChromeHeadless --include='packages/editor/snapshot-viewer/render-engine.spec.ts'
```
Expected: PASS for the smoke spec.

Commit:
```bash
git add packages/editor/snapshot-viewer docs/superpowers/plans/2026-04-15-snapshot-viewer.md
git commit -m "feat: scaffold snapshot viewer core"
```

### Task 3: Implement registry, block shells, and readonly inline rendering

**Files:**
- Create: `packages/editor/snapshot-viewer/registry.ts`
- Create: `packages/editor/snapshot-viewer/dom/create-block-shell.ts`
- Create: `packages/editor/snapshot-viewer/inline/render-inline.ts`
- Create: `packages/editor/snapshot-viewer/inline/render-inline.spec.ts`
- Modify: `packages/editor/snapshot-viewer/snapshot-render-engine.ts`
- Modify: `packages/editor/snapshot-viewer/types.ts`

- [ ] **Step 1: Write failing inline rendering tests for marks, links, and inline embeds**

Add focused specs for readonly inline output.

```ts
it('renders bold and link attributes into readonly inline elements', () => {
  const fragment = renderInline([
    { insert: 'Hello', attributes: { 'a:bold': true } },
    { insert: ' world', attributes: { 'a:link': 'https://example.com' } },
  ])

  expect(fragment.textContent).toBe('Hello world')
  expect(fragment.querySelector('[bold="true"]')).not.toBeNull()
  expect(fragment.querySelector('a[href="https://example.com"]')).not.toBeNull()
})
```

- [ ] **Step 2: Run the targeted inline spec and verify it fails**

Run:
```bash
pnpm exec ng test editor --watch=false --browsers=ChromeHeadless --include='packages/editor/snapshot-viewer/inline/render-inline.spec.ts'
```
Expected: FAIL because `renderInline()` and renderer registration are not implemented.

- [ ] **Step 3: Implement the shared renderer contracts and DOM shell helpers**

Add a registry-based contract such as:

```ts
export interface SnapshotBlockRenderer {
  canRender(snapshot: IBlockSnapshot): boolean
  render(ctx: SnapshotRenderContext, snapshot: IBlockSnapshot): SnapshotRenderResult
  patch?(ctx: SnapshotRenderContext, current: MountedSnapshotNode, next: IBlockSnapshot): void
}
```

Implement common DOM shell creation that applies:
- `data-block-id`
- `data-node-type`
- flavour-specific class names such as `paragraph-block`, `callout-block`, `image-block`
- minimal readonly container classes used later by theme styles

- [ ] **Step 4: Implement `renderInline()` and wire editable blocks through it**

Support:
- plain text
- newline preservation with `white-space: pre-wrap` compatible output
- bold / italic / underline / strike / inline code
- link attributes
- inline embed placeholders rendered as readonly non-editable spans

Update the engine so editable snapshots call `renderInline()` instead of dumping raw JSON.

- [ ] **Step 5: Re-run inline and smoke specs, then commit**

Run:
```bash
pnpm exec ng test editor --watch=false --browsers=ChromeHeadless --include='packages/editor/snapshot-viewer/**/*.spec.ts'
```
Expected: PASS for smoke and inline specs.

Commit:
```bash
git add packages/editor/snapshot-viewer
git commit -m "feat: add snapshot viewer registry and inline renderer"
```

### Task 4: Add structural and textual block renderers with fixture coverage

**Files:**
- Create: `packages/editor/snapshot-viewer/renderers/structural-renderers.ts`
- Create: `packages/editor/snapshot-viewer/renderers/text-renderers.ts`
- Create: `packages/editor/snapshot-viewer/renderers/renderers.spec.ts`
- Modify: `packages/editor/snapshot-viewer/registry.ts`
- Modify: `packages/editor/snapshot-viewer/testing/fixtures/all-blocks.fixture.ts`
- Reference: `packages/editor/blocks/*/index.ts`
- Reference: `packages/editor/themes/blocks/*.scss`

- [ ] **Step 1: Write failing renderer specs for the first readonly block set**

Cover at least:
- `paragraph` / heading-style paragraph
- `bullet`
- `ordered`
- `todo`
- `blockquote`
- `caption`
- `callout`
- `divider`
- `columns` / `column`
- `frame`
- `table` / `table-row` / `table-cell`

Example:

```ts
it('renders a callout prefix and nested paragraph children', () => {
  const host = renderFixture(createAllBlocksFixture().callout)
  expect(host.querySelector('.callout-block-prefix')?.textContent).toContain('📢')
  expect(host.querySelector('.paragraph-block')).not.toBeNull()
})
```

- [ ] **Step 2: Run the renderer spec and capture the missing-flavour failures**

Run:
```bash
pnpm exec ng test editor --watch=false --browsers=ChromeHeadless --include='packages/editor/snapshot-viewer/renderers/renderers.spec.ts'
```
Expected: FAIL on unimplemented flavours.

- [ ] **Step 3: Implement structural renderers**

Add renderers that recursively render nested block children and stamp readonly class structure compatible with existing styles, for example:
- root shell with `data-blockcraft-root="true"` / readonly class
- callout prefix span + child container
- columns wrapper + column child containers
- table wrapper + row/cell wrappers that can host nested child blocks

- [ ] **Step 4: Implement textual renderers**

Add renderers for editable/text-like block flavours that:
- reuse `renderInline()` for content
- output readonly list markers for `bullet`/`ordered`
- output disabled visual state for `todo`
- use code-specific shells for `code`
- preserve block props that influence readonly layout such as `heading`, `textAlign`, and `depth`

- [ ] **Step 5: Re-run the renderer suite and commit**

Run:
```bash
pnpm exec ng test editor --watch=false --browsers=ChromeHeadless --include='packages/editor/snapshot-viewer/**/*.spec.ts'
```
Expected: PASS for structural/textual renderer coverage.

Commit:
```bash
git add packages/editor/snapshot-viewer
git commit -m "feat: add snapshot viewer structural and text renderers"
```

### Task 5: Add media, embed, and async enhancement support

**Files:**
- Create: `packages/editor/snapshot-viewer/renderers/media-renderers.ts`
- Create: `packages/editor/snapshot-viewer/renderers/embed-renderers.ts`
- Create: `packages/editor/snapshot-viewer/enhancers/index.ts`
- Create: `packages/editor/snapshot-viewer/enhancers/image-enhancer.ts`
- Create: `packages/editor/snapshot-viewer/enhancers/media-enhancer.ts`
- Create: `packages/editor/snapshot-viewer/enhancers/bookmark-enhancer.ts`
- Create: `packages/editor/snapshot-viewer/enhancers/formula-enhancer.ts`
- Create: `packages/editor/snapshot-viewer/enhancers/mermaid-enhancer.ts`
- Modify: `packages/editor/snapshot-viewer/types.ts`
- Modify: `packages/editor/snapshot-viewer/registry.ts`
- Modify: `packages/editor/snapshot-viewer/renderers/renderers.spec.ts`

- [ ] **Step 1: Write failing specs for stable shells and deferred enhancement**

Cover at least:
- `image` renders an `<img>` shell with src/size props
- `bookmark` renders title/url shell even before enrichment
- `figmaEmbed` / `juejinEmbed` render card shells without immediately mounting expensive content when policy is `visible`
- `mermaid` / `formula` keep placeholder shells when enhancer output is unavailable

```ts
it('keeps bookmark shell visible when preview enhancement rejects', async () => {
  const host = renderFixture(createAllBlocksFixture().bookmark, {
    enhancers: { bookmark: { load: () => Promise.reject(new Error('offline')) } },
  })
  await flushPromises()
  expect(host.querySelector('.bookmark-block')).not.toBeNull()
  expect(host.textContent).toContain('https://example.com')
})
```

- [ ] **Step 2: Run the spec and verify failures are limited to the new media/embed cases**

Run:
```bash
pnpm exec ng test editor --watch=false --browsers=ChromeHeadless --include='packages/editor/snapshot-viewer/renderers/renderers.spec.ts'
```
Expected: FAIL because media/embed renderers and enhancer hooks are not implemented yet.

- [ ] **Step 3: Implement media and embed shell renderers**

Add synchronous shells for:
- `image`
- `video`
- `audio`
- `attachment`
- `formula`
- `mermaid`
- `bookmark`
- `figmaEmbed`
- `juejinEmbed`

Make the shell stable enough that async enhancement does not cause major layout shifts.

- [ ] **Step 4: Implement enhancer lifecycle, policy, cache keying, and cancellation**

Support:
- `resourcePolicy: 'eager' | 'visible' | 'off'`
- enhancer cancellation on `update()` / `destroy()`
- cache keys derived from `block.id` plus stable resource inputs
- stale result protection so slow requests do not overwrite newer renders

- [ ] **Step 5: Re-run renderer coverage and commit**

Run:
```bash
pnpm exec ng test editor --watch=false --browsers=ChromeHeadless --include='packages/editor/snapshot-viewer/**/*.spec.ts'
```
Expected: PASS for media/embed shell and enhancement tests.

Commit:
```bash
git add packages/editor/snapshot-viewer
git commit -m "feat: add snapshot viewer media and embed rendering"
```

### Task 6: Implement keyed `update()` diffing and wrapper component integration

**Files:**
- Modify: `packages/editor/snapshot-viewer/snapshot-render-engine.ts`
- Create: `packages/editor/snapshot-viewer/dom/patch-children.ts`
- Create: `packages/editor/components/snapshot-viewer/snapshot-viewer.component.ts`
- Create: `packages/editor/components/snapshot-viewer/index.ts`
- Create: `packages/editor/components/snapshot-viewer/snapshot-viewer.component.spec.ts`
- Modify: `packages/editor/components/index.ts`
- Modify: `packages/editor/index.ts`

- [ ] **Step 1: Write failing engine and Angular wrapper tests**

Add one core diff spec and one Angular wrapper spec.

```ts
it('patches a paragraph in place when only text changes and id stays stable', () => {
  const host = document.createElement('div')
  const renderer = createSnapshotRenderer()
  const first = createParagraphFixture('paragraph-1', 'before')
  const second = createParagraphFixture('paragraph-1', 'after')

  renderer.render(host, wrapRoot([first]))
  const oldNode = host.querySelector('[data-block-id="paragraph-1"]')
  renderer.update(wrapRoot([second]))
  const newNode = host.querySelector('[data-block-id="paragraph-1"]')

  expect(newNode).toBe(oldNode)
  expect(host.textContent).toContain('after')
})
```

```ts
it('re-renders when the Angular wrapper input snapshot changes', () => {
  // TestBed host component updates [snapshot] and expects DOM text to change.
})
```

- [ ] **Step 2: Run the targeted tests and verify both update and wrapper coverage fail first**

Run:
```bash
pnpm exec ng test editor --watch=false --browsers=ChromeHeadless --include='packages/editor/snapshot-viewer/render-engine.spec.ts,packages/editor/components/snapshot-viewer/snapshot-viewer.component.spec.ts'
```
Expected: FAIL because `update()` still replaces too much DOM and the Angular wrapper does not exist.

- [ ] **Step 3: Implement keyed diffing in `SnapshotRenderEngine`**

Add mounted-node bookkeeping keyed by `id`, then patch in place when:
- `id`, `flavour`, and `nodeType` stay stable
- props change but renderer supports patching
- child order changes without subtree type changes

Replace subtrees only when `id` is reused across a different `flavour`/`nodeType` combination.

- [ ] **Step 4: Add the Angular wrapper component and exports**

Create a standalone component that:
- accepts `[snapshot]` and `[options]`
- creates the renderer in `ngAfterViewInit`
- calls `render()` once and `update()` on input changes
- calls `destroy()` in `ngOnDestroy`

Then export it from `packages/editor/components/index.ts` and `packages/editor/index.ts`.

- [ ] **Step 5: Re-run targeted tests and commit**

Run:
```bash
pnpm exec ng test editor --watch=false --browsers=ChromeHeadless --include='packages/editor/snapshot-viewer/**/*.spec.ts,packages/editor/components/snapshot-viewer/**/*.spec.ts'
```
Expected: PASS for in-place patching and Angular wrapper lifecycle.

Commit:
```bash
git add packages/editor/snapshot-viewer packages/editor/components packages/editor/index.ts
git commit -m "feat: add snapshot viewer updates and angular wrapper"
```

### Task 7: Integrate theme styles, public docs, and migration notes

**Files:**
- Create: `packages/editor/themes/components/snapshot-viewer.scss`
- Modify: `packages/editor/themes/base.scss`
- Modify: `packages/editor/ai-skills/blockcraft.md`
- Modify: `packages/editor/ai-skills/blockcraft-app.md`
- Modify: `packages/editor/ai-skills/blockcraft-theme.md`
- Modify: `packages/editor/ai-skills/MIGRATIONS.md`

- [ ] **Step 1: Add the smallest viewer-specific SCSS layer needed for shell layout**

Keep style ownership narrow:
- viewer root container class
- readonly shell layout helpers not already covered by block theme files
- any class names introduced only by the new subsystem

Do not duplicate entire existing block styles if existing block classes already pick them up.

- [ ] **Step 2: Wire the new SCSS into the exported theme bundle**

Update `packages/editor/themes/base.scss` with:

```scss
@import "components/snapshot-viewer";
```

Expected result: consumer apps that already import BlockCraft themes receive the viewer styling automatically.

- [ ] **Step 3: Document the new public capability and migration impact**

Update docs to cover:
- how to call `createSnapshotRenderer()`
- how to use `<bc-snapshot-viewer>`
- which options are available in v1 (`themeClass`, `baseUrl`, `resourcePolicy`, `enhancers`, `placeholderPolicy`)
- the rule that the viewer is display-only and independent from editor runtime
- the new migration entry because this adds an external rendering API

- [ ] **Step 4: Refresh `Last updated:` dates in the touched ai-skills files**

Use the implementation date on:
- `packages/editor/ai-skills/blockcraft.md`
- `packages/editor/ai-skills/blockcraft-app.md`
- `packages/editor/ai-skills/blockcraft-theme.md`

- [ ] **Step 5: Commit docs and theme wiring**

Commit:
```bash
git add packages/editor/themes/base.scss packages/editor/themes/components/snapshot-viewer.scss packages/editor/ai-skills/blockcraft.md packages/editor/ai-skills/blockcraft-app.md packages/editor/ai-skills/blockcraft-theme.md packages/editor/ai-skills/MIGRATIONS.md
git commit -m "docs: document snapshot viewer api"
```

### Task 8: Final validation, changed-scope review, and release readiness check

**Files:**
- Verify: `packages/editor/snapshot-viewer/**/*`
- Verify: `packages/editor/components/snapshot-viewer/*`
- Verify: `packages/editor/themes/components/snapshot-viewer.scss`
- Verify: `packages/editor/index.ts`
- Verify: `packages/editor/ai-skills/*`

- [ ] **Step 1: Run the focused viewer test suite**

Run:
```bash
pnpm exec ng test editor --watch=false --browsers=ChromeHeadless --include='packages/editor/snapshot-viewer/**/*.spec.ts,packages/editor/components/snapshot-viewer/**/*.spec.ts'
```
Expected: PASS for engine, renderer, inline, and Angular wrapper coverage.

- [ ] **Step 2: Run a package-level build sanity check**

Run:
```bash
pnpm build:editor
```
Expected: PASS, producing an updated editor package bundle with the new viewer exports.

- [ ] **Step 3: Run a TypeScript top-level sanity check**

Run:
```bash
pnpm exec tsc -p tsconfig.json --noEmit
```
Expected: no new TypeScript errors introduced by the viewer work.

- [ ] **Step 4: Inspect changed scope against expectations**

Run:
```bash
git diff --stat
git status --short
```
Expected: changes are limited to the new `snapshot-viewer` tree, wrapper component, export barrels, theme wiring, and matching docs.

- [ ] **Step 5: Run GitNexus changed-scope verification if available in the environment**

Preferred check per repo rules:
```bash
npx gitnexus detect-changes --scope all
```
If unavailable in the environment, record that limitation in the implementation notes and manually review the final diff before opening a PR.

- [ ] **Step 6: Final commit**

```bash
git add packages/editor docs/superpowers/specs/2026-04-15-snapshot-viewer-design.md docs/superpowers/plans/2026-04-15-snapshot-viewer.md
git commit -m "feat: add standalone snapshot viewer"
```

---

## Self-Review Notes

### Spec coverage check

- standalone subsystem boundary: covered by Tasks 1-3
- DOM-first engine with `render/update/destroy`: covered by Tasks 2 and 6
- readonly inline renderer: covered by Task 3
- structural/text/media/embed block coverage: covered by Tasks 4 and 5
- async enhancement and resource policy: covered by Task 5
- Angular wrapper component: covered by Task 6
- theme/public docs/migration updates: covered by Task 7
- validation/performance/build scope checks: covered by Task 8

### Placeholder scan

This plan intentionally avoids placeholder markers. Any unresolved implementation detail is framed as a concrete file or test task.

### Type consistency check

The plan uses one consistent public API naming set throughout:
- `createSnapshotRenderer()`
- `SnapshotRenderEngine`
- `SnapshotRenderer`
- `SnapshotViewerOptions`
- `SnapshotViewerComponent`

If implementation chooses different names, rename them consistently across the whole task list before coding.
