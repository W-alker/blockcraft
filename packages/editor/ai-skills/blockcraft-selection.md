# BlockCraft: Selection System Deep Dive

> **Level 2: Mechanism Deep Dive** — Only read this when modifying selection behavior or when the L1 quick reference in `blockcraft.md` isn't enough.
>
> Last updated: 2026-07-14 | Source of truth: `framework/modules/selection/`

## Architecture Overview

```
Browser interaction (click / drag / native keyboard selection)
  → focus into native input island? → SelectionManager.blur()
  → DOM `selectionchange` event
  → SelectionManager.recalculate()
      → normalizeRange(DOMRange)         // DOM → endpoints
      → BlockSelection (anchor/head)     // immutable model
      → discard stale model references    // missing block ids become null
  → selectionChange$.next(selection)     // BehaviorSubject
  → SelectedManager (DOM class updates: .selected, .focused)

Programmatic write (API / undo replay / keyboard command)
  → canonicalize current or legacy points
  → resolve order/common parent from the block tree
  → validate + publish BlockSelection synchronously
  → focus host + suppress native selectionchange
  → project model to DOM Range (or clear native Range for model-only selection)
      → transient projection failure: keep model + bounded version-guarded retry
  → FakeRange (visual overlay for non-native selections, optional)
```

**Key principle**: `BlockSelection` is the canonical truth. The DOM `Selection` is a derived view. Every programmatic write goes through one model-first commit path: `setSelection()`, `setCursorAt()`, `extendTo()`, editable block cursor helpers, `selectBlock()`, `setGapCursor()`, table-cell selection, and replay all publish `doc.selection.value` before DOM projection. `SelectionPositionResolver` resolves endpoint order and nearest common ancestry together from `parentId`, reading only the first divergent parent's `childrenIds`; it does not call `compareDocumentPosition()` or read layout. Immutable `BlockSelection` instances cache their derived direction, so repeated `direction` / `start` / `end` reads do not walk the model tree again. The derived DOM Range is applied under a short native `selectionchange` suppression window so browsers (notably Safari/WebKit) cannot immediately reinterpret a container/callout block range back into internal child text or boundary endpoints. If a live model selection reaches the view before its block DOM is mounted, projection failure does not call `blur()`: Selection keeps the model, removes any partial native range, and retries only while the projection version and expected JSON still match. A newer selection cancels the old task, and an explicitly focused external control is never stolen back.

### Input Consumer Contract

`InputTransformer` consumes current selections through the pure planner in `framework/modules/input/selection-edit-plan.ts`. The planner reads ordered `start/end` points plus model IDs, ancestry, child lists, and text lengths, then emits a short-lived edit plan. It does not convert current selections to deprecated `from/to/index/length` ranges and does not use endpoint `point.block` references as mutation authority. This keeps selection intent stable when DOM projection is absent, delayed, or virtualized; Input resolves live block components by ID only at execution time and fails closed if the model has become stale.

Selection owns positions and semantic scope. Input owns lowering those positions into half-open text slices, structural block edges, Yjs mutations, undo capture, and post-edit cursor recipes. Plugins should continue reading `BlockSelection`; the internal edit plan is not a public selection type.

## Native Input Islands

When focus moves into a native `input`, `textarea`, `select`, or a node marked with `data-bc-native-input` inside the editor:

- `SelectionManager` clears the current `BlockSelection`
- subsequent `selectionchange` recalculations stay `null` while that native control owns focus
- the editor stops treating the previous inline cursor as active

This prevents stale toolbar state and accidental block-level keyboard handling while a block-local form field is being edited.

## Key Files

| File | Purpose |
|------|---------|
| `framework/modules/selection/index.ts` | `SelectionManager` — public API + DOM↔model bridging |
| `framework/modules/selection/blockSelection.ts` | `BlockSelection` — immutable anchor/head model |
| `framework/modules/selection/types.ts` | `ISelectionPoint`, `ISelectionJSON`, deprecated legacy types |
| `framework/modules/selection/normalize.ts` | `normalizeRange()` — DOM Range → endpoint pair |
| `framework/modules/selection/position-resolver.ts` | Pure block-tree document ordering + nearest common ancestor validation |
| `framework/modules/selection/scope.ts` | `SelectionScope` resolver + `SelectionScopePolicy` — semantic cross-parent guard and scope-owned input/visual policy |
| `framework/modules/selection/liveness.ts` | Endpoint guard for hot reads + structural liveness guard before broadcast/input |
| `framework/modules/selection/selection-keyboard.ts` | Arrow / Shift / Home / End / Ctrl+A / Escape handling |
| `framework/modules/selection/selected-manager.ts` | DOM class management (`.selected`, `.focused`) |
| `framework/modules/selection/createFakeRange.ts` | Visual overlay for non-native selections (collab cursors, find/replace) |

