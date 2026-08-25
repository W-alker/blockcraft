# BlockCraft: Creating Blocks

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> For inline system internals, see L2: `blockcraft-inline.md`
> For Yjs data model, see L2: `blockcraft-data.md`
>
> Last updated: 2026-08-25

## Block Types

| nodeType   | Base Class               | Has Inline Text? | Has Children? | Template Pattern                                |
| ---------- | ------------------------ | ---------------- | ------------- | ----------------------------------------------- |
| `void`     | `BaseBlockComponent`     | No               | No            | Custom template with `contenteditable="false"`  |
| `editable` | `EditableBlockComponent` | Yes (Y.Text)     | No            | Empty template, host has `edit-container` class |
| `block`    | `BaseBlockComponent`     | No               | Yes           | Template with `children-render-container` div   |

## Choosing Between Editable Text and Native Inputs

- Use `EditableBlockComponent` when the text is part of the document body and must participate in Yjs sync, undo/redo, IME, inline formatting, and cursor navigation.
- Use a native `input` / `textarea` only for **block-local property editing** inside `void` or `block` nodes.
- Native form controls now bypass the editor's input/hotkey/selection pipeline automatically.
- For non-form custom widgets that should behave the same way, add `data-bc-native-input` to the widget root.
- When a native field changes, commit through `updateProps()`, `setInitProps()`, or `DocChain` rather than trying to wire it into `InputTransformer`.

## File Structure

Each block needs 2 files in its own directory under `blocks/`:

```
blocks/
└── my-block/
    ├── index.ts          # Model interface + Schema + global type declarations
    └── my.block.ts       # Angular component
```

---

## Template: Void Block

**`blocks/my-block/index.ts`**

```typescript
import { generateId, NoEditableBlockNative } from "../../framework";
import { BlockNodeType, IBlockSchemaOptions } from "../../framework";
import { MyBlockComponent } from "./my.block";

// 1. Define the model interface
export interface MyBlockModel extends NoEditableBlockNative {
  flavour: "my-block";
  nodeType: BlockNodeType.void;
  props: {
    src?: string;
    caption?: string;
  };
}

// 2. Define the schema
export const MyBlockSchema: IBlockSchemaOptions<MyBlockModel> = {
  flavour: "my-block",
  nodeType: BlockNodeType.void,
  component: MyBlockComponent,
  createSnapshot: (src?: string) => ({
    id: generateId(),
    flavour: "my-block",
    nodeType: BlockNodeType.void,
    props: { src },
    meta: {},
    children: [],
  }),
  metadata: {
    version: 1,
    label: "My Block",
    description: "Short plain-language introduction shown in insertion menus",
    icon: "bc_icon bc_my-block",
    // virtualization: {
    //   viewRetention: 'keep-alive', // preserve DOM-owned state after first mount
    // },
    // svgIcon: "bc_my-block-color",  // optional colored icon
  },
};

// 3. Declare global types
declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      "my-block": MyBlockComponent;
    }
    interface IBlockCreateParameters {
      "my-block": [string?]; // matches createSnapshot params
    }
  }
}
```

**`blocks/my-block/my.block.ts`**

```typescript
import { ChangeDetectionStrategy, Component } from "@angular/core";
import { BaseBlockComponent } from "../../framework";
import { MyBlockModel } from "./index";

@Component({
  selector: "div.my-block",
  template: `
    <div class="my-block-content" contenteditable="false">
      @if (props.src) {
        <img [src]="props.src" [alt]="props.caption || ''" />
      } @else {
        <div class="placeholder">Click to add content</div>
      }
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyBlockComponent extends BaseBlockComponent<MyBlockModel> {
  onClickPlaceholder() {
    if (this.isReadonly) return;
    // Handle interaction...
    this.updateProps({ src: "new-value" });
  }
}
```

### Void / Block Node With Native Input

```typescript
@Component({
  selector: "div.embed-config-block",
  template: `
    <div class="embed-config" contenteditable="false">
      <input
        type="text"
        [value]="props.url || ''"
        placeholder="Paste URL"
        (input)="onUrlInput($event)"
      />
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmbedConfigBlockComponent extends BaseBlockComponent<any> {
  onUrlInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.updateProps({ url: value });
  }
}
```

Use `data-bc-native-input` when the editable surface is not literally an `input` / `textarea` / `select`:

```html
<div class="custom-editor-shell" contenteditable="false" data-bc-native-input>
  <!-- third-party widget mounts here -->
</div>
```

---

## Template: Editable Block

**`blocks/my-editable/index.ts`**

```typescript
import { EditableBlockNative, BlockNodeType } from "../../framework";
import {
  IBlockSchemaOptions,
  editableBlockCreateSnapShotFn,
  EditableBlockCreateSnapshotParams,
} from "../../framework/block-std/schema/block-schema";
import { MyEditableBlockComponent } from "./my-editable.block";

export interface MyEditableBlockModel extends EditableBlockNative {
  flavour: "my-editable";
  nodeType: BlockNodeType.editable;
  // Add custom props if needed:
  // props: EditableBlockNative['props'] & { level?: number };
}

export const MyEditableBlockSchema: IBlockSchemaOptions<MyEditableBlockModel> =
  {
    flavour: "my-editable",
    nodeType: BlockNodeType.editable,
    component: MyEditableBlockComponent,
    createSnapshot:
      editableBlockCreateSnapShotFn<MyEditableBlockModel>("my-editable"),
    metadata: {
      version: 1,
      label: "My Editable Block",
      description: "Short plain-language introduction shown in insertion menus",
      icon: "bc_icon bc_my-editable",
    },
  };

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      "my-editable": MyEditableBlockComponent;
    }
    interface IBlockCreateParameters {
      "my-editable": EditableBlockCreateSnapshotParams;
    }
  }
}
```

**`blocks/my-editable/my-editable.block.ts`**

```typescript
import { ChangeDetectionStrategy, Component } from "@angular/core";
import { EditableBlockComponent } from "../../framework";
import { MyEditableBlockModel } from "./index";

@Component({
  selector: "div.my-editable-block",
  template: ``, // Empty! InlineRuntime renders into host element
  standalone: true,
  host: {
    "[class.edit-container]": "true", // REQUIRED for InlineRuntime
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyEditableBlockComponent extends EditableBlockComponent<MyEditableBlockModel> {
  // Access inline content:
  //   this.yText          — Y.Text
  //   this.textDeltas()   — DeltaInsert[]
  //   this.insertText(index, text, attributes?)
  //   this.deleteText(index, length)
  //   this.formatText(index, length, attributes)
  //   this.setInlineRange(index, length?)
  //   this.plainTextOnly  — runtime view flag for disabling rich formatting
}
```

When an editable flavour is intrinsically plain text, also declare
`metadata.plainTextOnly: true` in its schema. The component flag controls its
mounted view; schema metadata lets model-first selection/toolbar commands make
the same decision while the component is virtualized. Built-in `code` and
`mermaid-textarea` declare both.

---

## Template: Container Block

**`blocks/my-container/index.ts`**

```typescript
import { generateId, NoEditableBlockNative } from "../../framework";
import { BlockNodeType, IBlockSchemaOptions } from "../../framework";
import { ParagraphBlockSchema } from "../paragraph-block";
import { MyContainerComponent } from "./my-container.block";

export interface MyContainerModel extends NoEditableBlockNative {
  flavour: "my-container";
  nodeType: BlockNodeType.block;
  props: {
    backgroundColor?: string;
    icon?: string;
  };
}

export const MyContainerSchema: IBlockSchemaOptions<MyContainerModel> = {
  flavour: "my-container",
  nodeType: BlockNodeType.block,
  component: MyContainerComponent,
  createSnapshot: () => ({
    id: generateId(),
    flavour: "my-container",
    nodeType: BlockNodeType.block,
    props: {
      backgroundColor: "#f5f5f5",
      icon: "📌",
    },
    meta: {},
    children: [ParagraphBlockSchema.createSnapshot()], // Pre-seed with a paragraph
  }),
  metadata: {
    version: 1,
    label: "My Container",
    description: "Short plain-language introduction shown in insertion menus",
    icon: "bc_icon bc_my-container",
    renderUnit: true, // Standalone render unit
    includeChildren: ["paragraph", "divider", "bullet", "ordered", "todo"],
    // excludeChildren: ['table'],  // Takes priority over includeChildren
  },
};

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      "my-container": MyContainerComponent;
    }
    interface IBlockCreateParameters {
      "my-container": [];
    }
  }
}
```

**`blocks/my-container/my-container.block.ts`**

```typescript
import { ChangeDetectionStrategy, Component } from "@angular/core";
import { BaseBlockComponent } from "../../framework";
import { MyContainerModel } from "./index";

@Component({
  selector: "div.my-container-block",
  template: `
    <span class="container-icon" contenteditable="false">{{ props.icon }}</span>
    <div class="container-content children-render-container">
      <!-- Framework renders children here automatically -->
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[style.background-color]": "props.backgroundColor",
  },
})
export class MyContainerComponent extends BaseBlockComponent<MyContainerModel> {
  // Optional callback hook: called whenever the Y.Array<string> children list mutates.
  // Receives the YEvent delta describing what was added/removed.
  override onChildrenChange = (
    delta: Y.YEvent<Y.Array<string>>["changes"]["delta"],
  ) => {
    // Called when children array changes
  };
}
```

---

## Registration Steps

### 1. Export from `blocks/index.ts`

```typescript
export { MyBlockSchema, MyBlockComponent } from "./my-block";
```

### 2. Add schema to SchemaManager

```typescript
// Where schemas are constructed (usually in editor.ts)
const schemas = new SchemaManager([
  ParagraphBlockSchema,
  MyBlockSchema, // Add here
  // ...
]);
```

### 3. Add styles (optional)

Create `themes/blocks/_my-block.scss` and import in the theme entry.

---

## Insertion Menu Introduction (Schema field)

Use `metadata.description` for a short, plain-language introduction to the
block. Insertion surfaces such as `BlockTransformerPlugin` read this field
without modifying it:

```typescript
metadata: {
  version: 1,
  label: '高亮块',
  description: '突出展示重要信息',
}
```

Do not place keyboard shortcuts, Markdown syntax, slash aliases, or line breaks
in `description`. Those are interaction hints owned by the plugin configuration
and are rendered separately from the introduction. All bundled Block Schemas,
including internal leaf/container Schemas, provide a description so other
host-owned insertion surfaces can reuse the same catalogue without inventing
copy. A host can override only the slash-menu introduction through the matching
`IBlockTransformConfig.description`; the Schema metadata remains unchanged.

---

## BaseBlockComponent Key API

```typescript
// ── Identity ──
this.id                 // string
this.flavour            // 'paragraph' | 'image' | ...
this.nodeType           // BlockNodeType.editable | void | block | root
this.doc                // BlockCraftDoc

