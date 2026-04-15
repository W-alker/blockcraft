# Fixed Toolbar Multi-line Transform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `FixedTextToolbarComponent` support heading and list conversion on cross-block text selections, matching the behavior scope of the floating text toolbar.

**Architecture:** Keep the fixed toolbar UI unchanged and localize the behavior update to `FixedTextToolbarComponent`. Reuse the existing `TextToolbarHelper` transform/update APIs and only adjust toolbar state gating plus selection validity checks for cross-block text ranges.

**Tech Stack:** Angular 20 standalone components, BlockCraft selection model, `TextToolbarHelper`, Markdown docs

---

### Task 1: Confirm blast radius and target file

**Files:**
- Modify: `packages/editor/plugins/fixed-toolbar/widgets/fixed-toolbar.component.ts`
- Reference: `packages/editor/framework/utils/text-toolbar-helper.ts`
- Reference: `packages/editor/plugins/float-text-toolbar/widgets/toolbar.component.ts`

- [ ] **Step 1: Inspect direct usages of the fixed toolbar component**

Run: `rg -n "FixedTextToolbarComponent|bc-fixed-toolbar" packages/editor -g '*.ts'`
Expected: component exported from plugin index and embedded by `packages/editor/editor/editor.ts`.

- [ ] **Step 2: Inspect internal methods that gate selection-based actions**

Run: `rg -n "syncToolbarState\(|runWithSelection\(|onStyleItemClicked\(|setList\(" packages/editor/plugins/fixed-toolbar/widgets/fixed-toolbar.component.ts`
Expected: selection gating centered in `syncToolbarState()` and `runWithSelection()`.

- [ ] **Step 3: Record the low-risk expectation before editing**

Expected conclusion: direct integration surface is the editor shell component, while the heading/list behavior is driven internally by `FixedTextToolbarComponent` plus `TextToolbarHelper`, so the likely blast radius is localized to fixed-toolbar enable/disable state and action dispatch.

### Task 2: Implement cross-block heading/list support in fixed toolbar

**Files:**
- Modify: `packages/editor/plugins/fixed-toolbar/widgets/fixed-toolbar.component.ts`

- [ ] **Step 1: Add a helper that recognizes format-able text selections**

Implement a private helper that returns `true` for selections that:
- exist
- are not `isAllSelected`
- start on a text point
- cover only editable, non-`plainTextOnly` blocks

This helper should be used for toolbar gating instead of the current inline condition bundle.

- [ ] **Step 2: Rework `syncToolbarState()` to keep multi-block text ranges operable**

Update the method so valid cross-block text selections:
- preserve `selectionJSON`
- compute common attrs via `toolbarHelper.getCurrentCommonAttrs(selection)`
- set `allEditable` from the shared helper result
- keep heading/list actions enabled even when `selection.isInSameBlock === false`
- keep `isLinkAble` and `hasTextSelection` restricted to same-block text ranges

- [ ] **Step 3: Rework `runWithSelection()` to reuse the shared validity helper**

Use the same helper so heading/list/align/color actions can run on cross-block text selections after `restoreSelection()`, without loosening block-selected behavior.

- [ ] **Step 4: Preserve current action semantics**

Do not change:
- `onStyleItemClicked()` transforming non-paragraph blocks to `paragraph` before updating `heading`
- `setList()` toggling active list flavour back to `paragraph`
- link/formula restrictions

### Task 3: Update consumer-facing formatting docs

**Files:**
- Modify: `packages/editor/ai-skills/blockcraft-plugins-formatting.md`
- Modify: `packages/editor/ai-skills/MIGRATIONS.md`

- [ ] **Step 1: Document the new fixed-toolbar behavior**

Update the `FixedTextToolbarComponent` section to state that heading and list transforms support cross-block text selections across editable blocks, while link/formula remain same-block only.

- [ ] **Step 2: Add a patch migration note**

Add a new top entry in `packages/editor/ai-skills/MIGRATIONS.md` describing the fixed-toolbar cross-block heading/list behavior change, why it changed, and which docs were updated.

### Task 4: Validate and review

**Files:**
- Verify: `packages/editor/plugins/fixed-toolbar/widgets/fixed-toolbar.component.ts`
- Verify: `packages/editor/ai-skills/blockcraft-plugins-formatting.md`
- Verify: `packages/editor/ai-skills/MIGRATIONS.md`

- [ ] **Step 1: Run a focused TypeScript sanity check if an existing command is available**

Run: `pnpm exec tsc -p tsconfig.json --noEmit`
Expected: no new TypeScript errors caused by the fixed-toolbar changes.

- [ ] **Step 2: Inspect the final diff**

Run: `git diff -- packages/editor/plugins/fixed-toolbar/widgets/fixed-toolbar.component.ts packages/editor/ai-skills/blockcraft-plugins-formatting.md packages/editor/ai-skills/MIGRATIONS.md`
Expected: only fixed-toolbar behavior and matching docs/migration note are changed.

- [ ] **Step 3: Check changed scope against repo expectations**

Run: `git status --short`
Expected: only the intended implementation/doc files plus the design/plan docs from this task flow.