## Core Data Model

### Selection Point (Discriminated Union)

A point describes **one endpoint** of a selection. There are five variants discriminated by `type`:

```typescript
// Cursor inside an editable block's inline text
interface ITextSelectionPoint {
  readonly blockId: string
  readonly type: 'text'
  readonly offset: number                       // character offset in inline content
  readonly block: EditableBlockComponent<any>   // lazy-resolved, non-enumerable
}

// Whole-block selection (void blocks, container blocks, "selected" state)
interface ISelectedSelectionPoint {
  readonly blockId: string
  readonly type: 'selected'
  readonly block: BaseBlockComponent<any>       // lazy-resolved, non-enumerable
}

// Yuque-style gap cursor: a COLLAPSED blinking caret beside a void or container
// block. `side` says whether the caret sits at the block's leading ('before') or
// trailing ('after') edge. Typing/Enter at a gap inserts an adjacent paragraph
// (keeping the block); arrow nav moves the gap across blocks.
interface IGapSelectionPoint {
  readonly blockId: string
  readonly type: 'gap'
  readonly side: 'before' | 'after'             // which edge of the block
  readonly block: BaseBlockComponent<any>       // lazy-resolved, non-enumerable
}

// Document-tree boundary inside a container/root block. `blockId` is the
// container block and `index` is the child boundary position: 0 before the first
// child, `childrenLength` after the last child.
interface IBoundarySelectionPoint {
  readonly blockId: string
  readonly type: 'boundary'
  readonly index: number
  readonly block: BaseBlockComponent<any>       // container/root block
}

// Table rectangular selection endpoint. `blockId` is a table-cell id; `tableId`
// is the owning table. The table component turns anchor/head cells into an
// adjusted rectangular coordinate range and paints the selected cells.
interface ITableCellSelectionPoint {
  readonly blockId: string
  readonly type: 'table-cell'
  readonly tableId: string
  readonly block: BaseBlockComponent<any>       // table-cell block
}

type ISelectionPoint =
  | ITextSelectionPoint
  | ISelectedSelectionPoint
  | IGapSelectionPoint
  | IBoundarySelectionPoint
  | ITableCellSelectionPoint
```

> The `block` accessor is defined via `Object.defineProperty` with `enumerable: false`, so it doesn't show up in `JSON.stringify`. Always narrow on `point.type` before reading `offset` (text-only), `side` (gap-only), `index` (boundary-only), or `tableId` (table-cell-only).

### Boundary Selection (`type: 'boundary'`)

A boundary point represents a **position between children of a container/root block**, not a DOM node. It is the closest BlockCraft analogue to ProseMirror-style document positions for container selections:

- `blockId` is the container/root block that owns the child list.
- `index: 0` means before the first child.
- `index: childrenLength` means after the last child.
- `[boundary(0), boundary(childrenLength)]` means "the container's child content is selected" without selecting the container block itself.

Non-collapsed DOM selections whose endpoints land on `.children-render-container` or a wrapper around it normalize to boundary points. Non-collapsed cross-block endpoints that land on a child block's leading/trailing gap text anchor or void/container block chrome also normalize back to the parent boundary index (`before` = child index, `after` = child index + 1). A same-block leading→trailing gap or chrome range still represents explicit whole-block `selected`. `SelectionManager` can build/replay DOM Ranges from boundary JSON, `SelectedManager` paints the covered child blocks, and undo/redo snapshots store boundary anchor/head indexes as Yjs relative positions over the parent's children array.

When `SelectionManager` builds a DOM Range from boundary points, it prefers the adjacent child block's gap text anchor when that child has leading/trailing block gap fillers. `normalizeRange()` treats those non-collapsed cross-block gap anchors, and cross-block void/container chrome endpoints, as the same parent boundary points on the way back. This keeps Shift+Arrow and native drag ranges that cross void/container blocks anchored on stable structural positions without letting Safari/WebKit reinterpret the model as a whole-block `selected` endpoint or internal child text.

Input over a same-container boundary range is structural and Yjs-owned when the owning container is a `renderUnit` that accepts paragraphs:

