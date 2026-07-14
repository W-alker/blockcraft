# Input Model-Native Edit Plan Design

> Status: awaiting written-spec review
> Date: 2026-07-14
> Branch: `ref-cursor`
> Scope: remove legacy range conversion from BlockSelection-driven input execution

## 1. Context

The selection refactor now makes `BlockSelection` the canonical state and
resolves programmatic selection writes from the block tree before projecting a
DOM Range. `InputTransformer` still has an older compatibility seam:

- model selections are repeatedly converted through `endpointsToLegacy()`;
- mutation helpers accept `INormalizedRange | BlockSelection` and branch again;
- mixed boundary/text input is first lowered to synthetic legacy
  `index/length` ranges;
- beforeinput, printable-key fallback, composition, delete, and clipboard paths
  classify the same selection independently.

The conversion is lossy for `gap`, `boundary`, and `table-cell` points. It also
makes the mutation path harder to virtualize because execution reasons about a
DOM-era range shape rather than an explicit model edit intent.

`INormalizedRange` is still a deprecated public compatibility type. Existing
code-block, Mermaid, formula, inline-link, and one-shot-anchor paths call the
public `SelectionManager.normalizeRange()` API. Removing that API now would be
a breaking change and is not required for virtual rendering.

## 2. Decision

Keep `INormalizedRange` at the DOM and legacy-plugin compatibility boundary,
but remove it from BlockSelection-driven input planning and execution.

The Input bounded context gains one internal, model-native planning step:

```text
DOM event / keyboard / composition / clipboard intent
  -> input adapter chooses canonical model selection or DOM target endpoints
  -> SelectionEditPlanner returns one discriminated SelectionEditPlan
  -> InputTransformer executes the plan through DocCRUD / Y.Text
  -> SelectionManager commits the resulting model selection
  -> view projection follows through the existing selection adapter
```

`InputTransformer` remains the application service and mutation executor in
this phase. A separate executor class is deliberately not introduced: it would
need composition, schema, undo, selection, and CRUD dependencies and would move
complexity without reducing it. The pure planner is the new isolation boundary.

## 3. Goals

1. Remove every `endpointsToLegacy()` call from
   `framework/modules/input/index.ts`.
2. Ensure every BlockSelection-driven mutation consumes one model-native edit
   plan instead of reclassifying selection points in multiple handlers.
3. Preserve current typing, deletion, IME, undo, format inheritance, table,
   boundary, gap, scope-policy, and Safari/WebKit behavior.
4. Keep the public `INormalizedRange` and `SelectionManager.normalizeRange()`
   compatibility contracts unchanged.
5. Keep planning free of DOM queries, layout reads, Yjs writes, and Angular
   change detection.
6. Establish the input boundary needed by future virtual rendering without
   claiming to implement virtualization in this phase.

## 4. Non-Goals

- Do not remove or unexport `INormalizedRange`, `IBlockRange`, or
  `SelectionManager.normalizeRange()`.
- Do not change SelectionManager point types or selection-scope semantics.
- Do not add live Yjs selection bookmarks.
- Do not change undo capture grouping or transaction boundaries.
- Do not extract all InputTransformer mutation methods into another service.
- Do not add offscreen selection geometry, virtual list anchoring, or block
  mount/pinning behavior.
- Do not change `packages/editor/package.json` version.

## 5. Considered Approaches

### A. Model-native core with compatibility adapter (chosen)

Add an internal edit planner and route model-owned input through it. Keep the
legacy public range API at the outer adapter boundary.

Advantages:

- removes lossy conversion from the correctness-critical path;
- preserves plugin compatibility;
- creates a clean virtualization boundary;
- permits incremental parity tests by plan kind.

Cost: the deprecated public type remains until a later breaking release.

### B. Wrap the legacy conversion behind a facade

This has the smallest diff, but mutation semantics would still depend on the
lossy range shape. It improves file organization without improving the model.

### C. Remove `INormalizedRange` everywhere now

This would require simultaneous changes to block-specific inline runtimes,
plugins, public exports, migration guidance, and all external consumers. It has
high regression and adoption risk and provides no additional virtualization
capability over approach A.

## 6. Domain Boundaries

### 6.1 Selection context

Owns canonical positions and ordering:

- `BlockSelection` and `ISelectionPoint`;
- anchor/head direction and document-ordered start/end;
- scope ownership and DOM-to-model endpoint normalization;
- model-to-DOM projection.

