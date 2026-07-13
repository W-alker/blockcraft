# BlockCraft: Input System Deep Dive

> **Level 2: Mechanism Deep Dive** — Only read this when modifying text input behavior.
>
> Last updated: 2026-07-13

## Architecture Overview

```
DOM beforeInput event inside an editable block
  → UIEventDispatcher routes to InputTransformer
  → e.preventDefault() (ALWAYS — editor owns all mutations)
  → InputTransformer classifies inputType
  → Writes directly to Y.Text via EditableBlockComponent methods
  → Y.Text fires Y.Event
  → InlineRuntime.applyDelta() updates DOM
```

**Key principle**: The editor intercepts `beforeInput` for `EditableBlockComponent` surfaces, prevents default browser behavior, and writes directly to Yjs. The DOM is never the source of truth for editable blocks — Yjs is.

## Fail-Closed Input Guard

`InputTransformer` must run for editor-root `beforeInput` even when `doc.selection.value` is currently `null`. If neither the live `BlockSelection` nor `beforeinput.getTargetRanges()` can be normalized into a model range, the handler **must call `preventDefault()` and clear the editor selection** instead of returning silently.

This protects complex native selections such as container-block / nested-block selections where the browser can paint a range but BlockCraft cannot yet express it safely. Until a selection is represented by `BlockSelection` (or a normalized target range), user input is not allowed to mutate DOM directly.

Boundary selections (`ISelectionPoint.type === 'boundary'`) are model-recognized and editable when both endpoints are in the same `renderUnit` container that can host paragraphs. In that case typing / printable keydown replaces the covered child range with one paragraph, IME first materializes an empty paragraph so the composition commits into `Y.Text`, Backspace/Delete delete the covered child range, and Enter replaces the range with an empty paragraph. Supported mixed `text + boundary` ranges under the same direct parent are replaced through the Yjs-owned text path, preserving the surviving text endpoint for typing and IME instead of blurring or letting native DOM input mutate content. Boundary selections in containers that cannot safely host a paragraph still fail closed (`preventDefault()` + clear selection).

Table-cell selections (`ISelectionPoint.type === 'table-cell'`) are also model-recognized and **do not rely on a native DOM Range**. Typing or printable keydown clears every selected visible cell, inserts text into a fresh paragraph in the anchor cell, and moves the caret after the inserted text. IME first clears the selected cells, materializes a fresh empty anchor paragraph, moves the caret there, then starts `CompositionSession` so the committed text is written to `Y.Text`. Backspace/Delete clear every selected visible cell and restore the table-cell rectangle selection. Enter clears the selected cells and places the caret in the anchor cell's fresh empty paragraph.

Text-shaped ranges can inherit behavior from `SelectionScopePolicy` (`selection/scope.ts`). The scope is resolved from the nearest ancestor block schema with `metadata.selectionScope`; blocks with no declaration or `selectionScope: 'transparent'` are transparent. The built-in `columns` policy is model-first for `beforeInput`: it deletes the selected content and any fully covered intermediate column/block content, but it does **not** append the surviving tail of the end-column text block into the start-column text block. IME follows the same rule: composition still prevents native DOM mutation and starts from the surviving start text endpoint, but cross-column replacement does not merge text across column boundaries.

Composition has the same rule:

- `compositionStart` tries to recover selection from `CompositionEventState.selectionResult`.
- Once `compositionStart` accepts a model selection, `CompositionSession` captures its commit anchor directly from the accepted text point or the materialized paragraph (`gap` / `boundary` / `table-cell` / selected renderUnit). A follow-up `selection.recalculate()` may still run to settle editor UI, but IME commit no longer depends on that DOM-derived result.
- IME paths that materialize structure before commit (`gap`, `boundary`, `table-cell`, whole-block selected, mixed cross-block ranges) keep the structural transaction and the later `compositionEnd` text commit inside one `DocUndoManager` capture group. Undo therefore restores the pre-input selection and data atomically even when the user spends longer than Yjs' normal `captureTimeout` inside the input method.
- While the session is active, composing `beforeinput` target ranges are treated as transient browser state and do not retarget the captured `OneShotCursorAnchor`.
- If recovery fails, it prevents default, blurs editor selection, and does not start `CompositionSession`.
- If recovery fails because the current selection still points at removed blocks,
  `InputTransformer` marks the pending composition as aborted. The matching
  `compositionEnd` is consumed without committing text; BlockCraft does not
  guess a nearby insertion block for stale IME input.
- A later `compositionEnd` without an accepted active session is ignored after `preventDefault()`.
- `beforeInput` events with `isComposing === true` are prevented when no active `CompositionSession` owns them.

## Native Input Islands

`InputTransformer` does **not** own native form controls embedded inside `void` / `block` nodes.

- Native `input`, `textarea`, and `select` elements now bypass the editor's `beforeInput`, hotkey, IME, paste, mouse, and selection pipelines.
- Custom widgets can opt into the same isolation by adding `data-bc-native-input` to the widget root.
- Use this mode for editing **block props / metadata** such as URL, title, caption, or config text.
- Do **not** use it for collaborative document body text. If the text should participate in Yjs, undo/redo, selection navigation, or block splitting, model it as an `EditableBlockComponent` (or an inner editor host), not a native textarea.

