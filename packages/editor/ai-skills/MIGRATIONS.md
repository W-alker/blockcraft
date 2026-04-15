# BlockCraft Migration Guide

> **Version adaptation reference.** Each entry documents a framework change that affects external consumers — including breaking API changes, deprecations, removed exports, behavior changes, and any rename/move that downstream code might depend on.
>
> Last updated: 2026-04-15 | Tracks `@ccc/blockcraft` npm releases.

## Why This File Exists

The BlockCraft skill pack and source code evolve together. When the framework refactors or grows new features, three things must stay aligned:

1. The **source code** in `packages/editor/`
2. The **L0/L1/L2 docs** in `packages/editor/ai-skills/`
3. The **migration entries** in this file

If you're an external consumer upgrading `@ccc/blockcraft`, this file tells you exactly what to change in your own code. If you're a contributor making a framework change, you **must** add an entry here before publishing the new version (see project `CLAUDE.md` "文档同步规则").

## Entry Format

Every entry follows this template:

```markdown
## v<X.Y.Z> — YYYY-MM-DD

**Severity**: patch | minor | major (semver — patch = fully back-compat, minor = additive, major = breaking)

**What changed**: one-paragraph summary aimed at a future reader who knows nothing about the PR.

**Why**: the motivation (incident, design lesson, feature request, …). Helps future-you decide if a follow-up is still relevant.

**Affected ai-skills files**:
- list of L0/L1/L2 markdowns updated in the same PR

### Breaking Changes (only for major)
- removed APIs, renamed exports, changed signatures, removed events, …

### Deprecations
- APIs marked `@deprecated` with the version they will be removed in (or "no removal date")

### New APIs / Features
- new exports, new methods, new lifecycle hooks, new schema fields, …

### Migration Recipe
Concrete before/after code snippets so a downstream developer can find-and-replace mechanically:

\`\`\`typescript
// before
selection.from.block

// after
selection.anchor.block
\`\`\`

### Behavior Changes
Things that didn't change shape but changed behavior — e.g. an event now fires earlier, a method now throws on a previously-silent edge case.
```

> **Severity → version bump rule**:
> - `patch` (e.g. 0.1.37 → 0.1.38): bug fix, doc-only change, internal refactor that doesn't touch any exported surface
> - `minor` (e.g. 0.1.37 → 0.2.0): additive — new APIs, new plugins, new blocks, new optional schema fields, new exports
> - `major` (e.g. 0.1.37 → 1.0.0): breaking — removed APIs, renamed exports, signature changes, behavior reversals
>
> **Deprecations are minor**, not major — they only become major when the deprecated API is actually removed.
>
> The version in `packages/editor/package.json` MUST be bumped according to this rule before running `pnpm publish:editor`.

---

## Releases

### v0.2.16 — 2026-04-15 — Fixed Toolbar Media Insert Actions

**Severity**: patch

**What changed**: `FixedTextToolbarComponent` now exposes more insertion actions directly in the toolbar. Table and columns keep their existing picker behavior but now show a dropdown affordance. The toolbar also adds image insertion plus a video/audio dropdown. Image creation now supports either a remote URL or local upload through the shared media-creator flow.

**Why**: The fixed toolbar already handled table and columns, but other common insert actions still required other entry points. Reusing the shared block-creator and media-creator flows keeps insertion behavior consistent while making the toolbar more complete.

**Affected ai-skills files**:
- `blockcraft-plugins-formatting.md`
- `MIGRATIONS.md`

### Behavior Changes

- Fixed-toolbar table and column insert buttons now visually communicate that they open pickers.
- Fixed-toolbar image insertion supports image URL input and local upload.
- Fixed-toolbar video/audio insertion is available from a shared dropdown entry and uses the existing media creation dialog.

### v0.2.15 — 2026-04-15 — Fixed Toolbar Cross-Block Heading/List Transforms

**Severity**: patch

**What changed**: `FixedTextToolbarComponent` now allows heading changes and list conversion (`ordered`, `bullet`, `todo`) on cross-block text selections, matching the behavior scope that users already had in the floating text toolbar. The fixed toolbar keeps its existing layout; only the selection gating for block-level transforms changed.

