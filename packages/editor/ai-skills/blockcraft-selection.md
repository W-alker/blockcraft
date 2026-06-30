# BlockCraft: Selection System Deep Dive

> **Level 2: Mechanism Deep Dive** — Only read this when modifying selection behavior or when the L1 quick reference in `blockcraft.md` isn't enough.
>
> Last updated: 2026-06-30 | Source of truth: `framework/modules/selection/`

## Architecture Overview

```
User interaction (click / keyboard / API)
  → focus into native input island? → SelectionManager.blur()
  → DOM `selectionchange` event (or programmatic call)
  → SelectionManager.recalculate()
      → normalizeRange(DOMRange)         // DOM → endpoints
      → BlockSelection (anchor/head)     // immutable model
  → selectionChange$.next(selection)     // BehaviorSubject
  → SelectedManager (DOM class updates: .selected, .all-selected)
  → FakeRange (visual overlay for non-native selections, optional)
```

**Key principle**: `BlockSelection` is the canonical truth. The DOM `Selection` is a derived view. Programmatic mutations build a DOM `Range` from the model and apply it via `Selection.addRange`.

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
| `framework/modules/selection/selection-keyboard.ts` | Arrow / Shift / Home / End / Ctrl+A / Escape handling |
| `framework/modules/selection/selected-manager.ts` | DOM class management (`.selected`, `.all-selected`) |
| `framework/modules/selection/createFakeRange.ts` | Visual overlay for non-native selections (collab cursors, find/replace) |

## Core Data Model

### Selection Point (Discriminated Union)

A point describes **one endpoint** of a selection. There are three variants discriminated by `type`:

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

type ISelectionPoint = ITextSelectionPoint | ISelectedSelectionPoint | IGapSelectionPoint
```

> The `block` accessor is defined via `Object.defineProperty` with `enumerable: false`, so it doesn't show up in `JSON.stringify`. Always narrow on `point.type` before reading `offset` (text-only) or `side` (gap-only).

### Gap Cursor (`type: 'gap'`)

A gap point reuses the per-block **`contenteditable` gap filler spans** (`<span data-block-zero-space class="bc-block-gap"><br></span>`) that `BaseBlockComponent` mounts around non-leaf void/container blocks (`createBlockGapSpace()` in `framework/utils/zero-gap.ts`). A **collapsed** native range landing inside the leading filler normalizes to `{type:'gap', side:'before'}`; inside the trailing filler it becomes `{type:'gap', side:'after'}` (see `resolveBlockGapSide()`). `_buildDomRange` maps the gap point back to a collapsed range at `(fillerSpan, 0)` — before the `<br>` — via `getBlockGapCaretSpan()`. The **browser renders its real native caret** on that filler line box (above the card for `before`, below for `after`); there is no fake CSS bar.

Gap is **always collapsed** — both `anchor` and `head` are the same gap point, so `collapsed` is true and there is no offset. Behaviors at a gap:

- **Arrow nav** — Left/Right (and Up/Down into a void/container) move the gap across blocks (`before` ↔ `after` ↔ neighbour).
- **Type / Enter / IME** — inserts an adjacent paragraph as a sibling at the gap index, keeping the void/container block, then drops the caret into the new paragraph.
- **Backspace / Delete** — removes the void/container block from a gap.
- **Click on blank area** — beside a void/container block sets a gap cursor on the nearest edge.
- **Paste** — inserts clipboard blocks as siblings at the gap index (`before` = block index, `after` = block index + 1), keeping the block (handled by `ClipboardManager._applyGapPaste`).

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
  get collapsed(): boolean           // same block AND (text+same offset, OR gap+same side)
  get isInSameBlock(): boolean       // anchor.blockId === head.blockId
  get isStartOfBlock(): boolean      // start at offset 0, OR 'selected', OR gap 'before'
  get isEndOfBlock(): boolean        // end at textLength, OR 'selected', OR gap 'after'
  get isAllSelected(): boolean       // both anchor/head are whole-block ('selected') points
  get isEmpty(): boolean             // collapsed text selection (alias for cursor)

  // ── Containment ──
  contains(blockId: string, offset?: number): boolean

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
  type: 'text' | 'selected' | 'gap'
  offset?: number               // present only for type === 'text'
  side?: 'before' | 'after'     // present only for type === 'gap'
}

interface ISelectionJSON {
  anchor: ISelectionPointJSON
  head: ISelectionPointJSON
  commonParent: string
}
```

> `toJSON()` / `replay()` round-trip the gap `side`, so a saved gap cursor restores to the exact edge. `DocUndoManager` captures the gap `side` too, so undo/redo restores "before vs after" precisely rather than degrading to a whole-block `selected` snapshot. The deprecated legacy `IBlockSelectionJSON.from` union is widened with a `{blockId, type:'gap', side}` variant for this round-trip; `toLegacyJSON()` itself still degrades a gap to a lossy `selected` point.