// ── Data (proxied through Yjs; treat as readonly from extensions) ──
this.props              // Typed current props
this.meta               // Current metadata
this.yBlock             // Raw Y.Map<...>
this._native            // Underlying NativeBlockModel (protected)

// ── Mutations ──
this.updateProps({ key: value })       // Creates undo history; respects readonly
this.setInitProps({ key: value })      // No undo history; still respects readonly
this.updateMeta({ key: value })        // Yjs meta mutation; null deletes a key

// ── Effective readonly ──
this.isReadonly                         // self, ancestor, or document lock
this.isExplicitReadonly                 // only this block's meta.lock
this.readonlySource                     // document | self | ancestor | null

// ── Tree navigation ──
this.parentId                          // string | null
this.parentBlock                       // BaseBlockComponent | null
this.childrenIds                       // string[] (throws on editable blocks)
this.childrenLength                    // number
this.getChildrenBlocks()               // BaseBlockComponent[]
this.getChildrenByIndex(index)         // BaseBlockComponent
this.getChildrenIdByIndex(index)       // string
this.firstChildren                     // BaseBlockComponent | null
this.lastChildren                      // BaseBlockComponent | null
this.getPath()                         // string[] — block id path from root
this.getIndexOfParent()                // number — index within parent's childrenIds

// ── Serialization ──
this.toSnapshot(deep?)                 // IBlockSnapshot
this.textContent()                     // Plain text (recursive)

// ── Event binding (scoped to this block) ──
this.bindEvent('click', handler, { flavour?, global? })

// ── Lifecycle ──
this.onViewInit$                       // Subject<boolean> — fires after ngAfterViewInit
this.onDetach$                         // Subject<void> — fires when a mounted view becomes retained
this.onReattach$                       // Subject<void> — fires after a retained view is remounted
this.onDestroy$                        // Subject<boolean> — fires only in permanent ngOnDestroy
this.viewState                         // 'mounted' | 'retained' | 'destroyed'
this.isAttached                        // true only while viewState === 'mounted'
this.onPropsChange                     // EventEmitter<Map> — props mutation events
this.onChildrenChange?                 // Optional callback assigned by subclasses

// ── DOM & Angular handles ──
this.hostElement                       // HTMLElement (root of the component)
this.changeDetectorRef                 // ChangeDetectorRef (use markForCheck())
this.destroyRef                        // DestroyRef (for takeUntilDestroyed)

// ── Detach / reattach (used by virtual rendering) ──
this.detach()                          // Idempotently enter retained state; does not destroy the component
this.reattach()                        // Idempotently re-init from current Yjs state and remount
```

### Common Block Appearance Props

`IBlockProps` declares two optional surface props, but the common live/viewer
projection applies them only to editable blocks:

```typescript
block.updateProps({
  backColor: '#FBF3DB',
  borderColor: '#DFAB01',
})

// `null` deletes the persisted override.
block.updateProps({backColor: null, borderColor: null})
```

`BaseBlockComponent` binds the opaque values to
`--bc-block-background-color` / `--bc-block-border-color` and toggles the
public `data-bc-block-background` / `data-bc-block-border` host attributes.
The base theme owns the actual fill and 1px outline, and gives every editable
block host a 4px radius. Do not duplicate inline
`background-color` or outline projection in a custom block component. The fill
uses `--bc-solid-block-background-opacity`; `transparent`, empty and missing
values render as no override. Block-specific focused/selected highlights keep
their existing priority over the persisted outline. The built-in Blockquote
consumes `borderColor` as the color of its
1px left accent bar instead of drawing the common rectangular outline.
Non-editable blocks ignore both props in the common projection; a block such as
Callout may still own and document a legacy block-specific appearance contract.
The bundled `render-unit` is another deliberate block-specific surface: it
persists optional `backColor` / `borderColor`, projects them through
`--bc-render-unit-background-color` / `--bc-render-unit-border-color`, and
draws a geometry-neutral 1px inner outline. `CalloutToolbarPlugin` exposes
background and border palettes for this region without cascading values into
its child blocks.

### Opt-in Block Surface Props

Do not infer padding or background-image semantics from `IBlockProps` or
`nodeType`. Container-like Blocks explicitly opt into the exported
`BlockSurfaceProps` interface. The bundled `render-unit` is the first consumer:

```typescript
interface BlockSurfaceProps extends IBlockProps {
  // CSS arity in layout px: all | vertical/horizontal | top/horizontal/bottom
  // | top/right/bottom/left
  p?: number | [number] | [number, number] |
    [number, number, number] | [number, number, number, number] | null
  bgi?: string | null // background image source
  bgs?: 'cover' | 'contain' | 'stretch' | null // background size/fit
  bgx?: number | null // background-position-x, percent 0..100
  bgy?: number | null // background-position-y, percent 0..100
  bgo?: number | null // background layer opacity, 0..1
}
```

Keep background options as flat top-level props. Padding deliberately uses one
`p` Y.Map entry with the same 1–4 value expansion as CSS: `12`, `[12, 24]`,
`[8, 16, 12]`, or `[8, 12, 16, 20]`. The normalizer compresses redundant
values back to the shortest arity. A padding edit therefore replaces the whole
shorthand value, while background options still merge independently. Use
`normalizeBlockSurfaceProps()` at creation/import boundaries and
`resolveBlockSurface()` in model/render paths. Values remain numeric rather
than arbitrary CSS strings; padding is bounded to `0..1000` layout pixels.
Once `bgi` is valid, omitted image options resolve to `cover`, `50% 50%` and
opacity `1`; active script schemes are rejected. `null` remains the normal
`updateProps()`/`updateBlockProps()` delete operation.

The surface image is presentation-only, sits behind children and must be an
actual non-interactive `<img>` rather than raw `background: url(...)`. That
keeps URL handling typed and lets the pagination print-resource barrier wait
for image decoding. `stretch` maps to CSS `object-fit: fill`.

`BlockSurfaceProps` is reusable but opt-in: ordinary editable blocks, tables,
Shape geometry and root page margins do not consume it automatically. The
bundled `render-unit` supplies an arbitrary-child content region; the separate
`text-box` Block combines the same surface contract with fixed geometry,
placement and object transforms.

`detach()` and `reattach()` describe a reversible view lifecycle. Permanent
subscriptions and document-owned resources should still use `onDestroy$` or
`DestroyRef`. View-only resources that must stop while virtualized should use
`onDetach$`, and recreate themselves from current Yjs state on `onReattach$`.
Custom block subclasses can override the protected `beforeDetach()` and
`afterReattach()` hooks for the same purpose. `beforeDetach()` also runs once
when a still-mounted component is permanently destroyed, so view resources use
one cleanup path regardless of whether deletion happens onscreen or offscreen.
Both operations are idempotent; `reattach()` after permanent destruction is
ignored. A retained root subtree is an LRU cache entry, not a durable component
handle: root virtualization may evict it according to `retainedViewLimit` and
then emit permanent `ngOnDestroy` / `onDestroy$`. Store stable block IDs for
work that outlives the current event or reconciliation frame, and reacquire the
component when a mounted view is required.

### Stateful View Retention

Blocks whose state is owned by browser DOM rather than Yjs can opt out of
root-view eviction after their first materialization:

```typescript
metadata: {
  version: 1,
  label: 'Custom player',
  virtualization: {
    viewRetention: 'keep-alive',
  },
}
```

Custom schema assemblies that use the standard absolute path must register
`PlacementLayoutBlockSchema` once alongside their positionable blocks. The
bundled editor already includes it.

`metadata.virtualization.viewRetention` accepts `'virtual'` (the default) or
`'keep-alive'`. A
keep-alive block pins its containing direct-root render unit for the remaining
component lifetime, including when the block is nested. It does not force an
initial full-document mount: the lease begins only after that block first enters
the virtual window. Deletion or document disposal releases it automatically.

Use this only for state that would be lost by DOM removal, such as iframe
browsing contexts or active media playback. Ordinary blocks should remain
virtual. Built-in `audio`, `video`, `embed`, `figma-embed`, and `juejin-embed`
schemas opt in. A host can override any schema policy through
`DocConfig.virtualization.resolveViewRetention`; see `blockcraft-app.md`.

### Model-Only Virtual Height Estimation

Custom Schemas can own their offscreen height rule instead of relying on one
fixed `DocConfig.virtualization.estimatedHeights[flavour]` value:

```typescript
metadata: {
  version: 1,
  label: 'Task list',
  virtualization: {
    estimateHeight: ({props, layoutMode}) =>
      layoutMode === 'paginated' ? 0 : props.height ?? 600,
  },
}
```

`estimateHeight(context)` receives only model/layout facts: `blockId`,
`flavour`, `nodeType`, readonly `props`, direct `childIds`, `layoutMode`
(`'flow' | 'paginated'`), `fallbackHeight`, cached `rootContentWidth`, and a
cycle-safe `estimateChildHeight(childId)` helper. Return a finite non-negative
CSS-pixel height; zero is valid. Invalid results and thrown errors fall through
to framework object-sizing/built-in/flavour fallback rules. A successful value
is marked model-driven, so offscreen props/content/structure changes can update
continuous virtualization and sparse pagination before the view mounts.

The estimator can run many times during model reconciliation. Keep it
deterministic, synchronous and DOM/network free. If remote or asynchronous
business data changes the visual height, persist a compact layout fact such as
`height`, `rowCount`, collapsed state or aspect ratio in block props. Do not
query a service or cache owned only by the Angular component. Use
`estimateChildHeight()` only for children that contribute to vertical extent;
large custom containers should avoid an unconditional deep traversal.

The built-in `page-divider` demonstrates layout-specific geometry: it reserves
a compact marker height in flow layout and returns zero in paginated layout,
where the same model node acts as a manual break.

`viewRetention` and `estimateHeight` intentionally share the same
`metadata.virtualization` capability object: the former owns the materialized
view lifecycle, while the latter owns model-only geometry before or between
materializations. Document-wide windowing, LRU limits and host overrides remain
under `DocConfig.virtualization`.

### Object Layout and Placement

Positioning is an opt-in Schema capability. Extend the common block props and
declare the supported modes:

```typescript
import type {IBlockProps} from '@ccc/blockcraft'

