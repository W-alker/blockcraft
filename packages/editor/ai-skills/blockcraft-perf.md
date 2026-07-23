# BlockCraft: Performance Optimization

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Last updated: 2026-07-22

## Core Performance Principles

BlockCraft is designed for large documents. Key performance mechanisms:

### 1. OnPush Change Detection

ALL block components use `ChangeDetectionStrategy.OnPush`. Angular only re-renders when:
- `@Input()` references change
- An event handler runs within the component
- `changeDetectorRef.markForCheck()` is explicitly called

**Rule**: Never use `Default` change detection in block components.

### 2. NgZone Optimization

Performance-critical code runs outside Angular's zone:

```typescript
this.ngZone.runOutsideAngular(() => {
  // High-frequency operations (mousemove, scroll, etc.)
  // DOM reads, requestAnimationFrame, setTimeout
});
```

Re-enter the zone only when Angular needs to know about changes:

```typescript
this.ngZone.run(() => {
  // Trigger change detection
  this.someSignal.set(newValue);
});
```

### 3. Incremental Blot Patching

The inline system prefers `applyDelta(ops)` over full `render()`:
- `applyDelta` patches only the changed portions of the DOM
- Full `render` rebuilds the entire blot tree
- Consistency check after `applyDelta` falls back to `render` only if mismatch detected

### 4. Root-Child Virtualization

Large documents can opt into model-first root virtualization through
`DocConfig.virtualization`. Yjs and `BlockModelGraph` remain complete while
`DocVM` creates/mounts only viewport and leased root-child subtrees.

```typescript
virtualization: {
  enabled: true,
  overscan: 6,
  segmentMergeGap: 2,
  retainedViewLimit: 12,
  estimatedHeights: {paragraph: 32, table: 240},
  resolveViewRetention: ({flavour}) =>
    flavour === 'custom-player' ? 'keep-alive' : undefined,
}
```

Scroll and pin changes are coalesced into one animation frame. Height lookup
uses incremental Fenwick-tree prefix sums: measurement updates, range sums and
offset lookup stay `O(log N)`, while structural rebuilds remain a cold `O(N)`
path. A normal scroll frame touches the mounted window, not every document
block. `ResizeObserver` corrects estimates and
records each mounted block's layout stride, including inter-block spacing, then
restores an ID-based scroll anchor. Nested subtrees are atomic in this phase.
Each frame adds only constant-time checks for local height/index lengths and the
model structure revision. A mismatch performs one cold `O(N)` rebuild. A
transient reconciliation failure receives bounded frame retries; after three
consecutive failures the document permanently falls back to complete root
mounting and warns once. The fallback does not run parallel window logic and
therefore trades memory for continued editability without adding steady-state
work to healthy documents. It repairs the sparse root from canonical model
order and clears virtual spacers before mounting the complete root, even if a
later mount throws. Height observation and scroll/resize scheduling stay off in
fallback mode, so stale estimated gaps cannot leave a large blank document.
Detached root subtrees use a bounded LRU (`retainedViewLimit`, default `12`) so
scrolling and model-first bulk insertion cannot make `DocVM.store` grow with
every root ever visited. Eviction runs on the coalesced reconciliation frame,
destroys the complete detached subtree, and rebuilds it from current Yjs state
if it is mounted again. Set the limit to `0` to trade remount work for minimum
retained-view memory.

Stateful iframe/media flavours can declare
`metadata.viewRetention: 'keep-alive'`, and hosts can override that decision
with `virtualization.resolveViewRetention(context)`. The policy is evaluated
when a component first mounts, outside the scroll hot path. Activation is
deferred until the current Angular mount transaction finishes, and all active
long-lived leases are collapsed into one `PinRegistry` source. Nested stateful
blocks pin only their containing direct-root render unit.

Keep-alive preserves iframe browsing context and media playback but is an
intentional memory tradeoff: each materialized unit remains mounted until its
stateful block is deleted or the document is disposed. It does not scan or
pre-mount the document. Avoid opting ordinary blocks in, and use a host override
returning `'virtual'` when a deployment prefers bounded DOM over state
continuity.

Direct-root structure transactions use a separate cold path. The manager keeps
the first visible block ID and its viewport-relative offset, rebuilds root
indices once, and re-evaluates active point-aware Selection pins from stable
endpoint IDs plus root boundary indices. Active local selections pin only their
two endpoint root units; the selected middle stays virtualized. Presentation
coverage checks only the mounted window using O(1) model sibling indices, while
copy/text/format commands materialize model IDs only when explicitly invoked.
Projection pins remain endpoint-ID based. All transactions are coalesced before
the next frame around the original anchor.
It computes the target window from estimated heights, mounts that window, then
uses the anchor host's actual DOM position for one final correction. This work
does not run on ordinary scroll events or nested-only structure changes.

Do not query `doc.vm` to decide whether document data exists. Use `doc.model`
for model work and let Selection/virtualization mount view capabilities only
when needed.

For imports and bulk insertion, prefer
`doc.crud.insertBlockSnapshots(parentId, index, snapshots)`. It returns block
IDs without resolving inserted Angular components for the caller. Sparse-root
and uncreated-parent insertion stays model-only; an already-created parent view
still synchronizes through the normal Yjs observer. `insertBlocks()`
intentionally keeps its older synchronous component return contract and can
therefore create a transient component peak before the retained-view LRU
reconciles.

For structural cleanup and reordering, `deleteBlocks()`, `deleteBlockById()`
and `moveBlocks()` accept stable IDs/indices and resolve directly through the
complete Yjs model. They do not materialize offscreen source or target views;
if a parent is already mounted, its existing observer applies the children
delta. Prefer these APIs over calling `getBlockById()` solely to discover a
parent or sibling before a structural write.

