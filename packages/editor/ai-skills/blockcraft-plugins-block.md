# BlockCraft: Block Management Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-08-28

## BlockControllerPlugin

> `plugins/block-controller/` — Drag handle, context menu, and block-level operations.

Renders a floating trigger button that follows the hovered block. Provides
drag-and-drop, common editable-block background/outline controls, a built-in context menu
for table operations, and fully extensible custom menu sections.

### Configuration

```typescript
// Object form (recommended)
new BlockControllerPlugin(options?: BlockControllerPluginOptions)

// Legacy form
new BlockControllerPlugin(customTools?: IContextMenuItem[], customToolHandler?: customToolHandler)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `customTools` | `IContextMenuItem[]` | `[]` | Extra items in the context menu |
| `customToolHandler` | `customToolHandler` | — | Click handler for `customTools` |
| `blockMenuResolver` | `(ctx: BlockMenuContext) => BlockMenuSection[]` | — | Return custom menu sections per block |
| `blockMenuActionHandler` | `(event: BlockMenuActionEvent, ctx: BlockMenuContext) => boolean` | — | Handle clicks on custom menu items |
| `positionResolver` | `BlockControllerPositionResolver` | — | Override trigger button positioning |

### Extension Points

| Name | Type | Purpose |
|------|------|---------|
| `blockMenuResolver` | `(ctx) => BlockMenuSection[]` | Dynamic menu sections based on block context |
| `blockMenuActionHandler` | `(event, ctx) => boolean` | Handle menu item actions; return `true` to consume |
| `positionResolver` | `BlockControllerPositionResolver` | Custom positioning logic for the trigger button |

`BlockMenuDropdownItem.menuWidth` optionally sets one second-level panel's
width; omitted dropdowns keep the surrounding menu width.

### Usage Example

```typescript
new BlockControllerPlugin({
  blockMenuResolver: (ctx) => {
    if (ctx.activeBlock.flavour === 'paragraph') {
      return [{
        key: 'ai',
        title: 'AI 操作',
        items: [
          { type: 'simple', name: 'summarize', label: '总结', icon: 'bc_icon bc_ai' },
          { type: 'simple', name: 'inspect', label: '查看', readonlyBehavior: 'allow' },
        ],
      }];
    }
    return [];
  },
  blockMenuActionHandler: (event, ctx) => {
    if (event.item.name === 'summarize') {
      // handle...
      return true;
    }
    return false;
  },
})
```

### Notes

- The built-in **颜色** second-level menu appears for an eligible editable flow
  block and whenever a multi-block range contains at least one eligible,
  writable editable flow block. Multi-block writes resolve stable IDs from the
  model graph and update that eligible subset in one Yjs transaction, including
  virtualized middle blocks; selected non-editable or protected blocks remain
  untouched. Mixed initial colors among the targets show no active swatch until
  the user picks one. Choosing transparent deletes the prop. The action never
  cascades to a parent Callout, table or columns container and remains absent
  when the range has no writable editable target, or for Schema leaf blocks,
  root/infrastructure blocks and absolute placement objects.
- Whole-document readonly hides mutation affordances as before. Block readonly
  keeps the trigger visible so the user can copy or unlock the block, but drag
  start and protected mutations are blocked.
- The built-in switch writes the current `DocConfig.currentUserId` to
  `meta.lock`. An explicit lock can be removed only by its owner or a host
  `canUnlockBlock` override. Another user's switch is disabled; missing identity
  disables lock control; an inherited lock must be removed at its source
  ancestor. Root never exposes a persistent-lock action.
- For a placement-capable Schema, the built-in **文字环绕** menu exposes
  **上下型 / 衬于文字下方 / 浮于文字上方**. If the flavour plugin registers
  a `BlockObjectLayoutAdapter`, it also exposes **嵌入型**. These actions call
  `doc.placement.setObjectLayout()`; under/over automatically enter absolute
  placement and top-bottom automatically returns to flow. Once an object enters
  the root placement layout, BlockController clears its active state and no
  longer renders or responds for that object. Image/shape-specific toolbars own
  its layer, return-to-flow, delete, resize and Pointer Events positioning.
- A whole-block model selection can activate BlockController without hover only
  for ordinary flow blocks. The `placement-layout` host and all descendants are
  rejected by the same centralized eligibility check.
- `svgIcon` values are names registered with Angular Material's
  `MatIconRegistry` and render through `<mat-icon [svgIcon]="…">` in the
  trigger and nested block menus. Register the icon set before mounting the
  editor; no global SVG symbol sprite is required. Use `icon` for single-color
  iconfont classes.
- Interacts with `TranslatePlugin` which provides its own `blockMenuResolver`/`blockMenuActionHandler` pair via `createBlockControllerOptions()`

### Readonly-aware custom menu items

`BlockMenuContext.readonly` contains the effective `BlockReadonlyResolution`.
Every custom item can declare `readonlyBehavior`:

| Value | Protected active block |
|-------|------------------------|
| `disable` / omitted | Item remains visible but cannot run |
| `hide` | Item is omitted |
| `allow` | Item remains actionable; use only for true read operations |

`allow` does not bypass the data boundary. If the handler attempts a guarded
mutation, `BlockReadonlyError` is still thrown. Typical allowed actions are
inspect, copy link, preview and download; translate, replace, delete, format and
property changes should stay disabled/hidden.

### Multi-block drag (since v?.?.?)

The drag handle now respects an active cross-block selection: when the user
drag-selects multiple blocks and then presses the drag handle, the entire
selected range is dragged as one unit.

- Behavior triggers only when:
  - `doc.selection.value` is cross-block (`!isInSameBlock`),
  - The hovered active block is **inside** the selection, AND
  - All selected blocks share the same `parentId` (a contiguous sibling range).
- Otherwise the plugin falls back to single-block drag of the hovered block.
- Cross-block selection no longer hides the drag handle; instead it anchors
  the handle on `selection.firstBlock`.

The drag is dispatched as `{ kind: 'origin-blocks', blockIds: string[] }` to
`doc.dragController.startDrag(...)`, and committed via the new
`DocDndService.onSortBlocks(sources, target, position)` API.

### Multi-block menu

When a cross-block selection covers the active block, the drag-handle menu
adds **颜色** whenever at least one selected block is an appearance-eligible,
writable editable flow block. The ordinary multi-block actions remain **cut /
copy / delete** and operate on the whole selection range:

- **copy** copies whole-block snapshots of every selected block
  (`clipboard.copyBlocksModel`), not an offset-sliced text range.
- **cut** copies all then deletes every selected block by id in one transaction.
- **delete** deletes every selected block by id in one transaction.

- **颜色** writes `backColor` / `borderColor` to the selected eligible, writable
  editable subset in one transaction and skips the other selected block types.
  The picker fails closed if the selection changes, a target disappears, or any
  captured target becomes protected before the click is handled.

All other menu items — alignment, heading, block-type conversion, "在下方添加",
`customTools`, and custom `blockMenuResolver` sections such as the table tools —
are hidden in multi-block mode. Single-block selection keeps the full menu
unchanged. The multi/single judgment mirrors the drag dispatch: a cross-block
selection whose range includes the active block (otherwise the single-block menu
shows). If the multi-selection collapses to fewer than two blocks between opening
the menu and clicking, cut/copy/delete fall back to the single-block path while
the multi-block color picker performs no write.

When any selected block is effectively readonly, or a selected ancestor
contains a locked descendant, the range-wide actions keep only **copy**; cut,
delete and drag cannot partially mutate the range. **颜色** may still appear for
other selected writable editable blocks and never writes the protected block.

---

## ImgToolbarPlugin

> `plugins/img-toolbar/` — Image alignment, captions, download/copy actions,
> and block-image conversion.

The built-in **嵌入型** action replaces the selected image block with a
paragraph whose first delta is the default `image` inline embed. It preserves
`src` and valid `width` / `height` values. If the image block has a caption, a
space and the caption's original formatted deltas follow the embed. Block-level
`align` is intentionally not copied because it has no stable inline equivalent.

The replacement goes through `DocChain.replaceWithSnapshots()` and then places
the caret at the end of the new paragraph. Empty-source, stale, and effectively
readonly image blocks are not converted. Undo/Redo treats the replacement as a
document mutation and restores the original image block structure.

The same plugin also manages the default inline-image shell. A click mounts the
existing `ResizeContainerComponent` handles and a compact size/conversion
toolbar. While these controls are active, the shell receives the temporary
`.bc-inline-image-shell--selected` theme outline; the unified close lifecycle
removes it without changing Delta attributes. Dragging previews width in the DOM
and commits `width` / `height` once on mouseup, preserving aspect ratio and
avoiding high-frequency Yjs writes.

Choosing **上下型** from an inline image splits surrounding rich text into
same-flavour editable snapshots, inserts a relative image block between them,
preserves inline attributes and selects the new image. Choosing
**衬于文字下方** or **浮于文字上方** performs the same split but measures the
inline image against the target children container first and creates the image
block directly at that visual position with the matching absolute layer. Empty
text sides are omitted and no caption is inferred. The action is unavailable
for readonly content and is rejected with feedback when the parent Schema does
not accept image blocks. Custom `image` converters without the default shell
marker remain host-owned.

---

## BlockGapCreatorPlugin

> `plugins/block-gap-creator/` — Resolves blank-area clicks to a sensible caret (gap cursor / line-end / nearest block).

Detects clicks in blank areas that the browser wouldn't otherwise place a caret in, and routes them via the gap-cursor model:

- **Beside a void/container block** (inside the block's host but outside its `[data-gap-anchor]` content box) → drops a **gap cursor** (`setGapCursor(block, 'before' | 'after')`, side by click position). Typing there inserts an adjacent paragraph and **keeps** the block (it no longer eagerly creates an empty paragraph on click).
- **Right of a text line** (block padding, outside `.edit-container`) → places a text caret at that line's end (feature-detected `caretRangeFromPoint`).
- **Root gutter / below all content** → focuses the nearest root-level child: editable → its text end/start; void → its `gap-after`/`gap-before`.

The root `placement-layout` and its absolute descendants are never gap targets.
The plugin consults `BlockPlacementManager.allowsGapCursor()` and falls back to
an eligible editable/root-flow neighbor rather than creating a selection beside
an absolute object. The same policy is shared with host gap rendering and
keyboard navigation, including dynamic restoration after an object returns to
relative flow.

Includes a mousedown+click same-target anti-drag guard so a drag-select never drops a gap cursor. Content clicks pass through to native handling unchanged.

### Configuration

No configuration options. Zero-config plugin.

```typescript
new BlockGapCreatorPlugin()
```

---

## BlockTransformerPlugin

> `plugins/block-transformer/` — Slash menu, block-type conversion, and Markdown shortcuts.

Enables slash-command (`/` or `、`) to open one grouped insertion surface,
Markdown shortcuts (e.g., `# ` for heading, `- ` for bullet), and
`Cmd/Ctrl+0–4` to set heading levels. At the start of a paragraph the menu keeps
the complete block + inline catalog. Inside existing paragraph text it opens an
inline-only catalog and never offers headings, blocks, media or third-party
embeds. The command owns only the contiguous `/query` token up to the first
space or inline Embed, so inserting an inline result preserves text on both
sides. Filtering reads model Y.Text rather than depending on selection offset
update order, so the first query character cannot prematurely close the menu.
Moving the caret outside that token or typing whitespace closes the menu.
`ArrowUp` / `ArrowDown` move the active item, `Enter` selects it, and `Escape`
closes the menu without moving the editor caret.