interface MyVisualBlockProps extends IBlockProps {
  // block-specific props...
}

metadata: {
  version: 1,
  label: 'My visual block',
  placement: {modes: ['relative', 'absolute']},
}
```

The Schema metadata declares capability only. Layout mode is structural: a
direct root child is relative flow, and a direct child of `placement-layout` or
`object-group` is absolute. An absolute child persists one atomic
`position: {x, y}` object in its parent plane's layout pixels. Its optional
`placementLayer: 'under'` is stored
separately; omission means `over`. A relative child persists neither field.
There is no persisted `mode` or `unit`. The base block host applies
`position/left/top` only to structurally absolute, Schema-capable children.
The standard lift/return transition is root-only. The manager moves absolute objects
under one hidden `placement-layout` at the end of `root.children`:

```text
root
├─ paragraph
├─ image                 # relative / top-bottom
├─ object-group          # relative / top-bottom, fixed width/height
└─ placement-layout      # infrastructure, zero height
   ├─ image              # absolute, root-local position
   └─ object-group       # absolute under/over, fixed width/height
      ├─ image           # absolute, group-local position and wr basis
      └─ shape           # absolute, group-local position
```

The renderer uses explicit non-negative tiers: background, `under` (`0`),
ordinary flow children (`1`), then `over` (`2`). This keeps an under block above
the page background and an over block above text and media regardless of DOM
order. The layout creates no stacking context and does not intercept pointers.
Stale position props on a flow-only Schema are cleared. `object-group` is the
only standard nested absolute plane; other nested containers do not imply
absolute layout. The infrastructure Schema accepts
future custom positionable flavours; normalization keeps a child there only
when its own Schema declares absolute capability. A transient direct-root
snapshot with `position` (for example, an import or representation conversion)
is normalized into the placement layout; stable mode still comes only from
structure.
Live pagination moves the placement-layout to the root's effective content
origin through the runtime `--bc-placement-content-origin-y` value. The same
deterministic value is used by pointer geometry and virtual visibility; it is
derived from page margins/header bands rather than DOM displacement and is
never stored in `position.y`.

Use the user-facing object-layout API rather than exposing positioning modes:

```typescript
doc.placement.setObjectLayout(block, "under"); // lifts to absolute + under
doc.placement.insertAbsoluteSnapshot(snapshot, {
  anchorRect: doc.selection.getSelectionRect(),
  layer: "over",
});
doc.placement.updateAbsolute(block, { x: 25, y: 120 });
doc.placement.startDrag(pointerEvent, block);
doc.placement.setObjectLayout(block, "over");
doc.placement.setObjectLayout(block, "top-bottom"); // returns to relative flow
```

`insertAbsoluteSnapshot()` is the direct-creation path for new positionable
objects. It normalizes the snapshot position and returns the inserted block
ID. The normalized landing point is bounded by the **padding box** of
the placement container, not by its content box: `position.x/y` still measure
from the content origin, but an object may sit on the editor padding (page
margins under pagination), so the plane's own lower bounds are negative.
`resolvePlacementPlaneBounds(box)` turns any `PlacementBox` into that
`{minX, maxX, minY}` triple — `minX = -contentInsetLeft`,
`maxX = width + contentInsetRight`, `minY = -contentInsetTop` — so
`maxX - minX === container.clientWidth`. Pointer-driven object drawing uses the
same bounds, so drawing and insertion agree on where the editor ends.

**Object width contract** (shared, capability-driven): while an object floats
(`absolute` placement) its width belongs entirely to the user — resizing has no
cap and rendering never clamps it. Back in the flow (top-bottom), the rendered
width collapses to the content column (editor minus padding) while the stored
`width` prop is preserved. The contract is enforced by `themes/base.scss` on an
attribute pair: `BaseBlockComponent` stamps `data-bc-object` on every block
whose Schema declares the `absolute` placement mode, and the block template
marks the element carrying the inline `width` with `data-bc-object-surface`.
Do not add your own `max-width` to these elements, and do not gate any of this
on flavour. For resizers, bind `BaseBlockComponent.objectMaxWidthResolver` into
`ShapeResizerComponent.maxWidthResolver` — it returns `null` (uncapped) while
floating and the content-column width in flow, evaluated once per gesture.

If the root layout already exists, it appends the object there. If no
layout exists yet, it inserts one nested snapshot whose initial child is the
object; it does not create the parent and then try to look it up during the
same Yjs transaction. The object therefore never appears as a temporary
ordinary root-flow child.

`startDrag()` accepts the initiating `PointerEvent`. It uses
`pointermove / pointerup / pointercancel` on the capture path, previews movement
with a transform and performs one Yjs props write on release. The write replaces
the whole `{x, y}` object; it does not issue separate coordinate writes. Do not add native
`draggable`, `dragstart`, `dragover`, or `drop` handling for object positioning.

The shared UI descriptors are exported as `BLOCK_OBJECT_LAYOUT_OPTIONS`:

| State        | Label        | Icon                        |
| ------------ | ------------ | --------------------------- |
| `inline`     | 嵌入型       | `bc_tuwenraopaiqianrushi`   |
| `top-bottom` | 上下型       | `bc_tuwenraopaishangxiashi` |
| `under`      | 衬于文字下方 | `bc_cengji-xia`             |
| `over`       | 浮于文字上方 | `bc_cengji-shang`           |

The manager can apply the three block states directly. A plugin that owns an
inline representation registers `BlockObjectLayoutAdapter.toInline()` for its
flavour; this is how image blocks and future custom shapes expose the same
**嵌入型** action without putting flavour-specific conversion logic in
BlockController.

Position/layer props pass through `BlockComponent.updateProps()` and structural
moves pass through `DocCRUD`, so readonly enforcement, Yjs collaboration and
undo/redo use the normal data path.
On absolute → top-bottom, `setObjectLayout()` uses `setMode()` to read the
current visual center once,
chooses the nearest mounted ordinary root-flow sibling, inserts before
or after that sibling's midpoint, and clears `position` plus `placementLayer`
in one transaction.
It falls back to the end of root flow, before the layout, when no valid geometry
exists. It does not persist or restore the object's old logical position.
`resolveFlowAnchor()` returns a transient stable-ID
`{parentId, anchorBlockId, side}` descriptor and `reanchorToFlow()` lets
conversion code reuse the same move without clearing props; call both only on
explicit conversion paths because anchor resolution reads DOM geometry.
Absolute → inline/wrap conversion always reanchors the source from
`placement-layout` into the root flow before replacing its representation. It
never inserts into editable descendants of a nearby absolute object, even when
their visual boxes overlap.
`getRootFlowChildIds()`, `getAbsoluteBlockIds()`, `isPlacementLayout()` and
`isInAbsoluteLayout()` expose model-first classification for integrations.
`isObjectGroup()` and `isInObjectGroup()` distinguish the local plane.
`allowsGapCursor()` is the shared eligibility policy used by block hosts,
selection keyboard handling and `BlockGapCreatorPlugin`; it rejects both the
layout and absolute objects. `isAbsoluteObjectSelection()` recognizes the
whole-object selection that Input must isolate from ordinary text entry.
Under root virtualization, the zero-height `placement-layout` is not
keep-alive. The virtualizer builds a model-only vertical index from each
child's root-relative `position.y` and estimated height, including `wr/ar`
media dimensions and rotated fixed-size shape bounds. If any band intersects
the viewport plus one viewport of pre-rendering, the layout root unit mounts;
otherwise it may detach unless Selection, drag, resize or another interaction
owns a lease. The normal-flow height map is unchanged and scrolling performs
no child DOM measurements. Because the layout is one root render unit, one
visible child currently materializes all absolute siblings. A materialized
`under` block remains recoverable through a narrow edge hit band; recovery
publishes a whole-block model selection instead of relying on DOM hit testing
through the content above it.

### Placement-Plane-Relative Object Sizing

Use Schema `objectSizing` for image-, video- or iframe-like blocks whose width
must follow their containing sizing plane:

```typescript
interface PreviewModel extends NoEditableBlockNative {
  flavour: "preview";
  props: BlockObjectSizeProps & { url: string };
}

