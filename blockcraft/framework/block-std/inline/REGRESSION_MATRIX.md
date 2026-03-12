# Inline Blot Regression Test Matrix

Minimum verification scenarios for each migration phase.
Each item should be verified on **Chrome (latest)**, **Safari (latest)**, and **Firefox (latest)**.

---

## 1. IME Composition

| # | Scenario | Expected |
|---|----------|----------|
| 1.1 | Chinese Pinyin: type full word and press space to commit | Text inserted at correct position; caret after committed text |
| 1.2 | Chinese Pinyin: type partial pinyin, then backspace to cancel | No residual text; caret returns to original position |
| 1.3 | Japanese Hiragana: type, convert to Kanji, confirm | Converted text replaces composition preview correctly |
| 1.4 | Korean 2-set: type consonant + vowel to form syllable | Syllable formed in-place without duplicate characters |
| 1.5 | Start composing at block start (offset 0) | Composition works; no crash or misaligned insertion |
| 1.6 | Start composing at block end (after last character) | Composition works; end-break not corrupted |
| 1.7 | Start composing with existing non-collapsed selection | Selected text deleted first; composition begins at collapsed cursor |
| 1.8 | Composing in a block with bold/italic attributes | Committed text inherits attributes from insertion context |
| 1.9 | Composing immediately after an embed (mention/formula) | Caret parks on gap node; new text appears after embed |
| 1.10 | Composing with `setNextInsertAttrs` active | Committed text receives the queued attributes |

## 2. Composition + Collaboration

| # | Scenario | Expected |
|---|----------|----------|
| 2.1 | Remote insert text BEFORE the composing position | Composition preview undisturbed; committed text at correct offset |
| 2.2 | Remote insert text AFTER the composing position | Composition preview undisturbed |
| 2.3 | Remote delete text BEFORE the composing position | Anchor resolves correctly via Yjs RelativePosition |
| 2.4 | Remote format change on the composing block | Composition completes; DOM reconciled after commit |
| 2.5 | Remote delete the entire composing block | Session resets cleanly; no crash |
| 2.6 | Remote insert embed at composing position | Deferred patch replayed after commit; embed visible |

## 3. Embed Boundary Navigation

| # | Scenario | Expected |
|---|----------|----------|
| 3.1 | ArrowRight into embed from text | Caret jumps to after-embed gap |
| 3.2 | ArrowLeft into embed from text after embed | Caret jumps to before-embed position |
| 3.3 | Backspace at position immediately after embed | Embed deleted; caret at previous text end |
| 3.4 | Delete at position immediately before embed | Embed deleted; caret stays at position |
| 3.5 | Selection spanning text + embed + text, then delete | All selected content removed; blocks merged if needed |
| 3.6 | Selection spanning text + embed, then type replacement | Embed removed; new text inserted at start of selection |
| 3.7 | Double-click on text adjacent to embed | Word selection does not accidentally include embed |

## 4. Position Mapper Accuracy

| # | Scenario | Expected |
|---|----------|----------|
| 4.1 | `modelPointToDomPoint(0)` on empty block | Returns leading gap text node, offset 0 |
| 4.2 | `modelPointToDomPoint(N)` where N = textLength | Returns correct end position |
| 4.3 | `domPointToModelPoint` on zero-space node | Returns 0 (leading) or embed+1 (trailing gap) |
| 4.4 | `domPointToModelPoint` during composing | Returns correct offset accounting for composition text |
| 4.5 | `modelRangeToDomRange` spanning multiple TextBlots | DOM range spans correct c-elements |
| 4.6 | `modelRangeToClientRects` for multi-line text | Returns rects for each visual line |

## 5. Plugin Compatibility

### 5.1 Mention
| # | Scenario | Expected |
|---|----------|----------|
| 5.1.1 | Type `@` to trigger mention popup | Popup appears at correct position |
| 5.1.2 | Select mention from popup | Embed inserted; placeholder removed; caret after mention |
| 5.1.3 | Type `@` during IME composition | No interference with composition session |
| 5.1.4 | Delete mention with Backspace | Mention embed removed cleanly |

### 5.2 Inline Link
| # | Scenario | Expected |
|---|----------|----------|
| 5.2.1 | Select text and apply link | `a:link` attribute set; correct range highlighted |
| 5.2.2 | Click on linked text | Link toolbar/popup shows at correct rect |
| 5.2.3 | Edit text inside a link span | Link attribute preserved on adjacent typing |
| 5.2.4 | Remove link from partial selection | Only selected portion loses `a:link` attribute |

### 5.3 Formula
| # | Scenario | Expected |
|---|----------|----------|
| 5.3.1 | Insert formula embed | Formula rendered at correct position |
| 5.3.2 | Click on formula to edit | Editor popup positioned correctly |
| 5.3.3 | Delete formula with Backspace | Embed removed; caret repositioned |

### 5.4 Code Block
| # | Scenario | Expected |
|---|----------|----------|
| 5.4.1 | Syntax highlighting renders correctly | Token c-elements match expected colors |
| 5.4.2 | Edit code text mid-line | Diff highlight patches only changed lines |
| 5.4.3 | Change language | Full re-highlight with new language tokens |
| 5.4.4 | Copy from code block | Plain text copied correctly |

## 6. General Inline Editing

| # | Scenario | Expected |
|---|----------|----------|
| 6.1 | Type plain text in empty paragraph | Text appears; no extra DOM nodes created |
| 6.2 | Bold selection, then type replacement | New text has bold attribute |
| 6.3 | Undo after text insertion | Text removed; caret restored |
| 6.4 | Redo after undo | Text re-inserted at same position |
| 6.5 | Paste rich text with mixed formatting | Delta correctly segmented into runs |
| 6.6 | Shift+Enter for soft line break | `\n` inserted; caret on new visual line |
| 6.7 | Select all (Ctrl/Cmd+A) in single block | Full block text selected |
| 6.8 | Tab/Shift+Tab for indent | Block depth changes; text content unchanged |
| 6.9 | Home/End keys | Caret moves to line/block start/end |
| 6.10 | Markdown prefix transform (e.g. `# `) | Block converts to heading; prefix removed |
