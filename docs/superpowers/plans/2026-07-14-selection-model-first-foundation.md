# Selection Model-First Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all programmatic BlockCraft selection writes synchronously model-first and order endpoints from the block tree instead of the DOM.

**Architecture:** Add a pure `SelectionPositionResolver` that reads only parent and child IDs, then inject it into `SelectionManager` as the ordering source for `BlockSelection`. Centralize programmatic writes in one commit method that validates and publishes the model before projecting a native DOM range, while retaining existing gap retries, table model-only behavior, public signatures, scope policy, and legacy point inputs.

**Tech Stack:** TypeScript, Angular 20, Jasmine/Karma, DOM Selection/Range APIs, Yjs-backed BlockCraft block tree.

---

## File Structure

- Create `packages/editor/framework/modules/selection/position-resolver.ts`: pure tree reader contract, document-order comparison, and nearest-common-ancestor resolution.
- Create `packages/editor/framework/modules/selection/position-resolver.spec.ts`: resolver tests with plain object trees and no DOM nodes.
- Modify `packages/editor/framework/modules/selection/index.ts`: tree reader adapter, point canonicalization, model common-parent resolution, unified commit path, and public API migration.
- Modify `packages/editor/framework/modules/selection/index.spec.ts`: synchronous model-first write, legacy compatibility, extension, and projection failure regressions.
- Modify `packages/editor/ai-skills/blockcraft-selection.md`: document model-tree ordering and synchronous programmatic writes.
- Modify `packages/editor/ai-skills/blockcraft.md`: update Selection quick reference and `Last updated` date.
- Modify `packages/editor/ai-skills/MIGRATIONS.md`: record the intentional behavior timing change without changing package version.

### Task 1: Pure Model Position Resolver

**Files:**
- Create: `packages/editor/framework/modules/selection/position-resolver.ts`
- Test: `packages/editor/framework/modules/selection/position-resolver.spec.ts`

- [x] **Step 1: Write failing resolver tests**

Cover sibling order, reversed order, ancestor order, cross-column order, nearest common ancestor, stale IDs, disconnected roots, missing parents, cycles, and a child absent from its parent's child list. Build the fixture with this shape so the suite cannot accidentally depend on DOM:

```typescript
interface NodeRecord {
  parentId: string | null
  childrenIds: string[]
}

const reader = {
  hasBlock: (id: string) => !!nodes[id],
  getParentId: (id: string) => nodes[id]?.parentId ?? null,
  getChildrenIds: (id: string) => nodes[id]?.childrenIds ?? null,
}

expect(resolver.compare('left', 'right')).toBe(-1)
expect(resolver.compare('right', 'left')).toBe(1)
expect(resolver.compare('columns', 'left-text')).toBe(-1)
expect(resolver.commonAncestor('left-text', 'right-text')).toBe('columns')
expect(resolver.compare('missing', 'right')).toBeNull()
```

- [x] **Step 2: Run the resolver spec and verify failure**

Run:

```bash
pnpm test -- --watch=false --browsers=ChromeHeadless --progress=false --include=packages/editor/framework/modules/selection/position-resolver.spec.ts
```

Expected: compilation fails because `SelectionPositionResolver` does not exist.

- [x] **Step 3: Implement the resolver**

Use the narrow reader contract and validate every parent-child edge while walking to root:

```typescript
export interface SelectionTreeReader {
  hasBlock(blockId: string): boolean
  getParentId(blockId: string): string | null
  getChildrenIds(blockId: string): readonly string[] | null
}

export type SelectionPositionOrder = -1 | 0 | 1

export class SelectionPositionResolver {
  constructor(private readonly reader: SelectionTreeReader) {}

  compare(a: string, b: string): SelectionPositionOrder | null {
    if (a === b) return this.reader.hasBlock(a) ? 0 : null
    const aPath = this.pathToRoot(a)
    const bPath = this.pathToRoot(b)
    if (!aPath || !bPath || aPath[0] !== bPath[0]) return null
    const divergence = firstDifferentIndex(aPath, bPath)
    if (divergence === Math.min(aPath.length, bPath.length)) {
      return aPath.length < bPath.length ? -1 : 1
    }
    const siblings = this.reader.getChildrenIds(aPath[divergence - 1])
    if (!siblings) return null
    const aIndex = siblings.indexOf(aPath[divergence])
    const bIndex = siblings.indexOf(bPath[divergence])
    if (aIndex < 0 || bIndex < 0 || aIndex === bIndex) return null
    return aIndex < bIndex ? -1 : 1
  }

  commonAncestor(a: string, b: string): string | null {
    const aPath = this.pathToRoot(a)
    const bPath = this.pathToRoot(b)
    if (!aPath || !bPath || aPath[0] !== bPath[0]) return null
    let common: string | null = null
    for (let i = 0; i < Math.min(aPath.length, bPath.length); i++) {
      if (aPath[i] !== bPath[i]) break
      common = aPath[i]
    }
    return common
  }
}
```