Typing a half-width `:` at any position in rich editable text opens the CSES
EmojiPicker without its search input. Text committed after `:` stays in the
editor-owned Y.Text and controls EmojiPicker `csQuery`; choosing a result
atomically replaces the full `:query` range. Deleting the trigger, entering
whitespace, moving the caret outside the range, destroying the block, or
pressing `Escape` closes the panel. This does not change the slash catalogs:
paragraph-start `/` / `、` keeps the complete catalog, while an in-text trigger
uses the inline-only catalog. The `/emoji` slash command remains available and
keeps the picker's ordinary search input. Any arrow key
activates the Emoji grid's virtual selection and is consumed before the
document can move its caret. Real focus remains in the editor, so subsequent
text and IME commits continue updating `csQuery`; four-direction navigation and
`Enter` operate on the virtual active option, `Tab` / `Shift+Tab` cycle Emoji
categories, and `Escape` closes the picker. These key bindings are owned by
BlockTransformer; the CSES picker only exposes semantic movement and selection
methods.

### Configuration

```typescript
new BlockTransformerPlugin(
  config?: readonly IBlockTransformConfig[] | BlockTransformerPluginOptions,
)
```

The legacy transform-array constructor remains supported. Use the options form
to add host-owned slash commands:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `transformList` | `readonly IBlockTransformConfig[]` | `blockTransforms` | Block types available for conversion and Markdown shortcuts |
| `commands` | `readonly SlashCommandItem[]` | `[]` | Additional items appended to the grouped slash menu |

