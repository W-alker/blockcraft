# BlockCraft: Yjs Data Model Deep Dive

> **Level 2: Mechanism Deep Dive** — Only read this when working with the CRDT data layer.
>
> Last updated: 2026-07-12

## Architecture Overview

```
BlockCraftDoc
  └── yDoc: Y.Doc
       └── yBlockMap: Y.Map<string, YBlock>    key = "blocks"
            └── YBlock: Y.Map
                 ├── id: string
                 ├── flavour: string
                 ├── nodeType: number
                 ├── props: Y.Map              (reactive properties)
                 ├── meta: Y.Map               (metadata)
                 ├── children: Y.Array<string>  (child block IDs)
                 └── text?: Y.Text              (inline content, editable blocks only)
```

## Key Files

| File | Purpose |
|------|---------|
| `framework/doc/index.ts` | `BlockCraftDoc` — owns `Y.Doc`, exposes services |
| `framework/doc/crud.ts` | `DocCRUD` — all Yjs mutations + observables |
| `framework/doc/vm.ts` | `DocVM` — Angular component creation/lookup |
| `framework/doc/undoManger.ts` | `DocUndoManager` — undo/redo with selection (note: filename is "Manger") |
| `framework/block-std/reactive/block.ts` | `proxyMap`, `YBlock`, `NativeBlockModel` |

## Reactive Proxy System

`proxyMap()` creates a JavaScript Proxy over Yjs data:

```typescript
const native = proxyMap(nativeObj, yMap);

// JS property write → automatically syncs to Y.Map
native.color = '#ff0000';
// Internally: yMap.set('color', '#ff0000')

// JS property read → reads from Y.Map
console.log(native.color);
// Internally: yMap.get('color')
```

This is how `block.props.color = 'red'` automatically syncs via Yjs.

## Data Flow: Write Path

```
block.updateProps({ color: 'red' })
  → DocCRUD.transact(() => { yBlock.props.set('color', 'red') })
  → Y.Transaction
  → Y.Event fires
  → DocCRUD._syncYEvent() dispatches:
     → onPropsUpdate$ (for property changes)
     → onChildrenUpdate$ (for children array changes)
     → onTextUpdate$ (for Y.Text changes)
  → Angular markForCheck() on affected components
```

## Data Flow: Read Path

```
Component template: {{ props.color }}
  → ProxyMap getter → yMap.get('color')
  → Returns current Yjs value
```

## DocCRUD API

```typescript
// Insert blocks
doc.crud.insertBlocks(parentId, index, snapshots[])
doc.crud.insertBlocksBefore(block, snapshots[])
doc.crud.insertBlocksAfter(block, snapshots[])

// Delete blocks
doc.crud.deleteBlocks(parentId, index, count)
doc.crud.deleteBlockById(blockId)

// Replace
doc.crud.replaceWithSnapshots(blockId, snapshots[])

// Move
doc.crud.moveBlocks(parentId, index, count, targetId, targetIndex)

// Transaction wrapper
doc.crud.transact(fn, origin?)

// Access raw Yjs
doc.crud.getYBlock(id): YBlock  // Y.Map
```

## IBlockSnapshot Format

```typescript
interface IBlockSnapshot {
  id: string;
  flavour: string;
  nodeType: BlockNodeType;
  props: Record<string, any>;
  meta: Record<string, any>;
  children: IBlockSnapshot[];   // Nested tree structure
}
```

Snapshots are the serialization format used for:
- Creating new blocks
- Clipboard copy/paste
- Undo/redo snapshots
- HTML/Markdown import/export
- Document persistence

## Undo/Redo

`DocUndoManager` wraps `Y.UndoManager` with parallel selection stacks. It lives on `doc.crud.undoManager`:

```typescript
// All mutations via DocCRUD.transact() are automatically tracked

// Manual undo/redo
doc.crud.undoManager.undo()
doc.crud.undoManager.redo()
doc.crud.undoManager.canUndo()
doc.crud.undoManager.canRedo()
```

Selection state is saved alongside undo items using `Y.RelativePosition` (collaboration-safe).

IME flows that split one user intent across multiple Yjs transactions can temporarily open a capture group:

```typescript
doc.crud.undoManager.beginCaptureGroup()
// compositionStart: materialize/delete blocks
// compositionEnd: commit final IME text
doc.crud.undoManager.endCaptureGroup()
```

The group forces the involved transactions into one undo item regardless of elapsed wall time, then restores the normal Yjs `captureTimeout` and stops capturing so the next user action starts a fresh undo item. This is used internally by `InputTransformer`; plugins should prefer higher-level editor APIs unless they are implementing a comparable multi-transaction input primitive.

## Transaction Origins

```typescript
// Normal mutation (creates undo history)
doc.crud.transact(() => { ... })

// Skip undo history
doc.crud.transact(() => { ... }, ORIGIN_SKIP_HISTORY)

// Skip sync (for metadata updates)
doc.crud.transact(() => { ... }, ORIGIN_SKIP_SYNC)
```

## Block Tree Navigation

```typescript
doc.getBlockById(id)                    // BlockComponent | undefined
doc.nextSibling(block)                  // Next sibling in parent
doc.prevSibling(block)                  // Previous sibling in parent
doc.queryAncestor(block, predicate?)    // Walk up the tree
doc.queryBlocksBetween(from, to)        // All blocks between two blocks
doc.compareBlockPosition(a, b)          // BLOCK_POSITION enum
```

## Yjs Sync Patterns

### Local Changes
```
User edits → DocCRUD.transact() → Y.Transaction → Y.Events → DOM update
```

### Remote Changes (Collaboration)
```
WebSocket message → Y.Doc.applyUpdate() → Y.Events → DocCRUD._syncYEvent() → DOM update
```

Both paths converge at Y.Events, so the same update logic handles local and remote changes.

## When to Read Source Files

- **Understanding how blocks are created**: Read `DocCRUD.insertBlocks()`
- **Understanding reactive props**: Read `proxyMap()` in `reactive/block.ts`
- **Modifying undo behavior**: Read `DocUndoManager`
- **Understanding snapshot format**: Read `IBlockSnapshot` type + `BaseBlockComponent.toSnapshot()`
- **Working with Y.Text directly**: Read `EditableBlockComponent`, `InlineRuntime`
- **Transaction handling**: Read `DocCRUD.transact()`
- **Full architecture**: Read `packages/editor/ARCHITECTURE.md`
