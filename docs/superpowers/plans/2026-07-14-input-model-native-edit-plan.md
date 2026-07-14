# Input Model-Native Edit Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove legacy range conversion from BlockSelection-driven input while preserving the deprecated public DOM compatibility API and all current input/IME/undo behavior.

**Architecture:** Add one pure `SelectionEditPlanner` in the Input bounded context. It converts ordered model endpoints into a short-lived discriminated plan containing IDs, half-open text slices, structural indexes, and post-edit cursor recipes; `InputTransformer` remains the Yjs mutation executor and routes existing specialized gap, boundary, table, and composition behavior from the plan.

**Tech Stack:** TypeScript, Angular 20, Jasmine/Karma, Yjs, BlockSelection anchor/head model, DOM beforeinput/composition APIs.

---

### Task 1: Pure Selection Edit Planner

**Files:**
- Create: `packages/editor/framework/modules/input/selection-edit-plan.ts`
- Create: `packages/editor/framework/modules/input/selection-edit-plan.spec.ts`

- [x] **Step 1: Write planner tests for text and block edges**

Cover collapsed text, same-block text range, cross-block text range,
selected/text, text/selected, all-selected, and backward BlockSelection input.
Assert half-open slices and stable cursor recipes:

```ts
expect(planSelectionEdit(selection, reader, {tailMode: 'merge'})).toEqual({
  kind: 'range',
  start: {kind: 'text', blockId: 'p1', from: 2, to: 5},
  end: {kind: 'text', blockId: 'p2', from: 0, to: 3},
  insertAt: {blockId: 'p1', offset: 2},
  stabilizeAt: {blockId: 'p1', offset: 2},
  tailMode: 'merge',
})
```

- [x] **Step 2: Run the planner spec and verify it fails**

Run:

```bash
pnpm test -- --watch=false --browsers=ChromeHeadless --progress=false --include=packages/editor/framework/modules/input/selection-edit-plan.spec.ts
```

Expected: compilation fails because `selection-edit-plan.ts` does not exist.

- [x] **Step 3: Add internal plan types and reader**

Implement an internal API shaped as:

```ts
export interface SelectionEditReader {
  getParentId(blockId: string): string | null | undefined
  getChildrenIds(blockId: string): readonly string[] | null
  getTextLength(blockId: string): number | null
}

export type SelectionReplaceEdge =
  | {kind: 'text'; blockId: string; from: number; to: number}
  | {kind: 'block'; blockId: string}

export type SelectionEditPlan =
  | {kind: 'text-cursor'; blockId: string; offset: number}
  | {
      kind: 'range'
      start: SelectionReplaceEdge
      end: SelectionReplaceEdge | null
      insertAt: {blockId: string; offset: number} | null
      stabilizeAt: {blockId: string; offset: number} | null
      tailMode: 'merge' | 'preserve'
    }
  | {kind: 'block-range'; startBlockId: string; endBlockId: string}
  | {kind: 'gap'; blockId: string; side: 'before' | 'after'}
  | {kind: 'boundary'; hostId: string; fromIndex: number; toIndex: number}
  | {kind: 'table-cell'; tableId: string; anchorCellId: string; headCellId: string}
  | {kind: 'unsupported'; reason: string}
```

The planner accepts `BlockSelection | INormalizedEndpoints`, reads no DOM, and
returns `unsupported` for stale or impossible ranges.

- [x] **Step 4: Add boundary, gap, table, and stale tests**

Assert same-host boundary indexes, mixed boundary/text lowering to explicit
block/text edges, gap side retention, table IDs, missing parent/child/text
length failure, and no `hostElement` access.

- [x] **Step 5: Run planner tests**

Expected: all planner tests pass.

- [x] **Step 6: Commit planner and tests**

```bash
git add packages/editor/framework/modules/input/selection-edit-plan.ts packages/editor/framework/modules/input/selection-edit-plan.spec.ts
git commit -m "refactor(editor): plan input edits from model selection"
```

### Task 2: Model-Native Range Executor

**Files:**
- Modify: `packages/editor/framework/modules/input/index.ts`
- Modify: `packages/editor/framework/modules/input/index.spec.ts`

- [x] **Step 1: Add failing integration tests for range-plan execution**

Add tests proving that same-block, cross-block, selected/text, text/selected,
and columns-tail replacements produce the existing Y.Text/block results and
cursor positions without calling `endpointsToLegacy()`.

