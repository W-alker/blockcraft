# BlockCraft: Yjs Data Model Deep Dive

> **Level 2: Mechanism Deep Dive** — Only read this when working with the CRDT data layer.
>
> Last updated: 2026-07-17

## Architecture Overview

```
BlockCraftDoc
  ├── model: BlockModelGraph                   derived, read-only reachable tree
  ├── readonlyManager: BlockReadonlyManager   derived permission/cache layer
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
| `framework/doc/model-graph.ts` | `BlockModelGraph` — DOM-free structure/order/text/snapshot reads |
| `framework/doc/block-readonly-manager.ts` | Persistent/inherited block permission resolver and guards |
| `framework/doc/block-readonly.types.ts` | Public readonly resolution, operation, violation and error contracts |
| `framework/doc/crud.ts` | `DocCRUD` — all Yjs mutations + observables |
| `framework/doc/sync-lifecycle.ts` | Internal remote transaction before/after view-sync lifecycle |
| `framework/doc/vm.ts` | `DocVM` — Angular component creation/lookup |
| `framework/doc/undoManger.ts` | `DocUndoManager` — undo/redo with selection (note: filename is "Manger") |
| `framework/modules/selection/relative-bookmark.ts` | Shared Yjs-relative selection bookmark codec |
| `framework/modules/selection/live-bookmark-tracker.ts` | Revisioned current-selection bookmark used by remote sync |
| `framework/modules/selection/remote-selection-reconciler.ts` | Selection-owned remote bookmark reconciliation |
| `framework/modules/selection/history-restorer.ts` | Selection-owned Undo/Redo bookmark restoration |
| `framework/block-std/reactive/block.ts` | `proxyMap`, `YBlock`, `NativeBlockModel` |

## Reactive Proxy System

`proxyMap()` creates a JavaScript Proxy over Yjs data. The write example below
describes internal plumbing, not an extension API:

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

Custom Blocks and Plugins must not assign proxied props/meta directly because a
raw proxy assignment bypasses transaction grouping and block-readonly guards.
Use `block.updateProps()`, guarded inline methods, `DocChain`, or `DocCRUD`.

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

Model-first query: doc.model.getPath(blockId)
  → BlockModelGraph reachable-tree index + current YBlock values
  → Returns without ComponentRef, HTMLElement or layout reads
```

`BlockModelGraph` is built from the root after the initial YBlockMap is complete
and before mounted-view observers start. It observes structural Yjs changes,
reconciles affected parents/subtrees incrementally, and is destroyed with the
document. Props/text reads always come from the current YBlock; the graph does
not duplicate mutable business state.

## BlockModelGraph API

```typescript
doc.model.exists(blockId): boolean
doc.model.getYBlock(blockId): YBlock | undefined
doc.model.getParentId(blockId): string | null
doc.model.getChildrenIds(blockId): readonly string[]
doc.model.getPath(blockId): readonly string[] | null
doc.model.indexInParent(blockId): number
doc.model.getPreviousSiblingId(blockId): string | null
doc.model.getNextSiblingId(blockId): string | null

doc.model.getFlavour(blockId)
doc.model.getNodeType(blockId)
doc.model.getProps(blockId)
doc.model.getText(blockId)
doc.model.getTextLength(blockId)

doc.model.comparePosition(aId, bId)
doc.model.queryBetween(fromId, toId, contain?)
doc.model.toSnapshot(blockId): IBlockSnapshot | null
doc.model.structureRevision: number
doc.model.structureChange$: Observable<IBlockModelStructureChange>
```

Important boundaries:

- `exists()` means reachable from the current document root. An orphan entry in
  `yBlockMap` is not a document block and returns `false`.
- The graph tolerates missing, cyclic and duplicate child references by skipping
  invalid edges. It reports diagnostics but never repairs/writes Yjs; structural
  repair ownership remains in CRUD/`ChildrenRepairer`.
- `comparePosition()` preserves the numeric bitmask direction of the former DOM
  `compareDocumentPosition()` implementation, including combined containment
  and ordering bits.
- `queryBetween()` preserves `BlockCraftDoc.queryBlocksBetween()` semantics: it
  returns the sibling interval below the closest common parent, not a full-tree
  preorder slice.
- `toSnapshot()` preserves rich `Y.Text` deltas, props, meta and nested blocks,
  and does not require mounted components.
- Model APIs are queries only. Plugins must still mutate through `DocCRUD` or
  `DocChain`; never write a returned YBlock or cached props object directly.
- `doc.vm` and `getBlockById()` describe mounted Angular view state. Do not use
  them as document-existence checks when model-only behavior is sufficient.

## Persistent Block Readonly

`IBaseMetadata.readonly?: boolean` is the only persisted lock flag. A value of
`true` is an explicit lock; absence means no explicit lock. Do not persist a
separate inherited flag—`BlockReadonlyManager` resolves inheritance from
`BlockModelGraph` and caches only derived permission state.

```typescript
doc.setBlockReadonly(blockId, true)

doc.readonlyManager.resolve(blockId)
doc.readonlyManager.isExplicitReadonly(blockId)
doc.readonlyManager.containsReadonly(blockId)

doc.setBlockReadonly(blockId, false)
```