const PreviewSchema: IBlockSchemaOptions<PreviewModel> = {
  // flavour, nodeType, component and createSnapshot omitted
  metadata: {
    version: 1,
    label: "Preview",
    objectSizing: {
      defaultWr: 100,
      defaultAr: 16 / 9,
    },
  },
} as IBlockSchemaOptions<PreviewModel>;
```

`wr` is the percentage of the nearest sizing plane width; `ar` is
`width / height`. The plane is normally the root children content box. For a
direct `object-group` child it is the group's fixed outer `props.width` minus
the two `BLOCK_OBJECT_GROUP_PADDING` horizontal insets. Resolve live block
dimensions through the document-owned manager:

```typescript
const dimensions = this.doc.objectSizing.resolveForBlock(
  this.id,
  this.flavour,
  this.props,
);
// null until a responsive root width is measurable
```

`getReferenceWidth(blockId)` exposes the same basis. The lower-level
`resolve(flavour, props)` remains explicitly root-relative for model projections
that operate on root objects rather than one known block ID.

The exported pure helpers `normalizeObjectSize()`,
`resolveObjectDimensions()` and `deriveObjectSizeFromPixels()` are available to
model-only renderers and adapters. They clamp `wr` to `[1, 100]`, reject invalid
ratios and report whether dimensions came from `ratio`, `legacy` or `default`.
Do not add a `ResizeObserver` per block or read root geometry during change
detection.

### Fixed Object Groups

`ObjectGroupBlockSchema` is an internal fixed-size container with persisted
pixel `width` and `height`. The complete group can be a relative root-flow
object or an absolute root under/over object. Those dimensions describe the
outer frame, which reserves the fixed `BLOCK_OBJECT_GROUP_PADDING` inset (8
layout pixels) on every side. The inset content box is always the member
placement plane. Direct members keep content-plane-local absolute `position`
and no independent under/over tier in either outer layout. `setLayer()`,
`moveForward()` and `moveBackward()` reject members, and their object toolbars
omit both representation/layout and independent stack controls. Nested groups
are rejected.

```typescript
const groupId = doc.placement.group(['image-id', 'shape-id'])
if (groupId) {
  const memberIds = doc.placement.ungroup(groupId)
}
```

The selected group toolbar applies `top-bottom`, `under` or `over` only to the
atomic outer frame. Returning to flow preserves member-local positions and
dimensions; absolute frame-edge drag regions are hidden so ordinary block
reorder owns movement. Later member geometry tightening resizes and rebases the
local plane without recreating a root `position`, so the group stays in flow.
`ungroup()` projects members back to the root absolute
plane and is therefore available while the group is under/over.
Paginated live/print themes cap a top-bottom group frame, text box, WordArt or
Shape at `--bc-page-content-height` with a direct-root CSS selector. When the
outer group is top-bottom, the same cap applies to its local image, text-box,
WordArt and Shape member frames even though those members remain locally
absolute. Their available cap subtracts the outer frame's block-start and
block-end `BLOCK_OBJECT_GROUP_PADDING`; root absolute placement objects remain
unaffected.

`canGroup(ids)` requires at least two contiguous direct children of the root
`placement-layout`, all in the same `under`/`over` layer and all Schema-capable
for absolute placement. Grouping computes a rotation-aware visual union,
rebases every member into local coordinates and moves the existing block IDs;
it does not clone content. Ratio-sized images preserve their resolved pixel
frame by converting `wr` from root width to group width. `ungroup()` performs
the inverse conversion and restores root coordinates in one transaction. Here
"group width" means outer `width - 2 * BLOCK_OBJECT_GROUP_PADDING`; the visual
padding never changes a responsive member's resolved pixel size.

Root absolute objects can be aligned without first creating a group:

```typescript
doc.placement.alignObjects(ids, 'left')
doc.placement.alignObjects(ids, 'center')
doc.placement.alignObjects(ids, 'horizontal-distribute')
```

`BlockObjectAlignment` contains the six single-axis edge/center commands,
combined `center`, and horizontal/vertical distribution. `canAlignObjects()`
requires at least two same-plane objects; distribution requires three. It does
not require the same placement layer and treats an existing `object-group` as
one fixed object. The command resolves responsive and rotated visual geometry
from the model, then writes only each changed `position` in one Yjs
transaction. It never freezes `wr/ar`, changes fixed `width/height`, or stores
a persistent alignment constraint.

Built-in member geometry commits must use the block-aware write path:

```typescript
doc.placement.updateObjectGeometry(block, {
  width: nextWidth,
  height: nextHeight,
  position: nextLocalPosition,
})
```

For a grouped member, this applies the requested patch and recomputes the
rotation-aware union in the same Yjs transaction. If the union origin changes,
the group root position and every local member position are rebased without a
visual jump. Ratio-sized members receive a new `wr` against the new group
content width so their resolved pixels remain stable. Remote geometry changes, Undo/Redo and
structure changes are transaction-coalesced repair triggers; no DOM bounds or
per-group observer participates. Every recomputation emits an info-level
`[ObjectGroup][performance]` timing record containing `members`, `writes`,
`changed` and `reason`.

V1 deliberately has no user-driven group resize, group rotation or nested
group contract. Automatic tight-frame maintenance is part of member geometry,
not a group resize gesture.
HTML and Snapshot preserve the structural container and original sizing fields;
Markdown remains a semantic, non-placement projection.

Remote built-in images and new videos start at `wr: 100`; intrinsic metadata
fills a missing `ar`. A mounted legacy image that lacks `wr` uses its existing
pixel width when available, otherwise its intrinsic width, and writes complete
`wr/ar` on the first successful resource load. The write uses
`ORIGIN_NO_RECORD`, removes legacy `width/height`, and caps the migrated visual
width by the current parent so the mounted image does not jump during migration.
An offscreen image remains on model-only legacy/default estimates until it first
mounts, and readonly images are never rewritten. A built-in local image is
inserted immediately with its Object URL and upload-progress preview. On the
first successful preview load it sets `ar` from the intrinsic dimensions and
sets `wr` from
`min(intrinsicWidth, parentAvailableWidth) / rootContentWidth`, so small images
are not enlarged and nested images do not exceed their parent. For any legacy
object type that has not migrated on load, the first completed Pointer Events
resize writes `wr/ar` once and clears the old fields in the same
`updateProps()` transaction. The gesture captures the root-width basis for
persistence but uses the current parent content width as its visual maximum, so
a concurrent container resize cannot change the committed ratio.

### Visual Resource Placeholder Extension

Use the standalone `BcResourcePlaceholderDirective` when a custom block has an
image-, video- or iframe-like resource. It composes with the stable frame and
`block-resizer`; it does not add a Schema field or document service:

```typescript
import {
  BaseBlockComponent,
  BcResourcePlaceholderDirective,
  ResourceIntrinsicSize,
  ResizeContainerComponent,
} from "@ccc/blockcraft";

@Component({
  // ...
  imports: [BcResourcePlaceholderDirective, ResizeContainerComponent],
  template: `
    <div
      #frame
      bcResourcePlaceholder
      [resourceElement]="media"
      [resourceKey]="props.url"
      (resourceIntrinsicSize)="onIntrinsicSize($event)"
    >
      <img #media [src]="props.url" />
      <block-resizer [container]="frame" />
    </div>
  `,
})
export class PreviewBlockComponent extends BaseBlockComponent<PreviewModel> {
  onIntrinsicSize(size: ResourceIntrinsicSize) {
    if (this.props.ar == null) this.setInitProps({ ar: size.ar });
  }
}
```

The default adapter is inferred from `img`, `video` or `iframe`. Hosts can pass
`resourceAdapter` for another element contract and `resourceTimeoutMs` for a
bounded load. `resourceStateChange` emits `idle | loading | ready | error`;
the directive exposes `retry()` for custom UI. The exported
`imageResourcePlaceholderAdapter`, `videoResourcePlaceholderAdapter` and
`iframeResourcePlaceholderAdapter` can also be composed by non-Angular
surfaces. Always keep the frame's size in model/CSS state—the directive owns
loading presentation, not geometry.

For the built-in image block, create the local Object URL and Snapshot
immediately. The mounted preview initializes `wr/ar` without adding Undo
history:

```typescript
const localUrl = fileService.createObjectURL(file);
const snapshot = ImageBlockSchema.createSnapshot({
  src: localUrl,
});
```

`ImageBlockCreateInput` is the short object form `{src, wr?, ar?}`. The legacy
positional `createSnapshot(src, width?, height?, caption?)` form remains
supported. `readImageIntrinsicSize()` remains available to hosts that require
a fully sized Snapshot before any view mounts; it prefers `createImageBitmap`
for `Blob/File` and falls back to temporary Object URL + `HTMLImageElement` for
WebKit compatibility. Do not put that await in an interactive built-in image
insertion path because it delays the upload-preview state.

### Built-in Word-like Text Box

The bundled `text-box` flavour is a fixed-size container whose text remains in
ordinary paragraph/list/blockquote child Blocks. Register the Schema and its
object toolbar together with the placement infrastructure and the child
schemas your document allows:

```typescript
import {
  ParagraphBlockSchema,
  PlacementLayoutBlockSchema,
  TextBoxBlockSchema,
  TextBoxToolbarPlugin,
} from '@ccc/blockcraft'

