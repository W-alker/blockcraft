# BlockCraft: Yjs Data Model Deep Dive

> **Level 2: Mechanism Deep Dive** — Only read this when working with the CRDT data layer.
>
> Last updated: 2026-08-27

## Architecture Overview

```
BlockCraftDoc
  ├── model: BlockModelGraph                   derived, read-only reachable tree
  ├── readonlyManager: BlockReadonlyManager   derived permission/cache layer
  ├── revisions: DocumentRevisionManager      revision/query/projection domain
  └── yDoc: Y.Doc
       ├── yBlockMap: Y.Map<string, YBlock>    key = "blocks"
       │    └── YBlock: Y.Map
                 ├── id: string
                 ├── flavour: string
                 ├── nodeType: number
                 ├── props: Y.Map              (reactive properties)
                 ├── meta: Y.Map               (metadata)
                 ├── children: Y.Array<string>  (child block IDs)
                 └── text?: Y.Text              (inline content, editable blocks only)
       ├── Y.Map<RevisionRecord>               key = "bc:revisions"
       ├── Y.Map<RevisionDecision>             key = "bc:revision-decisions"
       └── Y.Map<unknown>                      key = "bc:revision-meta"
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
| `framework/revision/` | Revision records, append-only decisions, projection, conflict detection and checkpoint compaction |
| `framework/modules/selection/relative-bookmark.ts` | Shared Yjs-relative selection bookmark codec |
| `framework/modules/selection/live-bookmark-tracker.ts` | Revisioned current-selection bookmark used by remote sync |
| `framework/modules/selection/remote-selection-reconciler.ts` | Selection-owned remote bookmark reconciliation |
| `framework/modules/selection/history-restorer.ts` | Selection-owned Undo/Redo bookmark restoration |
| `framework/modules/table/` | Package-internal table topology/selection projections over stable model IDs |
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

### Flat props and collaborative value boundaries

Every top-level block prop is an independent entry in the block's `props`
Y.Map. A nested `SimpleRecord` is legal snapshot data, but updating that one
top-level key replaces the record as one collaborative value. Prefer flat
primitive fields when users may edit parts independently.

The exported `BlockSurfaceProps` makes one deliberate shorthand exception:
padding is stored as the single `p` entry with CSS-like 1–4 numeric values.
Changing one side therefore replaces the complete padding shorthand value.
Background-image options (`bgi/bgs/bgx/bgy/bgo`) remain separate entries, so
for example `bgs` and `bgo` can still merge independently. Runtime code expands
the shorthand through `normalizeBlockSurfaceProps()` / `resolveBlockSurface()`
and must not persist a second nested surface object.

`null` passed to `updateProps()` or `updateBlockProps()` deletes that Y.Map key;
omitted surface values resolve to defaults without a load-time migration.

The object-format domain makes a second deliberate atomic-value choice. Its
persisted keys are `lockRatio/shape/fill/outline/effects/textFrame/textStyle`.
These names remove repeated domain prefixes without collapsing the public
contract into opaque single letters. Each structured section is one shallow
`Record<string, SimpleBasicType>` value, not a JSON string and not a nested Y.Map.
Changing shadow and glow therefore replaces the single `effects` value;
changing whole-object text effects replaces the single `textStyle` value. A
mixed batch command still produces one transaction and one Undo step. Use `storeObjectPaint()`,
`storeObjectLine()`, `storeObjectEffects()`, `storeObjectTextFrame()` and
`storeObjectTextStyle()` at snapshot boundaries; never mutate a stored record
in place. Missing or malformed values resolve to Schema
`metadata.objectFormat.defaults` without a migration or exception. `null`
deletes one section and restores its Schema default; a valid stored `t: 'n'`
fill/outline remains explicit state.
`BlockObjectFormatManager.updateSelection()` stays selection-guarded by
default. Its `allowDetachedSelection` option accepts only a `null` selection
gap and is intended for the object toolbar while browser focus is owned by its
input or CSES child overlay; it never accepts a different non-empty selection.

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

Model-first structural mutation is also available when no view capability is
needed:

```typescript
const insertedIds = doc.crud.insertBlockSnapshots(parentId, index, snapshots)
doc.crud.deleteBlocks(parentId, index, count)
doc.crud.deleteBlockById(blockId)
doc.crud.moveBlocks(parentId, index, count, targetParentId, targetIndex)
```

The method validates schema and readonly rules, writes the snapshots and parent
children array in one Yjs transaction, and returns only stable block IDs. The
parent may be reachable without a ComponentRef, and the method never resolves
inserted components for its return value. If the parent view already exists,
the normal Yjs observer still synchronizes that view; sparse-root and uncreated
parent insertions remain model-only. The existing `insertBlocks()` API delegates
to the same write path, then preserves its legacy synchronous
`BlockComponent[]` result by materializing views where required.
Deletion and movement resolve their parent, child range and target from the
reachable Yjs model rather than `DocVM`. Their readonly checks and writes run
before/in the same transaction as before. Existing views are patched by the
normal observer, while an uncreated source or target remains model-only.

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
doc.model.getTextDeltas(blockId)
doc.model.getTextLength(blockId)

doc.model.comparePosition(aId, bId)
doc.model.queryBetween(fromId, toId, contain?)
doc.model.toSnapshot(blockId): IBlockSnapshot | null
doc.model.structureRevision: number
doc.model.structureChange$: Observable<IBlockModelStructureChange>
doc.model.contentChange$: Observable<IBlockModelContentChange>
doc.model.textChange$: Observable<IBlockModelTextChange>

// @internal: DocCRUD view-materialization barrier for an open outer transaction
doc.model.synchronizeParentBeforeView(parentId): void

doc.exportSnapshot(): IBlockSnapshot | undefined
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
- `doc.exportSnapshot()` is the full-document convenience entry point. Prefer it
  for persistence and export so virtualized offscreen blocks are included
  without creating Angular views.
- `getTextDeltas()` and `textChange$` provide rich-text reads and transaction-
  coalesced changed block IDs for mounted or unmounted editable blocks. Use
  these for model-wide indexes such as search; `onTextUpdate$` remains a
  component/view update stream and intentionally omits uncreated views.
- `contentChange$` is the broader model-level invalidation stream. It reports
  reachable text, inline-attribute and props changes without requiring mounted
  views; see the contract below. Existing `textChange$` subscribers keep their
  original filtering and transaction context unchanged.
- Model APIs are queries only. Plugins must still mutate through `DocCRUD` or
  `DocChain`; never write a returned YBlock or cached props object directly.
- `synchronizeParentBeforeView()` is the one internal exception to the query
  surface. `DocCRUD` uses it only when a sparse-root insert must synchronously
  return a component before an outer Yjs transaction can notify deep observers.
  Extensions must not call it or treat it as a mutation API.

### Table Model Projection

`framework/modules/table/TableModelGrid` is a package-internal read model over
the direct `table → table-row → table-cell` topology. It builds stable-ID
coordinate, physical-cell, visible-master and rowspan/colspan indexes without
reading ComponentRefs, descendants, text or layout. `TableModelProjectionStore`
caches that grid per document/table and invalidates it only for table/cell prop
changes, table/row child-structure changes, table removal or document destroy;
ordinary cell text and row-height changes retain the projection.

The projection is read-only and diagnostic. A malformed grid never repairs Yjs
or guesses from the mounted view. Table selection, input and table keyboard /
clipboard commands resolve their complete target set from this model, then send
stable IDs to `DocCRUD` or obtain snapshots through `doc.model.toSnapshot()`.
Component lookup remains a view capability for focus and mounted-cell painting,
not mutation authority.
- `doc.vm` and `getBlockById()` describe mounted Angular view state. Do not use
  them as document-existence checks when model-only behavior is sufficient.

### Model Change Streams

```typescript
export type BlockModelContentChangeKind = "text" | "props"

