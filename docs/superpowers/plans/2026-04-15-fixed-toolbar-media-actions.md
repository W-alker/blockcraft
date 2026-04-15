# Fixed Toolbar Media Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dropdown-affordance insertion buttons for tables and columns, plus image and video/audio insertion actions to the fixed toolbar.

**Architecture:** Keep UI wiring inside `FixedTextToolbarComponent`, but reuse `BLOCK_CREATOR_SERVICE_TOKEN` and `MediaCreatorComponent` for all media parameter collection. Extend the shared media creator to support `image` so fixed-toolbar does not need a separate image dialog.

**Tech Stack:** Angular 20 standalone components, CDK overlay trigger, BlockCraft schemas, block creator service, Markdown docs

---

### Task 1: Confirm shared insertion paths and blast radius

**Files:**
- Modify: `packages/editor/plugins/fixed-toolbar/widgets/fixed-toolbar.component.ts`
- Modify: `packages/editor/editor/services/block-creator.service.ts`
- Modify: `packages/editor/components/media-creator/index.ts`

- [ ] **Step 1: Inspect the existing fixed-toolbar insertion helpers**

Run: `rg -n "insertQuickTable|insertColumnsBlock|insertTable|insertColumns|resolveInsertAnchor" packages/editor/plugins/fixed-toolbar/widgets/fixed-toolbar.component.ts`
Expected: fixed-toolbar already resolves insertion anchors locally and inserts snapshots after the anchor block.

- [ ] **Step 2: Inspect shared block creator usage**

Run: `rg -n "BLOCK_CREATOR_SERVICE_TOKEN|getParamsByScheme" packages/editor -g '*.ts'`
Expected: image/video/audio creation parameters are already centralized behind the block creator service.

- [ ] **Step 3: Record the manual blast radius**

Expected conclusion: `fixed-toolbar` UI changes are local, while `MyBlockCreatorService` and `MediaCreatorComponent` are shared insertion infrastructure and should be changed carefully to avoid regressions in other insertion entry points.

### Task 2: Add fixed-toolbar insertion controls

**Files:**
- Modify: `packages/editor/plugins/fixed-toolbar/widgets/fixed-toolbar.component.ts`

- [ ] **Step 1: Add dropdown-style visual affordance to table and columns buttons**
- [ ] **Step 2: Add an image insert button**
- [ ] **Step 3: Add a video/audio dropdown button with an overlay menu**
- [ ] **Step 4: Add a reusable insert-by-flavour helper that calls the block creator service and inserts the created snapshot after the resolved anchor block**

### Task 3: Extend shared media creation for image mode

**Files:**
- Modify: `packages/editor/components/media-creator/index.ts`
- Modify: `packages/editor/editor/services/block-creator.service.ts`

- [ ] **Step 1: Extend `MediaCreatorComponent` to support `image` in addition to `video` and `audio`**
- [ ] **Step 2: Update labels, icons, placeholders, accept types, and validation for image link/upload mode**
- [ ] **Step 3: Change `MyBlockCreatorService.getParamsByScheme()` so `image` uses the media creator dialog instead of file-picker-only logic**

### Task 4: Sync docs and validate

**Files:**
- Modify: `packages/editor/ai-skills/blockcraft-plugins-formatting.md`
- Modify: `packages/editor/ai-skills/MIGRATIONS.md`

- [ ] **Step 1: Document the new fixed-toolbar insertion actions**
- [ ] **Step 2: Add a patch migration note**
- [ ] **Step 3: Run `pnpm exec tsc -p tsconfig.json --noEmit` and note whether failures are pre-existing or new**
- [ ] **Step 4: Inspect final diff and `git status --short`**