const schemas = new SchemaManager([
  ParagraphBlockSchema,
  PlacementLayoutBlockSchema,
  TextBoxBlockSchema,
])
const plugins = [new TextBoxToolbarPlugin()]
```

`TextBoxBlockSchema.createSnapshot(text?, props?)` always starts with a normal
paragraph, so Enter, IME, Y.Text collaboration and Undo use the same path as
document prose. Its exact child allowlist is `paragraph`, `bullet`, `ordered`,
`todo` and `blockquote`; nested media, tables and drawing objects are rejected.
Deleting the last child restores the framework's normal fallback paragraph.

`TextBoxBlockProps` extends `BlockSurfaceProps` with fixed `width`, `height` and
`rotation`, plus a composable shape shell: `sh` (Shape catalog kind), `fo`
(fill opacity), `bw` (outline width) and `bs` (outline style). Optional `wa` is
a canonical serialized WordArt-compatible value object. Common `backColor`,
`borderColor`, `position` and `placementLayer` remain inherited Block props.
The latter two are present only while the text box is structurally absolute.
Defaults are
`240 × 120`, rectangle, rotation `0`, `p: [8, 12]`, a white fill and a gray
outline.

Compact `wm` (`'h'` | `'v'`, default `'h'`) selects the text direction. A
vertical frame renders `writing-mode: vertical-rl` through
`--bc-text-box-writing-mode`; horizontal frames omit the variable so the theme
falls back to `horizontal-tb`. Direction is a frame flag, not a second set of
properties: `text-align` and the `flex-direction: column` main axis are both
logical, so alignment and child stacking flip on their own. Only the labels in
the object rail change. `DEFAULT_VERTICAL_TEXT_BOX_SIZE` transposes the default
geometry for callers that insert a vertical frame.

`TEXT_BOX_PRESETS` is grouped into three shape tabs through the optional `cat`
field (`outline` / `rect` / `bubble`), and a preset may limit itself to one
direction with `wm`. Two curated entries lead 线框 rather than occupying a
separate 精选 tab: **极简** first — the classic frame with `fo: 0`, the same
value the 无填充 button writes, so the border stays visible while the fill is
gone — then **默认白框**. The picker marks the fill-less thumbnail with a
transparency checkerboard, because on the picker's near-white panel it would
otherwise be indistinguishable from the white-filled frame.
`getTextBoxPreset()` falls back to 默认白框 for
unknown ids, not to the catalog's first slot. Two
kinds coexist in the catalog: geometry-only
entries driven by `sh`, and decorated entries that set `sh: 'rectangle'` with
`bw: 0` / `fo: 0` and name a drawing from the artwork registry in `bgi`. The second kind exists because the surface image is
clipped to the shape path and a Shape shell paints only one fill and one
stroke — hand-drawn borders, ribbons and multi-color ornament need the image.
Query them with `getTextBoxPresetsFor()` / `getTextBoxPresetCategoriesFor()`.

Those drawings live in a registry, not in the document. `bgi` holds a `bc:<id>`
reference; `getTextBoxArtwork()` / `resolveTextBoxArtworkSrc()` turn it into the
inline SVG at render time, and anything that is not a `bc:` reference — a URL the
host's upload service returned — passes through untouched. The registry is the
same idea as the Shape catalog: `sh` names geometry plus `textInsets`, `bgi`
names a drawing plus its own `textInsets`. Two consequences follow. The drawing
never travels in a snapshot, a Yjs sync, an undo entry or an export, which is
worth 0.3–1.6 KB per frame. And the frame's text-safe area is a *fraction* of the
frame, so it tracks whatever size the author drags — held as fixed px in `p` it
was only correct at the size each entry was drawn for, and a stretched frame ran
its text straight through the artwork.

`_shapeInset()` resolves in that order: the artwork's insets when `bgi` names
one, then nothing at all for `sh: 'rectangle'` (a plain rectangle has no artwork
to dodge), then the shape's own. `p` remains optical padding in absolute px,
stacked on top of whichever inset wins. That combination belongs to the chosen
style, not to the text-box type as a whole: 默认白框 keeps ordinary `p`, while
decorated frames and bubbles set `p` to zero and let their proportional
`textInsets` define the actual editable safe area.

Decorated entries split the work between the two layers: the frame is a real
`bw` outline on the chosen shape — editable from the toolbar and a constant
width at any frame size — while `bgi` carries ornament only. Bubbles are the
exception and draw their own contour with `bw: 0`, because a balloon is not a
rectangle wearing a badge.

Two consequences are worth knowing before adding entries. The surface image is
clipped to the shape and the outline paints above it, so ornament can neither
bleed past the frame nor interrupt the border; picking a shape whose
`detailPath` already breaks the outline (`folded-corner`) is the only way to get
that reading. And a non-rectangular shape contributes its `textInsets`
underneath `p`, so the two stack — `_shapeInset()` returns `0%` only for
`rectangle`.

Child spacing inside a frame uses `margin-block-end`, which resolves to the
document's usual `margin-bottom` under `horizontal-tb`. A caret that leaves the
fixed frame is **not** scrolled into view in either direction —
`SelectionManager.scrollSelectionIntoView()` only scrolls the document-level
container on its vertical axis. Use `normalizeTextBoxProps()` at creation/import boundaries and
`normalizeTextBoxWordArtStyle()` / `serializeTextBoxWordArtStyle()` at the
text-effect boundary. The shared compact surface keys remain `p`, `bgi`,
`bgs`, `bgx`, `bgy` and `bgo`; there is no second text-box-specific padding or
image record.

The live Block and Snapshot Viewer render the selected Shape geometry as SVG.
A real decorative `<img>` is clipped by that geometry behind a padded child
viewport; non-rectangular definitions also contribute their catalog text-safe
insets. Optional WordArt values style the ordinary child text without changing
its Y.Text ownership. The frame stays fixed-size: editing may scroll overflowing
content, while readonly/print output clips it. Eight resize
handles and the rotation handle reuse `ShapeResizerComponent`; preview runs in
an animation frame and pointerup writes one props transaction. The fixed toolbar
opens `TEXT_BOX_PRESETS`, inserts the chosen concrete appearance into
`placement-layout`, then enters the first paragraph. Preset IDs are never
persisted, so changing a future catalog does not drift existing documents.

The Schema declares a placement-aware Selection contract. Its frame remains
selectable in either layout, but relative `top-bottom` flow uses a transparent
selection scope just like Mermaid: descendant caret, double-click, IME, arrows
and Ctrl/Cmd+A follow the surrounding document, and Enter is not repurposed.
`escapeToFrame: 'always'` independently lets Escape from a direct editable child
select the whole frame in either layout. In absolute placement the same Block
resolves to a closed `container` scope: Enter or a direct-frame double-click
enters text, edge arrows cannot escape the object plane, and repeated Ctrl/Cmd+A
is capped there. Core Selection owns these rules; `TextBoxToolbarPlugin` only
observes the resulting state and owns the toolbar plus the explicit top-handle,
resize and reorder gestures. Its object
toolbar is semantic and preset-first: **样式**, **形状** and
**文字效果**, followed by **上下型**, **衬于文字下方** and
**浮于文字上方** plus absolute stack order. Raw padding and background-image
URL fields remain available through Schema/CRUD APIs but are not exposed as
primary toolbar inputs. There is no inline/wrap adapter for a multi-Block
container. HTML round-trips the complete frame, Shape, WordArt and compact
surface fields; Markdown deliberately flattens to readable ordinary children.

`text-box` is a new flavour, and live editors do not have an unknown-flavour
fallback. Collaborative rooms must ensure every writer/reader has registered
the Schema before any client persists one.

### Built-in Word-like Shape Block

The built-in shape feature is a `shape` container block with zero or one
collaborative `shape-text` editable child. Register both schemas together:

```typescript
import {
  ShapeBlockSchema,
  ShapeTextBlockSchema,
  ShapeToolbarPlugin,
} from "@ccc/blockcraft";

const schemas = new SchemaManager([
  // ...
  ShapeBlockSchema,
  ShapeTextBlockSchema,
]);