- [x] **Step 2: Add one planner instance and reader adapter**

Create a private reader backed by model APIs only:

```ts
private _planSelectionEdit(source: BlockSelection | INormalizedEndpoints) {
  return planSelectionEdit(source, {
    getParentId: id => this._getLiveBlockById(id)?.parentId ?? null,
    getChildrenIds: id => this._getLiveBlockById(id)?.childrenIds ?? null,
    getTextLength: id => {
      const block = this._getLiveBlockById(id)
      return block && this.doc.isEditable(block) ? block.textLength : null
    },
  }, {
    tailMode: source instanceof BlockSelection &&
      this._textRangeScopePolicy(source)?.textRangeTailMode === 'preserve'
      ? 'preserve'
      : 'merge',
  })
}
```

Resolve the scope policy once per request.

- [x] **Step 3: Implement `_replacePlannedRange()`**

Port the BlockSelection branch of `_replaceText()` to plan edges:

```ts
private _replacePlannedRange(
  plan: Extract<SelectionEditPlan, {kind: 'range'}>,
  text?: string | null,
  merge = false,
  skipAppend = false,
): boolean
```

Resolve blocks by ID once, validate text slices, capture undo before mutation,
stabilize the model cursor, query covered paths once, preserve inherited attrs,
and retain the current separate tail-append delta behavior.

- [x] **Step 4: Route `_replaceText(BlockSelection)` through the plan**

Keep the legacy `INormalizedRange` executor temporarily for public
compatibility, but remove its use from the BlockSelection branch.

- [x] **Step 5: Run focused input tests**

Run the planner spec and `packages/editor/framework/modules/input/index.spec.ts`.
Expected: pass with unchanged snapshots and undo expectations.

- [x] **Step 6: Commit model-native range execution**

```bash
git add packages/editor/framework/modules/input/index.ts packages/editor/framework/modules/input/index.spec.ts
git commit -m "refactor(editor): execute model selection ranges directly"
```

### Task 3: Mixed Boundary and Whole-Block Migration

**Files:**
- Modify: `packages/editor/framework/modules/input/index.ts`
- Modify: `packages/editor/framework/modules/input/index.spec.ts`
- Modify: `packages/editor/framework/modules/input/selection-edit-plan.spec.ts`

- [x] **Step 1: Add parity tests for mixed boundary/text plans**

Cover boundary-to-text in the same direct child, boundary across preceding
children, text-to-boundary in the same child, and text across following
children. Verify delete, typed replacement, IME materialization, cursor target,
and undo.

- [x] **Step 2: Replace `_mixedBoundarySelectionToLegacy()`**

Delete `_legacyRange`, `_legacyTextPoint`, `_legacySelectedPoint`,
`_mixedBoundarySelectionToLegacy`, and `_legacyTextCursorAfterReplacement`.
Execute the planner's explicit range edges via `_replacePlannedRange()`.

- [x] **Step 3: Route all-selected replacement from `block-range` plans**

Change `_replaceSelectedBlocksWithParagraph()` and `_deleteAllSelected()` to
accept plan IDs/model selection without converting through
`endpointsToLegacy()`. Preserve `sibling` versus `inside` host behavior and
`restoreSelectionAfterBlockDelete()`.

- [x] **Step 4: Run input, undo, and selection tests**

Expected: mixed structural input and undo tests pass.

- [x] **Step 5: Commit structural range migration**

```bash
git add packages/editor/framework/modules/input/index.ts packages/editor/framework/modules/input/index.spec.ts packages/editor/framework/modules/input/selection-edit-plan.spec.ts
git commit -m "refactor(editor): execute structural input plans"
```

### Task 4: Canonical BeforeInput and Delete Routing

**Files:**
- Modify: `packages/editor/framework/modules/input/index.ts`
- Modify: `packages/editor/framework/modules/input/index.spec.ts`
- Modify: `packages/editor/framework/modules/selection/normalize.ts` only if an internal endpoint helper must be exported within the framework module

- [x] **Step 1: Add failing target-range adapter tests**

Verify ordinary text target ranges become `INormalizedEndpoints`, structural
target endpoints fail closed, embed zero-space deletion still adjusts one text
slice, and canonical model selection wins for gap/boundary/table/scope-policy
ranges.

