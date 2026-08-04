# BlockCraft: Inline & Keyboard Binding Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-08-03

## Inline Extensions

### InlineLinkExtension

> `plugins/inline-link-extension/` — Hyperlink interactions and editing.

Handles inline link clicks (single-click shows toolbar, double-click navigates), provides link editing/unbinding/copying, and supports "switch view" to convert an inline link into a bookmark block.

#### Configuration

```typescript
new InlineLinkExtension(openLink?: (link: string) => void)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `openLink` | `(link: string) => void` | `(link) => window.open(link, '_blank')` | Custom link navigation handler |

#### Toolbar Actions

| Action | Behavior |
|--------|----------|
| `open-link` | Navigate to URL via `openLink` callback |
| `edit-link` | Open `LinkEditFloatDialog` for editing |
| `unbind-link` | Remove the link format, keep text |
| `copy-link` | Copy URL to clipboard |
| `switch-view` | Convert inline link to bookmark block |

#### Public API

| Method | Description |
|--------|-------------|
| `openToolbar(target, link, block)` | Show the link toolbar for a specific link element |
| `closeToolbar()` | Dismiss the toolbar |
| `onEditLink(target, block)` | Open the link edit dialog |
| `switchView()` | Convert the current link to a bookmark block |
| `tryGetLink(target)` | Get the `href` from a link element |
| `getLinkInfo(target)` | Get `{ textRange, text }` for a link element |

#### Usage Example

```typescript
// Custom link handler: open internal links in the same tab
new InlineLinkExtension((link) => {
  if (link.startsWith('/internal')) {
    router.navigate([link]);
  } else {
    window.open(link, '_blank');
  }
})
```

---

### MentionPlugin

> `plugins/mention/` — `@`-mention with pluggable panel.

Detects the trigger character (`@` by default), inserts it into `Y.Text`, opens a consumer-provided panel for search/selection, and on confirmation replaces the `@keyword` span with a `{mention}` embed delta.

#### Configuration

```typescript
new MentionPlugin(config: MentionPluginConfig)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `panel` | `MentionPanelFactory` | **required** | `(ctx: { doc, rect }) => IMentionPanel` — provides all UI and search logic |
| `trigger` | `string` | `'@'` | Character that opens the mention panel |
| `onMentionClick` | `(id, type, event) => void` | — | Callback when a rendered mention embed is clicked |
| `onConfirm` | `(data, { block }) => boolean \| void` | — | Host opt-out, called after the `@keyword` range is resolved but **before** the embed is inserted. Return `true` to claim the confirm: the plugin removes the `@keyword` and inserts **no** embed (no node, no trailing space) — the host applies its own side-effect instead. Falsy → default embed insertion |

#### Consumer-Provided Panel Interface

The `panel` factory must return an object implementing `IMentionPanel`:

| Method / Property | Type | Purpose |
|-------------------|------|---------|
| `onKeywordChange(keyword)` | `(string) => void` | Plugin pushes search keyword as user types |
| `onKeydown(e)` | `(KeyboardEvent) => boolean` | Plugin forwards nav/confirm keys; return `true` to consume |
| `onConfirm` | `Observable<IMentionData>` | Panel emits confirmed selection |
| `updatePosition(rect)` | `(DOMRect) => void` | Plugin calls on scroll to reposition |
| `dispose()` | `() => void` | Plugin calls when session closes |

#### Usage Example

```typescript
new MentionPlugin({
  trigger: '@',
  panel: ({ doc, rect }) => {
    const panel = new MyMentionPanel(rect);
    return {
      onKeywordChange: (keyword) => panel.search(keyword),
      onKeydown: (e) => panel.handleKeydown(e),
      onConfirm: panel.confirmed$,
      updatePosition: (rect) => panel.reposition(rect),
      dispose: () => panel.destroy(),
    };
  },
  onMentionClick: (id, type, event) => {
    // navigate to user profile, etc.
  },
})
```

#### Notes