const plugins = [
  // ...
  new ShapeToolbarPlugin(),
];
```

`ShapeBlockSchema.createSnapshot(shapeType?, text?)` accepts one of the 103
exported `SHAPE_KINDS`. `SHAPE_CATEGORIES` groups the same canonical
`SHAPE_DEFINITIONS` into the Word-like **矩形 / 基本形状 / 线条 / 箭头总汇 /
公式形状 / 流程图 / 星与旗帜 / 标注** catalog. `ShapeBlockProps` persists
width/height, `shapeType`, fill, outline, text color/alignment, optional
`rotation` in degrees and optional absolute `position` / `placementLayer`.
Fill supports solid and linear-gradient modes through the structured
`fillType` / `gradientAngle` / `gradientColors` / `gradientStops` fields
(compare WordArt); a missing `fillType` means solid, so legacy documents need
no migration, and raw CSS gradient strings are never persisted. Gradients
render as per-block SVG `<linearGradient>` defs in both the block component and
the inline shape Embed; `SHAPE_FILL_GRADIENT_PRESETS` ships the Word-like
built-in gallery and preset IDs are never persisted.
Catalogue SVG paths and categories are never written into Yjs or snapshots.
Parameterised catalogue shapes may additionally persist one flat numeric
`adjustments` record. Editable line/freeform geometry persists as one validated,
versioned JSON string in `customGeometry`; it is an atomic top-level Yjs prop,
not arbitrary SVG markup or a nested node-level CRDT. `normalizeShapeProps()`
validates these optional values and returns a finite rotation normalized into
`[0, 360)`.

`ShapeDefinition` stores the trusted main `path`, optional stroke-only
`detailPath`, `textInsets`, and optional `fillable` / `supportsText` /
`fillRule` rendering capabilities. The eight built-in line and connector
appearances are non-filled and do not expose a shape-text editor. When selected,
their nodes and cubic control points are editable through a dedicated overlay;
pointer movement previews outside Angular and pointerup stores one complete
`customGeometry` value through the ordinary placement/Undo transaction. They
remain visual objects rather than auto-snapping semantic connectors.
`ShapeIconComponent` renders the same main and detail
geometry as the inserted object. The fixed **插入形状** action uses the shared
categorized picker; the selected-shape toolbar does not expose a change-shape
control. Its dense icon-only cells expose names through CSES Tooltip and
`aria-label`; compact category headings keep the 103 entries navigable. Other
toolbar/menu glyphs continue to use iconfont classes.

An empty shape snapshot has no child block. Passing non-empty text or deltas
creates the single `shape-text` child; double-clicking an empty shape creates
that child through `DocChain` and focuses it. This keeps insertion snapshots
free of placeholder paragraphs while preserving normal Y.Text collaboration
once the user starts editing.

The block supports eight-direction resizing, drag rotation and only the three
block object layouts: **上下型**, **衬于文字下方**, and **浮于文字上方**.
Under/over enter absolute placement; top-bottom returns to relative flow.
Selecting an unlocked shape shows one rotation handle above the resize outline.
It uses Pointer Events, previews outside Angular through one animation frame,
snaps to 15° while Shift is held, and commits one `updateProps()` write on
pointerup. Rotated resize deltas are converted into the shape's local axes and
west/north compensation is converted back to page coordinates before absolute
placement is updated. Shape text remains a normal Y.Text editing surface and
therefore participates in collaboration, undo/redo and inline formatting while
rotating visually with its parent shape.

The exported `CustomShapeGeometry` format owns a separate finite `width/height`
coordinate space and one to eight safe paths. A path accepts only `move`,
`line`, `cubic`, `arc` and `close`, with at most 512 commands and a 64 KiB serialized
ceiling. Use `serializeCustomShapeGeometry()` before writing and
`normalizeCustomShapeGeometry()` when reading external data. Built-in line,
elbow, curved-connector and scribble definitions use
`createDefaultEditableShapeGeometry()` only as an edit projection; old
snapshots stay catalogue-only until the first completed handle gesture.

The built-in adjustment projection currently covers rounded/single-rounded/
same-side-rounded rectangles, triangle, parallelogram, trapezoid, four
single-direction and two bidirectional block arrows, plus rectangular/rounded
speech bubbles and wedge callouts. These shapes expose one or two yellow round
handles and persist only their named finite numbers (`radius`, `apexX`, `inset`,
`headLength`, `shaftThickness`, `tailX`, `tailY`). Pointer movement is a local
path preview; pointerup writes the complete flat record once. Explicit
`customGeometry` has precedence and suppresses catalogue adjustment handles.
Every remaining built-in Shape definition receives an edit-only projection
from its trusted catalogue path. The internal converter accepts only the
catalogue's absolute `M/L/H/V/C/S/Q/T/A/Z` subset, converts quadratic and
smooth commands and catalogue arcs to explicit cubic controls, and retains
`evenodd` compound-path fill. The projection is not persisted until the first
completed yellow-node gesture, so untouched snapshots remain path-free. Across
the parameter and path modes, all 103 built-in Shape kinds are editable.

`ShapeRotateCommit`, `calculateShapeRotation()`, `rotateShapeVector()` and
`normalizeShapeRotation()` are exported for custom shape UI and testing.
Pointer cancel, Escape, window blur and component destruction restore the
pre-gesture transform without writing props.

`ShapeResizerComponent` also accepts optional `resizeCalculator`,
`previewMirror`, `rotationLabel` and `borderDraggable` inputs. The defaults
preserve shape behavior. Fixed-size editable objects such as WordArt can reuse
the same handles while supplying their own resize policy; enabling
`borderDraggable` adds four invisible edge hit regions without covering the
object's editable interior.

The bundled fixed toolbar creates a shape through
`insertAbsoluteSnapshot()`, so the first persisted state is a direct child of
the root `placement-layout` with the default `over` tier. The nested
`shape-text` editing surface is visually part of the shape: it has no separate
border, outline, shadow, background or block margin.

### Built-in Editable WordArt Block

The built-in `word-art` flavour is an `editable` block, not a container. Its
text is stored directly in the block's Y.Text and participates in the normal
Input/IME, collaboration and undo path; it never creates a `shape-text` child.
Register the Schema and object toolbar together:

```typescript
import { WordArtBlockSchema, WordArtToolbarPlugin } from "@ccc/blockcraft";

const schemas = new SchemaManager([
  // ...
  WordArtBlockSchema,
  PlacementLayoutBlockSchema,
]);

const plugins = [
  // ...
  new WordArtToolbarPlugin(),
];
```

`WordArtBlockSchema.createSnapshot(text?, props?)` defaults to `艺术字`. The
exported flat `WordArtBlockProps` stores fixed width/height, rotation,
typography, solid or linear-gradient fill, outline, shadow, alignment, a safe
affine/perspective effect and optional absolute `position` / `placementLayer`.
Gradient colors/stops use
parallel primitive arrays so props remain valid BlockCraft `SimpleValue`
records. `normalizeWordArtProps()` clamps external values and
`resolveWordArtPresentation()` resolves portable CSS without accepting raw CSS
expressions. The bundled catalog contains 16 `WORD_ART_PRESETS`, 10 safe
`WORD_ART_FONT_OPTIONS` and 15 allowlisted `WordArtEffect` transforms;
`getWordArtPreset()` and `wordArtPresentationToInlineStyle()` are public.

The interaction is object/edit dual-state. Clicking text or blank space enters
its direct text surface; normal clicks inside an active editor keep native
caret placement. `selectionInteraction` declares `editingBoundary: 'always'`
and `escapeToFrame: 'always'`, so core Selection owns Enter into editing and
Escape back to whole-object selection. The hover/focus-revealed
`.word-art-block__object-handle` matches the text-box handle: it selects and
moves the object without intercepting the editable text surface. Whole-object
selection applies `.word-art-block--object-selected`, which alone exposes the
resizer and object toolbar; text editing shows neither. Object movement also
remains available from the four invisible selected-border hit regions. The
bundled fixed toolbar inserts an absolute `over` WordArt near the saved
selection. Its **插入艺术字** control is a scrollable 16-card visual preset dropdown;
choosing a card applies that preset while creating the default `艺术字`,
navigates to its mounted view and selects all text. The object toolbar exposes
classic presets, safe font families, solid/gradient fill, outline, shadow
toggle, letter spacing, iconfont horizontal/vertical alignment submenus,
effects, object layout, stack order and deletion. Its range controls
share the shape toolbar's track, thumb and keyboard-focus treatment.

The eight handles and rotation control reuse `ShapeResizerComponent`. Corners
scale width, height and font size proportionally; left/right handles change
width for text reflow; top/bottom handles change height. Pointer preview stays
DOM-only and one `updateProps()` write is committed on release. WordArt
supports the same **上下型 / 衬于文字下方 / 浮于文字上方** placement states
as shapes and has no inline representation.

Do not assign `this.props.foo = ...`, mutate `this.meta`, or write raw
`Y.Text`/`Y.Map` from a custom Block/Plugin. Use `updateProps()`, guarded inline
methods, `DocChain`, or `DocCRUD`; these are the enforcement boundary for block
readonly. To control the persistent lock itself, call
`doc.setBlockReadonly(blockOrId, boolean)` rather than `updateMeta()`.
The explicit lock owner is persisted as `meta.lock?: string`; the host supplies
`DocConfig.currentUserId`, and only that owner or `canUnlockBlock` override can
remove it. Legacy `meta.readonly` is not interpreted.

Block readonly is inherited. A locked container protects all descendants, and
an unlocked ancestor containing a locked descendant cannot be deleted or moved.
Readonly blocks remain selectable/copyable and may keep read-only interactions
such as links, previews and downloads. Root cannot be persistently locked.

> **Gap-space behavior**: Eligible non-leaf void/container blocks dynamically
> receive direct before/after zero-width gap spaces so a caret can land beside
> them. The root `placement-layout` and its structurally absolute children
> never receive those gaps. A mounted object removes them when it
> enters absolute placement and restores them when it returns to relative flow.
> `SelectionManager` also degrades stale disallowed gap snapshots to a
> whole-block selection. See `createBlockGapSpace()` in `framework/utils/` and
> `BlockPlacementManager.allowsGapCursor()`.

## EditableBlockComponent Additional API

```typescript
// ── Inline state ──
this.yText                                       // Y.Text (canonical inline content)
this.runtime                                     // InlineRuntime (Blot tree + mapper)
this.containerElement                            // HTMLElement (.bc-inline-container)
this.textLength                                  // number (yText.length)
this.textDeltas()                                // DeltaInsert[] (yText.toDelta())

// ── Inline mutations (write directly to yText) ──
this.insertText(index, text, attrs?)              // throws on effective readonly
this.deleteText(index, length?)                   // throws on effective readonly
this.replaceText(index, length, text?, attrs?)    // throws on effective readonly
this.formatText(index, length, attrs)             // throws on effective readonly
this.applyDeltaOperations(delta)                  // throws on effective readonly

// ── Render ──
this.rerender()                                  // Force runtime.render(textDeltas())

// ── Cursor / selection inside this block ──
this.setInlineRange(index, length = 0): Range    // Returns the DOM Range applied

// ── Config ──
this.plainTextOnly = true                        // Disables rich formatting (for code blocks)