Readonly control uses `ORIGIN_BLOCK_READONLY_CONTROL`: it synchronizes and
persists but is excluded from normal content Undo/Redo. Root cannot receive this
flag. `ORIGIN_SYSTEM_REPAIR` is reserved for deterministic internal consistency
repairs (children de-duplication, table normalization, ordered numbering); it
may bypass user-facing block guards but is not an authorization escape hatch for
host or plugin mutations.

The manager intentionally does not copy `parentById` or any other structure
index. Effective lookup walks `doc.model.getPath()` once and caches the result;
subtree lock counts are rebuilt lazily from explicit lock paths after a model
revision. Queries never read DOM/layout and work for reachable unmounted blocks.

Remote Yjs updates are still applied and rendered—the guard is for local user,
plugin, chain, CRUD and history entry points. This makes block readonly a
trusted-client editing policy, not cryptographic/server access control.

## Remote Transactions and Local Selection

DocCRUD publishes transaction/view-sync facts; the Selection domain maps the current local selection through relevant remote Yjs changes without treating DOM as the source of truth:

```text
selectionChange$ → revisioned live RelativeSelectionBookmark

remote Y.Transaction
  → DocCRUD emits before-view-sync + affected block IDs
  → RemoteSelectionReconciler snapshots the live bookmark
  → _syncYEvent() updates model and mounted view
  → DocCRUD emits after-view-sync for the same transaction
  → direct endpoint hit, or changed endpoint ancestor path/index?
       no  → no selection work
       yes → one animation-frame reconciliation
  → revision and editor focus still current?
       no  → cancel
       yes → resolve Y.RelativePosition + current commonParent
              success → SelectionManager.replay(mapped JSON)
              failure → one owned-native-Range recalculate, otherwise replay(null)
```

Text endpoints are relative to the owning `Y.Text`; boundary endpoints are relative to the container's children `Y.Array`. Selected/gap/table-cell points are validated structurally by ID. Ancestor dependency IDs provide a cheap candidate filter, then only captured structural edges owned by affected parents are checked; parent/sibling positions prevent unrelated root or container changes from replaying every local selection. The path performs no layout read; DOM normalization is a guarded failure fallback only.

DocCRUD never reads DOM selection or calls selection replay in this flow. `RemoteSelectionReconciler` owns capture/relevance/replay, while `SelectionSurfaceAdapter` owns the guarded native-selection/focus/frame boundary.

`DocUndoManager` uses the same relative bookmark codec for one-shot selection snapshots. Live collaboration and Undo have different lifecycles, but they share point affinity, liveness checks, current-tree `commonParent` resolution, and table/boundary semantics.

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

`deleteBlocks()` is selection-neutral. When a non-forced deletion removes every
child of a `renderUnit` container, DocCRUD synchronously inserts one empty
paragraph to keep the container editable, but it does not sample or reposition
the browser selection. The Input/plugin action that owns the mutation must place
the final caret or range explicitly through `SelectionManager` (`setCursorAt()`,
`setCursorAtBlock()`, `replay()`, etc.). Do not call `recalculate()` merely to
confirm a programmatic write.

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

Persistence/export snapshots retain `meta.readonly`. Clipboard serialization is
the deliberate exception: copy clones the snapshot and recursively removes the
readonly metadata before producing BlockSnapshot/HTML/Markdown/plain payloads,
so pasting protected content never recreates permission state.

## Undo/Redo

`DocUndoManager` wraps `Y.UndoManager` and stores selection bookmarks on each owning Yjs `StackItem.meta`. It lives on `doc.crud.undoManager`:

```typescript
// All mutations via DocCRUD.transact() are automatically tracked

// Manual undo/redo
doc.crud.undoManager.undo()
doc.crud.undoManager.redo()
doc.crud.undoManager.canUndo()
doc.crud.undoManager.canRedo()
```

Selection state is saved on the content stack item itself using the shared Relative Selection Bookmark codec (`Y.RelativePosition` for text/boundary points, structural IDs for selected/gap/table-cell points). A merged item keeps its earliest pre-change bookmark. Undo captures the current selection for the redo `StackItem` Yjs creates, and redo performs the symmetric capture for the replacement undo item. This follows Yjs stack identity through merge, clear, truncation and undo/redo without parallel array indexes.

After a stack item is popped, Selection's `SelectionHistoryRestorer` owns focus, relative-position resolution, replay and bounded DOM/model verification. `DocUndoManager` does not read `document`, schedule animation frames or recalculate a browser range.

Every history item also accumulates affected block IDs. Undo/Redo checks the
entire item before asking Yjs to pop it. If an affected reachable block is
readonly, or an affected ancestor contains a locked descendant, the operation
is rejected and the item remains on its original stack; unlocking makes that
same item executable later.

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

// Persistent block-lock control (framework-owned)
doc.crud.transact(() => { ... }, ORIGIN_BLOCK_READONLY_CONTROL)

// Deterministic consistency repair (framework-owned; may bypass block guards)
doc.crud.transact(() => { ... }, ORIGIN_SYSTEM_REPAIR)
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
