# BlockCraft: Creating Toolbars & Overlay UI

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Last updated: 2026-08-17

## Overlay Service

All floating UI in BlockCraft uses Angular CDK Overlay via `doc.overlayService`. Two main patterns:

### 1. Connected Overlay (Anchored to Element or Block)

```typescript
const { componentRef, overlayRef } = this.doc.overlayService.createConnectedOverlay<MyComponent>({
  target: anchorElement,         // HTMLElement to position against
  component: MyComponent,       // Angular standalone component
  positions: [                   // Try these positions in order
    getPositionWithOffset("top-left", 0, 8),
    getPositionWithOffset("bottom-left", 0, 8),
  ],
  backdrop: false,               // Optional: add a click-outside backdrop
  clampTo: fullscreenHost,       // Optional authoritative clamp rectangle
}, closeSubject$, closeCallback);

// Pass data to component
componentRef.setInput('doc', this.doc);
componentRef.setInput('myData', someData);

// Listen to component outputs
componentRef.instance.myEvent
  .pipe(takeUntil(closeSubject$))
  .subscribe(value => { /* handle */ });
```

Connected overlays use exact dimensions by default
(`flexibleDimensions: false`). This keeps fixed-width toolbars centered on
their origin when scrolling triggers `OverlayRef.updatePosition()`. Set
`flexibleDimensions: true` explicitly only for overlays that need CDK to
shrink or grow the pane within the viewport, such as long pickers.

Connected overlays normally clamp their final pane to `doc.scrollContainer`.
Pass `clampTo` when the interaction owns a different visible coordinate space,
such as an in-place fullscreen block. An explicit `clampTo` element is the
authoritative boundary; it is not intersected with the hidden or locked
document scroller. CDK still chooses among `positions` and pushes within the
viewport before BlockCraft performs this final clamp.

Choose the target by ownership, not only by geometry:

- `target: blockComponent` creates a block-owned overlay. With root
  virtualization enabled, `DocOverlayService` automatically holds a targeted
  block view lease until `close$`, `OverlayRef.detach()` / `dispose()`, or
  document destruction. The stable block ID is re-resolved after structure
  changes, and disabled virtualization makes the lease a no-op.
- `target: anchorElement` creates an element-owned overlay. It acquires no block
  lease and closes when that exact element disconnects. Use this for inline
  links, temporary range markers, toolbar buttons and other ephemeral anchors.

Lease acquisition and release happen only at overlay open/close boundaries;
scroll and pointer events perform no lease work. Always emit `closeSubject$.next()`
from the owning plugin's common teardown even if it also disposes the returned
OverlayRef directly.

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
        target: block, // Block-owned: keeps its virtualized root unit mounted
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
| `BlockResizerComponent` | `components/` | Block resize handles |
| `TableSizePickerComponent` | `components/` | Table row/column picker |
| `ColumnCountPickerComponent` | `components/` | Column count selector |
| `MediaCreatorComponent` | `components/` | Media upload/URL input |
| `ShapePickerComponent` | `components/` | Categorized Shape catalog; `supportsTextOnly` removes non-text geometries and `embedded` removes popup chrome inside a settings card |
| `TextBoxPresetPickerComponent` | `components/` | Visual 线框 / 矩形 / 气泡 text-box catalog with 默认白框 first in 线框; `embedded` removes standalone popup chrome |

Column-oriented `BcFloatToolbarComponent` menus use border-box items constrained
to the menu width. Long labels are clipped inside the item and the menu must not
gain a horizontal scrollbar; bounded long lists scroll vertically only.

The fixed toolbar treats paragraph line height as a block-level command. A
mixed multi-block selection may open that picker when at least one selected
block is editable; the command skips ineligible blocks. In responsive layouts,
the **更多格式** entry therefore remains available when line height is the only
applicable nested command, while its font and character-spacing entries stay
disabled unless the complete text selection is editable.

Font scale has its own model-only eligibility path. A complete editable block
uses paragraph prop `pfs`, while partial text and collapsed carets use inline
`t:fs`; cross-block selections partition those targets in one Yjs transaction.
This makes ordered markers, bullets and todo controls inherit full-block scale
without DOM measurement or resize listeners. Font family and character spacing
remain ordinary inline commands.

## Standard Control Source

Use the exact `@cses/ui@4.27.0` peer for generic toolbar chrome:

- `CsButtonComponent` for textual confirm/cancel and ordinary actions;
- `CsTooltipDirective` for hover help;
- `CsRadioGroupComponent`, `CsSegmentedComponent`, `CsSwitchComponent`,
  `CsSliderComponent`, `CsInputNumberComponent`, `CsSelectComponent` and
  `CsColorPickerComponent` for settings-card forms;
- `CsDropdownDirective` + `CsDropdownMenuComponent` + `CsMenuDirective` /
  `CsMenuItemComponent` for accessible menus;