export interface IBlockModelContentChange {
  readonly blockIds: readonly string[]
  readonly kinds: readonly BlockModelContentChangeKind[]
  readonly origin: unknown
  readonly local: boolean
  readonly isUndoRedo: boolean
}

export interface IBlockModelStructureChange {
  revision: number
  reachableAddedIds: readonly string[]
  reachableRemovedIds: readonly string[]
  affectedParentIds: readonly string[]
  readonly affectedRootIds?: readonly string[]
}
```

`contentChange$` emits at most once per Yjs transaction for changed blocks that
remain reachable from the document root. It covers editable text mutations,
inline attribute changes, nested `props` mutations, `children`/`props`
replacement and whole reachable block replacement. `meta`-only changes and
unreachable/orphan blocks are excluded. `kinds` is the transaction-coalesced
set of `"text"` and `"props"`; `origin`, `local` and `isUndoRedo` preserve the
same transaction context used by `textChange$`.

`textChange$` remains fully compatible: it still emits only reachable editable
text block IDs and keeps its previous transaction metadata. Existing search or
text-index subscriptions do not need to migrate. Use `contentChange$` only
when props or non-view model invalidation also matters.

`structureChange$.affectedRootIds` identifies direct-root render units whose
content/layout ownership changed, including nested moves and deletes. The field
is optional so existing constructed mocks and consumers remain source
compatible, but current runtimes always emit it. Direct-root additions and
removals include the affected IDs; a pure direct-root reorder emits `[]`
because order synchronization is already represented by the structure event
and does not invalidate measured block geometry.

## Sparse View Synchronization

When `DocConfig.virtualization.enabled` is true, direct root children can be
uncreated, mounted or retained while their YBlocks remain live. `DocCRUD`
therefore treats a missing ComponentRef as a valid view state:

- snapshot initialization materializes the complete YBlock tree in one
  transaction, builds `BlockModelGraph`, and creates only the root component;
- text/props changes on an uncreated block update Yjs/model only; mounting
  rebuilds from current Yjs state;
- retained editable blocks skip DOM patches and rebuild `InlineRuntime` on
  reattach;
- remote root insertions update model order and sparse indices without creating
  components;
- `insertBlockSnapshots()` keeps local root insertions model-only and returns
  stable IDs; legacy `insertBlocks()` ensures retained components so its command
  return values stay compatible, while Selection/viewport leases decide whether
  to mount them. If that compatibility materialization occurs inside a nested
  Yjs transaction, `DocCRUD` synchronizes the affected parent projection before
  Angular lifecycle runs; the commit observer detects the already-reconciled
  graph and does not emit a duplicate structure revision;
- `deleteBlocks()`, `deleteBlockById()` and `moveBlocks()` can mutate reachable
  uncreated parents/blocks directly; mounted parents still receive the same
  children delta and retain component identity for moved blocks;
- root delete/move/undo shifts only mounted sparse indices and never requires a
  dense ComponentRef array;
- when one transaction deletes a temporary container while moving one of its
  children to a surviving parent (for example, undoing a drag-created columns
  block), component destruction follows the post-transaction model owner.
  `DocVM` destroys only data-deleted descendants, retains a still-reachable
  moved subtree, and lets the destination children event adopt it. A delayed
  event captured from the deleted parent is discarded by parent liveness and
  ComponentRef identity checks;
- direct-root order changes remap Selection/Projection leases by stable block ID
  and preserve the visible anchor across local, remote and undo/redo transactions;
  nested-only structure changes leave the root window index untouched.

Nested children of a mounted or retained root child remain a complete subtree
in the current implementation. All local and remote mutations still use the
same Yjs transaction and observer path.

## Persistent Block Readonly

`IBaseMetadata.lock?: string` persists the explicit lock owner's non-empty user
ID. Absence means no explicit lock. Do not persist a separate boolean or
inherited flag—`BlockReadonlyManager` resolves inheritance from
`BlockModelGraph` and caches only derived permission state. Legacy
`meta.readonly` is not read or migrated.

```typescript
const doc = new BlockCraftDoc({
  // ...
  currentUserId: currentUser.id,
  canUnlockBlock: ({currentUserId}) =>
    currentUserId !== null && permissions.isAdmin(currentUserId),
})

