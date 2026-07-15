# BlockCraft: Creating Plugins

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> For configuring existing built-in plugins, see `blockcraft-plugins-ref.md`.
> For event system internals, see L2: `blockcraft-event.md`.
>
> Last updated: 2026-07-15

## Plugin Lifecycle

```
DocConfig.plugins[] → doc._initPlugins() → plugin.register(doc) → registerClassEvents() → plugin.init()
                                                                                              ↓
                                                          doc.destroy() ← plugin.destroy() ←──┘
```

1. Framework calls `register(doc)` — sets `this.doc`, wires `@EventListen`/`@BindHotKey` decorators
2. Framework calls `init()` — your setup code runs
3. On doc destruction, framework calls `destroy()` — your cleanup code runs

## Template: Minimal Plugin

```typescript
// plugins/my-feature/index.ts
import { DocPlugin } from "../../framework";

export class MyFeaturePlugin extends DocPlugin {
  override name = "my-feature";

  init() {
    // Setup: subscribe to observables, create DOM elements, etc.
  }

  destroy() {
    // Cleanup: unsubscribe, remove DOM elements, etc.
  }
}
```

## Template: Plugin with Event Listeners

```typescript
import { DocPlugin, EventListen, UIEventStateContext } from "../../framework";

export class MyPlugin extends DocPlugin {
  override name = "my-plugin";

  init() {}

  // Listen to clicks on a specific block type
  @EventListen('click', { flavour: 'image' })
  onImageClick(ctx: UIEventStateContext) {
    const block = ctx.state.source.block;  // the clicked block
    // handle click...
    return true; // consumed — stops event propagation
  }

  // Listen to all clicks (global scope)
  @EventListen('click')
  onAnyClick(ctx: UIEventStateContext) {
    // handle...
  }

  destroy() {}
}
```

## Template: Plugin with Hotkeys

```typescript
import { DocPlugin, BindHotKey, UIEventStateContext } from "../../framework";

export class MyPlugin extends DocPlugin {
  override name = "my-plugin";

  init() {}

  @BindHotKey({ key: 'k', shortKey: true })  // Ctrl/Cmd+K
  onHotkey(ctx: UIEventStateContext) {
    ctx.preventDefault();
    // handle hotkey...
    return true;
  }

  // With shift modifier
  @BindHotKey({ key: 'l', shortKey: true, shiftKey: true })  // Ctrl/Cmd+Shift+L
  onShiftHotkey(ctx: UIEventStateContext) {
    ctx.preventDefault();
    return true;
  }

  destroy() {}
}
```

## Template: Plugin with Selection Observation

```typescript
import { DocPlugin } from "../../framework";
import { Subscription } from "rxjs";

export class MyPlugin extends DocPlugin {
  override name = "my-plugin";
  private _sub?: Subscription;

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      if (!selection) {
        // No selection — hide UI
        return;
      }

      if (selection.isCollapsed) {
        // Cursor only (no range)
      }

      if (selection.isInSameBlock) {
        const block = selection.firstBlock;
        // Single-block selection
      }

      // Access selection text
      const text = this.doc.selection.getSelectedText();
    });
  }

  destroy() {
    this._sub?.unsubscribe();
  }
}
```

## Template: Plugin with CDK Overlay (Toolbar/Popup)

```typescript
import { DocPlugin, EventListen, UIEventStateContext, getPositionWithOffset } from "../../framework";
import { Subject, Subscription, takeUntil } from "rxjs";
import { OverlayRef } from "@angular/cdk/overlay";
import { MyPopupComponent } from "./widgets/my-popup.component";

export class MyPlugin extends DocPlugin {
  override name = "my-plugin";
  private _sub?: Subscription;
  private _overlayRef?: OverlayRef;
  private _close$ = new Subject<void>();

  init() {
    // Open overlay based on selection, click, or other trigger
  }

  openOverlay(anchorElement: HTMLElement) {
    this.closeOverlay();

    const { componentRef, overlayRef } = this.doc.overlayService.createConnectedOverlay<MyPopupComponent>({
      target: anchorElement,                     // HTMLElement to anchor to
      component: MyPopupComponent,               // Angular standalone component
      positions: [                               // ConnectedPosition[]
        getPositionWithOffset("top-left", 0, 8),
        getPositionWithOffset("bottom-left", 0, 8),
      ],
      backdrop: false,                           // optional: click-outside to close
    }, this._close$, this.closeOverlay);

    this._overlayRef = overlayRef;

    // Pass data to component
    componentRef.setInput('doc', this.doc);
    componentRef.setInput('someData', { /* ... */ });

    // Subscribe to component outputs
    componentRef.instance.someEvent
      .pipe(takeUntil(this._close$))
      .subscribe(value => { /* handle */ });
  }

  closeOverlay = () => {
    this._close$.next();
    this._overlayRef?.dispose();
    this._overlayRef = undefined;
  }

  destroy() {
    this.closeOverlay();
    this._sub?.unsubscribe();
  }
}
```