Each `IBlockTransformConfig`:

| Field | Type | Description |
|-------|------|-------------|
| `flavour` | `BlockFlavour` | Target block flavour |
| `description` | `string` | Optional slash-menu introduction overriding Schema `metadata.description`; do not include shortcut syntax |
| `keywords` | `readonly string[]` | Additional searchable aliases |
| `searchAlias` | `string` | Preferred alias displayed as `/alias` and included in search |
| `hotkey` | `HotkeyConfig` | Optional keyboard shortcut |
| `markdown` | `RegExp` | Optional Markdown trigger pattern |
| `markdownHint` | `string` | Human-readable Markdown trigger rendered as a trailing hint |
| `onConvert` | `(doc, block, text) => void` | Optional custom conversion logic |

Each `SlashCommandItem` has `id`, `label`, `run(context)` and optional `group`,
`groupLabel`, `description`, `keywords`, `icon`, `svgIcon`, `csIcon`, and
`when(context)`. `searchAlias` selects the visible `/alias`, while
`shortcutHint` displays a host-owned shortcut without registering that binding.
Groups are `basic`, `inline`, `media`, or `embed`. IDs must be stable; a host
command with the same ID as a built-in command replaces that built-in command
in place. Search indexes the label, ID, flavour, explicit alias, and `keywords`.
Chinese labels and keywords also receive pinyin-initial keys, so `/gl` matches
`高亮块`; descriptions and group labels are presentation-only and cannot create
accidental search matches.