- **Typing / printable keydown fallback** — deletes the covered child range with `DocCRUD.deleteBlocks(..., force: true)`, inserts one paragraph at the boundary index, and places the caret after the inserted text.
- **IME** — materializes an empty paragraph at the boundary index before `CompositionSession.startFromSelection()`, so composition commits into a real `Y.Text`.
- **Backspace / Delete** — deletes the covered child range and moves selection to the adjacent remaining child (or the auto-created empty paragraph when the renderUnit becomes empty).
- **Enter** — replaces the covered child range with an empty paragraph and places the caret in it.

Boundary ranges in structural containers that cannot host paragraphs remain fail-closed (`preventDefault()` + clear selection) until explicit semantics are added.

### Table Cell Selection (`type: 'table-cell'`)

A table-cell point represents one endpoint of a **model-owned rectangular table selection**. It deliberately does not depend on a native DOM Range:

- `blockId` is the table-cell block id.
- `tableId` is the owning table block id.
- `anchor` / `head` preserve drag intent; `start` / `end` remain document-ordered.
- `BlockSelection.getTableCellSelection()` returns `{ tableId, anchorCellId, headCellId }` when both endpoints belong to the same table.
- `SelectionManager.setTableCellSelection(table, anchorCell, headCell?)` updates `doc.selection.value` synchronously, focuses the editor host, clears the browser native range, and lets `TableBlockComponent` paint the adjusted rectangle.
- `SelectionManager.getSelectionRect()` and `getSelectionRects()` return `null` for table-cell selections. They are intentionally model-only, so toolbar/overlay code must not derive geometry from a synthetic DOM Range.
- While the editor host keeps focus, an empty native `selectionchange` caused by that `removeAllRanges()` does not clear the model-owned table-cell selection; explicit `blur()` / `replay(null)` still clears it.

`TableBlockComponent` remains responsible for merged-cell adjustment and the private `.bc-table-cell-selected` cell rectangle class. Generic selected/focused class painting ignores model-owned table-cell selections, and text-shaped fallback ranges that cross different cells do not mark `table-row` containers as `.selected`. `FloatTextToolbarPlugin` also ignores table-cell rectangles and cross-cell text-shaped ranges, while still allowing normal text selection inside one cell. `TableBlockBinding` reads table-cell model selection first for copy/cut/paste/delete/arrow navigation, then falls back to the table component's explicit row/column/cell rectangle state for older paths. Plain Arrow over a model table-cell selection moves/collapses to the adjacent visible cell; Shift+Arrow keeps the anchor and extends the head. `InputTransformer` reads the same model selection for typing, printable keydown, Enter, Backspace/Delete fallback, and IME materialization: text goes into the anchor cell's fresh paragraph; delete-style input clears selected visible cells and keeps the rectangle selected. Undo/redo snapshots store table-cell anchor/head `{ blockId, tableId }` and restore the model selection if both cells and table still exist.

### Gap Cursor (`type: 'gap'`)

A gap point reuses the per-block **`contenteditable` gap filler spans** (`<span data-block-zero-space class="bc-block-gap">{zero-width text}</span>`) that `BaseBlockComponent` mounts around non-leaf void/container blocks (`createBlockGapSpace()` in `framework/utils/zero-gap.ts`). A **collapsed** native range landing inside the leading filler normalizes to `{type:'gap', side:'before'}`; inside the trailing filler it becomes `{type:'gap', side:'after'}` (see `resolveBlockGapSide()`). `_buildDomRange` maps the gap point back to a collapsed range inside the filler zero-width text node, while `getBlockGapCaretSpan()` still returns the visual span used for geometry. The **browser renders its real native caret** on that filler line box (above the card for `before`, below for `after`); there is no fake CSS bar. The text-node anchor exists for Safari/WebKit, which does not reliably paint a caret for a collapsed range at a filler span boundary.

Gap is **always collapsed** — both `anchor` and `head` are the same gap point, so `collapsed` is true and there is no offset. Behaviors at a gap:

- **Arrow nav** — Left/Right (and Up/Down into a void/container) move the gap across blocks (`before` ↔ `after` ↔ neighbour).
- **Type / Enter / IME** — inserts an adjacent paragraph as a sibling at the gap index, keeping the void/container block, then drops the caret into the new paragraph.
- **Backspace / Delete** — removes the void/container block from a gap.
- **Click on blank area** — beside a void/container block sets a gap cursor on the nearest edge.
- **Paste** — inserts clipboard blocks as siblings at the gap index (`before` = block index, `after` = block index + 1), keeping the block (handled by `ClipboardManager._applyGapPaste`).