## Template: Plugin with Readonly Support

```typescript
init() {
  // React to readonly changes
  this.doc.readonlySwitch$.subscribe(readonly => {
    if (readonly) {
      this.closeOverlay();
    }
  });
}

@EventListen('click', { flavour: 'my-block' })
onClick(ctx: UIEventStateContext) {
  if (this.doc.isReadonly) return;  // skip in readonly mode
  // ...
}
```

### 插件贡献复制过滤器

插件可在 `init()` 注册复制过滤器、在 `destroy()` 注销（多个插件互不覆盖，按注册顺序叠加）：

```typescript
class MyPlugin extends DocPlugin {
  private _disposeFilter?: () => void
  init() {
    this._disposeFilter = this.doc.clipboard.registerCopyFilter({
      excludeFlavours: ['my-internal-block'],
      stripAttributes: ['s:background'],
    })
  }
  destroy() { this._disposeFilter?.() }
}
```

`ClipboardCopyFilter` 字段：`excludeFlavours` / `excludeBlock(snapshot, ctx)` / `stripAttributes`（key 数组或 `(key, value) => boolean`）/ `transform(root, ctx)`（逃生舱，返回新 snapshot）。

## Available Event Names

```
beforeInput, focusIn, focusOut, click, doubleClick, tripleClick,
mouseDown, mouseMove, mouseUp, mouseEnter, mouseLeave,
dragStart, dragEnter, dragMove, dragLeave, dragEnd, drop,
keyDown, keyUp, selectionChange,
compositionStart, compositionUpdate, compositionEnd,
cut, copy, paste, selectStart, selectEnd,
contextMenu, wheel, pinch, pan
```

## Event Scope Options

```typescript
@EventListen('click', { flavour: 'paragraph' })  // Only paragraph blocks
@EventListen('click', { blockId: 'abc123' })      // Only specific block ID
@EventListen('click')                              // Global — all blocks
```

## Plugin Registration

Add your plugin to the editor setup:

```typescript
// In editor.ts or wherever BlockCraftDoc is created
plugins: [
  new MyPlugin(),
  // ... other plugins
]
```

And export from `plugins/index.ts`:

```typescript
export { MyPlugin } from './my-feature';
```

### Runtime-enabled plugin example: Pagination

`PaginationPlugin` is registered once and can be enabled without rebuilding the document:

```typescript
const pagination = new PaginationPlugin({
  enabled: false,
  pageSize: 'A4',
  printShortcut: true,
})

const doc = new BlockCraftDoc({
  // ...other config
  plugins: [pagination],
})

pagination.enable()
pagination.updateConfig({
  margins: {top: 72, right: 72, bottom: 72, left: 72},
  footer: {center: '{page} / {total}'},
})
pagination.recompute()
await pagination.exportToPdf('document.pdf') // current stable layout; browser print dialog
pagination.disable()
```

The plugin owns all `ResizeObserver`, animation-frame, DOM-layer and print resources. `enable()`, `disable()` and `destroy()` are idempotent. Its `Cmd/Ctrl+P` binding uses `shortKey` and consumes the event only while pagination and `printShortcut` are both enabled. `exportToPdf()` serializes concurrent work, synchronously captures layout plus snapshot before the first await, and uses a readonly editor render surface rather than snapshot-viewer. Without a backend it opens browser print; a Tauri host can inject `PaginationPdfHostBackend` to print the current top-level export WebView.

## Checklist

- [ ] Plugin extends `DocPlugin`
- [ ] `name` is unique and descriptive
- [ ] `init()` sets up subscriptions/state
- [ ] `destroy()` cleans up ALL subscriptions, overlays, DOM elements
- [ ] Event handlers return `true` when event is consumed
- [ ] Readonly mode is respected (check `this.doc.isReadonly`)
- [ ] RxJS subscriptions use `takeUntil` or are manually unsubscribed
- [ ] Plugin is added to `plugins/index.ts` exports
- [ ] Plugin is registered in `DocConfig.plugins[]`

## Reference: Real Plugin Examples

| Pattern | Example Plugin | Path |
|---------|---------------|------|
| Simple overlay | `DividerExtensionPlugin` | `plugins/divider-toolbar/` |
| Selection-based toolbar | `FloatTextToolbarPlugin` | `plugins/float-text-toolbar/` |
| Input interception | `MentionPlugin` | `plugins/mention/` |
| Block transformation | `BlockTransformerPlugin` | `plugins/block-transformer/` |
| Keyboard shortcuts | `FindReplacePlugin` | `plugins/findReplace/` |
| Drag & hover | `BlockControllerPlugin` | `plugins/block-controller/` |
| Reversible layout controller | `PaginationPlugin` | `plugins/pagination/` |