For Schema block items, introduction resolution is local to this menu:

1. Matching `IBlockTransformConfig.description`.
2. Schema `metadata.description`.
3. No introduction row.

The plugin never writes the override back to Schema metadata. Markdown syntax,
the formatted cross-platform hotkey, and `/searchAlias` are never concatenated
into `description`. The hotkey and quick-search alias stay at the end of the
right-hand hint area's first row; the Markdown trigger receives its own second
row directly below them in the same right-hand area.

`SlashCommandContext` exposes `doc`, `block`, `query`, `triggerIndex`,
`triggerLength`, and a single-use `replace(deltas)` function. `replace()` keeps
the slash range as a Yjs relative position while an async picker is open. It
returns `false` if the range became stale, readonly, or invalid, and otherwise
replaces `/query` through the editable block model and restores the caret.

### Built-in Slash Commands

The default grouped menu includes all insertable Schema blocks plus:

| Group | Commands |
|-------|----------|
| Basic content | Paragraph, heading 1–4, editable block Schemas, and host commands assigned to `basic` |
| Inline content | Formula, mention (when `MentionPlugin` is registered), Emoji, CSES Icon, link, date, and inline image (when the image Schema is registered) |
| Media & layout | Non-editable block Schemas |
| Third-party embed | Schemas whose flavour ends in `-embed` |

Emoji and Icon use `CsEmojiPickerComponent` and `CsIconPickerComponent` from the
exact CSES UI peer. The `:` type-ahead flow uses EmojiPicker's public `csQuery`
model while input continues in the editor. Entering picker keyboard navigation
uses EmojiPicker's preserve-focus keyboard API, so the grid renders an active
option without taking DOM focus from BlockCraft. The shared CSES Emoji/Icon
pickers expose `moveActive`, `selectActive`, and `moveCategory`; BlockTransformer
maps its own four-direction, Enter, Tab / Shift+Tab, and Escape bindings onto
those methods. Slash-opened Emoji and Icon pickers use the same active picker
session whether real focus remains in the editor or moves into the picker search
input. Navigation keys never move the document caret or transfer focus into the
grid; ordinary search text, Backspace, and IME remain owned by the focused
input. Both `:` and `/emoji` set the picker locale explicitly to `zh-CN`.
The selected Icon is stored through the built-in inline
`icon` embed as a `csicon csicon-<name>` class string; SVG catalogue entries are
not accepted by this single-colour embed path.

The `date` command (`inline:date`) opens no picker: it freezes the current
local time straight into a `date` embed, and editing is deferred to
`DateInlineExtensionPlugin`'s click dialog. Inserting through a picker would
make the common case — "stamp now" — cost two interactions.

Choosing a block item replaces the slash-command paragraph. Inline commands
replace the same model-owned `/query` range without moving input ownership into
the picker.

### Runtime Command API

Commands can also be contributed after construction. Changes appear the next
time the slash menu opens:

```typescript
const transformer = new BlockTransformerPlugin()
const dispose = transformer.registerCommand(command)
const disposeMany = transformer.registerCommands([commandA, commandB])

dispose()                              // removes only this registration
disposeMany()                          // removes this batch
transformer.unregisterCommand('host:command-id') // removes all registrations for the ID
```

Registrations are stacked per stable ID. The latest registration is visible;
disposing it reveals the previous registration, which lets independently loaded
host extensions override and unload without deleting another extension's item.