The private path walk must reject missing blocks, missing parents, cycles, and parent child lists that do not contain the current block.

- [x] **Step 4: Run resolver tests**

Run the command from Step 2.

Expected: all resolver cases pass.

- [x] **Step 5: Commit the resolver**

```bash
git add packages/editor/framework/modules/selection/position-resolver.ts packages/editor/framework/modules/selection/position-resolver.spec.ts
git commit -m "refactor(editor): resolve selection order from model tree"
```

### Task 2: Canonical Programmatic Selection Model

**Files:**
- Modify: `packages/editor/framework/modules/selection/index.ts`
- Test: `packages/editor/framework/modules/selection/index.spec.ts`

- [x] **Step 1: Write failing synchronous model tests**

Add a reusable editable block fixture with a model tree and mapper, then assert:

```typescript
manager.setCursorAt(p1, 2)
expect(manager.value?.toJSON()).toEqual({
  anchor: {blockId: 'p1', type: 'text', offset: 2},
  head: {blockId: 'p1', type: 'text', offset: 2},
  commonParent: 'p1',
})

manager.setSelection(
  {blockId: 'p1', type: 'text', index: 1, length: 2},
)
expect(manager.value?.toJSON()).toEqual({
  anchor: {blockId: 'p1', type: 'text', offset: 1},
  head: {blockId: 'p1', type: 'text', offset: 3},
  commonParent: 'p1',
})

manager.setSelection(
  {blockId: 'p1', type: 'text', index: 1, length: 0},
  {blockId: 'p2', type: 'text', index: 0, length: 2},
)
expect(manager.value?.end.type === 'text' && manager.value.end.offset).toBe(2)
```

Also make `doc.compareBlockPosition` throw and prove cross-block direction still follows `root.childrenIds`.

- [x] **Step 2: Run SelectionManager specs and verify failure**

```bash
pnpm test -- --watch=false --browsers=ChromeHeadless --progress=false --include=packages/editor/framework/modules/selection/index.spec.ts
```

Expected: the new assertions fail because `setCursorAt()` and `setSelection()` still update only native DOM state.

- [x] **Step 3: Adapt the resolver into SelectionManager**

Construct one resolver from a safe model reader:

```typescript
private readonly _positionResolver: SelectionPositionResolver

constructor(public readonly doc: BlockCraft.Doc) {
  this._positionResolver = new SelectionPositionResolver({
    hasBlock: id => this._readBlock(id) !== null,
    getParentId: id => this._readBlock(id)?.parentId ?? null,
    getChildrenIds: id => {
      const block = this._readBlock(id)
      if (!block) return null
      return block.nodeType === BlockNodeType.editable ? [] : block.childrenIds
    },
  })
  this.doc.afterInit(this._bindEvents)
}
```

Map `-1` to `Node.DOCUMENT_POSITION_FOLLOWING`, `1` to `Node.DOCUMENT_POSITION_PRECEDING`, and unresolved order to `Node.DOCUMENT_POSITION_DISCONNECTED` when constructing `BlockSelection`. Do not call `doc.compareBlockPosition()` from SelectionManager.

- [x] **Step 4: Add point canonicalization and model common-parent resolution**

Normalize every write point to new JSON before attaching lazy block accessors:

```typescript
private _canonicalWritePoints(from: SelectionWritePoint, to?: SelectionWritePoint | null) {
  const anchorJSON = this._writePointJSON(from, 'start')
  const headJSON = to
    ? this._writePointJSON(to, 'end')
    : this._writePointJSON(from, this._isLegacyTextPoint(from) ? 'end' : 'start')
  const anchor = this._pointFromJSON(anchorJSON)
  const head = this._pointFromJSON(headJSON)
  const commonParent = this._commonParentFromModel(anchor, head)
  return commonParent ? this._createBlockSelection(anchor, head, commonParent) : null
}
```

For text, start uses `offset ?? index`; legacy end uses `index + length`. For selected, gap, boundary, and table-cell, preserve the discriminant-specific field. `_commonParentFromModel()` must prefer same block, then same physical selection container, then a common semantic scope, then the resolver's nearest common ancestor only when the existing scope guard permits the range.

- [x] **Step 5: Run SelectionManager specs**

Run the command from Step 2.

Expected: synchronous cursor/range, legacy length, cross-block end offset, and pure ordering cases pass while existing replay tests remain green.

### Task 3: Unified Model-First Commit Path

**Files:**
- Modify: `packages/editor/framework/modules/selection/index.ts`
- Test: `packages/editor/framework/modules/selection/index.spec.ts`

- [x] **Step 1: Write failing commit-order and failure tests**

Observe `selectionChange$` while `Selection.addRange()` has not yet run, and assert the model is already current. Add a mapper that throws and assert the canonical state and native ranges are cleared and `doc.logger.warn` receives a projection warning.

```typescript
const valuesDuringAddRange: Array<BlockSelection | null> = []
spyOn(document.getSelection()!, 'addRange').and.callFake(() => {
  valuesDuringAddRange.push(manager.value)
})
manager.setCursorAt(p1, 1)
expect(valuesDuringAddRange[0]?.head.type).toBe('text')

expect(() => manager.setCursorAt(brokenBlock, 0)).toThrow()
expect(manager.value).toBeNull()
expect(document.getSelection()?.rangeCount).toBe(0)
```

- [x] **Step 2: Implement `_commitSelection()`**

Preserve the invariant ordering and existing gap retry:

```typescript
private _commitSelection(
  selectionState: BlockSelection,
  options: {scrollIntoView?: boolean; modelOnly?: boolean} = {},
): Range | null {
  if (!isSelectionAlive(selectionState, this.doc)) {
    this.blur()
    return null
  }
  this._applyState(selectionState)
  this.doc.root.hostElement.focus?.({preventScroll: true})
  this._suppressProgrammaticSelectionChange()
  if (options.modelOnly) {
    document.getSelection()?.removeAllRanges()
    if (options.scrollIntoView) this.scrollSelectionIntoView()
    return null
  }
  try {
    return this._projectSelectionToDom(selectionState, options.scrollIntoView)
  } catch (error) {
    this.doc.logger.warn('selectionProjectionError: ', error)
    this.blur()
    throw error
  }
}
```

`_projectSelectionToDom()` must derive ordered start/end points from `BlockSelection`, clear native ranges while a gap filler is deferred, schedule the existing retry, apply the native range under suppression, and return the built `Range` when available.

- [x] **Step 3: Route existing model-first methods through the commit path**

Migrate `selectBlock()`, `setGapCursor()`, `setTableCellSelection()`, and new-format `replay()` to `_commitSelection()`. Table-cell commits pass `{modelOnly: true}`. Remove direct `_applyState()` plus native range pairs from those call sites, but keep root whole-block endpoint behavior and Safari gap anchors unchanged.

- [x] **Step 4: Run SelectionManager specs**

Run the Task 2 command.

Expected: commit ordering, failure cleanup, selected, gap, boundary, replay, and table-cell tests pass.

### Task 4: Migrate Remaining Public Write APIs

**Files:**
- Modify: `packages/editor/framework/modules/selection/index.ts`
- Test: `packages/editor/framework/modules/selection/index.spec.ts`

- [x] **Step 1: Write failing extension and editable block tests**