Shift+Arrow uses `gap` only as the collapsed starting caret. Once the user extends over a void/container block, the new moving endpoint is represented as a parent `boundary` point and rendered through the block's leading/trailing gap anchors. If a later `selectionchange` reads that non-collapsed DOM range back, the gap anchor or block chrome endpoint round-trips to the same boundary index instead of falling back to `selected`. When Shift+Arrow leaves a container from its first or last child and there is no sibling inside that container, the moving endpoint similarly maps to the container's boundary in its parent instead of promoting the container to `selected`. Continued Shift+Arrow extension advances from the model `head`, not from the browser native `Selection.focusNode`, because replayed backward ranges may be painted with a forward native focus. Collapsed text/gap starts can materialize a structural boundary range, but an existing non-collapsed text anchor remains a text point so the model keeps the user's visible text extent. Supported mixed `text + boundary` ranges are handled by `InputTransformer`; `selected` remains reserved for explicit whole-block selection commands such as click/Escape/Ctrl+A-style block selection.

### Ctrl+A Ladder

Ctrl+A is model-first and climbs by content coverage, not by DOM highlight shape:

- Partial/collapsed editable text -> `selectAllChildren(editable)` creates a full text range and shows the "press again" hint.
- Full editable text range -> `selectAllChildren(parent)` creates a parent content range, except table-cell paragraphs first promote to table-cell selection.
- Partial container/root boundary range -> `selectAllChildren(container)` expands to all direct children.
- Full container boundary range or explicit whole-block `selected` -> `selectAllChildren(parent)` climbs one level. Full root boundary selection stays at root.
- Model table-cell selection -> `selectBlock(table)` selects the whole table block.

This keeps repeated Ctrl+A aligned with the same `boundary` model that Shift+Arrow uses around gap/container blocks. It also avoids asking the browser to reinterpret a container DOM range before input/IME runs.

### BlockSelection

```typescript
class BlockSelection {
  readonly anchor: ISelectionPoint   // where the user started dragging / clicked
  readonly head: ISelectionPoint     // where the cursor currently is
  readonly commonParent: string      // common ancestor block id

  // ── Direction & ordering ──
  get direction(): 'forward' | 'backward'
  get start(): ISelectionPoint       // anchor or head, document-ordered first
  get end(): ISelectionPoint         // anchor or head, document-ordered last
  get firstBlock(): BaseBlockComponent<any>   // start.block
  get lastBlock(): BaseBlockComponent<any>    // end.block

  // ── Predicates ──
  get collapsed(): boolean           // same text offset, same gap side, same boundary index, or same table cell
  get isInSameBlock(): boolean       // anchor.blockId === head.blockId, except non-collapsed boundary/table-cell ranges
  get isStartOfBlock(): boolean      // start at offset 0, OR 'selected', OR gap 'before', OR table-cell
  get isEndOfBlock(): boolean        // end at textLength, OR 'selected', OR gap 'after', OR table-cell
  get isAllSelected(): boolean       // both anchor/head are whole-block ('selected') points
  get isEmpty(): boolean             // collapsed text selection (alias for cursor)

  // ── Containment ──
  contains(blockId: string, offset?: number): boolean
  getBoundarySelectedChildIds(): string[] | null
  getTableCellSelection(): { tableId: string; anchorCellId: string; headCellId: string } | null

  // ── Serialization ──
  toJSON(): ISelectionJSON           // new format
  toLegacyJSON(): IBlockSelectionJSON  // backward-compat format with from/to
}
```

**Anchor vs Start** — `anchor` is the *intentional* origin (where the user clicked first). `start` is the *positional* origin (whichever comes first in document order). When the user drags right→left, `anchor > head` in document order, so `start === head`.

**Always prefer `start`/`end`** in plugin code unless you specifically need to know the drag direction.

### JSON Shapes

```typescript
interface ISelectionPointJSON {
  blockId: string
  type: 'text' | 'selected' | 'gap' | 'boundary' | 'table-cell'
  offset?: number               // present only for type === 'text'
  side?: 'before' | 'after'     // present only for type === 'gap'
  index?: number                // present only for type === 'boundary'
  tableId?: string              // present only for type === 'table-cell'
}

interface ISelectionJSON {
  anchor: ISelectionPointJSON
  head: ISelectionPointJSON
  commonParent: string
}
```