- Uses `OneShotCursorAnchor` for collaboration-safe cursor tracking during the mention session
- The trigger character is physically inserted into `Y.Text` and removed/replaced on confirm or cancel
- `onConfirm` lets a host block turn a mention into a **side-effect that runs only on the acting client** rather than a CRDT-synced embed node. Use it when every collaborator observing the node would otherwise re-run the effect (e.g. a synced todo adding a task collaborator from `@user` — only the picker should write; others learn via that domain's own realtime channel)

---

## Keyboard Bindings

### CodeInlineEditorBinding

> `plugins/codeEditorBinding.ts` — Keyboard bindings for code and mermaid blocks.
> Runtime plugin ID: `code-inline-editor-binding`.

Handles Enter (newline with indent preservation or block splitting with Shift), Tab/Shift+Tab (insert/remove tabs), and IME composition end for `code` and `mermaid-textarea` blocks.

#### Configuration

No configuration options.

```typescript
new CodeInlineEditorBinding()
```

#### Registered Bindings

| Event | Flavour | Behavior |
|-------|---------|----------|
| `compositionEnd` | `code`, `mermaid-textarea` | Write composed text to Y.Text |
| `Enter` | `code`, `mermaid-textarea` | Insert newline (preserving indent) or split block (with Shift) |
| `Tab` | `code`, `mermaid-textarea` | Insert/remove tab characters (supports multi-line) |

---

### TableBlockBinding

> `plugins/tableBlockBinding.ts` — Keyboard and clipboard bindings for table blocks.
> Runtime plugin ID: `table-block-binding`.

Handles copy/cut of selected cell ranges, table-shaped paste into existing cells, Arrow/Shift+Arrow movement for model-owned cell rectangles, Delete/Backspace to clear cells, and Cmd+A to select entire table.

Table rectangular selection is model-owned when possible: drag-selected cells are written as `table-cell` anchor/head points via `SelectionManager.setTableCellSelection(table, anchorCell, headCell)`. `TableBlockBinding` resolves that intent through the package-internal `TableModelGrid`, so copy/cut/paste/delete/Arrow/Tab use stable cell IDs and model snapshots even when intermediate cell components are not mounted. `TableBlockComponent` only projects the resolved rectangle onto currently mounted master cells with its private `.bc-table-cell-selected` class; it does not build a Component-owned full-table master map. Row ranges, column ranges, and older transient paths still live as explicit table coordinates, so nonstandard documents without a usable model graph retain the bounded component fallback. Malformed real model grids fail closed. Plain Arrow moves/collapses to the adjacent visible source cell, while Shift+Arrow keeps the anchor and extends the head. Delete/Backspace therefore clears every selected master cell instead of only the anchor cell, while ordinary text deletion inside a cell is still left to `InputTransformer`.

The built-in `TableBlockComponent` previews column resizing with an inert blue
viewport guide outside the clipped table subtree instead of changing live
`<col>` widths. Dragging therefore leaves cell content, row heights and
pagination geometry unchanged. Mouse release resolves
the stable source-cell anchor through the current model grid and writes
`colWidths` once; Escape, window blur, a readonly release or
a stale anchor cancel without a write. This behavior has no configuration
option and does not change the `TableBlockBinding` constructor or public API.
The resize handle is a `data-bc-native-input` UI island, so root mouse and
selection controls do not arm a competing text/rectangle-selection gesture
before the table starts resizing. The table capture boundary gives that handle
priority over pagination flow masks and rectangle-selection arming, then stops
the mousedown from reaching later selection handlers. Idle cell `mousemove`
repairs the handle's actual DOM ownership after pagination/Angular projection;
same-cell movement exits through identity checks without reading layout.
At capture time the built-in table also recognizes the narrow right-edge cell
geometry as resize ownership. This covers Safari/WebKit table-cell hit testing,
where a painted absolute handle may still be reported as its `td` or content.

#### Configuration

No configuration options.

```typescript
new TableBlockBinding()
```

#### Registered Bindings

| Event / Key | Flavour | Behavior |
|-------------|---------|----------|
| `copy` | `table` | Copy selected cells as table snapshot |
| `cut` | `table` | Copy + clear selected cells |
| `paste` | `table` | When clipboard content is a BlockCraft/HTML/Markdown/TSV table, fill existing table cells one-to-one from the focused cell or selected top-left cell; oversized source rows/columns are clipped to the current table, then the range selection UI is cleared |
| `Arrow` | `table-cell` | Move/collapse a model table-cell selection to the adjacent visible cell; boundary arrows are consumed and keep the selection unchanged |
| `Shift+Arrow` | `table-cell` | Extend the model table-cell selection by moving the head cell and keeping the anchor cell fixed |
| `Delete` / `Backspace` | `table` | Clear content of the explicit selected cell rectangle; if there is no rectangle, only a whole-cell block selection falls back to clearing the single selected cell. Plain text deletion inside a cell is left to `InputTransformer` |
| `Cmd/Ctrl+A` | `table-cell` | Select entire table after the current cell content is already fully selected |

#### Public API

| Method | Description |
|--------|-------------|
| `clearCellContent(cells)` | Clear content of given mounted table-cell components; built-in model commands use a private stable-ID write path |

#### Related Table Component API

| Method | Description |
|--------|-------------|
| `table.getExplicitSelectedCoordinates()` | Return the active cell/row/column rectangle only. Unlike `getSelectedCoordinates()`, it never falls back to the current selection's first cell |
| `doc.selection.setTableCellSelection(table, anchorCell, headCell?)` | Store a model-owned rectangular table-cell selection. The browser native Range is cleared and the table component paints the selected rectangle |