## Key Files

| File | Purpose |
|------|---------|
| `framework/modules/input/index.ts` | `InputTransformer` — main input handler |
| `framework/modules/input/composition-session.ts` | `CompositionSession` — IME state machine |
| `framework/block-std/event/control/` | Event controls (keyboard, mouse, composition) |

## Input Types Handled

The `beforeInput` event's `inputType` determines behavior:

| inputType | Handler |
|-----------|---------|
| `insertText` | Insert plain text at cursor |
| `insertParagraph` | Enter key — split block or create new paragraph |
| `insertLineBreak` | Shift+Enter — insert `\n` within block |
| `deleteContentBackward` | Backspace — delete char or merge with previous block |
| `deleteContentForward` | Delete — delete char or merge with next block |
| `deleteWordBackward` | Ctrl/Opt+Backspace — delete word |
| `deleteWordForward` | Ctrl/Opt+Delete — delete word |
| `deleteSoftLineBackward` | Cmd+Backspace — delete to line start |
| `deleteSoftLineForward` | Cmd+Delete — delete to line end |
| `insertFromPaste` | Handled by ClipboardManager |
| `insertReplacementText` | Autocorrect/spell check replacement |
| `formatBold/Italic/...` | Format shortcuts (browser-initiated) |

## IME / Composition

The most complex input path. CJK input methods (Chinese, Japanese, Korean) require special handling:

```
compositionStart → CompositionSession created
  → CursorBlot inserted (temporary, zero-length blot for IME rendering)
  → compositionUpdate (multiple times, browser renders inline)
  → compositionEnd → CompositionSession.commit()
    → CursorBlot removed
    → Final text written to Y.Text
```

### CompositionSession

Manages the lifecycle of an active IME session:
- Creates a `CursorBlot` at the cursor position
- Tracks the composition text
- Uses `OneShotCursorAnchor` (Yjs `RelativePosition`) to maintain cursor position during collaboration
- Captures the anchor from the accepted model selection/materialized block at `compositionStart`; DOM selection jitter during IME startup must not retarget the eventual commit.
- On commit: removes CursorBlot, inserts final text into Y.Text

## Cross-Block Operations

When selection spans multiple blocks:

| Operation | Behavior |
|-----------|----------|
| Insert text | Delete selected content across blocks, insert at anchor |
| IME over cross-block text selection | Capture undo snapshot, collapse the live model/native selection to the surviving text endpoint, delete covered blocks/text, then start `CompositionSession` there |
| Insert text / IME over a scope policy with preserved text tail (`columns`) | Delete selected content across that scope and insert/compose at the start endpoint without appending the end text tail into the start block |
| Insert text / IME over mixed whole-block→text selection | Capture undo snapshot, collapse the model/native selection to the surviving editable text endpoint before deleting whole-block endpoints, delete covered blocks/text, then commit there |
| Insert text over same-container boundary range | Delete covered child blocks, insert one paragraph at the boundary index, place caret after inserted text |
| IME over same-container boundary range | Open one undo capture group, materialize an empty paragraph at the boundary index, then commit IME text into that paragraph at `compositionEnd` |
| Insert text / IME over supported mixed text+boundary selection | Convert the boundary side to the covered direct child, delete selected blocks/text through Yjs, and keep the caret/composition on the surviving editable text endpoint |
| Insert text over table-cell rectangle | Clear selected visible cells, insert text into the anchor cell's fresh paragraph, place caret after text |
| IME over table-cell rectangle | Open one undo capture group, clear selected visible cells, materialize the anchor paragraph, then commit IME text into that paragraph |
| Backspace at block start | Merge current block into previous block |
| Delete at block end | Merge next block into current block |
| Backspace/Delete over same-container boundary range | Delete covered child blocks, then place selection on the adjacent remaining child / auto-created empty paragraph |
| Backspace/Delete over table-cell rectangle | Clear selected visible cells and keep the table-cell rectangle selected |
| Enter | Split current block at cursor, create new block |
| Enter over same-container boundary range | Replace covered child blocks with an empty paragraph |
| Enter over table-cell rectangle | Clear selected visible cells and place the caret in the anchor cell |

## Block Boundary Behavior

When backspace/delete reaches a block boundary:
1. Check if blocks can merge (both editable, compatible types)
2. If mergeable: concatenate Y.Text content, delete empty block
3. If not mergeable: select the adjacent block instead

## When to Read Source Files

- **Modifying Enter key behavior**: Read `InputTransformer`, search for `insertParagraph`
- **Changing backspace at block boundary**: Read `InputTransformer`, search for `deleteContentBackward`
- **IME issues**: Read `CompositionSession` and `CursorBlot`
- **Adding new inputType handling**: Read `InputTransformer.handleBeforeInput()`
- **Cross-block delete**: Read `InputTransformer`, search for cross-block handling logic
- **Full architecture**: Read `packages/editor/ARCHITECTURE.md`, inline editing section