> `toJSON()` / `replay()` round-trip anchor/head direction, gap `side`, boundary `index`, and table-cell `tableId`. `DocUndoManager` captures anchor/head as relative model points (text and boundary use Yjs relative positions) and replays `ISelectionJSON`, so undo/redo restores direction-sensitive selections without depending on DOM `selectionchange`. The deprecated legacy `IBlockSelectionJSON.from` union is widened with `{blockId, type:'gap', side}`, `{blockId, type:'boundary', index}`, and `{blockId, type:'table-cell', tableId}` variants for replay compatibility; `toLegacyJSON()` itself still degrades gap/boundary/table-cell selections to lossy `selected` points where the old format cannot express intent.

## SelectionManager Public API

### Reading Selection

```typescript
// Current selection (synchronous)
// Repeated reads cheaply validate endpoint/common-parent ids. Structural coverage
// is validated before DOM recalculation, publication, input, and replay.
doc.selection.value                    // BlockSelection | null

// Observe changes (BehaviorSubject — emits current value immediately).
// SelectionManager validates lazy block references before broadcasting; if a
// replay/undo snapshot points at deleted blocks, subscribers receive null.
doc.selection.selectionChange$         // BehaviorSubject<BlockSelection | null>

// Lifecycle-bound observer (auto-unsubscribes on doc destroy)
doc.selection.changeObserve()          // Observable<BlockSelection | null>

// Fires once on the next change, then completes
doc.selection.nextChangeObserve()      // Observable<BlockSelection | null>
doc.selection.afterNextChange(fn)      // Subscribe sugar

// Explicitly sample the current native DOM Selection into the model.
// Use only at browser event/native-mutation boundaries. Never call this to
// confirm setSelection()/setCursorAt()/replay(): those writes already commit
// the canonical model synchronously before projecting the DOM view.
// Pass execNext=false to defer the side-effect (emit + DOM class update).
doc.selection.recalculate(execNext?, options?)
//  → { value: BlockSelection | null, next?: () => void }

// Geometry (for positioning toolbars/overlays)
doc.selection.getSelectionRect(): DOMRect | null
doc.selection.getSelectionRects(): DOMRectList | null
doc.selection.getSelectedText(): string

// Scroll the current selection into view (used after navigation)
doc.selection.scrollSelectionIntoView()
```

### Programmatic Selection

```typescript
// Set cursor at a specific text offset in an editable block.
// The collapsed text BlockSelection is published synchronously, then projected.
doc.selection.setCursorAt(editableBlock, offset)

// Move the cursor to a block (auto-picks editable descendant or selects whole block)
// atStart: true → cursor at offset 0; false → cursor at textLength.
// Editable branches use the same synchronous model-first cursor commit.
doc.selection.setCursorAtBlock(block, atStart, scrollIntoView?)

// Select an entire block (used for void/block-level selection)
// Updates doc.selection.value synchronously before applying the derived DOM
// Range. The follow-up native selectionchange from Selection.addRange() is
// suppressed briefly, keeping whole-block container selections model-owned.
doc.selection.selectBlock(block)

// Set a Yuque-style gap cursor beside a void/container block.
// side: 'before' → caret at the leading edge; 'after' → trailing edge.
// Accepts a block id or a BlockComponent. Builds a collapsed range in the
// matching gap filler span; the DOM Range itself is anchored inside that
// filler's zero-width text node for WebKit caret visibility.
// Updates doc.selection.value synchronously before applying the DOM Range.
doc.selection.setGapCursor(block, 'before' | 'after', scrollIntoView?)

// Set a model-owned rectangular table-cell selection. This is model-only:
// the browser native Range is cleared and TableBlockComponent paints cells.
doc.selection.setTableCellSelection(table, anchorCell, headCell?, scrollIntoView?)

// Extend the canonical selection's head while preserving its anchor and direction.
// Falls back to a collapsed cursor when no live model selection exists.
doc.selection.extendTo(editableBlock, offset)

// Select all children/content of a block.
// Editable blocks become a model-first text range. Container/root blocks with
// children become [boundary(0), boundary(childrenLength)]. Void/empty blocks
// fall back to whole-block selected state.
doc.selection.selectAllChildren(block)

// Canonicalize points, publish BlockSelection synchronously, then derive/apply Range.
// Legacy index/length calls remain forward; current ISelectionPoint calls retain
// from/to direction. Returns the derived Range for compatibility.
doc.selection.setSelection(anchor, head?)        // new ISelectionPoint
doc.selection.setSelection(legacyFrom, legacyTo) // @deprecated legacy format

// Replay a saved selection (e.g. from undo/redo or remote sync).
// Accepts both new ISelectionJSON and legacy IBlockSelectionJSON.
// New ISelectionJSON applies the BlockSelection model synchronously before the
// native DOM Range view catches up. Legacy JSON remains accepted for compat.
doc.selection.replay(json)

// Clear all selection (no DOM range)
doc.selection.blur()
```