// ── Events ──
this.onTextChange  // Subject<{ op: DeltaOperation[]; tr: Y.Transaction }>
```

> **Heading is a prop, not a block type**. The "heading" levels (h1, h2, h3) are stored as `props.heading` on `paragraph` blocks and exposed via the `[attr.data-heading]` host binding on `EditableBlockComponent`. There is no separate `heading` flavour. To toggle: `paragraphBlock.updateProps({ heading: 1 })`.

## DocChain: Block Operations

### Template-authoring draft props

BlockCraft ships `weather`, `date-card`, and `person-card` as canonical void
blocks. Do not create parallel `template-*` schemas. A host that edits reusable
templates stores unresolved author choices under namespaced instance meta with
`draftPropMetaKey(key)` (for example `draft:style`) and may pass those values in
`InternalDragData` as `initMeta`. The built-in dynamic blocks project declared
draft keys for presentation without mutating their real props.

When a host creates a normal document from a template it owns the materializing
transition: resolve every draft value, write the result to the corresponding
real prop, and remove the consumed `draft:*` meta. Geometry and placement remain
real props in both states. Normal documents should never retain template draft
meta.

Use `DYNAMIC_MATERIAL_DATA` to provide host data for dynamic blocks without
coupling BlockCraft to authentication or business services. The person-card
payload is a neutral display snapshot; weather access implements
`DynamicMaterialDataPort`.

`DocChain` is the fluent transaction builder. Each method enqueues a step; `run()` commits everything in a single Yjs transaction. Async tasks can be interleaved with `.task()`.

```typescript
// Insert relative to an existing block (parent inferred)
doc
  .chain()
  .insertAfter(existingBlock, "my-block", ...params)
  .run();
doc.chain().insertBefore(existingBlock, "paragraph", "Hello").run();

// Insert at a specific child index inside a parent
doc
  .chain()
  .insert(parentId, index, "my-block", ...params)
  .run();

// Insert pre-built snapshots (no schema params)
doc.chain().insertSnapshots(parentId, index, [snapshotA, snapshotB]).run();

// Replace a block
doc
  .chain()
  .replaceWith(blockId, "my-block", ...params)
  .run();

// Delete
doc.chain().deleteById(blockId).run();

// Cursor positioning (queued, runs after the mutations land)
doc
  .chain()
  .insertAfter(block, "paragraph", "New paragraph")
  .setCursorAtBlock(newBlockId, true) // atStart
  .run();

// Custom async work between steps
doc
  .chain()
  .insertAfter(block, "paragraph", "New paragraph")
  .task(async (ctx) => {
    await fetchSomething();
  })
  .setCursorAtBlock(newBlockId, false)
  .run();
```

> Always prefer `DocChain` over calling `doc.crud` directly. The chain handles transaction grouping, undo history boundaries, and cursor restoration in one place.

## Built-in Mermaid Fullscreen View

The built-in `mermaid` container always shows a fullscreen button in its header.
Its Schema creates one `mermaid-textarea` editable child from the Mermaid source
and declares `metadata.includeChildren: ['mermaid-textarea']`; hosts and
model-first operations should create the outer `mermaid` block rather than
inserting `mermaid-textarea` directly under the document root.
Fullscreen is an in-place viewport projection: the Mermaid host stays in its
Angular-owned DOM tree, and the `mermaid-textarea` child remains the same Y.Text
editing surface. Source input, IME, selection, collaboration, Undo/Redo, mode
switching, SVG export and preview rendering therefore continue through their
normal paths.

- The `text`, `graph` and side-by-side `default` modes all fill the available
  fullscreen content area; each visible pane owns its own scrolling.
- Escape exits fullscreen, except while an IME composition is active. The
  header button changes to an explicit exit action while fullscreen is active.
- Readonly Mermaid blocks can enter fullscreen for preview, while their source
  remains protected by the existing readonly policy.
- Fullscreen state is local view state. It is not written to Yjs, does not enter
  Undo history, and is not restored after reopening a document.
- Table and Mermaid blocks share one internal fullscreen owner, so entering one
  exits any other active fullscreen block. The active block holds a targeted
  virtualization view lease until exit.
- The controller temporarily locks every scrollable ancestor on the active
  block's DOM path, including host-app containers outside BlockCraft, and
  restores their exact overflow declarations and scroll offsets on exit. This
  prevents Safari from painting an outer scrollbar above the fixed surface.
- Mermaid keeps its existing graph-only `+` / `-` controls. In fullscreen it
  consumes Ctrl/Cmd + wheel without changing graph scale, preventing the host
  document zoom shortcut from running underneath the active block.
- Clicking the rendered graph does not open the separate image-preview viewer
  while Mermaid is already fullscreen; normal-flow preview behavior is unchanged.

The implementation reuses the existing `is-fullscreen` host class and the
compatibility body/isolation classes used by table fullscreen. These classes
are BlockCraft-owned implementation details; integrations should invoke the
built-in button rather than persisting or toggling them directly.

## Selection Scope (Schema field)

Container-like blocks can declare how their descendants participate in
cross-parent selection via `metadata.selectionScope`. Use one static scope when
placement does not affect the editing domain:

```typescript
metadata: {
  // ...
  selectionScope: 'container',
}
```

Placement-capable Blocks can instead resolve the scope structurally:

```typescript
metadata: {
  selectionScope: {
    relative: 'transparent',
    absolute: 'container',
  },
}
```

Supported values:

| Value                   | Meaning                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `document`              | Top-level document scope; normally only `root` declares this.                       |
| `table`                 | Closed table scope. Descendants share one table selection domain.                   |
| `columns`               | Layout scope whose child columns are transparent to text selection.                 |
| `container`             | Closed generic container scope such as callout/highlight or an absolute text box.   |
| `transparent` / omitted | This block does not create a scope; descendants inherit the nearest ancestor scope. |

Built-in declarations:

| Flavour                        | `selectionScope`                                  |
| ------------------------------ | ------------------------------------------------- |
| `root`                         | `document`                                        |
| `table`                        | `table`                                           |
| `columns`                      | `columns`                                         |
| `callout`                      | `container`                                       |
| `text-box`                     | relative `transparent`; absolute `container`      |
| `mermaid` / `mermaid-textarea` | `transparent`                                     |

`SelectionManager` reads this field through the registered schema. Do not add
flavour-specific checks in input, toolbar, or selection-class code; derive
behavior from the resolved scope / `SelectionScopePolicy` instead.
Cmd/Ctrl+A follows the resolved scope. In a `container` scope the first press
selects the scope block's complete child boundary range; repeated presses stay
there when it is an absolute object. A relative text box resolves as
`transparent`, so the first press selects the active editable child and later
presses follow the ordinary parent/document ladder, exactly like Mermaid text.

## Selection Interaction (Schema field)

`selectionScope` defines a text range domain; it does not make the container
frame an object-selection target. A Block that needs a selectable frame around
otherwise normal editable descendants declares the independent interaction:

```typescript
metadata: {
  selectionInteraction: {
    frame: 'selectable',
    escapeToFrame: 'always',
    editingBoundary: 'absolute',
  },
}
```

`frame: 'selectable'` makes the Block host itself selectable. A frame whose
visible border is rendered by a descendant (for example an SVG path) marks the
precise hit region with `data-bc-selection-interaction-frame`; unmarked wrapper
and editable descendants remain native. `editingBoundary` independently enables
Enter/direct-frame double-click entry either `always` or only in `absolute`
placement. `escapeToFrame` uses the same values but controls only Escape from a
direct editable child back to whole-frame selection. When omitted, Escape keeps
following `editingBoundary` for backward compatibility:

- direct non-descendant frame click → whole-block selection;
- while the editing boundary is active, Enter or direct-frame double-click →
  first editable descendant;
- while `escapeToFrame` is active, Escape from a direct editable child →
  whole-block selection;
- descendant pointer/text/IME/Ctrl/Cmd+A → normal Selection/Input handling.

```html
<path data-bc-selection-interaction-frame></path>
```

The framework resolves all placement-aware capabilities through the Placement
domain; Selection and plugins must not inspect flavour. Relative text boxes use
the same transparent entry/editing behavior as Mermaid, while
`escapeToFrame: 'always'` still provides a direct object-selection path.
Absolute text boxes are closed and capped. Interactive frame controls can add
`data-bc-selection-interaction-ignore` so Selection does not consume their
pointer gesture. The built-in `.text-box-block__object-handle` uses that opt-out
and delegates select/move to `TextBoxToolbarPlugin`. `text-box` declares the
placement-aware capability; `callout`
deliberately has no selectable-frame interaction even though it uses a static
`selectionScope: 'container'`.

## Plain-Text Formatting Capability (Schema field)

Editable flavours that prohibit rich formatting must declare the capability in
both their view class and schema:

```typescript
export class MySourceBlock extends EditableBlockComponent<MySourceModel> {
  override plainTextOnly = true;
}