Selection does not decide how input mutates document data.

### 6.2 Input context

Owns user edit intent:

- classify insert, delete, paragraph, and composition materialization intent;
- plan how a canonical selection is replaced;
- preserve scope policy such as columns tail behavior;
- capture undo at the existing boundary;
- execute Yjs-owned mutations and commit the resulting selection.

### 6.3 Document context

Owns block-tree and inline mutations through `DocCRUD`, `DocChain`, and Y.Text.
The planner never writes to this context.

### 6.4 View adapter

Owns native `StaticRange`, DOM zero-space/embed quirks, and caret projection.
DOM target ranges may still enter through a compatibility adapter, but a
legacy range object must not flow into model-owned execution.

## 7. Canonical Planning Model

Add `framework/modules/input/selection-edit-plan.ts`. Its types remain internal
to the editor package in this phase.

The planner accepts:

```ts
interface SelectionEditRequest {
  selection: BlockSelection | INormalizedEndpoints
  intent: SelectionEditIntent
}

type SelectionEditIntent =
  | { kind: 'insert-text'; text: string }
  | { kind: 'delete'; direction: 'backward' | 'forward' | 'range' }
  | { kind: 'insert-paragraph' }
  | { kind: 'composition-materialize' }
```

`INormalizedEndpoints` is allowed only for a native beforeinput target range
that could not use the canonical live `BlockSelection`. Unlike
`INormalizedRange`, it retains the current point discriminants and uses offsets
instead of `index/length` slices.

The result is a closed union:

```ts
type SelectionEditPlan =
  | CollapsedTextPlan
  | TextRangePlan
  | BlockRangePlan
  | GapPlan
  | BoundaryPlan
  | TableCellPlan
  | UnsupportedPlan
```

Each plan contains IDs, offsets, structural indexes, policy flags, and the
post-mutation selection recipe. A recipe may refer to the result of an insert
operation instead of inventing an ID before the block exists. Plans do not
contain DOM nodes, Range objects, or eagerly materialized lists of every
covered block.

### 7.1 Text ranges

Use half-open text slices:

```ts
interface TextSlice {
  blockId: string
  from: number
  to: number
}
```

For same-block text selection, one slice represents `[start.offset,
end.offset)`. For cross-block text selection, the start slice covers the start
offset to block end and the end slice covers block start to the end offset.

The plan records `tailMode: 'merge' | 'preserve'` once from
`SelectionScopePolicy`. It also records the stable text cursor to commit before
deleting an endpoint block, preserving IME behavior.

### 7.2 Whole-block and mixed ranges

Whole-block edges remain explicit `{kind:'block', blockId}` edges. Mixed
selected/text ranges use one block edge and one text slice; they are never
encoded as a text point with synthetic `length`.

All-selected replacement remains distinct from text replacement because it may
insert a paragraph beside the selected block or inside a selected renderUnit
container. Existing schema checks determine `sibling` versus `inside` mode.

### 7.3 Boundary ranges

Same-container boundary selection records `{hostId, fromIndex, toIndex}`.
Mixed boundary/text selection resolves the direct child under the boundary
host once and produces explicit block/text edges. No synthetic legacy range is
created.

### 7.4 Gap and table-cell plans

Gap plans retain `{blockId, side}`. Table-cell plans retain table ID, anchor
cell ID, head cell ID, and the existing replacement mode. They continue to use
their specialized model-owned mutation paths.

### 7.5 Unsupported plans

The planner fails closed with an internal reason code. The event adapter calls
`preventDefault()` and clears the editor selection exactly as today. It never
falls back to browser contenteditable mutation.

## 8. Execution Rules

`InputTransformer` executes exactly one plan per accepted event.

1. Validate the plan's referenced endpoint IDs before mutation.
2. Capture the pre-change selection at the existing undo boundary.
3. Commit a stable text selection before removing selected endpoint blocks when
   IME or cross-block replacement requires it.
4. Resolve covered paths once, only for plans that cross blocks.
5. Perform the existing DocCRUD/Y.Text operations without changing transaction
   grouping.
6. Apply inherited inline attributes from the insertion text slice.
7. Commit the plan's post-mutation selection through SelectionManager.
8. Fail closed if any required block or structural relation becomes stale.

Execution must not inspect `hostElement`, `Range`, layout geometry, or DOM
document order.

## 9. Adapter Strategy

### Canonical model selection