doc.setBlockReadonly(blockId, true)

doc.readonlyManager.resolve(blockId)
doc.readonlyManager.isExplicitReadonly(blockId)
doc.readonlyManager.getExplicitLockUserId(blockId)
doc.readonlyManager.containsReadonly(blockId)
doc.canUnlockBlock(blockId)

doc.setBlockReadonly(blockId, false)
```

Lock control uses `ORIGIN_BLOCK_READONLY_CONTROL`: it synchronizes and persists
but is excluded from normal content Undo/Redo. `DocConfig.currentUserId` is
captured at document construction and owns new locks. Unlock requires the same
user or an additional synchronous `canUnlockBlock` grant; missing identity
disables lock control without making unlocked content readonly. Root cannot
receive this field. `ORIGIN_SYSTEM_REPAIR` is reserved for deterministic
internal consistency repairs (children de-duplication, table normalization,
ordered numbering); it may bypass user-facing block guards but is not an
authorization escape hatch for host or plugin mutations.

The manager indexes explicit owners as `Map<blockId, userId>` and intentionally
does not copy `parentById` or any other structure index. Effective lookup walks
`doc.model.getPath()` once and caches the result; subtree lock counts are
rebuilt lazily from explicit lock paths after a model revision. Queries never
read DOM/layout and work for reachable unmounted blocks. The host unlock policy
is not called from input/write-guard hot paths.

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

`DocUndoManager` uses the same relative bookmark codec for one-shot selection snapshots. Live collaboration and Undo have different lifecycles, but they share point affinity, liveness checks, current-tree `commonParent` resolution, and table/boundary semantics. History restoration records whether the resolved head is visible before native Selection replay: visible targets preserve the viewport, while offscreen virtual targets delegate to bounded stable-ID center navigation after replay.

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
doc.crud.replaceBlockSnapshots(blockId, snapshots[]) // returns IDs, no view required

// Props writes by stable model ID (mounted component not required)
doc.crud.updateBlockProps(blockId, patch)

// Text writes by stable model ID (mounted component not required)
doc.crud.replaceText(blockId, index, length, text?, attributes?)
doc.crud.applyTextDelta(blockId, deltaOperations)

// Move
doc.crud.moveBlocks(parentId, index, count, targetId, targetIndex)

// Transaction wrapper
doc.crud.transact(fn, origin?)

// Access raw Yjs
doc.crud.getYBlock(id): YBlock  // Y.Map
```

