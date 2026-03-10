# BlockCraft Render Runtime Refactor

## 1. Background

BlockCraft currently treats a block component as both:

- a render node
- a Yjs-backed data node
- an editor interaction node

This design works for the full editor, but it is too heavy for message rendering.
In a message system, each message needs block-based rendering and incremental updates,
but it does not need a full `BlockCraftDoc`, Yjs store, selection manager, clipboard,
drag and drop, overlays, or editor plugins.

The target of this refactor is:

- block components render from `snapshot`
- view updates are driven by `snapshot` diff or patch
- `Yjs` becomes one store adapter instead of a component dependency
- editor behavior is moved out of block components into editor-only runtime

## 2. Core Problem

The current coupling is concentrated in these layers:

- `framework/block-std/block/component/base-block.ts`
  - directly depends on `doc`, `yBlock`, `Y.Map`, CRUD transactions
- `framework/block-std/block/component/editable-block.ts`
  - directly depends on `Y.Text`
  - text update path is tied to editor runtime
- `blocks/root-block/root.block.ts`
  - contains selection and pointer behavior that only belongs to editor mode
- `framework/doc/index.ts`
  - mixes data store, renderer lifecycle, interaction runtime and plugin runtime
- `editor/markdown-stream-renderer.ts`
  - currently patches the document through `doc.yBlockMap` and editable block instances

As long as block components depend on `doc` and `Yjs`, message rendering cannot be lightweight.

## 3. Target Architecture

The new architecture has four layers.

### 3.1 Block View Layer

Each block component becomes a pure view component.

Input:

- `snapshot: IBlockSnapshot`
- `context: BlockRenderContext`

Allowed responsibilities:

- render from snapshot
- update DOM when snapshot changes
- expose narrow render hooks for text patching

Forbidden responsibilities:

- direct Yjs access
- direct CRUD writes
- selection mutation
- clipboard, drag and drop, overlay control
- plugin registration

### 3.2 Render Runtime

This runtime manages block tree rendering only.

Responsibilities:

- mount snapshot tree
- diff old and new snapshot tree
- reuse components when flavour and node type match
- patch props, text and children

This runtime must work in:

- editor mode
- message mode
- preview mode

### 3.3 Edit Runtime

This runtime is editor-only and composes on top of render runtime.

Responsibilities:

- selection
- keyboard handling
- clipboard
- drag and drop
- overlay
- toolbar
- editor plugins

This runtime must not be required for message rendering.

### 3.4 Store Adapter Layer

This layer owns data source integration.

Planned adapters:

- `YjsBlockStoreAdapter`
- `SnapshotBlockStoreAdapter`

Rule:

- render runtime talks to store adapters through narrow interfaces
- block components never talk to adapters directly

## 4. Design Principles

### 4.1 Snapshot Is The View Contract

Every block component must be able to render with `IBlockSnapshot` only.

That means:

- full mount from snapshot must work
- full update from next snapshot must work
- optimized patch is optional, correctness from snapshot is mandatory

### 4.2 Patch Is A Runtime Optimization

Patch is not the component contract.

Component contract:

- render snapshot
- optionally apply text patch faster than full rerender

Runtime contract:

- compare snapshots
- decide patch or replace
- keep component tree in sync

### 4.3 Yjs Is Only A Store

Yjs should become an implementation detail of editor data synchronization.

It must not appear in:

- block component public API
- render runtime public API
- message rendering API

### 4.4 Editor Behavior Must Be External

Selection, keyboard, toolbar and plugin behavior should move to editor-only controllers,
directives or runtime services.

Blocks remain reusable in readonly and message scenarios.

## 5. Target Interfaces

These are planning-level interfaces. Names may change during implementation,
but the boundary should stay stable.

### 5.1 `BlockRenderContext`

```ts
export interface BlockRenderContext {
  readonly readonly: boolean;
  renderInline(delta: DeltaInsert[], container: HTMLElement): void;
  patchInline(ops: DeltaOperation[], container: HTMLElement): void;
  resolveAsset?(src: string): string;
  dispatchAction?(action: BlockAction): void;
}
```

Purpose:

- give blocks only the render utilities they need
- remove direct dependence on `BlockCraftDoc`

### 5.2 `BlockTreeHost`

```ts
export interface BlockTreeHost {
  readonly rootId: string;
  readonly schemas: BlockCraft.SchemaManager;
  transact(fn: () => void, origin?: unknown): void;
  getSnapshot(id: string): IBlockSnapshot | null;
  getChildren(parentId: string): string[];
  patchProps(id: string, props: IBlockSnapshot['props']): void;
  patchText(id: string, ops: DeltaOperation[], next: DeltaInsert[]): void;
  insertSnapshots(parentId: string, index: number, snapshots: IBlockSnapshot[]): void;
  deleteChildren(parentId: string, index: number, count: number): void;
  replaceChild(parentId: string, index: number, snapshot: IBlockSnapshot): void;
}
```