`RootVirtualizationManager.ensureViewMounted(blockIds)` is the synchronous
interaction boundary for code that has already resolved model IDs but needs a
component immediately (for example, keyboard navigation to an adjacent root
unit). It materializes the containing root units and refreshes spacer/height
tracking without creating a persistent pin. The resulting Selection or
viewport must take ownership before the next reconciliation frame.
Callers must not keep the returned component as long-lived state: an offscreen
transient component can be evicted once the frame reconciles.
`SelectionManager` uses this boundary before publishing only when one of its
bounded endpoint or boundary-adjacent views is missing. Normal typing and arrow
updates whose endpoints are already mounted perform only constant-count VM
availability lookups; they do not run height, spacer, geometry, or full-range
work. The endpoint selection lease is reconciled separately in the existing
coalesced virtualization frame; it does not expand with selection length.

`RootVirtualizationManager.scrollToBlock(blockId)` is a cold stable-ID
navigation path. It resolves the containing direct-root unit, performs one
`O(log N)` height-index jump, mounts that unit, and corrects against the real
requested host. Completion requires two consecutive sub-1px frames and is
hard-bounded at eight frames so late `ResizeObserver` measurements cannot leave
the target displaced. While navigation owns placement, pending structural and
height anchors do not compete with target centering. Each correction reads only
the target and scroll-container rects; ordinary scroll/input/selection frames
gain no work. Undo calls this path only when the restored head was not already
visible before DOM Selection replay.

`RootVirtualizationManager.acquireBlockViewLease(blockIds)` is the targeted
longer-lived counterpart. It synchronously mounts and pins only the direct-root
units containing those stable IDs, re-resolves them after root structure
changes, and returns an idempotent release function. Acquisition and a structure
change cost `O(K)` for `K` leased IDs/root units; pointer movement and ordinary
scrolling add no lease traversal. Interaction owners must release from one
symmetric teardown path. Internal dragging holds one lease for all source blocks
after crossing its movement threshold, then releases it on drop or cancellation.

`RootVirtualizationManager.viewChange$` emits a model-ordered list of mounted
root IDs only when that list changes. Consumers should use it for view-bound
projection lifecycle rather than adding another scroll handler. Work performed
from this stream must stay proportional to the mounted window or its nested
atomic subtrees, never to total document size. Selection class replay checks the
mounted window; native Selection repair for a non-collapsed cross-root range
touches only its two pinned endpoints. That repair is paid once per changed
mounted-ID window, not per raw scroll event or selected block. During the
bounded endpoint mount/frame retry, `selectionchange` performs an O(1)
selection-identity check and returns; there is no document traversal, layout
read, recurring timer, or extension of the mounted window.

Non-collapsed virtual-root boundary projection also performs no geometry read:
it maps directly into the adjacent pinned block's inline/gap/host edge. Because
the Range no longer stores root child offsets, ordinary middle-window mount and
unmount operations cannot rebase its endpoints; the deduplicated view-change
repair remains only a bounded endpoint-rerender safety net.

`RootVirtualizationManager.acquireFullDocumentViewLease()` is the explicit
escape hatch for capabilities that require exact DOM geometry for every root
unit. It synchronously mounts all root views, includes root blocks inserted
while held, and returns an idempotent release function. Live pagination uses
this lease because estimated offscreen heights cannot produce exact page and
table-row breaks. This intentionally suspends virtualization benefits until
pagination is disabled; model-only search/export/collaboration code must not
use the lease.

Find/replace follows this split explicitly: indexing scans `doc.model` and
creates no components; text changes rescan only the changed block IDs; virtual
window changes bind `IntersectionObserver` only to matched blocks in mounted
subtrees; navigating to a result materializes only that result's root unit.

### 5. Debounce & Throttle

High-frequency operations should be debounced/throttled:

```typescript
import { debounceTime, throttleTime } from 'rxjs';

// Debounce: wait for quiet period (good for save, search)
this.doc.onTextUpdate$.pipe(debounceTime(300)).subscribe(...)

// Throttle: limit frequency (good for scroll, resize)
scrollEvent$.pipe(throttleTime(16)).subscribe(...)  // ~60fps
```

### 5. IntersectionObserver

For blocks that need visibility awareness (lazy loading, etc.):

```typescript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      // Block is visible — load heavy content
    }
  });
}, { root: doc.scrollContainer });

observer.observe(this.hostElement);
```

## Performance Checklist for New Blocks

- [ ] `ChangeDetectionStrategy.OnPush` used
- [ ] Heavy computation moved outside Angular zone
- [ ] Event listeners cleaned up in `ngOnDestroy`
- [ ] Large DOM structures lazy-loaded
- [ ] No unnecessary re-renders (check `markForCheck` calls)
- [ ] RxJS subscriptions properly managed

## Performance Checklist for New Plugins

- [ ] High-frequency subscriptions throttled/debounced
- [ ] Overlays destroyed when not needed
- [ ] Event handlers return quickly (defer heavy work)
- [ ] No global `mousemove` or `scroll` listeners without throttle
- [ ] Selection observation avoids unnecessary work when selection hasn't meaningfully changed

## Source Files to Read

For current performance patterns, read:
- `framework/block-std/block/component/base-block.ts` — OnPush, lifecycle hooks
- `framework/block-std/inline/runtime/` — incremental patching logic
- Any existing plugin for debounce/throttle patterns
- `framework/modules/virtualization/` — current root virtualization kernel,
  spacer layer, height observer and coordinator
