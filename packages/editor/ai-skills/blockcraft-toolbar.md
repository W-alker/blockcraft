# BlockCraft: Creating Toolbars & Overlay UI

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.

## Overlay Service

All floating UI in BlockCraft uses Angular CDK Overlay via `doc.overlayService`. Two main patterns:

### 1. Connected Overlay (Anchored to Element)

```typescript
const { componentRef, overlayRef } = this.doc.overlayService.createConnectedOverlay<MyComponent>({
  target: anchorElement,         // HTMLElement to position against
  component: MyComponent,       // Angular standalone component
  positions: [                   // Try these positions in order
    getPositionWithOffset("top-left", 0, 8),
    getPositionWithOffset("bottom-left", 0, 8),
  ],
  backdrop: false,               // Optional: add a click-outside backdrop
}, closeSubject$, closeCallback);

// Pass data to component
componentRef.setInput('doc', this.doc);
componentRef.setInput('myData', someData);

// Listen to component outputs
componentRef.instance.myEvent
  .pipe(takeUntil(closeSubject$))
  .subscribe(value => { /* handle */ });
```

### 2. Global Overlay (Centered/Custom Position)

```typescript
const { componentRef, overlayRef } = this.doc.overlayService.createGlobalOverlay<MyDialog>({
  component: MyDialog,
  backdrop: true,
  panelClass: 'my-dialog-panel',
});
```

## Position Helpers

```typescript
import { getPositionWithOffset } from "../../framework";

// Predefined positions with offset
getPositionWithOffset("top-left", xOffset, yOffset)
getPositionWithOffset("top-right", xOffset, yOffset)
getPositionWithOffset("bottom-left", xOffset, yOffset)
getPositionWithOffset("bottom-right", xOffset, yOffset)
getPositionWithOffset("top-center", xOffset, yOffset)
getPositionWithOffset("bottom-center", xOffset, yOffset)
```

## Template: Block-Specific Toolbar Plugin

```typescript
import { DocPlugin, getPositionWithOffset } from "../../framework";
import { Subject, Subscription, takeUntil } from "rxjs";
import { OverlayRef } from "@angular/cdk/overlay";
import { MyToolbarComponent } from "./widgets/my-toolbar.component";

export class MyBlockToolbarPlugin extends DocPlugin {
  override name = "my-block-toolbar";
  private _sub?: Subscription;
  private _overlayRef?: OverlayRef;
  private _close$ = new Subject<void>();
  private _activeBlock: BlockCraft.IBlockComponents['my-block'] | null = null;

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe(selection => {
      // Show toolbar when a specific block type is selected
      if (!selection || !selection.isInSameBlock || selection.firstBlock?.flavour !== 'my-block') {
        this._overlayRef && this.closeToolbar();
        return;
      }

      const block = selection.firstBlock as BlockCraft.IBlockComponents['my-block'];
      if (this._activeBlock === block) return;

      this.closeToolbar();
      this._activeBlock = block;

      const { componentRef, overlayRef } = this.doc.overlayService.createConnectedOverlay<MyToolbarComponent>({
        target: block.hostElement,
        component: MyToolbarComponent,
        positions: [
          getPositionWithOffset("top-left", 0, 8),
          getPositionWithOffset("bottom-left", 0, 8),
        ],
      }, this._close$, this.closeToolbar);

      this._overlayRef = overlayRef;
      componentRef.setInput('block', block);
      componentRef.setInput('doc', this.doc);
    });
  }

  closeToolbar = () => {
    this._close$.next();
    this._activeBlock = null;
    this._overlayRef = undefined;
  }

  destroy() {
    this.closeToolbar();
    this._sub?.unsubscribe();
  }
}
```

## Template: Toolbar Angular Component

```typescript
import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";

@Component({
  selector: 'my-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bc-toolbar">
      <button (click)="onAction('bold')" [class.active]="isActive('bold')">
        <i class="bc_icon bc_bold"></i>
      </button>
      <button (click)="onAction('italic')" [class.active]="isActive('italic')">
        <i class="bc_icon bc_italic"></i>
      </button>
      <div class="separator"></div>
      <button (click)="onAction('delete')">
        <i class="bc_icon bc_delete"></i>
      </button>
    </div>
  `,
})
export class MyToolbarComponent {
  block = input.required<any>();
  doc = input.required<BlockCraft.Doc>();
  actionTriggered = output<string>();

  isActive(action: string): boolean {
    // Check block state...
    return false;
  }

  onAction(action: string) {
    const doc = this.doc();
    const block = this.block();

    switch (action) {
      case 'delete':
        doc.chain().deleteById(block.model.id).run();
        break;
      // ...
    }
  }
}
```

## Existing Reusable Components

| Component | Import From | Description |
|-----------|-------------|-------------|
| `FloatToolbarComponent` | `components/` | Base floating toolbar shell |
| `ColorPickerComponent` | `components/` | Color selection grid |
| `EmojiPickerComponent` | `components/` | Emoji selection panel |
| `BlockResizerComponent` | `components/` | Block resize handles |
| `TableSizePickerComponent` | `components/` | Table row/column picker |
| `ColumnCountPickerComponent` | `components/` | Column count selector |
| `MediaCreatorComponent` | `components/` | Media upload/URL input |

## Overlay Lifecycle Management

Key pattern: use `Subject` + `takeUntil` for cleanup.

```typescript
private _close$ = new Subject<void>();

// All subscriptions auto-cleanup:
someObservable$.pipe(takeUntil(this._close$)).subscribe(...)

// Close:
this._close$.next();  // triggers all takeUntil subscriptions to complete
```

## Checklist

- [ ] Overlay component is `standalone: true` with `OnPush`
- [ ] `createConnectedOverlay` receives a `close$` Subject
- [ ] `closeToolbar` function resets all state
- [ ] `destroy()` calls `closeToolbar()` and unsubscribes
- [ ] Readonly mode checked before showing interactive UI
- [ ] Toolbar styles scoped to avoid leaking
- [ ] Positions array provides fallback positions

## Reference: Real Toolbar Plugins

| Plugin | Pattern | Path |
|--------|---------|------|
| `FloatTextToolbarPlugin` | Selection-based text formatting | `plugins/float-text-toolbar/` |
| `DividerExtensionPlugin` | Block-type toolbar | `plugins/divider-toolbar/` |
| `ImgToolbarPlugin` | Block-type toolbar with resize | `plugins/img-toolbar/` |
| `CalloutToolbarPlugin` | Block-type toolbar with color picker | `plugins/callout-toolbar/` |
| `InlineLinkExtension` | Inline element popover | `plugins/inline-link-extension/` |