- [x] **Step 2: Normalize native target ranges to endpoints**

Import the internal `normalizeRange()` function under an alias and pass
`INormalizedEndpoints` to the planner. Stop calling the public legacy
`SelectionManager.normalizeRange()` from InputTransformer.

- [x] **Step 3: Replace beforeinput legacy destructuring**

Switch the main handler on `SelectionEditPlan.kind`. Keep DOM zero-space/embed
inspection in the adapter before executing the adjusted plan. Every accepted
event calls `preventDefault()` before mutation.

- [x] **Step 4: Route `deleteByRange(BlockSelection)` through plans**

Preserve the legacy overload/signature for external callers. The
`BlockSelection` branch must plan once and dispatch range, block-range,
boundary, table-cell, and gap behavior without a legacy conversion.

- [x] **Step 5: Run input, clipboard, and plugin tests**

Run input specs, `gap-paste.spec.ts`, table binding specs, paste-format selector,
mention, image toolbar, attachment, formula, inline-link, code, and Mermaid
tests affected by normalizeRange compatibility.

- [x] **Step 6: Commit beforeinput routing**

```bash
git add packages/editor/framework/modules/input/index.ts packages/editor/framework/modules/input/index.spec.ts packages/editor/framework/modules/selection/normalize.ts
git commit -m "refactor(editor): route beforeinput through edit plans"
```

### Task 5: Composition and Printable Convergence

**Files:**
- Modify: `packages/editor/framework/modules/input/index.ts`
- Modify: `packages/editor/framework/modules/input/index.spec.ts`
- Modify only if required by existing contract: `packages/editor/framework/modules/input/composition-session.ts`

- [x] **Step 1: Add equivalent-intent tests**

For text, selected/text, boundary/text, all-selected, gap, and table-cell
selections, assert printable fallback and composition start choose the same plan
kind and post-edit target as beforeinput.

- [x] **Step 2: Reuse planner dispatch in printable fallback**

Replace `_handlePrintableModelSelection()` point-shape branching with one plan
dispatch while preserving event consumption and fail-closed blur behavior.

- [x] **Step 3: Reuse plans during composition materialization**

Plan once after `_recoverCompositionSelection()`. Preserve composition undo
groups, stale-session abortion, stable cursor capture, and the existing delayed
commit through `CompositionSession`.

- [x] **Step 4: Run IME and undo regressions**

Expected: composition materialization and delayed undo tests pass with no
selection/data drift.

- [x] **Step 5: Commit composition convergence**

```bash
git add packages/editor/framework/modules/input/index.ts packages/editor/framework/modules/input/index.spec.ts packages/editor/framework/modules/input/composition-session.ts
git commit -m "refactor(editor): share edit planning across input paths"
```

### Task 6: Remove Legacy Conversion From Input and Document Architecture

**Files:**
- Modify: `packages/editor/framework/modules/input/index.ts`
- Modify: `packages/editor/ai-skills/blockcraft-input.md`
- Modify: `packages/editor/ai-skills/MIGRATIONS.md`
- Modify: `docs/superpowers/plans/2026-07-14-input-model-native-edit-plan.md`

- [x] **Step 1: Prove the Input module has no legacy conversion**

Run:

```bash
rg -n "endpointsToLegacy" packages/editor/framework/modules/input
```

Expected: no matches.

`INormalizedRange` may remain only on explicit legacy compatibility entry
signatures/branches, not in planner or BlockSelection execution.

- [x] **Step 2: Run full regression suites**

Run selection, input, undo manager, event, clipboard, table-binding, and affected
plugin specs in ChromeHeadless. Expected: all pass.

- [x] **Step 3: Build the editor**

```bash
pnpm build:editor
```

Expected: build passes; unrelated existing CSS warnings may remain.

- [x] **Step 4: Update framework documentation**

Document the Input adapter/planner/executor flow, retained public legacy API,
fail-closed rules, performance constraints, and virtualization boundary in
`blockcraft-input.md`. Refresh `Last updated:`.

- [x] **Step 5: Add an internal patch migration entry**

Record the architectural refactor with no consumer migration and no package
version change.

- [x] **Step 6: Audit and commit only phase files**

Run `git diff --check`, inspect staged paths, and leave playground/callout user
changes unstaged.

```bash
git commit -m "refactor(editor): make input planning model native"
```
