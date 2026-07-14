# Selection Model-First Foundation Design

> Status: approved direction, written spec pending user review
> Date: 2026-07-14
> Branch: `ref-cursor`
> Scope: the first architecture-convergence phase for `framework/modules/selection`

## 1. Context

The current cursor refactor has established a useful selection vocabulary:

- `text` for inline offsets;
- `selected` for explicit whole-block selection;
- `gap` for collapsed positions beside void/container blocks;
- `boundary` for positions between a container's children;
- `table-cell` for model-owned rectangular table selection.

`BlockSelection` is already treated as the canonical state for replay, undo,
IME, gap cursors, and table-cell selection. Two older mechanisms still prevent
the model-first rule from being consistently true:

1. block ordering inside `BlockSelection` ultimately uses DOM
   `compareDocumentPosition()`;
2. `setSelection()`, `setCursorAt()`, `extendTo()`, and editable paths in
   `setCursorAtBlock()` update the native DOM selection first and wait for a
   later `selectionchange -> recalculate()` to update the model.

This phase removes those two inconsistencies without changing keyboard,
clipboard, IME, deletion, scope, or table semantics.

## 2. Goals

1. Determine selection endpoint order from the BlockCraft block tree, with no
   DOM access and no layout reads.
2. Give every programmatic selection write one model-first commit path:
   canonicalize points, update `selection.value` synchronously, then project a
   native DOM Range.
3. Preserve existing public method names, parameters, return values, and legacy
   point compatibility.
4. Preserve the current native `selectionchange` suppression behavior and the
   Safari gap-anchor behavior.
5. Add focused regression tests before changing InputTransformer or undo
   mapping in later phases.

## 3. Non-Goals

- Do not remove `INormalizedRange` or change InputTransformer's replacement
  algorithms in this phase.
- Do not introduce live Yjs selection bookmarks yet.
- Do not change `selectionScope` policy, cross-scope projection, or selected
  class painting.
- Do not move table-cell behavior out of core yet.
- Do not remove the root block's pointer-leave selection controller yet.
- Do not change gap filler DOM or CSS.
- Do not change `packages/editor/package.json` version.

## 4. Considered Approaches

### A. Incremental compatibility-first convergence (chosen)

Add a pure model position resolver and a single internal model-first commit
path. Route existing public APIs through them while retaining all signatures
and legacy inputs.

Advantages:

- small, reviewable behavior surface;
- old plugins keep working;
- later Input/Undo cleanup can build on a stable selection write primitive;
- failures can be isolated to ordering or projection tests.

Cost: legacy range execution remains temporarily present.

### B. Replace Selection, Input, and Undo in one change

Move all mutation planning to new selection points and add Yjs bookmarks at the
same time.

Advantages: reaches the desired architecture immediately.

Rejected because selection, IME, undo, clipboard, table, and Safari behavior
would all move at once. The regression surface is too large for the current
dirty refactor branch.

### C. Add only a DOM adapter facade

Keep current ordering and write behavior, but hide native Selection calls
behind a new class.

Rejected because it changes file organization without fixing either source of
model/DOM drift.

## 5. Domain Design

### 5.1 `SelectionPositionResolver`

Add an internal pure resolver under `framework/modules/selection/`.

Responsibilities:

- compare two block IDs in document order using parent IDs and each parent's
  `childrenIds`;
- determine ancestor/descendant ordering without inspecting `hostElement`;
- resolve the nearest common block-tree ancestor for two block IDs;
- return `null` for stale, disconnected, or inconsistent trees instead of
  throwing.

The resolver depends on a narrow read interface, not `BlockCraftDoc` or Angular
components:

```ts
interface SelectionTreeReader {
  hasBlock(blockId: string): boolean
  getParentId(blockId: string): string | null
  getChildrenIds(blockId: string): readonly string[] | null
}
```

`hasBlock()` distinguishes a valid root (`parentId === null`) from a stale ID;
`getChildrenIds() === null` means the reader cannot resolve that block.

The implementation walks each endpoint to root once, compares the first
diverging children under the common ancestor, and therefore costs
`O(depth + siblings.indexOf)`. Editor nesting depth is small; no DOM or layout
work occurs. A per-call path cache avoids walking the same endpoint twice.

The resolver returns `-1 | 0 | 1`. `SelectionManager` adapts that result to the
existing DOM-position bit values before passing it to `BlockSelection`, so the
exported `BlockSelection` constructor contract is not changed. The existing
public `BlockCraftDoc.compareBlockPosition()` also remains unchanged in this
phase because DnD consumes its legacy `BLOCK_POSITION` contract.

### 5.2 Canonical selection commit

Add one private SelectionManager primitive, conceptually:

```ts
_commitSelection(
  selection: BlockSelection,
  options?: { scrollIntoView?: boolean; modelOnly?: boolean }
): Range | null
```

Invariant order:

