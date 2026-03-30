# BlockCraft: Performance Optimization

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.

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

### 4. Debounce & Throttle

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
- `packages/editor/VIRTUAL_RENDERING.md` — planned virtual rendering design