**Why**: The fixed toolbar previously gated too much of its behavior behind text-format selection checks, which made multi-line selections feel weaker than the floating toolbar even though the underlying `TextToolbarHelper` APIs already support multi-block block transforms.

**Affected ai-skills files**:
- `blockcraft-plugins-formatting.md`
- `MIGRATIONS.md`

### Behavior Changes

- Cross-block text selections across editable, non-`plainTextOnly` blocks can now be converted to heading styles from the fixed toolbar.
- The same selections can now be converted between `ordered`, `bullet`, `todo`, and `paragraph` from the fixed toolbar.
- Link and inline-formula actions remain same-block only; on cross-block text selections their buttons stay visible but disabled in the fixed toolbar.

### v0.2.14 — 2026-04-13 — Selection: `isAllSelected` Means Block Selection Only

**Severity**: patch

**What changed**: `BlockSelection.isAllSelected` now returns `true` only when both `anchor` and `head` are `type: 'selected'` points. A cross-block text range that happens to start at offset `0` and end at the last block's `textLength` is no longer treated as "all selected".

**Why**: The previous implementation conflated "text selection covers full block boundaries" with "the selection endpoints are block/void selections". That caused block-level behaviors to leak into normal text ranges, including the floating text toolbar disappearing for multi-paragraph text selections.

**Affected ai-skills files**:
- `blockcraft-selection.md`
- `blockcraft.md`

### Migration Recipe

```typescript
// before
if (selection.isAllSelected) {
  // this also matched text selections like paragraph-start -> paragraph-end
}

// after
if (selection.isAllSelected) {
  // only block/void-style selections reach this branch
}

// if you need the old "full text coverage" check explicitly:
const coversWholeRange = selection.isStartOfBlock && selection.isEndOfBlock
```

### Behavior Changes

- Cross-block text selections now remain text selections even when they cover whole paragraphs.
- Plugins such as the floating text toolbar and fixed toolbar will treat those ranges as format-able text instead of block-level "all selected" state.

### v0.2.13 — 2026-04-13 — Native Input Islands Inside Void / Block Nodes

**Severity**: patch

**What changed**: Native `input`, `textarea`, and `select` elements embedded inside BlockCraft blocks now bypass the editor's document-level `beforeInput`, hotkey, composition, paste, mouse, and selection pipelines. A custom widget can opt into the same isolation by adding `data-bc-native-input` on its root element. While one of these native controls is focused, `SelectionManager` clears the active `BlockSelection` instead of leaving stale editor selection state behind.

**Why**: The previous event model assumed text input only happened inside `EditableBlockComponent`. When a `void` or `block` node hosted a native form control, browser events bubbled to the root editor and could accidentally trigger document commands such as Enter-to-split, Backspace merge, mention triggers, slash transforms, or stale toolbar state.

**Affected ai-skills files**:
- `blockcraft.md`
- `blockcraft-block.md`
- `blockcraft-event.md`
- `blockcraft-input.md`
- `blockcraft-selection.md`

### New APIs / Features

- `data-bc-native-input` marker for non-form widgets that should be treated like isolated native input hosts

### Migration Recipe

```html
<!-- before: third-party editor or custom text widget inside a void/block node -->
<div class="widget-shell"></div>

<!-- after -->
<div class="widget-shell" data-bc-native-input></div>
```

```typescript
// before: trying to route block-local form edits through InputTransformer
// (not supported for void/block native controls)

// after: treat it as block-local state and commit via props / chain
onInput(event: Event) {
  this.updateProps({ value: (event.target as HTMLInputElement).value });
}
```

### Behavior Changes

- Typing, IME composition, paste, and keyboard shortcuts inside native form controls no longer reach the editor command pipeline.
- Focusing a native form control inside the editor clears the current `BlockSelection`.
- Root-level `beforeInput` plugins such as mention/slash style triggers will no longer react to text typed inside isolated native controls.

### v0.1.38 — 2026-04-07 — AI Skill Pack External Distribution

**Severity**: minor

