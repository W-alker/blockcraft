# BlockCraft: Input System Deep Dive

> **Level 2: Mechanism Deep Dive** — Only read this when modifying text input behavior.
>
> Last updated: 2026-04-13

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
- On commit: removes CursorBlot, inserts final text into Y.Text

## Cross-Block Operations

When selection spans multiple blocks:

| Operation | Behavior |
|-----------|----------|
| Insert text | Delete selected content across blocks, insert at anchor |
| Backspace at block start | Merge current block into previous block |
| Delete at block end | Merge next block into current block |
| Enter | Split current block at cursor, create new block |

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
