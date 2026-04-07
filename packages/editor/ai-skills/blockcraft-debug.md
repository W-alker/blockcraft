# BlockCraft: Debugging Guide

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Last updated: 2026-04-07

## Data Flow Tracing

### The Core Data Flow

```
User action
  → DOM event
  → UIEventDispatcher (event system)
  → Handler (plugin/module)
  → DocCRUD mutation (Yjs transaction)
  → Y.Event fires
  → DocCRUD._syncYEvent() dispatches to subjects:
     → onPropsUpdate$ / onChildrenUpdate$ / onTextUpdate$
  → Angular component markForCheck()
  → View updates
```

### Tracing a Text Edit

```
Keystroke
  → DOM 'beforeInput' event
  → UIEventDispatcher → InputTransformer
  → e.preventDefault()
  → EditableBlockComponent.insertText() → Y.Text.insert()
  → Y.Text fires delta event
  → InlineRuntime.applyDelta() → DOM update
```

### Tracing a Block Operation

```
API call: doc.chain().insertAfter(block, 'paragraph').run()
  → DocChain.run()
  → DocCRUD.insertBlocksAfter()
  → Y.Transaction:
     → yBlockMap.set(newId, yBlock)
     → parentChildren.insert(index, [newId])
  → Y.Events fire
  → DocCRUD._syncYEvent():
     → DocVM.createComponentByYBlocks()
     → Angular component created
     → onChildrenUpdate$ emits
```

## Common Issues & Solutions

### Block Not Rendering

1. Check schema is registered in `SchemaManager`
2. Check `flavour` matches between schema, model, and `createSnapshot`
3. Check component is exported from `blocks/index.ts`
4. Check `declare global` type declarations exist

### Inline Content Not Showing

1. Editable block must extend `EditableBlockComponent`
2. Host must have `[class.edit-container]: 'true'`
3. Template must be empty (InlineRuntime renders into host)
4. Check `nodeType` is `BlockNodeType.editable`

### Overlay Not Positioning Correctly

1. Check `target` element exists in DOM when overlay opens
2. Check positions array has fallback positions
3. Check scroll container is set correctly
4. Try using `getPositionWithOffset()` helpers

### Selection Not Working

1. Check block's `contenteditable` attribute
2. Void blocks must have `contenteditable="false"`
3. Container blocks need `children-render-container` class
4. Read `blockcraft-selection.md` for deep dive

### Plugin Events Not Firing

1. Check `@EventListen` decorator is imported from `framework`
2. Check `flavour` spelling matches exactly
3. Check plugin is registered in `DocConfig.plugins[]`
4. For hotkeys: check `shortKey` (Ctrl/Cmd) vs `ctrlKey` (only Ctrl)
5. Verify handler returns `true` if you want to stop propagation

### IME / Chinese Input Issues

1. Read `blockcraft-input.md` for the CompositionSession mechanism
2. Check `CursorBlot` creation/removal in `compositionStart/End`
3. Verify `OneShotCursorAnchor` handling for collaboration

### Undo/Redo Not Working

1. Check mutations go through `DocCRUD.transact()` (not direct Yjs)
2. Check transaction origin is not `ORIGIN_SKIP_HISTORY`
3. Check `updateProps()` is used (not `setInitProps()` which skips history)

## Debugging Tools

### Logger

```typescript
// The editor has a built-in logger
doc.logger.log('MyPlugin', 'message', data);
doc.logger.warn('MyPlugin', 'warning');
doc.logger.error('MyPlugin', 'error', errorObj);
```

### Inspecting Block Tree

```typescript
// Get root block
const root = doc.rootBlock;

// Get any block by ID
const block = doc.getBlockById(blockId);

// Serialize to snapshot (inspectable JSON)
const snapshot = block.toSnapshot(true);  // true = deep (include children)
console.log(JSON.stringify(snapshot, null, 2));

// Get plain text
console.log(block.textContent());
```

### Inspecting Yjs State

```typescript
// Access raw Yjs data
const yBlock = doc.crud.getYBlock(blockId);
console.log('props:', yBlock.get('props').toJSON());
console.log('children:', yBlock.get('children').toArray());

// For editable blocks
const yText = yBlock.get('text') as Y.Text;
console.log('deltas:', yText.toDelta());
console.log('text:', yText.toString());
```

### Inspecting Selection

```typescript
const selection = doc.selection.selectionChange$.value;
if (selection) {
  console.log('anchor:', selection.anchor);
  console.log('head:', selection.head);
  console.log('isCollapsed:', selection.isCollapsed);
  console.log('isInSameBlock:', selection.isInSameBlock);
  console.log('selectedText:', doc.selection.getSelectedText());
}
```

### Inspecting Inline Blot Tree

```typescript
// For editable blocks
const editableBlock = block as EditableBlockComponent;
const runtime = editableBlock.runtime;
console.log('blot tree:', runtime.scrollBlot);
console.log('total length:', runtime.getLength());
```

## Build Issues

Build command: `pnpm nx build editor` (from monorepo root)

Common build errors:
- **Missing type declarations**: Add `declare global { namespace BlockCraft { ... } }`
- **Circular imports**: Check import paths, use barrel exports carefully
- **Missing exports**: Add to `blocks/index.ts` or `plugins/index.ts`