**What changed**: The `ai-skills/` folder is now bundled with the npm package. New entry points added: `SKILL.md` (AI discovery, with frontmatter), `README.md` (human installation guide), `install.mjs` (one-command installer for Claude Code / Codex skill directories). The `ng-package.json` `assets` array gained `ai-skills/**/*`. New L1 doc `blockcraft-app.md` covers embedding BlockCraft in a host Angular app — DI tokens, `DocConfig`, init paths, persistence, readonly mode.

**Why**: External consumers (other Angular apps, AI coding agents working in those apps) need to access the skill pack without checking out the source repo. The new app-integration L1 closes a previously-undocumented gap.

**Affected ai-skills files**:
- `blockcraft.md` — added external usage section, file index, plugin list refresh
- `blockcraft-app.md` — NEW
- `SKILL.md` — NEW
- `README.md` — NEW
- `install.mjs` — NEW
- `MIGRATIONS.md` — NEW (this file)

**New APIs / Features**: none in `framework/`. Distribution-only release.

**Migration Recipe**: no code changes required. To start using the skill pack in an external project:

```bash
node node_modules/@ccc/blockcraft/ai-skills/install.mjs
```

---

### v0.1.37 — 2026-04-07 — Selection Model: anchor/head + Discriminated Points

**Severity**: minor (legacy types kept as `@deprecated` for backward compat)

**What changed**: `BlockSelection` switched from a `from`/`to`/`index/length` shape to an `anchor`/`head` model with a discriminated `ISelectionPoint` union (`type: 'text' | 'selected'`). New derived properties: `start`, `end`, `direction`, `collapsed`, `isInSameBlock`, `isStartOfBlock`, `isEndOfBlock`, `isAllSelected`, `isEmpty`, `contains()`. The legacy `INormalizedRange`, `IBlockRange`, `IBlockInlineRangeJSON`, `IBlockSelectionJSON` types are still exported but marked `@deprecated` and parsed for backward compat by `setSelection()`, `replay()`, and `createFakeRange()`.

**Why**: The old `from`/`to`/`index` shape conflated "where I clicked first" with "what's at the start of the document order", and didn't model whole-block selection cleanly. The new model uses true anchor/head (intentional origin vs current cursor) plus a discriminated point type, which makes type narrowing safe and ordering unambiguous.

**Affected ai-skills files**:
- `blockcraft-selection.md` (L2) — major rewrite
- `blockcraft.md` (L0) — Quick Reference section
- `blockcraft-block.md` (L1) — `setInlineRange` return type, EditableBlockComponent API

#### Deprecations

| Deprecated | Replacement | Removal version |
|------------|-------------|------------------|
| `BlockSelection.isCollapsed` | `BlockSelection.collapsed` | TBD (v0.3.x earliest) |
| `BlockSelection.getDirection()` | `BlockSelection.direction` | TBD |
| `INormalizedRange { from, to, collapsed }` | `BlockSelection { anchor, head, ... }` or `INormalizedEndpoints { start, end }` | TBD |
| `IBlockRange / IBlockTextRange / IBlockSelectedRange` | `ISelectionPoint` | TBD |
| `IBlockInlineRangeJSON { index, length, ... }` | `ISelectionPointJSON { offset, ... }` | TBD |
| `IBlockSelectionJSON { from, to, ... }` | `ISelectionJSON { anchor, head, ... }` | TBD |
| `selection.from.* / selection.to.*` access | `selection.anchor.* / selection.head.*` (or `start/end`) | TBD |

#### New APIs

```typescript
// On BlockSelection
selection.anchor                    // ISelectionPoint
selection.head                      // ISelectionPoint
selection.start                     // document-ordered first endpoint
selection.end                       // document-ordered last endpoint
selection.direction                 // 'forward' | 'backward'
selection.collapsed                 // boolean
selection.isInSameBlock             // boolean
selection.isStartOfBlock            // boolean
selection.isEndOfBlock              // boolean
selection.isAllSelected             // boolean
selection.isEmpty                   // boolean
selection.contains(blockId, offset?) // boolean
selection.toJSON(): ISelectionJSON
selection.toLegacyJSON(): IBlockSelectionJSON

// On SelectionManager
doc.selection.recalculate(execNext?, options?) // returns { value, next? }
doc.selection.nextChangeObserve()              // Observable, fires once
doc.selection.afterNextChange(fn)              // subscribe sugar
```