When `doc.selection.value` is authoritative, the event adapter passes the
`BlockSelection` directly to the planner.

### Native target range

When beforeinput must use `getTargetRanges()`, Input imports the internal
DOM-to-endpoint normalizer and obtains `INormalizedEndpoints`. It does not call
the public legacy wrapper that returns `INormalizedRange`.

This fallback accepts ordinary text endpoints only. Gap, boundary, table-cell,
and whole-block semantics must come from the canonical `BlockSelection`; an
unexpected structural target endpoint fails closed instead of being guessed
from DOM state.

### Public compatibility

`SelectionManager.normalizeRange()` keeps returning `INormalizedRange` for
existing callers. `InputTransformer.deleteByRange()` keeps its current public
signature initially; the legacy branch remains an adapter into existing
compatibility execution, while its `BlockSelection` branch must use the new
planner. No new code may add legacy-range execution.

## 10. Performance Constraints

- Planning is `O(1)` for same-block text and collapsed selections.
- Planning may walk endpoint ancestry for mixed boundary/text selection, but it
  does so once per accepted event.
- Covered block paths are resolved only during execution and only once.
- Scope policy is resolved once and stored in the plan.
- Do not call `childrenIds` in loops when parent/index metadata already resolves
  the relation; a single indexed lookup is acceptable.
- Do not cache plans across events. A plan is short-lived and document state may
  change between events through collaboration.
- Do not perform layout reads or synchronous DOM queries in planner/executor
  code.

Focused tests will assert call budgets where practical; this design does not
claim benchmark improvements without browser profiling.

## 11. Virtual Rendering Implications

This phase is necessary architectural preparation but not the complete virtual
rendering solution.

It provides:

- selection replacement semantics expressed as IDs, offsets, and child indexes;
- no dependency on a mounted native Range for model-owned edits;
- a narrow read/mutation boundary that can later target a block model service
  instead of mounted components.

Virtual rendering will still require:

- a model-level block/text reader for unmounted blocks;
- offscreen selection painting and geometry estimation;
- pinning the active editable/IME block while composition is running;
- scroll anchoring and remount-safe DOM projection;
- remote selection mapping independent of mounted elements.

The deprecated public range adapter may remain indefinitely for mounted DOM
islands without blocking those capabilities.

## 12. Error Handling

- Stale endpoint or parent relation: return `UnsupportedPlan('stale-model')`.
- Unsupported boundary host: return `UnsupportedPlan('invalid-host')`.
- Missing editable insertion target: return
  `UnsupportedPlan('missing-text-target')`.
- Mutation/projection failure: log through the existing scoped logger, clear the
  live selection, and prevent native mutation.
- Composition planning failure: abort the pending composition and consume its
  matching composition end without committing text.

Reason codes are internal diagnostics and do not change public events.

## 13. Testing

### Pure planner tests

- collapsed and non-collapsed same-block text;
- forward/backward cross-block text produces the same ordered plan;
- columns policy records preserved tail behavior;
- selected/text and text/selected mixed edges;
- all-selected block range;
- same-container boundary and mixed boundary/text;
- gap before/after;
- table-cell rectangle;
- stale and unsupported structures fail closed;
- planner performs no DOM/layout calls.

### Input integration tests

- beforeinput, printable fallback, deleteByRange, and IME consume equivalent
  plans for the same model selection;
- format inheritance remains unchanged;
- cross-column deletion preserves the current tail semantics;
- mixed boundary/text replacement and undo remain atomic;
- selected void/container replacement retains sibling/inside behavior;
- table rectangle and gap behavior remain unchanged;
- no `endpointsToLegacy()` call remains in the Input module.

### Regression

Run selection, input, undo, event, clipboard, table-binding, and affected plugin
tests in ChromeHeadless, then run `pnpm build:editor`. Because this phase is
behavior-preserving, Safari manual testing is deferred unless an integration
test exposes a browser-specific projection change.

## 14. Delivery and Documentation

Implementation should be split into reviewable commits:

1. internal planner and pure tests;
2. text and mixed-range execution migration;
3. beforeinput, printable, delete, and IME routing convergence;
4. legacy-call removal from Input plus regression/docs.

The implementation changes Input architecture but not public behavior. Update
`blockcraft-input.md` and add an internal patch migration entry according to the
repository architecture-documentation rule. Do not change package version.

Existing uncommitted playground and callout changes must remain unstaged.
