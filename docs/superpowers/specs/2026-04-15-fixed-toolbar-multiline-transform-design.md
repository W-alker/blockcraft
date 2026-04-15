# Fixed Toolbar Multi-line Transform Design

Date: 2026-04-15
Status: proposed and user-approved in chat
Scope: `packages/editor/plugins/fixed-toolbar/`

## Goal

Make `FixedTextToolbarComponent` support converting a cross-block text selection into heading styles and list styles (`ordered`, `bullet`, `todo`) the same way `FloatTextToolbarPlugin` already does.

## Non-goals

- Do not change the fixed toolbar visual style or layout.
- Do not unify the fixed-toolbar and float-toolbar UI implementations.
- Do not expand link or inline-formula actions to cross-block selections.
- Do not change block-selected (`type: 'selected'`) behavior.

## Current Problem

The fixed toolbar already uses `TextToolbarHelper.updateBlockProps()` and `transformBlocks()`, which are capable of applying changes across multiple editable blocks. But its selection-state gating is still stricter than the float toolbar in practice, so cross-block text selections do not reliably expose heading/list transforms as usable actions.

## Recommended Approach

Use the existing fixed-toolbar UI and keep all interactions as-is. Only relax and correct its internal selection-state logic so that a cross-block text selection remains toolbar-operable when:

- the selection is a text selection, not an all-selected block selection
- every covered block is editable
- no covered block is `plainTextOnly`

This keeps risk low because the existing transformation helpers already implement the desired block conversion behavior.

## Behavior Design

### Multi-block heading transform

When the user selects text across multiple editable blocks and chooses a heading level from the fixed toolbar:

1. If the current common flavour is not `paragraph`, first convert the covered blocks to `paragraph`.
2. Apply `heading` props to all editable blocks in the selection.
3. Preserve existing toolbar UI; the dropdown remains the heading entry point.

Mixed selections should still work. For example, a selection spanning paragraph + bullet + ordered blocks should end up as paragraph blocks with the chosen heading level.

### Multi-block list transform

When the user selects text across multiple editable blocks and clicks one of the list buttons:

- `ordered`, `bullet`, and `todo` should transform all covered editable blocks to that list flavour.
- Clicking the currently active list flavour should toggle those blocks back to `paragraph`, matching current helper behavior.

### State display

The fixed toolbar does not need new tri-state UI.

- If the selection has a single common heading, show it.
- If heading or flavour is mixed, keep the current neutral/default display.
- Buttons remain enabled as long as the selection is valid for text formatting.

### Unchanged restrictions

These stay single-block only:

- link action
- inline formula action

They should remain disabled for cross-block text ranges.

## Implementation Notes

Primary file:

- `packages/editor/plugins/fixed-toolbar/widgets/fixed-toolbar.component.ts`

Expected changes:

1. Adjust `syncToolbarState()` so cross-block text selections that satisfy the editable/plain-text checks still produce `allEditable = true` and keep heading/list actions available.
2. Keep `runWithSelection()` text-selection based, but ensure it does not unnecessarily reject a valid cross-block text range.
3. Preserve existing selection replay/recalculate flow after actions.
4. Do not change `TextToolbarHelper` unless the component-level fix proves insufficient.

## Risk Assessment

Low-to-medium.

- Low because the actual mutations already flow through `TextToolbarHelper`.
- Medium because fixed-toolbar state derivation is coupled to selection semantics, so regressions could affect enabled/disabled states for collapsed or mixed selections.

## Validation Plan

Manual verification:

1. Select text across multiple paragraph blocks and apply H1/H2/H3/H4 from fixed toolbar.
2. Select text across paragraph + heading blocks and convert them all to a list.
3. Select text across paragraph + list blocks and convert them all to another list type.
4. Click the active list type again and verify selection returns to `paragraph`.
5. Confirm link and formula remain disabled for cross-block selections.
6. Confirm single-block formatting behavior remains unchanged.

Docs follow-up:

- Update `packages/editor/ai-skills/blockcraft-plugins-formatting.md`
- Add a patch entry to `packages/editor/ai-skills/MIGRATIONS.md`