#### Migration Recipe

```typescript
// ── 1. Reading the current selection ──

// before
const sel = doc.selection.value
if (sel?.isCollapsed) { … }
const block = sel?.from.block
const offset = sel?.from.index

// after
const sel = doc.selection.value
if (sel?.collapsed) { … }
if (sel && sel.anchor.type === 'text') {        // narrow first!
  const block = sel.anchor.block                // EditableBlockComponent
  const offset = sel.anchor.offset
}

// ── 2. Building a selection JSON to save / replay ──

// before
const json: IBlockSelectionJSON = {
  from: { blockId, type: 'text', index: 0, length: 5 },
  to: null,
  collapsed: false,
  commonParent: parentId,
}

// after
const json: ISelectionJSON = {
  anchor: { blockId, type: 'text', offset: 0 },
  head:   { blockId, type: 'text', offset: 5 },
  commonParent: parentId,
}

// ── 3. setSelection / replay ──
//   Both signatures still work — legacy {from,to} is parsed by replay() and
//   createFakeRange(). New code should pass ISelectionPoint / ISelectionJSON.

// before
doc.selection.setSelection(
  { blockId, type: 'text', index: 0, length: 5 }
)

// after
doc.selection.setSelection(
  { blockId, type: 'text', offset: 0, block: editableBlock },  // anchor
  { blockId, type: 'text', offset: 5, block: editableBlock }   // head
)

// ── 4. Whole-block selection check ──

// before
sel.from.type === 'selected'   // worked but no narrowing helper

// after
if (sel.start.type === 'selected') {
  // sel.start.block: BaseBlockComponent (TS narrows automatically)
}
```

#### Behavior Changes

- Cross-parent selections (anchor and head under different parent blocks) are still rejected by `recalculate()` — that constraint hasn't changed. The constraint is documented as removable once `DocUndoManager` handles cross-parent selection snapshots.
- Root-block "gap-space" selections (zero-width spaces at document boundaries) now resolve to the first/last child block's start/end, enabling Cmd+A from any cursor position to select the whole document. This is additive — no consumer code change needed.

---

### v0.1.36 and earlier — Pre-skill-pack baseline

Releases before 2026-03-30 do not have entries in this file. For historical changes, run `git log packages/editor/framework/` and consult per-PR commit messages. Future contributors: please backfill entries here only if you're certain about the change scope.

---

## Severity Reference Card

| Change type | Severity | Example |
|-------------|----------|---------|
| Bug fix in framework internals, no public API affected | patch | Fix race in `applyDelta` blot consistency check |
| Doc-only fix in `ai-skills/` | patch | Typo in `blockcraft-block.md` |
| Bundled CSS adjustment, no class rename | patch | Tweak callout box-shadow |
| New optional `DocConfig` field with a default | minor | Add `theme?: string` |
| New plugin / new block / new embed | minor | `BlockGapCreatorPlugin` |
| New method on `BaseBlockComponent` | minor | `getChildrenByIndex()` |
| Mark old API `@deprecated` (still works) | minor | Selection v0.1.37 refactor |
| Rename / remove an exported symbol | major | Drop `IBlockSelectionJSON` (when actually removed) |
| Change a method signature in a non-back-compat way | major | `setSelection(point, point)` → `setSelection({anchor, head})` |
| Behavior reversal users could observe | major | Plugin hook fires before init instead of after |
| Removal of a previously-deprecated API | major | Drop `selection.isCollapsed` |

When in doubt, treat the change as one severity higher and note the reasoning in the entry's "Why" field. Conservative is cheap; under-bumping can break consumers silently.

## Tooling Note

If you bump the package version but forget to add an entry here, the framework's `CLAUDE.md` rule says reviewers should request changes. There is currently no automated check enforcing this — add one (PreCommit hook? CI script?) when the team has time.