Purpose:

- let diff renderers work against a tree abstraction
- allow the same renderer to target editor store and message store

### 5.3 `SnapshotRenderer`

```ts
export interface SnapshotRenderer {
  mount(root: IBlockSnapshot, container: HTMLElement): void;
  update(root: IBlockSnapshot): void;
  destroy(): void;
}
```

Purpose:

- own component creation and diff update
- decouple render tree from editor runtime

## 6. Migration Strategy

The migration is intentionally incremental.

### Phase 1: Freeze Component Contract

Goal:

- define and adopt snapshot-driven render boundary

Work:

- add `BlockRenderContext`
- stop introducing new `doc` or `Yjs` usage into block components
- document component contract

Exit criteria:

- all new work follows snapshot-first rule

### Phase 2: Build Snapshot Renderer

Goal:

- create a render runtime that can mount and update from snapshot tree

Work:

- extract component tree management logic from `DocVM`
- formalize mount / update / destroy operations
- reuse existing text delta patch logic where possible

Exit criteria:

- a root snapshot can render without `BlockCraftDoc`

### Phase 3: Adapt Markdown Stream To Host Interface

Goal:

- make markdown stream rendering independent from editor runtime

Work:

- refactor `editor/markdown-stream-renderer.ts`
- switch from `BlockCraftDoc` access to `BlockTreeHost`
- keep current diff behavior

Exit criteria:

- same markdown stream engine works for both editor and message mode

### Phase 4: Extract Editor Runtime

Goal:

- make editor features optional and external

Work:

- move selection behavior out of `root.block.ts`
- isolate keyboard / clipboard / dnd / toolbar dependencies
- convert editor-only behavior into runtime modules or controllers

Exit criteria:

- readonly render path can run without editor modules

### Phase 5: Introduce Store Adapters

Goal:

- support multiple backing stores

Work:

- create `YjsBlockStoreAdapter`
- create `SnapshotBlockStoreAdapter`
- bridge editor runtime with Yjs adapter

Exit criteria:

- message rendering runs from snapshot store only
- editor runs from Yjs store without changing block components

## 7. First Implementation Slice

The first code slice after this document should be narrow.

Recommended order:

1. add `BlockRenderContext` and `BlockTreeHost` foundation types
2. refactor `BaseBlockComponent` so it can initialize from `snapshot`
3. refactor `EditableBlockComponent` so text render can update without `Y.Text`
4. keep existing editor runtime as the compatibility path
5. verify existing editor behavior remains unchanged

This is the safest first slice because:

- it improves architecture immediately
- it does not require rewriting all block components at once
- it establishes the bottom-layer contract before runtime extraction

## 8. Non Goals For The First Slice

These items are explicitly out of scope for the first implementation slice:

- rewriting all block components
- removing Yjs from editor runtime completely
- redesigning plugins
- redesigning selection model
- changing user-facing editor behavior

## 9. Risks

### 9.1 Editable Text Path

`EditableBlockComponent` currently assumes `Y.Text` as the source of truth.
This is the largest structural dependency and should be migrated carefully.

### 9.2 Root Interaction Coupling

`RootBlockComponent` currently mixes view and selection behavior.
If moved too early, editor selection may regress.

### 9.3 Plugin Assumptions

Many plugins assume a full `BlockCraftDoc` runtime exists.
Those assumptions should be isolated after render runtime is stable.

## 10. Validation Checklist

Each migration phase must validate:

- existing editor still mounts and edits correctly
- markdown import still works
- markdown stream render still works
- no new block component depends directly on `Yjs`
- snapshot-driven rendering path remains functional

## 11. Message Rendering End State

Target message rendering composition:

- `SnapshotBlockStoreAdapter`
- `SnapshotRenderer`
- shared block schema
- shared inline render utilities

No message item should require:

- `BlockCraftDoc`
- `SelectionManager`
- `ClipboardManager`
- `DocDndService`
- editor plugins
- Yjs undo manager

## 12. Decision Log

### Decision 1

Do not start by rewriting block components wholesale.

Reason:

- too large
- hard to validate
- high regression risk

### Decision 2

Start by extracting runtime boundary around renderer and markdown stream.

Reason:

- directly helps the message rendering target
- creates reusable seam for later component migration
- keeps current editor behavior stable