```typescript
manager.setCursorAt(p1, 3)
manager.extendTo(p2, 2)
expect(manager.value?.anchor).toEqual(jasmine.objectContaining({blockId: 'p1', offset: 3}))
expect(manager.value?.head).toEqual(jasmine.objectContaining({blockId: 'p2', offset: 2}))

manager.setCursorAtBlock(p1, false, false)
expect(manager.value?.head).toEqual(jasmine.objectContaining({blockId: 'p1', offset: p1.textLength}))
```

Assert `setSelection()` returns the same applied native `Range` and that all methods have updated `manager.value` before returning.

- [x] **Step 2: Route APIs through canonical model commits**

- `setSelection()` builds a canonical `BlockSelection`, commits it, and returns the derived `Range`; invalid scope/tree data fails closed.
- `setCursorAt()` creates equal text anchor/head points and commits them.
- `extendTo()` preserves `this.value.anchor`, replaces only the head, recomputes model `commonParent`, and commits; with no live current selection it falls back to a collapsed cursor.
- Editable branches of `selectOrSetCursorAtBlock()` and `setCursorAtBlock()` delegate to the model-first `setCursorAt()` and perform scrolling once.
- Remove any caller-side `recalculate()` that exists only to publish a programmatic write; retain recalculation where it reads a browser-originated mutation.

- [x] **Step 3: Run focused selection tests**

```bash
pnpm test -- --watch=false --browsers=ChromeHeadless --progress=false '--include=packages/editor/framework/modules/selection/**/*.spec.ts'
```

Expected: all Selection specs pass.

- [x] **Step 4: Commit the SelectionManager migration**

```bash
git add packages/editor/framework/modules/selection/index.ts packages/editor/framework/modules/selection/index.spec.ts
git commit -m "refactor(editor): make selection writes model first"
```

### Task 5: Documentation and Regression Verification

**Files:**
- Modify: `packages/editor/ai-skills/blockcraft-selection.md`
- Modify: `packages/editor/ai-skills/blockcraft.md`
- Modify: `packages/editor/ai-skills/MIGRATIONS.md`

- [x] **Step 1: Update architecture documentation**

Set both skill document dates to `2026-07-14`. Document that programmatic writes synchronously publish `BlockSelection`, tree order/common ancestry come from `SelectionPositionResolver`, the DOM Range is a projection, and native `selectionchange` remains the input path for browser-created selections.

- [x] **Step 2: Add the migration entry**

Insert a top release entry with a minor severity and no package version bump:

```markdown
### v?.?.? - 2026-07-14 (minor) — programmatic selection writes are model-first

**Severity**: minor

**What changed**: `SelectionManager` now resolves endpoint order from the block tree and synchronously publishes all programmatic selection writes before applying the derived native DOM range.

### Behavior Changes

- `setSelection()`, `setCursorAt()`, `extendTo()`, and editable block cursor helpers expose the updated `doc.selection.value` before returning.
- Projection failures clear the canonical selection instead of leaving model and DOM state partially mismatched.
- No downstream call-site migration is required; callers may remove waits that existed only for `selectionchange` synchronization.
```

- [x] **Step 3: Run all cursor regression suites**

```bash
pnpm test -- --watch=false --browsers=ChromeHeadless --progress=false '--include=packages/editor/framework/modules/selection/**/*.spec.ts' --include=packages/editor/framework/modules/input/index.spec.ts --include=packages/editor/framework/doc/undoManger.spec.ts '--include=packages/editor/framework/block-std/event/*.spec.ts' --include=packages/editor/framework/modules/clipboard/gap-paste.spec.ts
```

Expected: all selection, input, undo, event, and clipboard cases pass.

- [x] **Step 4: Build the editor package**

```bash
pnpm build:editor
```

Expected: build succeeds; existing CSS budget warnings are acceptable, new TypeScript or template errors are not.

- [x] **Step 5: Check scope and commit docs**

```bash
git diff --check
git status --short
git add packages/editor/ai-skills/blockcraft-selection.md packages/editor/ai-skills/blockcraft.md packages/editor/ai-skills/MIGRATIONS.md
git commit -m "docs(editor): document model-first selection writes"
```

Expected: only this phase's Selection files, plan, and required docs are committed. `apps/playground/src/app/app.component.ts` and `packages/editor/blocks/callout-block/index.ts` remain dirty and unstaged.