### FakeRange (Visual Overlays)

`FakeRange` paints highlight rectangles into the editor without using the native browser selection. Use cases: collaborative cursors, find/replace highlights, "ghost" selections that survive focus changes.

For model-owned table-cell selections, `createFakeRange(selection)` paints a border-only focus ring on the anchor cell instead of rendering the full rectangle.

```typescript
// From a saved JSON (new or legacy format) or a live BlockSelection
doc.selection.createFakeRange(source, config?): FakeRange

// config: { className?, style?, zIndex?, ... } — see IFakeRangeConfig
fakeRange.dispose()  // remove the overlay
```

## Selection Lifecycle Flow

```
DOM `selectionchange` event
  → SelectionManager._bindEvents() listener fires
  → Skip if isComposing (IME active) or _suppressRecalculate
  → RootBlockComponent does not start its block-level pointerleave selection
    chain when the mouse selection starts inside an editable block, so native
    text drag ranges can cross semantic scopes such as columns and reach
    normalizeRange().
  → recalculate()
      → document.getSelection().getRangeAt(0)
      → If selection escaped editor root → setNull
      → If anchor === editor root → snap to nearest child block
      → _normalizeRange(range)
          → walks DOM nodes, asks each EditableBlockComponent's
            InlinePositionMapper.domPointToModel() for the offset
          → returns { start: ISelectionPoint, end: ISelectionPoint }
      → Detect direction via isSelectionBackward(nativeSelection)
      → anchor = backward ? end : start ; head = backward ? start : end
      → Scope guard: if physical parents differ, resolve semantic selection scope
        and project closed-scope endpoints to parent boundary points
      → Build BlockSelection
  → _applyState()
      → validate lazy block references; stale ids become null
      → selectionChange$.next(selection)
      → SelectedManager paints `.selected` / `.focused` classes
```

Programmatic gap cursor flow:

```
doc.selection.setGapCursor(block, side)
  → lazyGapPoint(block.id, side)
  → BlockSelection(gap, gap)
  → _applyState(selection)           // synchronous model update
  → _buildDomRange(gap)
  → native Selection.addRange(range) // DOM view catches up under suppression
```

Programmatic whole-block selection flow:

```
doc.selection.selectBlock(block)
  → selectedPoint(block.id)
  → BlockSelection(selected, selected)
  → _applyState(selection)           // synchronous model update
  → build Range from leading/trailing block gap anchors
  → native Selection.addRange(range) // delayed native selectionchange ignored
```

Programmatic replay flow for new `ISelectionJSON`:

```
doc.selection.replay(json)
  → createSelection(anchor, head)
  → _applyState(selection)           // synchronous model update
  → _buildDomRange(start, end)       // skipped for model-only table-cell selection
  → native Selection.addRange(range) // DOM view catches up under suppression
      → if DOM is not mounted: keep model and retry projection for this version
```

### Selection Scope Guard

`recalculate()` no longer treats "different physical parent block" as automatically invalid. If anchor/head have different physical containers, it resolves each endpoint through `selection/scope.ts`. The resolver walks up the block tree and reads each block's registered schema `metadata.selectionScope`; blocks with no declaration or `selectionScope: 'transparent'` inherit the nearest ancestor scope. Endpoints inside the same **semantic editing scope** are kept. When a drag crosses from one scope to another, the endpoint inside a closed scope is projected to that scope block's parent `boundary` point (`before` for document-ordered start, `after` for document-ordered end). Only ranges that still cannot be represented after projection are collapsed and ignored.

Scope rules:

- **Document/root scope** — `metadata.selectionScope: 'document'`; normal top-level text/blocks resolve to the topmost document scope. Their `commonParent` uses `root.id` so the editor can address the root child list; because root has no parent, it is never projected beyond itself.
- **Table scope** — `metadata.selectionScope: 'table'`; descendants of table structural children, plus model-owned `table-cell` points, resolve to the owning table scope. A table cell and root paragraph are different scopes and are rejected.
- **Columns scope** — `metadata.selectionScope: 'columns'`; descendants of transparent column children resolve to the owning columns scope, allowing native text ranges across columns while still keeping the whole columns block selection in the parent/document fallback.
- **Container scope** — `metadata.selectionScope: 'container'`; content and boundary points resolve to that closed container. A container's internal text cannot be selected together with outside root text through `recalculate()`; selecting the whole container as a block is still parent-scope.
- **Transparent containers** — no declaration or `metadata.selectionScope: 'transparent'`; descendants inherit the nearest ancestor scope, so blocks such as mermaid text can participate in document-level text selections and deletion paths.

