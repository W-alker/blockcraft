# BlockCraft: Selection System Deep Dive

> **Level 2: Mechanism Deep Dive** — Only read this when modifying selection behavior.
>
> Primary source of truth: `packages/editor/SELECTION.md`

## Architecture Overview

```
User interaction (click/keyboard/API)
  → SelectionManager.setSelection() / setCursorAt() / selectBlock()
  → BlockSelection (anchor/head model)
  → selectionChange$ (BehaviorSubject)
  → SelectedManager (DOM class updates: .selected, .focused, .all-selected)
  → FakeRange (visual overlay for non-native selections)
```

## Key Files

| File | Purpose |
|------|---------|
| `framework/modules/selection/index.ts` | `SelectionManager` — main coordinator |
| `framework/modules/selection/blockSelection.ts` | `BlockSelection` — anchor/head data model |
| `framework/modules/selection/normalize.ts` | `normalizeRange()` — DOM Range → model endpoints |
| `framework/modules/selection/selection-keyboard.ts` | Arrow/Shift/Home/End/Ctrl+A/Escape handling |
| `framework/modules/selection/selected-manager.ts` | DOM class management |
| `framework/modules/selection/createFakeRange.ts` | Visual overlay for non-native selections |
| `framework/modules/selection/types.ts` | `ISelectionPoint`, `ISelectionJSON` |

## Core Concepts

### Selection Point

```typescript
interface ISelectionPoint {
  blockId: string;    // Which block
  offset: number;     // Character offset within the block's inline content
}
```

### BlockSelection

```typescript
class BlockSelection {
  anchor: ISelectionPoint;   // Where selection started
  head: ISelectionPoint;     // Where selection ended (current position)

  isCollapsed: boolean;      // anchor === head (cursor, no range)
  isInSameBlock: boolean;    // anchor and head in same block
  firstBlock: BlockComponent;
  lastBlock: BlockComponent;
  direction: 'forward' | 'backward';
}
```

### normalizeRange()

Converts a native DOM `Range` (from `document.getSelection()`) to the model's `ISelectionPoint` format:

```
DOM node + DOM offset
  → InlinePositionMapper.domPointToModel(node, offset)
  → { blockId, offset }
```

This is the bridge between browser selection and the editor's selection model.

## SelectionManager API

```typescript
// Set cursor at a specific position
doc.selection.setCursorAt(block, offset)

// Set a range selection
doc.selection.setSelection(anchorBlock, anchorOffset, headBlock, headOffset)

// Select an entire block
doc.selection.selectBlock(block)

// Extend selection to a point
doc.selection.extendTo(block, offset)

// Replay a saved selection (e.g., after undo)
doc.selection.replay(selectionJSON)

// Recalculate from current DOM state
doc.selection.recalculate()

// Get selection rectangle for overlay positioning
doc.selection.getSelectionRect(): DOMRect | null

// Get selected text
doc.selection.getSelectedText(): string

// Observable
doc.selection.selectionChange$: BehaviorSubject<BlockSelection | null>

// One-shot observer (fires once on next change, then completes)
doc.selection.nextChangeObserve(): Observable
```

## FakeRange System

FakeRange creates visual overlays for selections that can't use native browser selection:
- Collaborative cursors (other users)
- Search highlights (find & replace)
- Block-level selections

```typescript
doc.selection.createFakeRange(options): FakeRange
```

## When to Read Source Files

- **Modifying keyboard navigation**: Read `selection-keyboard.ts`
- **Changing how clicks set selection**: Read `SelectionManager` + `normalizeRange.ts`
- **Adding collaborative cursors**: Read `createFakeRange.ts`
- **Changing DOM selection classes**: Read `selected-manager.ts`
- **Understanding anchor/head model**: Read `blockSelection.ts`
- **Full architecture**: Read `packages/editor/SELECTION.md`
