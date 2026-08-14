# BlockCraft: Creating Blocks

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> For inline system internals, see L2: `blockcraft-inline.md`
> For Yjs data model, see L2: `blockcraft-data.md`
>
> Last updated: 2026-08-15

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
direct root child is relative flow, and a direct child of `placement-layout` is
absolute. An absolute child persists one atomic `position: {x, y}` object in
root-content layout pixels. Its optional `placementLayer: 'under'` is stored
separately; omission means `over`. A relative child persists neither field.
There is no persisted `mode` or `unit`. The base block host applies
`position/left/top` only to structurally absolute, Schema-capable children.
Standard absolute placement is root-only. The manager moves absolute objects
under one hidden `placement-layout` at the end of `root.children`:

```text
root
├─ paragraph
├─ image                 # relative / top-bottom
└─ placement-layout      # infrastructure, zero height
   ├─ image              # absolute
   └─ shape              # absolute
```

The renderer uses explicit non-negative tiers: background, `under` (`0`),
ordinary flow children (`1`), then `over` (`2`). This keeps an under block above
the page background and an over block above text and media regardless of DOM
order. The layout creates no stacking context and does not intercept pointers.
Stale position props on a flow-only Schema are cleared. A nested object cannot
enter absolute placement in this phase. The infrastructure Schema accepts
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
ID. If the root layout already exists, it appends the object there. If no
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

| State        | Label        | Icon                    |
| ------------ | ------------ | ----------------------- |
| `inline`     | 嵌入型       | `bc_fuwenben-qianruzuo` |
| `top-bottom` | 上下型       | `bc_fuwenben-shangxia`  |
| `under`      | 衬于文字下方 | `bc_cengji-xia`         |
| `over`       | 浮于文字上方 | `bc_cengji-shang`       |

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

### Root-Relative Object Sizing

Use Schema `objectSizing` for image-, video- or iframe-like blocks whose width
must follow the root content box:

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

`wr` is the percentage of the root children content width; `ar` is
`width / height`. Resolve dimensions through the document-owned manager:

```typescript
const dimensions = this.doc.objectSizing.resolve(this.flavour, this.props);
// null until a responsive root width is measurable
```

The exported pure helpers `normalizeObjectSize()`,
`resolveObjectDimensions()` and `deriveObjectSizeFromPixels()` are available to
model-only renderers and adapters. They clamp `wr` to `[1, 100]`, reject invalid
ratios and report whether dimensions came from `ratio`, `legacy` or `default`.
Do not add a `ResizeObserver` per block or read root geometry during change
detection.

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
outline. Use `normalizeTextBoxProps()` at creation/import boundaries and
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

`TextBoxToolbarPlugin` separates child text editing from whole-object
selection. Enter or double-click enters text; Escape selects the frame. Its
object toolbar is semantic and preset-first: **样式**, **形状** and
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
only width/height, `shapeType`, fill, outline, text color/alignment, optional
`rotation` in degrees and optional absolute `position` / `placementLayer`; SVG path and catalog category are
never written into Yjs or snapshots. `normalizeShapeProps()` validates the
expanded union and returns a finite rotation normalized into `[0, 360)`.

`ShapeDefinition` stores the trusted main `path`, optional stroke-only
`detailPath`, `textInsets`, and optional `fillable` / `supportsText` /
`fillRule` rendering capabilities. The eight built-in line and connector
appearances are non-filled, do not expose a shape-text editor, and keep the
existing resize/rotation behavior; they are visual objects, not auto-snapping
semantic connectors. `ShapeIconComponent` renders the same main and detail
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
caret placement. Enter also enters editing, while Escape returns to the
whole-object selection. Object movement starts only from the four invisible
hit regions on the visible outline—there is no separate move handle. The
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
cross-parent selection via `metadata.selectionScope`.

```typescript
metadata: {
  // ...
  selectionScope: 'container',
}
```

Supported values:

| Value                   | Meaning                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `document`              | Top-level document scope; normally only `root` declares this.                       |
| `table`                 | Closed table scope. Descendants share one table selection domain.                   |
| `columns`               | Layout scope whose child columns are transparent to text selection.                 |
| `container`             | Closed generic container scope such as callout/highlight.                           |
| `transparent` / omitted | This block does not create a scope; descendants inherit the nearest ancestor scope. |

Built-in declarations:

| Flavour                        | `selectionScope` |
| ------------------------------ | ---------------- |
| `root`                         | `document`       |
| `table`                        | `table`          |
| `columns`                      | `columns`        |
| `callout`                      | `container`      |
| `mermaid` / `mermaid-textarea` | `transparent`    |

`SelectionManager` reads this field through the registered schema. Do not add
flavour-specific checks in input, toolbar, or selection-class code; derive
behavior from the resolved scope / `SelectionScopePolicy` instead.

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

Editable rich-text blocks also accept compact `lh?: number | null`, a bounded
unitless line-height ratio. Missing values inherit the document root.
`TextToolbarHelper.updateBlockProps({lh})` applies it across the model-owned
covered block IDs in one Yjs transaction, including unmounted middle blocks;
plain-text-only/non-editable blocks are skipped.

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