## SelectionManager Public API

### Reading Selection

```typescript
// Current selection (synchronous)
doc.selection.value                    // BlockSelection | null

// Observe changes (BehaviorSubject — emits current value immediately)
doc.selection.selectionChange$         // BehaviorSubject<BlockSelection | null>

// Lifecycle-bound observer (auto-unsubscribes on doc destroy)
doc.selection.changeObserve()          // Observable<BlockSelection | null>

// Fires once on the next change, then completes
doc.selection.nextChangeObserve()      // Observable<BlockSelection | null>
doc.selection.afterNextChange(fn)      // Subscribe sugar

// Recalculate from current DOM state. Returns { value, next }.
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
// Set cursor at a specific text offset in an editable block
doc.selection.setCursorAt(editableBlock, offset)

// Move the cursor to a block (auto-picks editable descendant or selects whole block)
// atStart: true → cursor at offset 0; false → cursor at textLength
doc.selection.setCursorAtBlock(block, atStart, scrollIntoView?)

// Select an entire block (used for void/block-level selection)
doc.selection.selectBlock(block)

// Set a Yuque-style gap cursor beside a void/container block.
// side: 'before' → caret at the leading edge; 'after' → trailing edge.
// Accepts a block id or a BlockComponent. Builds a collapsed range in the
// matching zero-width gap span.
doc.selection.setGapCursor(block, 'before' | 'after', scrollIntoView?)

// Extend the current selection's head to a new point (used for shift+click)
doc.selection.extendTo(editableBlock, offset)

// Select all children of a block
doc.selection.selectAllChildren(block)

// Build a Range from points (new format) and apply it
doc.selection.setSelection(anchor, head?)        // new ISelectionPoint
doc.selection.setSelection(legacyFrom, legacyTo) // @deprecated legacy format

// Replay a saved selection (e.g. from undo/redo or remote sync).
// Accepts both new ISelectionJSON and legacy IBlockSelectionJSON.
doc.selection.replay(json)

// Clear all selection (no DOM range)
doc.selection.blur()
```

### FakeRange (Visual Overlays)

`FakeRange` paints highlight rectangles into the editor without using the native browser selection. Use cases: collaborative cursors, find/replace highlights, "ghost" selections that survive focus changes.

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
      → Cross-parent guard: if anchor.parent !== head.parent → collapse, abort
      → Build BlockSelection
  → _applyState()
      → selectionChange$.next(selection)
      → SelectedManager paints `.selected` / `.all-selected` classes
```

### Cross-Parent Constraint

`recalculate()` currently rejects selections whose anchor/head live under different parent blocks (e.g. one in a table cell, another outside). The selection collapses and the range is suppressed. This constraint prevents undo/redo edge cases that would otherwise need multi-parent transaction handling.

> The constraint is documented as removable once `DocUndoManager` handles cross-parent selection snapshots — see memory observation 1148.

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
3. If the block is void/container, builds an `ISelectedSelectionPoint`.
4. Handles the special **gap-space** case: zero-width spaces at the document boundary in the root block resolve to the first/last child's start/end (added to support Cmd+A from anywhere in the doc).

The legacy `SelectionManager.normalizeRange()` public method wraps this and returns `INormalizedRange` (with `from`/`to`) for backward compatibility — **new code should not use it**.

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

`SelectionManager.setSelection()`, `replay()`, and `createFakeRange()` all accept both old and new formats so existing plugins don't break — but **all new code must use the new shapes**.

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
| Building an `ISelectionPointJSON` for a gap without `side` | Include `side: 'before' \| 'after'` whenever `type === 'gap'` |
| Building `ISelectionPointJSON` and forgetting `type` | The `type` field is required |
| Calling `setSelection()` with the legacy `{from, to}` shape in new code | Pass `ISelectionPoint` directly |
| Manipulating `document.getSelection()` directly | Always go through `SelectionManager` so the model stays in sync |

## When to Read Source Files

- **Modifying keyboard navigation**: `selection-keyboard.ts`
- **Changing how clicks set selection**: `SelectionManager.recalculate()` + `normalize.ts`
- **Adding collaborative cursors**: `createFakeRange.ts`
- **Changing DOM selection classes**: `selected-manager.ts`
- **Adding a new selection point type**: `types.ts` + `blockSelection.ts` + `normalize.ts`
- **Cross-parent selection support**: `SelectionManager.recalculate()` cross-parent guard + `DocUndoManager`

## Related Skills

- For **Input/IME** that interacts with selection during composition: `blockcraft-input.md`
- For **Block component** APIs that selection points reference: `blockcraft-block.md`
- For **Inline mapper** (DOM↔model offset translation): `blockcraft-inline.md`
- For **Yjs origin tags** used during selection-altering transactions: `blockcraft-data.md`