### Built-in Hotkeys

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+0` | Remove heading (plain paragraph) |
| `Cmd/Ctrl+1` | Heading 1 |
| `Cmd/Ctrl+2` | Heading 2 |
| `Cmd/Ctrl+3` | Heading 3 |
| `Cmd/Ctrl+4` | Heading 4 |

### Static API

```typescript
// Convert a block to a different type, preserving text content
BlockTransformerPlugin.transformEditableBlock(doc, fromBlock, toFlavour)
```

### Usage Example

```typescript
// Add a custom "note" block type to the slash menu
new BlockTransformerPlugin([
  ...blockTransforms,  // keep defaults
  {
    flavour: 'note',
    description: '记录补充说明或上下文',
    markdown: /^:::$/,  // trigger on typing :::
    markdownHint: '::: + 空格',
    searchAlias: 'bj',
    onConvert: (doc, block, text) => {
      // custom conversion logic
    },
  },
])

// Keep built-ins and add a host-owned inline command.
const transformer = new BlockTransformerPlugin({
  commands: [{
    id: 'inline:date',
    label: '日期',
    group: 'inline',
    csIcon: 'calendar',
    keywords: ['date', 'today'],
    run: async context => {
      const value = await openDatePicker()
      if (value) context.replace([{insert: value.label, attributes: {'d:date': value.iso}}])
    },
  }],
})

// A feature module can contribute later and clean up on unload.
const unregisterApproval = transformer.registerCommand({
  id: 'host:approval',
  label: '快捷审批',
  keywords: ['workflow'],
  searchAlias: 'sp',
  shortcutHint: '⌘⇧A', // display only; the host owns the binding
  run: context => context.replace([{insert: '审批'}]),
})
// unregisterApproval()
```

---

## OrderedBlockPlugin

> `plugins/ordered-extension/` — Auto-numbering for ordered list blocks.
> Runtime plugin ID: `ordered-block`.

Maintains correct sequential numbering across ordered list blocks. Recalculates
`order` props when blocks are inserted, deleted, or have `depth`/`heading`
changed. Clicking a marker opens the numbering library plus continue / restart
commands.

### Configuration

No configuration options.

```typescript
new OrderedBlockPlugin()
```

### Notes

- Subscribes to `doc.onChildrenUpdate$` and `doc.onPropsUpdate$` for automatic renumbering
- Queues stable parent/block IDs, reads the complete sibling sequence from
  `BlockModelGraph`, and writes `order` through `DocCRUD.updateBlockProps()`;
  offscreen root children are renumbered without materializing their components
- Recalculates the affected parent block as one sibling sequence after local child changes, or after ordered block `depth` / `heading` / `start` prop changes
- Numbering is grouped by sibling `depth` + `heading`; changing one ordered block's `heading` renumbers following ordered siblings in the same parent
- Plain ordered groups (`heading` omitted / zero) stop when a non-ordered sibling
  at the same or a deeper `depth` is encountered; a later plain ordered block
  starts a fresh counter. Ordered heading groups keep scanning across those
  non-ordered siblings whenever the existing heading/depth boundaries allow it
- Explicit `start` restarts the sequence from that number; following same-depth/same-heading ordered blocks continue from it
- A `start`-only prop change uses a local recalculation range and stops at the next explicit `start` boundary for the same `depth` + `heading`
- Returning from a nested depth to a shallower depth clears deeper counters, so nested ordered lists restart under the next parent item
- Shows `OrderedPrefixToolbar` when the list prefix button is clicked
- The fixed-toolbar split button uses `BcOrderedMarkerPickerComponent`, which
  offers the automatic depth cycle and 12 explicit `ms` presets. The
  prefix toolbar remains focused on continue / restart / recalculate and does
  not duplicate the marker library
- Marker changes call `applyOrderedMarkerStyle()` with stable IDs. They update
  the anchor's automatic-numbering group, cross same-level non-ordered siblings,
  stop at structural counter pruning or an explicit restart, skip readonly
  blocks, and use one normal Yjs transaction so Undo restores the whole change
- Marker changes do not schedule or rewrite `order`; automatic counter repair
  continues to use `ORIGIN_SYSTEM_REPAIR`
- Newly inserted ordered blocks that omit `ms` inherit the valid preset of the
  automatic-numbering group they join, including across same-level non-ordered
  siblings. Existing blocks are not backfilled, explicit styles are preserved,
  and a positive `start` boundary begins a group without inheritance
