# BlockCraft: Event System Deep Dive

> **Level 2: Mechanism Deep Dive** — Only read this when modifying event dispatch or handling.
>
> Last updated: 2026-04-07

## Architecture Overview

```
DOM event (click, keyDown, beforeInput, etc.)
  → Event Control (KeyboardControl, MouseControl, etc.)
  → UIEventDispatcher.emit(eventName, state)
  → Three-tier scope routing:
      1. Block ID scope (exact match)
      2. Flavour scope (all blocks of that type)
      3. Global scope (catch-all)
  → Event bubbles up block tree (block → parent → ... → root)
  → Handler returns true → stops propagation
```

## Key Files

| File | Purpose |
|------|---------|
| `framework/block-std/event/dispatcher.ts` | `UIEventDispatcher` — main dispatcher |
| `framework/block-std/event/control/` | Event controls that translate DOM events |
| `framework/block-std/event/state/` | `UIEventStateContext`, `EventSourceState` |
| `framework/block-std/event/base/` | `UIEventState` base class |
| `framework/block-std/event/decorators/` | `@EventListen`, `@BindHotKey`, `registerClassEvents` |

## Event Names (34 Total)

```
beforeInput, focusIn, focusOut,
click, doubleClick, tripleClick,
mouseDown, mouseMove, mouseUp, mouseEnter, mouseLeave,
dragStart, dragEnter, dragMove, dragLeave, dragEnd, drop,
keyDown, keyUp,
selectionChange,
compositionStart, compositionUpdate, compositionEnd,
cut, copy, paste,
selectStart, selectEnd,
contextMenu, wheel, pinch, pan
```

## Three-Tier Scope Routing

When an event fires, handlers are checked in this order:

### Tier 1: Block ID Scope
```typescript
// Only fires for a specific block instance
this.doc.event.on('click', blockId, handler)

// Or via decorator with blockId option
@EventListen('click', { blockId: 'specific-id' })
```

### Tier 2: Flavour Scope
```typescript
// Fires for all blocks of a given flavour
this.doc.event.on('click', 'paragraph', handler)

// Or via decorator — most common pattern
@EventListen('click', { flavour: 'paragraph' })
```

### Tier 3: Global Scope
```typescript
// Fires for all blocks (catch-all)
this.doc.event.on('click', handler)

// Or via decorator with no scope
@EventListen('click')
```

## Event Bubbling

Events bubble up the block tree. For a deeply nested block:

```
table-cell (tier 1 → tier 2 → tier 3)
  → table-row (tier 1 → tier 2 → tier 3)
  → table (tier 1 → tier 2 → tier 3)
  → root (tier 1 → tier 2 → tier 3)
```

A handler returning `true` stops the bubble.

## UIEventStateContext

```typescript
interface UIEventStateContext {
  state: {
    source: EventSourceState;  // Which block, DOM event, etc.
    event: Event;              // Original DOM event
  };
  preventDefault(): void;
  stopPropagation(): void;
}

interface EventSourceState {
  block: BlockComponent;       // The source block
  element: HTMLElement;        // The DOM element
  event: Event;                // Raw DOM event
}
```

## Decorator API

### @EventListen

```typescript
@EventListen(eventName: EditorEventName, options?: {
  flavour?: string;    // Tier 2: flavour scope
  blockId?: string;    // Tier 1: block ID scope
  // No options = Tier 3: global scope
})
methodName(ctx: UIEventStateContext): boolean | void {
  // return true to consume (stop propagation)
}
```

### @BindHotKey

```typescript
@BindHotKey(trigger: {
  key: string;           // Key name (a-z, 0-9, etc.)
  shortKey?: boolean;    // Ctrl (Win) / Cmd (Mac)
  shiftKey?: boolean;
  altKey?: boolean;
}, options?: EventOptions)
methodName(ctx: UIEventStateContext): boolean | void {
  ctx.preventDefault();
  return true;
}
```

### Decorator Registration

Decorators store metadata via `Reflect.defineMetadata`. The `registerClassEvents()` function (called in `DocPlugin.register()`) reads this metadata and wires up the handlers:

```typescript
// Happens automatically in DocPlugin.register():
registerClassEvents.call(this, doc);
// Reads @EventListen metadata → doc.event.on(...)
// Reads @BindHotKey metadata → doc.event.bindHotkey(...)
```

## Programmatic Event Binding

For dynamic event binding (not via decorators):

```typescript
// In a plugin's init()
const dispose = this.doc.event.on('click', 'image', (ctx) => {
  // handle...
  return true;
});

// Cleanup in destroy()
dispose();

// Temporary hotkey binding
const dispose = this.doc.event.bindHotkey(
  { key: 'ArrowDown' },
  (ctx) => { /* handle */ return true; }
);
```

## When to Read Source Files

- **Adding new event types**: Read `UIEventDispatcher`, event controls
- **Changing event routing logic**: Read `UIEventDispatcher.emit()`
- **Understanding decorator internals**: Read `decorators/index.ts`
- **Modifying keyboard event handling**: Read `KeyboardControl`
- **Modifying mouse event handling**: Read `MouseControl`
- **Understanding state context**: Read `UIEventState`, `EventSourceState`