export const MySourceSchema: IBlockSchemaOptions<MySourceModel> = {
  // ...
  metadata: {
    version: 1,
    label: "Source",
    plainTextOnly: true,
  },
};
```

The component property governs mounted rendering. The optional
`metadata.plainTextOnly` field is the model-only capability used by
`doc.isPlainTextBlock(blockId)`, fixed/floating toolbar eligibility, and
`TextToolbarHelper` while the block is outside the virtual viewport. Formatting
writes use readonly-guarded `doc.crud.formatText(blockId, index, length, attrs)`;
do not resolve a ComponentRef solely to mutate an offscreen `Y.Text`.

Editable rich-text blocks also accept compact paragraph typography props:

| Prop | Unit / range | Meaning |
|------|--------------|---------|
| `pfs` | ratio, `0.5..3` | Paragraph base font scale; missing/`null` inherits `1` |
| `lh` | unitless, `1..3` | Paragraph line-height ratio; missing inherits the root |
| `psb` | pt, `0..120` | Space before |
| `psa` | pt, `0..120` | Space after; missing inherits `--bc-segments-gap` |

Adjacent paragraph spacing is one physical gap: `max(previous.psa,
next.psb)`. The first child's `psb` becomes leading block padding and the last
child has no trailing gap. This avoids margin collapse differences and keeps
pagination's `border-box + margin-bottom` stride authoritative. Use the shared
`normalizeParagraphSpacing()` and `paragraphPointsToCss/Pixels()` rather than
writing unbounded values or assuming `1pt === 1px`.

`pfs` scales the editable host rather than only its inline text container, so
ordered markers, bullet prefixes and todo controls inherit the same size. The
effective text scale is `pfs × t:fs`; heading scale multiplies that paragraph
base. Use `normalizeParagraphFontScale()` and omit neutral `1` as `null`.
`TextToolbarHelper.formatTypography({fontScale}, selection)` decides ownership
from model offsets: complete blocks write `pfs` and clear their stale inline
size, partial ranges write `t:fs`, and a collapsed caret updates pending insert
attrs only. Existing inline-only documents are not migrated automatically.

`TextToolbarHelper.updateBlockProps({...})` applies these props across the
model-owned covered block IDs in one Yjs transaction, including unmounted
middle blocks; plain-text-only/non-editable blocks are skipped. Changes to a
following paragraph's `psb` also invalidate the preceding mounted sibling,
because that sibling owns the effective physical gap.

## Ordered Block Marker Library

The built-in `ordered` block separates counter state from marker presentation:

```typescript
interface OrderedBlockModel {
  props: {
    order: number
    start?: number | null
    ms?: OrderedMarkerStyleId | null
  } & IEditableBlockProps
}
```

`order` / `start` remain owned by `OrderedBlockPlugin`. Compact `ms` is only a
presentation preset. Missing, `null`, or an unknown value renders through the
legacy `depth` cycle, so stored documents retain their old appearance. New
list items inherit a valid marker preset from the source props or the existing
automatic-numbering group, but never inherit `order` or `start`.

The exported `ORDERED_MARKER_STYLES` catalog contains 12 presets. Render with
`resolveOrderedMarker(order, depth, ms)`; it returns `{text,
enclosure}`. `ms` persists a stable two-character ID (`n1..n5`, `a1..a2`,
`r1..r2`, `c1..c2`, or `o1`). `o1` returns a plain number plus `enclosure:
'circle'`, and the theme owns the circle geometry. Do not substitute Unicode
circled-number glyphs because their coverage ends early and varies by font.

`resolveOrderedMarkerGroupIds()` and `applyOrderedMarkerStyle()` operate only
on stable IDs through `BlockModelGraph` / `DocCRUD`. A marker group is the same
counter segment used by automatic numbering: it matches the anchor
`depth + heading`, crosses same-level ordinary paragraphs, and stops at the
counter's structural-pruning boundary or the next explicit positive `start`.

## Block Instance Metadata

BlockCraft exposes a small, generic instance-metadata contract for editable
placeholders and container direct-child constraints:

```typescript
interface IBaseMetadata {
  plh?: string;
  plhMode?: "focused" | "always";
  incl?: string[];
  excl?: string[];
}
```

`incl` / `excl` are intentionally abbreviated persistent keys. A Schema must
explicitly opt a non-editable container into instance child constraints:

```typescript
metadata: {
  // The Schema remains the immutable upper bound.
  includeChildren: ['paragraph', 'image', 'callout'],
  excludeChildren: ['table-*'],
  instanceMeta: {
    childConstraints: true,
  },
  allowEmptyChildren: true,
}
```

- Editable blocks support `plh` and `plhMode` without a Schema opt-in.
- Non-editable containers do not render placeholder metadata. A content region
  should persist `plh` / `plhMode` on an empty editable child.
- `incl` / `excl` are interpreted only when
  `instanceMeta.childConstraints: true`.
- `allowEmptyChildren: true` preserves an empty container when its final child
  is deleted.
- Persisted `incl` / `excl` on a Schema that did not opt in are inert. The
  built-in `table-cell`, `column`, and `callout` Schemas do not opt in.

Instance metadata can narrow but never widen the Schema contract. `excl` wins
over `incl`; an explicitly empty `incl` allows no direct child. Patterns use
the existing Schema syntax (`*`, `table-*`, `*-embed`), and malformed rules
fail closed.

Use `doc.canInsertChild(parentId, childFlavour)` for menus and drag/drop.
`DocCRUD` enforces the same rule for insert, move and replace. The bundled
`render-unit` block is the generic container for host-defined content regions;
it opts into child constraints and uses the iconfont class
`bc_icon bc_erjidaohang_caogaoxiang`. Template hosts should create it together
with an empty editable child that owns any persistent placeholder. Its optional
`backColor` / `borderColor` and `BlockSurfaceProps` style the region shell and
inset its content; child blocks keep their own appearance props.

## Editable Block Placeholder (Schema and instance fields)

Editable blocks declare a placeholder via `metadata.placeholder` on their
schema. The text is rendered by `PlaceholderPlugin` at runtime — see
`blockcraft-plugins-util.md` → "PlaceholderPlugin" for the rendering /
override APIs. A particular block can override the flavour-level configuration
with persistent `meta.plh`.

```typescript
import { BlockPlaceholderConfig } from "../../framework";

// String form — one placeholder for all states:
metadata: {
  // ...
  placeholder: '列表项',
}

// Object form — separate text per heading level on paragraph:
metadata: {
  // ...
  placeholder: {
    default: '输入"/"呼出菜单',
    heading: { 1: '一级标题', 2: '二级标题', 3: '三级标题' },
  },
}
```

### Per-block override

`IBaseMetadata.plh?: string` is the instance-level field. It persists through
Yjs and Snapshot import/export:

```typescript
// Set before insertion.
const snapshot = ParagraphBlockSchema.createSnapshot();
snapshot.meta.plh = "请输入摘要";
snapshot.meta.plhMode = "always";

// Update an existing mounted block.
block.updateMeta({ plh: "请输入摘要" });
block.updateMeta({ plhMode: "always" });
block.updateMeta({ plhMode: "focused" });
block.updateMeta({ plh: "" }); // Explicitly disable this block's placeholder.
block.updateMeta({ plh: null }); // Delete the key and restore fallback resolution.
```

`updateMeta()` accepts `null` as a deletion command for any metadata key; it
does not persist the null value. Once a Snapshot has been inserted, do not
assign `block.meta.plh` directly.

`meta.plh` deliberately accepts only a string. It does not duplicate the
Schema's heading map: when `plh` is absent, the existing Schema configuration
still resolves against `props.heading`.

**Plugin resolution order**:

1. Valid string `block.meta.plh` (`''` explicitly disables).
2. `PlaceholderPluginOptions.overrides[flavour]`.
3. `schema.metadata.placeholder`.
4. No placeholder.

Malformed persisted non-string `plh` values are ignored and fall through
without throwing or rewriting the document.

`plhMode` omitted (or `'focused'`) preserves focused-only behavior.
`'always'` displays a non-empty instance `plh` while the block is semantically
empty, including in readonly mode.

**Resolution rules** (`resolvePlaceholderText` pure helper, exported from
`framework/block-std/schema/block-schema.ts`):

| Config                                   | `props.heading` | Result                            |
| ---------------------------------------- | --------------- | --------------------------------- |
| `undefined`                              | any             | `''` (not rendered)               |
| `'foo'`                                  | any             | `'foo'`                           |
| `{ default: 'A' }`                       | undefined       | `'A'`                             |
| `{ default: 'A' }`                       | 1               | `'A'` (no matching heading entry) |
| `{ default: 'A', heading: { 1: 'H1' } }` | 1               | `'H1'`                            |
| `{ default: 'A', heading: { 1: 'H1' } }` | 2               | `'A'` (fallback to default)       |
| `{ heading: { 1: 'H1' } }`               | undefined       | `''` (no default)                 |

**Built-in defaults** (configured on shipped schemas):

| Flavour              | placeholder                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `paragraph`          | `{ default: '输入"/"呼出菜单', heading: { 1: '一级标题', 2: '二级标题', 3: '三级标题' } }` |
| `bullet` / `ordered` | `'列表项'`                                                                                 |
| `todo`               | `'待办事项'`                                                                               |
| `blockquote`         | _none_ (uses its own `::before` for the left quote rule)                                   |

`PlaceholderPlugin` targets `.bc-placeholder-target::before` on editable
blocks. Do not claim `::before` on the same target; place decorative chrome on
the host or a sibling.

> Without `PlaceholderPlugin` in the `DocConfig.plugins` array, the schema
> field is inert — nothing is rendered. The plugin is part of the default
> editor preset, so host apps usually do not need to wire it manually.

## Checklist

- [ ] Model interface extends `EditableBlockNative` or `NoEditableBlockNative`
- [ ] Schema has correct `flavour`, `nodeType`, `component`, `createSnapshot`
- [ ] Component extends correct base class
- [ ] Component uses `ChangeDetectionStrategy.OnPush` and `standalone: true`
- [ ] Selector follows pattern: `elementTag.flavour-name-block`
- [ ] Void blocks: `contenteditable="false"` on content
- [ ] Editable blocks: empty template + `[class.edit-container]` host binding
- [ ] Container blocks: `children-render-container` div in template
- [ ] Global type declarations in `declare global { namespace BlockCraft { ... } }`
- [ ] Schema exported from `blocks/index.ts`
- [ ] Schema added to `SchemaManager` constructor
- [ ] Visual blocks that need free positioning extend `IBlockProps` and declare `metadata.placement`
- [ ] Styles added in `themes/blocks/` if needed
