# Selection Model-First Hot-Path Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve model-first selection semantics while reducing each cross-block selection construction to one model-tree pair resolution and one liveness check during commit.

**Architecture:** Replace separate resolver operations with `resolve(a, b)`, returning document order and common ancestor from one pair of parent paths. Cache `BlockSelection` direction, pass the resolved endpoint order into its comparator, use endpoint-only liveness for repeated value reads, and retain structural validation at DOM recalculation and mutation/replay boundaries.

**Tech Stack:** TypeScript, Angular 20, Jasmine/Karma, Yjs-backed block tree, DOM Selection/Range APIs.

---

### Task 1: Pair Resolver Read Budget

**Files:**
- Modify: `packages/editor/framework/modules/selection/position-resolver.ts`
- Modify: `packages/editor/framework/modules/selection/position-resolver.spec.ts`

- [x] Add tests proving `resolve()` returns order and common ancestor together.
- [x] Add reader spies proving each path node's parent is read once and the divergent parent's children are read once.
- [x] Replace `compare()` and `commonAncestor()` with one `resolve()` implementation.
- [x] Run the resolver spec.

### Task 2: Immutable Endpoint Ordering

**Files:**
- Modify: `packages/editor/framework/modules/selection/blockSelection.ts`
- Modify: `packages/editor/framework/modules/selection/blockSelection.spec.ts`

- [x] Add a test reading `direction`, `start`, and `end` repeatedly while asserting the endpoint comparator runs once.
- [x] Cache the resolved direction inside immutable `BlockSelection`.
- [x] Run the BlockSelection spec.

### Task 3: Single-Resolution Selection Construction

**Files:**
- Modify: `packages/editor/framework/modules/selection/index.ts`
- Modify: `packages/editor/framework/modules/selection/index.spec.ts`

- [x] Add a cross-block programmatic-write test that records resolver-dependent tree reads and liveness traversal calls.
- [x] Resolve endpoint order/common ancestor once before constructing a selection.
- [x] Reuse the resolved endpoint order in `BlockSelection` while retaining general `contains()` ordering.
- [x] Compute cross-parent native selection scope/common parent once.
- [x] Split validated state publication from defensive `_applyState()` and remove the duplicate commit validation.
- [x] Keep repeated `value` reads endpoint-only without weakening DOM recalculation validation.
- [x] Run SelectionManager specs.

### Task 4: Regression and Documentation

**Files:**
- Modify only if wording changes: `packages/editor/ai-skills/blockcraft-selection.md`
- Modify only if public behavior changes: `packages/editor/ai-skills/blockcraft.md`
- Modify only if public behavior changes: `packages/editor/ai-skills/MIGRATIONS.md`

- [x] Run selection, input, undo, event, and clipboard regression suites.
- [x] Run `pnpm build:editor` and `git diff --check`.
- [x] Confirm no public API or behavior changed; avoid a new migration entry when this remains an internal performance correction.
- [x] Commit only the hot-path simplification files, leaving playground and callout user changes untouched.