- `CsEmojiPickerComponent` for Unicode Emoji search, categories, recent items
  and keyboard navigation. Use its `panel` mode inside a BlockCraft-owned
  overlay and consume `csEmojiSelect`;
- `CsEmptyComponent` and `CsMessageService` for standard feedback.

Use the CSES dropdown lifecycle for fixed-toolbar popup triggers, including
BlockCraft-owned complex panels such as color, table-size and visual preset
pickers. Keep those complex components as projected dropdown content and close
them explicitly after a confirmed pick (`[csClickHide]="false"`); do not force
their grids or forms into `CsMenuItemComponent`. Use `CsMenuDirective` and
`CsSubmenuComponent` for actual nested command menus. Fixed-toolbar first-level
dropdowns use `csTrigger="hover"`, and nested menus use
`csTriggerSubMenuAction="hover"`; click/touch and keyboard activation remain
available through CSES. This ownership model also keeps a dropdown open while a
menu item's `CsTooltipDirective` renders in its separate CDK overlay.
Style `.cs-dropdown-trigger-open` on the trigger itself for persistent hover
feedback. When a `BcFloatToolbarComponent` is projected inside a CSES submenu,
remove only its wrapper surface background/shadow under a submenu-specific
overlay class; the outer CSES panel owns the single visible card.
Set `csMatchTriggerWidth` on fixed-toolbar dropdowns: CSES treats the trigger as
the overlay minimum rather than a forced fixed width, so intrinsic picker/menu
content may still expand without clipping. Override CSES's generic
three-`interactive-xl` standard-menu minimum inside the fixed-toolbar overlay;
otherwise compact heading and typography menus are widened to about 288px even
when their trigger and longest item need less space. Scope lightweight thin
scrollbars to fixed-toolbar vertical dropdown/submenu content instead of
changing every BlockCraft toolbar globally.

The fixed toolbar uses the same split-control shell for ordered-list presets
and superscript/subscript: hovering either half highlights the whole control,
while the caret receives an additional hover/open state. Font family and
relative scale form one adjacent, iconless Word-style pair on the wide surface;
responsive layouts move both fields into **更多格式** so the pair is never left
visually half-present; that responsive scale submenu uses `bc_zihao`. Character
spacing uses `bc_zijianju` immediately before paragraph line height.

Formatting and insertion are non-shrinking sibling sections of the fixed
toolbar's single row. When their combined intrinsic width exceeds the host,
the toolbar progressively condenses based on measured overflow. Only the final
narrow tier enables host-level horizontal scrolling with a thin
transparent-track scrollbar; neither section creates a competing inner scroll
range or overlays the other. Use safe centering so content stays centered while
it fits and the inline start remains reachable once it overflows.

Editor-owned input surfaces use native `input` / `textarea` elements with
component-scoped BlockCraft styles. This includes formula source, link editing,
find/replace, comments, media/embed URLs, block names and attachment renaming.
Do not attach `CsInputDirective` to these controls: its generic geometry and
focus presentation can override the compact overlay layout. Validation remains
local through classes such as `.error` or a styled wrapper.

Keep BlockCraft-owned components when the behavior is editor-specific, such as
block drag handles, the inline color matrix, resize handles and table structure
geometry. `bc_icon` and the existing Material SVG/brand-icon path remain the
icon sources until the separate icon migration is authorized.

Do not force a settings card containing radio, switch, slider, select or color
controls into `CsDropdownMenuComponent`; its menu semantics are for commands,
not nested forms. A Word-style object toolbar should use one block-owned
connected Overlay for the rail and secondary card, then click-switch local
panel state without recreating the overlay or writing document data.
`TextBoxToolbarComponent` and `WordArtToolbarComponent` are the bundled
references for this two-level pattern; both keep a narrow left/right rail and
emit a panel-only geometry signal so the owning Overlay can reposition on the
next animation frame. Their generic form fields use the matching CSES controls
(`CsSelect`, `CsSegmented`, `CsInputNumber`, `CsColorPicker`, `CsSlider` and
`CsSwitch`) while editor-specific layout geometry stays BlockCraft-owned.
When a CSES control creates a sibling CDK pane, the
owning Plugin must recognize that pane only while the corresponding control
inside its own toolbar has an open state. Pointer/focus in unrelated CSES panes
must still close stale toolbars.

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
- [ ] Block-owned overlays pass the BlockComponent itself as `target`
- [ ] Ephemeral element-owned overlays intentionally pass an `HTMLElement`
- [ ] Fullscreen/fixed-coordinate overlays pass their visible owner as `clampTo`
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
| `ObjectGroupToolbarPlugin` | Multi-object alignment, distribution and grouping | `plugins/object-group-toolbar/` |
| `CalloutToolbarPlugin` | Block-type toolbar with color picker | `plugins/callout-toolbar/` |
| `InlineLinkExtension` | Inline element popover | `plugins/inline-link-extension/` |