`SelectionScopePolicy` keeps scope-specific behavior out of callers:

| Scope kind | Text beforeInput | Cross-text tail | Generic selected classes |
|------------|------------------|-----------------|--------------------------|
| `document` | use DOM target range when available | merge end tail into start block | text ranges use deep path coverage; structural ranges query covered blocks |
| `columns` | use live model selection | preserve end-column tail | endpoint text blocks only |
| `table` | use DOM target range unless model table-cell selection is active | merge if a text-shaped fallback is handled | endpoint text blocks only |
| `container` | use DOM target range when available | merge end tail into start block | query covered blocks |

The guard decides whether a DOM range can become a `BlockSelection` and what `commonParent` should be when physical parents differ. `SelectionScopePolicy` then tells input and visual layers how to handle text-shaped ranges in that scope, so callers do not hard-code individual flavours such as `columns`, `table-row`, or custom container flavours.

## normalizeRange Internals

`normalize.ts` exports `normalizeRange(staticRange, getBlockById, options)` which returns `INormalizedEndpoints`:

```typescript
interface INormalizedEndpoints {
  start: ISelectionPoint
  end: ISelectionPoint
}
```

It walks the DOM range endpoints and:
1. Finds the nearest block via `closestBlockId(domNode)`.
2. If the block is editable, calls `block.runtime.mapper.domPointToModel(node, offset)` to get the inline-character offset → builds an `ITextSelectionPoint`.
3. If the endpoint is a **non-collapsed container boundary** (`block` / `root` host, a wrapper around `.children-render-container`, or a `.children-render-container` offset), maps it to an `IBoundarySelectionPoint`. Direct `.children-render-container` endpoints use the DOM offset to choose the child boundary index; outer host/wrapper endpoints map to index `0` for start or `childrenLength` for end. This lets native selections that start/end on a container wrapper (e.g. callout content) become boundary-to-boundary `BlockSelection`s instead of `selected(container)` mixed with child text.
4. If the endpoint is a **non-collapsed cross-block void/container edge** (leading/trailing gap text anchor or block chrome), maps it to the parent `IBoundarySelectionPoint`: start endpoints use the boundary before the child, end endpoints use the boundary after the child. Same-block ranges are preserved as explicit whole-block `selected`.
5. If the block is void/container and no boundary mapping applies, builds an `ISelectedSelectionPoint`.
6. Handles the special **gap-space** case: zero-width spaces at the document boundary in the root block resolve to the first/last child's start/end (added to support Cmd+A from anywhere in the doc).

Framework DOM adapters should call the pure function directly and narrow the endpoint type before consuming its payload:

```typescript
import { normalizeRange } from '@ccc/blockcraft'

const endpoints = normalizeRange(
  staticRange,
  id => doc.getBlockById(id),
)
if (endpoints.start.type === 'text') {
  const offset = endpoints.start.offset
}
```

The legacy `SelectionManager.normalizeRange()` public method wraps this and returns `INormalizedRange` (with `from`/`to`) for backward compatibility. It is marked `@deprecated`; **new code must use the pure function and `INormalizedEndpoints`**. The manager method is a compatibility facade, not the normalization boundary for framework internals.

## DOM Sampling Boundary

`recalculate()` means one thing: sample browser-owned native selection state and publish the resulting `BlockSelection`. Valid call sites are `selectionchange`, composition/native input fallback, and integrations whose browser API has just produced a `Range` without a model source.

Programmatic selection APIs (`setSelection`, `setCursorAt`, `setCursorAtBlock`, `selectBlock`, `setGapCursor`, table-cell selection, `extendTo`, and `replay`) already perform model commit followed by DOM projection. Calling `recalculate()` immediately after them introduces an unnecessary DOM walk and lets browser-specific range interpretation overwrite the intent that was just committed. Input, undo, and plugin code should read `doc.selection.value` after a successful programmatic write instead.

A valid model commit and a successful DOM projection are deliberately separate outcomes. If the target block exists in the model but its inline/container DOM is still mounting, Selection keeps `doc.selection.value`, keeps or restores editor focus only when focus naturally dropped to `body`, and retries projection for a bounded number of animation frames. Each task is guarded by a projection version plus exact selection JSON; later user intent cancels it. Exhaustion leaves the model intact and never samples unknown DOM state. Invalid or structurally stale model endpoints still fail closed, and explicit `blur()` / `replay(null)` still clear both model and native ranges.