1. validate selection liveness;
2. synchronously call `_applyState(selection)`;
3. focus the editor host when needed;
4. suppress the browser's follow-up `selectionchange`;
5. for model-only selection, clear native ranges;
6. otherwise build and apply the derived DOM Range;
7. optionally scroll the committed selection into view.

No caller may apply a native Range for a programmatic selection and rely on a
future `recalculate()` to publish the corresponding model.

### 5.3 Point canonicalization

Existing write APIs accept both current and deprecated shapes. Add internal
conversion helpers that produce `ISelectionPoint` endpoints before commit:

- current text point: `{type:'text', blockId, offset}`;
- legacy text point: `{type:'text', blockId, index, length}`;
- selected/gap/boundary/table-cell points retain their discriminants;
- a single legacy text point with `length > 0` becomes two text endpoints in
  the same block;
- a cross-block legacy `to` text point uses `index + length` as the end offset,
  preserving current `_buildDomRange()` behavior.

Legacy calls remain forward, because the legacy shape does not encode
anchor/head direction. New replay and extension paths retain anchor/head.

### 5.4 `commonParent`

For this phase, `commonParent` stays in `ISelectionJSON` for compatibility.
Programmatic writes compute it from model data:

- same block: endpoint block ID;
- same physical parent: parent ID;
- different physical parents in one semantic scope: scope owner ID;
- otherwise: nearest model-tree common ancestor, subject to the existing scope
  guard.

DOM `Range.commonAncestorContainer` must not be used for programmatic writes.
DOM-derived user selections continue through the existing normalization path.

## 6. Public API Behavior

Signatures stay unchanged. The observable timing becomes consistent:

- `setSelection()` updates `selection.value` before returning its `Range`;
- `setCursorAt()` updates `selection.value` before returning;
- `extendTo()` updates anchor/head before returning;
- editable branches of `setCursorAtBlock()` and
  `selectOrSetCursorAtBlock()` update the model before returning;
- `selectBlock()`, `setGapCursor()`, `setTableCellSelection()`, and new-format
  `replay()` retain their current synchronous behavior.

The synchronous state update is an intentional public behavior improvement and
must be documented in `blockcraft-selection.md`, the L0 quick reference, and a
minor migration entry. No API is removed and no call-site migration is needed.

## 7. DOM Projection and Browser Compatibility

The existing `_buildDomRange()` remains the projection implementation for this
phase. Text offsets still use `InlinePositionMapper`; gap and boundary points
still use zero-width gap anchors.

Programmatic commit keeps the current short suppression window so delayed
Safari/WebKit `selectionchange` events cannot reinterpret the committed model.
Gap DOM readiness retry remains unchanged.

When projection fails after the model was committed:

- log a scoped warning;
- clear the invalid live selection through the existing `blur()` path;
- never leave a model state whose DOM projection partially succeeded.

The failure policy remains fail-closed.

## 8. Performance

- Position comparison performs no DOM query and no layout read.
- Programmatic APIs eliminate the extra `recalculate()` work currently needed
  by callers solely to synchronize model state.
- This phase does not add work to native mouse-drag `selectionchange` handling.
- Equality-based broadcast deduplication is intentionally deferred; mixing it
  into this phase would alter toolbar timing and selected-class updates.

## 9. Testing

### Pure model tests

- siblings in forward and backward order;
- ancestor versus descendant;
- blocks under different columns with a common columns ancestor;
- stale block, missing parent, and child not present in parent;
- no test block needs `hostElement`.

### SelectionManager tests

- `setCursorAt()` synchronously publishes a collapsed text selection;
- `setSelection()` synchronously publishes same-block and cross-block ranges;
- legacy `index/length` retains its exact range semantics;
- `extendTo()` preserves the original anchor and changes only the head;
- editable `setCursorAtBlock()` is model-first;
- model state is already visible while the DOM projection is being applied;
- projection failure clears state rather than retaining a partial commit;
- existing selected/gap/boundary/table-cell replay tests remain green.

### Regression suites

Run selection, input, undo, event, and clipboard tests in ChromeHeadless. Build
the editor package. Safari/WebKit manual testing is not required until a later
phase changes visible interaction behavior, but current Safari-specific unit
expectations must remain green.

## 10. Documentation and Migration

This is an architectural/public behavior change because SelectionManager write
methods become synchronously model-first. In the implementation commit:

1. update `packages/editor/ai-skills/blockcraft-selection.md`;
2. update the Selection quick reference in
   `packages/editor/ai-skills/blockcraft.md`;
3. add a minor entry to `packages/editor/ai-skills/MIGRATIONS.md`;
4. refresh `Last updated:` on modified skill documents;
5. do not change the package version without an explicit release request.

## 11. Delivery Boundaries

The implementation commit must include only files belonging to this phase.
Existing uncommitted input, clipboard, restore, playground, and callout changes
remain unstaged even when their tests are used as the regression baseline.

The next phase, after this one is stable, will replace InputTransformer's
`endpointsToLegacy()` execution path with model-native edit planning. Live Yjs
selection bookmarks and unified undo/remote mapping follow after that.