`updateBlockProps()` resolves a reachable block's props `Y.Map`, removes keys
whose patch value is `null`, runs the block-readonly guard, and writes only
changed keys through a Yjs transaction. `replaceText()` and `applyTextDelta()`
resolve a reachable editable `Y.Text` with the same model-first and readonly
guarantees. These APIs are the mutation boundary for plugins that operate on
unmounted blocks; plugins must not write Yjs values returned through internal
model plumbing directly.

`replaceBlockSnapshots()` replaces one reachable non-root block and returns the
inserted stable IDs without resolving components. `replaceWithSnapshots()`
delegates to the same model mutation, then materializes the replacement view
only to preserve its legacy synchronous `BlockComponent[]` return contract.

`deleteBlocks()`, `deleteBlockById()`, `replaceBlockSnapshots()` and
`moveBlocks()` resolve structure from
`BlockModelGraph`/YBlock, so host and `DocChain` workflows may operate on
reachable offscreen blocks without materializing their views. Their existing
readonly guards, return values and root non-empty behavior are unchanged.

`deleteBlocks()` is selection-neutral. When a non-forced deletion removes every
child of a `renderUnit` container, DocCRUD synchronously inserts one empty
paragraph to keep the container editable, but it does not sample or reposition
the browser selection. The Input/plugin action that owns the mutation must place
the final caret or range explicitly through `SelectionManager` (`setCursorAt()`,
`setCursorAtBlock()`, `replay()`, etc.). Do not call `recalculate()` merely to
confirm a programmatic write.

### Per-block placeholder metadata

`IBaseMetadata.plh?: string` stores an editable block's instance-level
placeholder override. An empty string explicitly disables the placeholder for
that block; absence lets `PlaceholderPlugin` fall back to its flavour override
and then Schema `metadata.placeholder`.

Set the field on a Snapshot before insertion, or call
`block.updateMeta({plh: value})` on a mounted block. `updateMeta({plh: null})`
deletes the key and restores fallback resolution. The method's public patch
type now describes its existing runtime rule that `null` deletes any metadata
key. Do not mutate `block.meta` or a raw Y.Map directly.

DocCRUD's existing `onMetaUpdate$` stream reports local, remote and Undo/Redo
changes by stable block ID. `PlaceholderPlugin` keeps one doc-level
subscription and filters it to the active block and `plh` key; metadata remains
excluded from `BlockModelGraph.contentChange$`.

## Revision CRDT and Complete Snapshot

Canonical content remains in the existing block/Y.Text tree until a validated
checkpoint. `bc:revisions` stores non-destructive range/block/boundary records;
`bc:revision-decisions` stores append-only decision nodes with `supersedes`;
`bc:revision-meta` stores the current epoch. Active decision heads converge by
set semantics: both accept and reject means `conflict`, and a redecision must
supersede every head visible at that moment. A late offline head can therefore
reopen conflict instead of being silently discarded.