## Backward Compatibility

These types are still exported but marked `@deprecated` and will be removed:

| Deprecated | Replacement |
|------------|-------------|
| `INormalizedRange { from, to, collapsed }` | `BlockSelection { anchor, head, ... }` or `INormalizedEndpoints { start, end }` |
| `IBlockRange / IBlockTextRange / IBlockSelectedRange` | `ISelectionPoint` |
| `IBlockInlineRangeJSON { index, length, ... }` | `ISelectionPointJSON { offset, ... }` |
| `IBlockSelectionJSON { from, to, ... }` | `ISelectionJSON { anchor, head, ... }` |
| `BlockSelection.getDirection()` | `BlockSelection.direction` (getter) |
| `selection.from.type / selection.from.block / selection.from.index` | `selection.start.type / selection.start.block / selection.start.offset` |

`SelectionManager.setSelection()`, `replay()`, and `createFakeRange()` all accept both old and new formats so existing plugins don't break — but **all new code must use the new shapes**. `setSelection()` maps legacy `index/length` inputs to canonical text offsets and normalizes their endpoints to forward document order; current `ISelectionPoint` inputs retain the supplied direction. Boundary points cannot be represented by the deprecated `INormalizedRange` / `IBlockSelectionJSON` shape; use `BlockSelection` or `ISelectionJSON` when container boundaries matter.

## Selection Check Recipes

```typescript
// Check if cursor only (no range)
if (selection.collapsed) { ... }

// Check single-block text selection
if (selection.isInSameBlock && selection.start.type === 'text') {
  const block = selection.start.block as EditableBlockComponent
  const text = block.textContent().slice(selection.start.offset, selection.end.offset)
}

// Check whole-block selection
if (selection.start.type === 'selected') {
  // selection.firstBlock is fully selected
}

// Check block-level full selection
if (selection.isAllSelected) { ... }

// Check container child-boundary selection
const childIds = selection.getBoundarySelectedChildIds()
if (childIds) {
  // childIds are direct children covered by [boundary start, boundary end)
}

// Check if a particular block is inside the current selection
if (selection.contains(myBlock.id)) { ... }

// Get all blocks between start and end (inclusive)
const between = doc.queryBlocksBetween(selection.firstBlock, selection.lastBlock)
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Reading `selection.from.block` | Use `selection.anchor.block` or `selection.start.block` |
| Reading `selection.from.index` without narrowing | Narrow on `point.type === 'text'` first, then use `.offset` |
| Comparing `selection.isCollapsed` | Use `selection.collapsed` (legacy alias removed) |
| Using offsets directly without checking type | A `'selected'` or `'gap'` point has no `offset` field |
| Assuming a gap point has `.offset` | Narrow on `point.type === 'gap'` first; gap points carry `side`, not `offset` |
| Assuming a boundary point has `.offset` | Narrow on `point.type === 'boundary'` first; boundary points carry child-list `index` |
| Building an `ISelectionPointJSON` for a gap without `side` | Include `side: 'before' \| 'after'` whenever `type === 'gap'` |
| Building an `ISelectionPointJSON` for a boundary without `index` | Include `index` whenever `type === 'boundary'` |
| Building `ISelectionPointJSON` and forgetting `type` | The `type` field is required |
| Calling `setSelection()` with the legacy `{from, to}` shape in new code | Pass `ISelectionPoint` directly |
| Manipulating `document.getSelection()` directly | Always go through `SelectionManager` so the model stays in sync |

## When to Read Source Files

- **Modifying keyboard navigation**: `selection-keyboard.ts`
- **Changing how clicks set selection**: `SelectionManager.recalculate()` + `normalize.ts`
- **Adding collaborative cursors**: `createFakeRange.ts`
- **Changing DOM selection classes**: `selected-manager.ts`
- **Adding a new selection point type**: `types.ts` + `blockSelection.ts` + `normalize.ts`
- **Cross-parent selection support**: `SelectionManager.recalculate()` + `selection/scope.ts` semantic scope guard + `DocUndoManager`

## Related Skills

- For **Input/IME** that interacts with selection during composition: `blockcraft-input.md`
- For **Block component** APIs that selection points reference: `blockcraft-block.md`
- For **Inline mapper** (DOM↔model offset translation): `blockcraft-inline.md`
- For **Yjs origin tags** used during selection-altering transactions: `blockcraft-data.md`