Text targets use encoded `Y.RelativePosition` values in the live CRDT. Complete
JSON export converts them to current absolute start/end offsets and recreates
relative positions after loading the root snapshot:

Text-insert targets are boundary-tight: a later insertion exactly at either
edge remains adjacent instead of being absorbed into the older revision. The
original author can still grow or shrink their own pending insertion because
that mutation explicitly rewrites the target to its new range. Destructive
gestures crossing active ranges are split at dependency boundaries while their
records retain one shared review `groupId`.

```typescript
interface BlockCraftDocumentSnapshot {
  version: 1
  root: IBlockSnapshot
  revisions: RevisionSnapshotRecord[]
  decisions: RevisionDecision[]
  revisionEpoch: number
}

const complete = doc.exportDocumentSnapshot()
doc.initByDocumentSnapshot(complete, container)
```

`exportSnapshot()` / `initBySnapshot()` remain content-only compatibility APIs.
Undo scopes include `bc:revisions` with the block map so an edit and its
revision attribution undo atomically; `bc:revision-decisions` is deliberately
outside content history. `compactResolved({epoch, stateVector})` is the only
materialization path and requires no pending/conflicted revisions plus an exact
state-vector match.

Overlapping line edits are dependency-aware rather than rejected wholesale.
For a non-destructive deletion that crosses existing revision boundaries, the
manager creates adjacent `text-delete` records for each distinct active
dependency set, all under the same `groupId`. Rejecting an insertion ancestor
therefore discards only the segment inside that insertion; original text in an
adjacent segment remains independently reviewable. Rejected nested deletions
also do not override a still-pending insertion's markup kind.

Review integrations that maintain their own projection should use the
incremental group contract instead of rescanning `state$.revisions` after every
Yjs update:

```typescript
doc.revisions.change$.subscribe(change => {
  for (const groupId of change.groupIds) {
    updateReviewGroup(groupId, doc.revisions.listGroup(groupId))
  }
  if (change.conflictsChanged) refreshStructuralConflicts()
})
```

`RevisionDomainChange` reports `records`, `decisions` or `meta`, the affected
revision/group IDs and whether structural-conflict projection may have
changed. Indexes and resolved statuses are updated before the event is emitted.
`mode$` and `viewMode$` remain the dedicated mode streams; `state$` remains the
complete compatibility snapshot for low-frequency consumers. Rewriting only a
text revision's relative target still emits the affected group, allowing a
consumer such as `RevisionReviewPlugin` to compare semantic group state and
avoid republishing unchanged cards.

`doc.revisions.readRevisionContent(revisionId)` is the model-only content
query for review UIs. Text targets resolve their `Y.RelativePosition` anchors
and return only that range; whole-block targets serialize only their targeted
subtrees; split/merge boundaries return an empty string because the boundary
owns no paragraph text. The query never mounts a Block view.

Active deletion effects are idempotent for the same actor. Repeating a pending
or accepted text/whole-block deletion reuses the existing record, and an
extended selection persists only the uncovered text segments or block IDs.
Rejected records do not suppress a fresh proposal. Different actors still
store independent overlapping deletion records and decision histories.

Revision tracking is attribution, not a mutation capability gate. Operations
outside the v1 record model—props/formatting, format or inline-object Delta,
block movement, table-cell structure and cross-container structure—commit via
their normal Yjs transaction and Undo path with no Revision record. Composite
fallbacks bypass tracking for the whole transaction so they cannot leave a
partial Diff beside an otherwise untracked mutation.

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

Persistence/export snapshots retain `meta.plh` and `meta.lock`. The native
BlockCraft Snapshot clipboard payload also preserves `plh`; HTML/Markdown/plain
retention remains adapter-dependent. `lock` is the deliberate copy exception:
copy clones the source snapshot and recursively removes the lock owner before
producing any clipboard payload, so a native BlockCraft paste keeps its
placeholder but never recreates permission state.

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

After a stack item is popped, Selection's `SelectionHistoryRestorer` owns focus, endpoint view materialization, relative-position resolution, replay, viewport reveal and bounded DOM/model verification. Under root virtualization it materializes only bookmark endpoints before resolving, then waits for the matching Selection DOM projection to settle instead of repeatedly publishing and canceling it. This restores offscreen or fully evicted targets with model selection, native selection and focus aligned. `DocUndoManager` does not read `document`, schedule animation frames or recalculate a browser range.

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
