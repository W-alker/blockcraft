# BlockCraft: Creating Blocks

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> For inline system internals, see L2: `blockcraft-inline.md`
> For Yjs data model, see L2: `blockcraft-data.md`
>
> Last updated: 2026-09-21

通用数据描述和快照位于 `@ccc/blockcraft/framework/model`，类型为
`BlockDescriptor<P, M, F>` / `BlockSnapshot<P, M, F>`，默认不依赖组件注册表。
创建编辑器 Block 时仍使用原 `BaseBlockDesc`、`IBlockSnapshot` 与 Schema API；
`declare global { namespace BlockCraft { interface IBlockComponents { ... } } }`
继续限定编辑器快照的 flavour 和后代节点。新增通用快照类型不替代组件注册或 Schema 校验。

## Block Types

| nodeType   | Base Class               | Has Inline Text? | Has Children? | Template Pattern                                |
| ---------- | ------------------------ | ---------------- | ------------- | ----------------------------------------------- |
| `void`     | `BaseBlockComponent`     | No               | No            | Custom template with `contenteditable="false"`  |
| `editable` | `EditableBlockComponent` | Yes (Y.Text)     | No            | Empty template, host has `edit-container` class |
| `block`    | `BaseBlockComponent`     | No               | Yes           | Template with `children-render-container` div   |

## 仅限 root 直属子级的块

`IBlockSchemaOptions.metadata.rootOnly?: boolean` 由子块声明父级限制，省略时保持原行为。
`PageDividerBlockSchema` 设置 `rootOnly: true`，分页符只允许作为 `root` 的直属子级。
表格和填写区块（内容区域）不启用此限制，继续按父容器 Schema 和实例约束决定能否插入。
该限制优先于父容器的通配白名单和实例 `meta.incl`；root 自身的排除规则仍然生效。
插入菜单、转换、移动与 CRUD 使用同一 Schema 校验；插入的嵌套快照也会检查此限制。
固定工具栏和模板物料面板在嵌套块上不得向上寻找 root 插入分页符。旧文档加载不自动迁移或删除已有节点。

## Choosing Between Editable Text and Native Inputs

- Use `EditableBlockComponent` when the text is part of the document body and must participate in Yjs sync, undo/redo, IME, inline formatting, and cursor navigation.
- Use a native `input` / `textarea` only for **block-local property editing** inside `void` or `block` nodes.
- Native form controls now bypass the editor's input/hotkey/selection pipeline automatically.
- For non-form custom widgets that should behave the same way, add `data-bc-native-input` to the widget root.
- When a native field changes, commit through `updateProps()`, `setInitProps()`, or `DocChain` rather than trying to wire it into `InputTransformer`.

## File Structure

Each block needs at least 2 files in its own directory under `blocks/`. Add the
optional `agent/` directory only when a document Agent should understand this
flavour's business meaning or receive explicit create/write permissions:

```
blocks/
└── my-block/
    ├── index.ts          # Model interface + Schema + global type declarations
    ├── my.block.ts       # Angular component
    └── agent/            # Optional, declarative Agent contract
        └── index.ts
```

### Agent contract (optional, explicit opt-in)

Schema registration alone never authorizes AI creation or writes. If an
external Block should participate in `blockcraft-agent`, keep its declarative
contract beside the Block and export it from the Block package:

```typescript
// blocks/my-block/agent/index.ts
import {defineBlockAgentCapability} from '@ccc/blockcraft'

export const MY_BLOCK_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'acme.block.my-block',
  kind: 'block',
  flavour: 'my-block',
  schemaVersion: 1, // must match MyBlockSchema.metadata.version
  title: 'My Block',
  description: 'Displays one host-owned resource by URL.',
  domains: ['document', 'acme'],
  semanticRoles: ['resource-card'],
  createParameters: {
    type: 'array',
    minItems: 1,
    maxItems: 1,
    prefixItems: [{type: 'string', minLength: 1}],
    items: false,
  },
  writableProps: {
    type: 'object',
    properties: {caption: {type: ['string', 'null']}},
    additionalProperties: false,
  },
  examples: [{flavour: 'my-block', params: ['https://example.com/item']}],
})
```

```typescript
// blocks/my-block/index.ts
export * from './agent'
```

The host must then register that exported capability in a
`DocumentAgentHostExtension`; see `blockcraft-app.md`. The fields are separate
grants:

- omit `createParameters` to make the Block non-creatable by the Agent;
- omit `writableProps` to prohibit Agent property updates;
- list structured values such as `position`, `fill`, or an application-owned
  configuration record in `atomicProps` when they must be replaced as one Yjs
  value;
- keep `flavour`, the existing Schema `nodeType`, create parameters and
  `schemaVersion` aligned with the actual Schema. Do not invent another Block
  discriminator for the Agent;
- do not provide or register an `agent/` contract when the Block needs no
  AI-specific understanding. It remains visible as generic document data, but
  the Agent must not guess how to create it or which props are writable.

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
  backColor: "#FBF3DB",
  borderColor: "#DFAB01",
});

// `null` deletes the persisted override.
block.updateProps({ backColor: null, borderColor: null });
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
  p?:
    | number
    | [number]
    | [number, number]
    | [number, number, number]
    | [number, number, number, number]
    | null;
  bgi?: string | null; // url("paper.png") 50% 50% / cover no-repeat
  bgo?: number | null; // background layer opacity, 0..1
}
```

背景图片以一个 CSS shorthand 原子值保存：`bgi: 'url("paper.png") 50% 50% / cover no-repeat'`。
`stretch` 编码为 `/ 100% 100%`。不再保存 `bgs/bgx/bgy`；`bgo` 是独立透明度，
默认 1 时省略，缺少有效图片时也省略。旧裸 URL 和旧分散参数不兼容。
`normalizeBlockSurfaceProps()` 负责创建/导入时的校验与裁剪，`resolveBlockSurface()`
解码给渲染器；图片位置和透明度保留最多两位小数。`p` 仍是有界的运行时数值 shorthand，
与文字框边距模型一致，不把尺寸约束改成任意 CSS。`null` 表示通过 CRUD 删除属性。

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

### Idle Speculative Mount Safety

A direct-root text Schema can explicitly declare that its view is safe to
construct during idle prefetch:

```typescript
metadata: {
  version: 1,
  label: 'Plain note',
  virtualization: {
    speculativeMount: 'safe',
  },
}
```

`speculativeMount?: 'safe'` is a safety capability, not a request to mount the
Block. It is considered only when the host also sets
`DocConfig.virtualization.idlePrefetch: true`; the document option defaults to
`false`. The first release accepts safe text Blocks only when they are direct
root render units. It warms eligible roots within one projected viewport of the
current window before sweeping farther roots during later idle slices.
The audited built-ins are `paragraph`, `ordered`, `bullet`, `todo`,
`blockquote`, and `caption`.

Declaring `'safe'` promises that speculative construction is deterministic and
idempotent. Component initialization must not start network/upload work or media
decoding/playback, write Yjs/model state, emit notifications, change focus, or
register a global listener or other side effect that normal detach/destroy cannot
fully release. The speculative mount may be cancelled immediately, so
construction must be repeatable and reversible. Do not declare it for
tables, media/iframe/resource Blocks, asynchronous widgets, `keep-alive` views,
or container render units in this release. Those Blocks continue to use
model-only `estimateHeight()` until ordinary mounting supplies authoritative DOM
geometry.

Use `estimateHeight()` whenever model facts can provide a useful answer; reserve
`speculativeMount: 'safe'` for text layout whose final browser wrapping is worth
warming. The runtime keeps continuous-flow and sparse-pagination measurements
separate, and normal pagination already mounts the complete document through its
full-document lease.

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
`position: "x y"` string in its parent plane's layout pixels.
`storeBlockPosition({x, y})` quantizes coordinates to at most two decimals,
removes trailing zeros and negative zero; `resolveBlockPosition(value)` returns
runtime numeric coordinates and `parseBlockPosition(value)` returns null for
malformed/retired values. Drag previews retain full precision; commit, resize,
alignment, grouping, duplicate and HTML paths share the codec. Its optional
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

绝对定位层仍然保持零高度，不参与正文断行。`BlockPlacementManager.surface`
是内部视图协调器：用模型尺寸、旋转后的包围盒和绝对对象可见范围索引计算文档
下沿；流式根容器取正文自然高度与对象下沿加 padding 的较大值，移动或删除后可收缩。

对象保持 scrollContainer 内自由拖动，不限制到正文内容区，也不吸附纸张边缘或页缝。
Host 的 `left/top` 始终使用原始 `position`；切换视图不改变坐标。根级组合按外框估算范围，
成员保持组内坐标。分页屏幕和打印都把对象所需的额外页面纳入页数，不插入正文占位块。
拖动预览使用原始位移，只有松手时写入一次坐标事务；拖到新增页面时扩展预览纸面，
取消则撤销预览。打印保留对象坐标，纸张外的部分遵循现有分页裁切规则，不自动搬移对象。

尺寸和范围按模型/结构/宽度/修订可见性事件失效；已挂载根级对象使用单个共享
ResizeObserver 校正完整块的宽高（含 Caption），按内部 surface revision 更新可见范围。
调用方不应读取 `surface` 的内部状态作为持久数据或自行修改 root 的高度。

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

### Render-unit 响应式尺寸

`render-unit` 原生支持可选 `wr/ar`：宽度是正文内容区宽度的百分比，高度为宽度除以宽高比，与流式图片共用 `deriveObjectSizeFromPixels()`。
`RenderUnitBlockComponent.setSize(width, height)` 接收布局像素，在一个事务内换算比例并清理旧 `width/height`；`objectDimensions` 提供当前显示尺寸。
未设置完整有效尺寸时仍由内容自然撑高；不自动把旧容器变成固定尺寸。显式尺寸包含内边距，超出内容可滚动。
悬停或内部编辑时显示文本框同款顶部抓手聚焦按钮（`bc_caijian` 图标），点击或键盘激活后整块选中并显示八向手柄（无旋转）；整块选中后隐藏聚焦按钮，只读时不创建该按钮。CalloutToolbarPlugin 仅提供颜色入口，不显示宽高输入。
HTML 通过 `data-bc-wr/ar`（以及旧 `data-bc-width/height`）保留尺寸；私有 Markdown 保留 props。只读、协同、撤销和虚拟估高沿用框架路径。
背景默认仍透明，业务填写区的白底由宿主传入 `backColor`；框架不识别 `tplRegion` 等业务标记。

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
direct `object-group` child it is the group's full `props.width`; the external
selection frame does not reduce this sizing plane. Resolve live block
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
content plane. `BLOCK_OBJECT_GROUP_PADDING` (4 layout pixels) is only the
outward offset of the selection outline and drag edges, with zero host padding.
The full content box is always the member placement plane. Direct members keep
content-plane-local absolute `position`
and no independent under/over tier in either outer layout. `setLayer()`,
`moveForward()` and `moveBackward()` reject members, and their object toolbars
omit both representation/layout and independent stack controls. Nested groups
are rejected.

```typescript
const groupId = doc.placement.group(["image-id", "shape-id"]);
if (groupId) {
  const memberIds = doc.placement.ungroup(groupId);
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
absolute. Their available cap is the full page content height; the external
selection frame consumes no page space. Root absolute placement objects remain
unaffected.

`canGroup(ids)` requires at least two contiguous direct children of the root
`placement-layout`, all in the same `under`/`over` layer and all Schema-capable
for absolute placement. Grouping computes a rotation-aware visual union,
rebases every member into local coordinates and moves the existing block IDs;
it does not clone content. Ratio-sized images preserve their resolved pixel
frame by converting `wr` from root width to group width. `ungroup()` performs
the inverse conversion and restores root coordinates in one transaction. Here
"group width" means the full persisted `width`; the visual frame never changes
a responsive member's resolved pixel size. Existing snapshots use this same
semantics without a version marker or automatic legacy conversion, so old
groups may change their member size/position when rendered or reflowed.

Root absolute objects can be aligned without first creating a group:

```typescript
doc.placement.alignObjects(ids, "left");
doc.placement.alignObjects(ids, "center");
doc.placement.alignObjects(ids, "horizontal-distribute");
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
});
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

组合成员删除由 `DocCRUD.deleteBlocks()` 在原删除事务内调用内部的
`reflowAfterMemberDeletion()`，同时记录组合尺寸、原点、剩余成员局部坐标及
图片 `wr/ar` 的调整。键盘、工具栏及模型删除入口因此共享一次 Undo/Redo；
删除最后一个成员仍保留空组合。该内部桥接不要求宿主额外调用，也不依赖组件挂载。

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

### Unified Object Format Capability

Fixed visual objects opt in through Schema metadata. Capability defaults remain
readable semantic objects, while snapshots persist compact independent groups:

```typescript
const schema: IBlockSchemaOptions<MyObjectModel> = {
  // ...
  metadata: {
    objectFormat: {
      kind: "shape",
      features: {
        geometry: true,
        shape: true,
        pictureFill: true,
        lineArrows: false,
        textFrame: true,
        textStyle: "rich-default",
      },
      defaults: {
        width: 240,
        height: 120,
        rotation: 0,
        lockAspectRatio: false,
        shapeType: "rectangle",
        shapeFill: DEFAULT_OBJECT_PAINT,
        shapeOutline: DEFAULT_OBJECT_LINE,
        shapeEffects: DEFAULT_OBJECT_EFFECTS,
        textFrame: DEFAULT_OBJECT_TEXT_FRAME,
        textStyle: DEFAULT_OBJECT_TEXT_STYLE,
      },
      shapeTypes: ["rectangle"],
    },
  },
};
```

`BlockObjectFormatProps` 保留数值几何 `width/height/rotation`、`lockRatio`、`shape`，
外观按独立功能保存为顶层小组，不再保存 `effects/textFrame/textStyle` 大对象：

| 属性 | 编码示例 |
| --- | --- |
| `fill` / `textFill` | `"#FFFFFF"`、`"#FFFFFF / 0.5"` 或 `"none"`；渐变为 `linear-gradient(135deg, #fff 0%, #000 100%)`；图片为 `url("paper.png") 50% 50% / cover no-repeat` |
| `fillOpacity` / `textFillOpacity` | 渐变/图片整体透明度；默认 1 时省略，单个色标透明度使用 CSS `color-mix()` 保留独立控制 |
| `outline` | `"1px solid #333333 / 0.8"` 或 `"none"` |
| `lineEnds` / `arrows` | `"round bevel"` / `"none triangle"` |
| `shadow` / `textShadow` | `"45deg 2px 6px #000000 / 0.25"`，依次为角度、距离、模糊、颜色、透明度 |
| `glow` / `textGlow` | `"4px #4857E2 / 0.35"` |
| `textPadding` | `"18 22"`，布局 px，支持 CSS 顺序的一到四个值 |
| `textAlignment` | `"left top"`；不与段落 `textAlign` 混用 |
| `textDirection/textWrap/textAutoFit/textRotate` | 独立枚举/布尔值 |
| `textFamily` | 独立字体 ID/安全字体栈，不拼入位置字符串 |
| `textFont` / `textSpacing` | `"24px 700 italic"` / `"0.1em 1.5"` |
| `textOutline` / `textTransform` | `"1px #000000"` 或 `"none"` / 独立变形枚举 |

运行时 `ObjectFormatPatch`、`ObjectTextStyle`、`ObjectTextFrame` 等仍使用结构化参数。
`storeObjectLine/Effects/TextFrame/TextStyle()` 返回可展开到 props 的小组片段，
`storeObjectPaint()` 仅返回 CSS paint token；渐变/图片整体透明度由同组属性保存，
手工构造 props 必须展开 `storeObjectFormatSection("shapeFill", paint)`。最终持久化必须使用
`storeBlockObjectFormat(format, capability)`，或各块的 `normalize*SnapshotProps()`，
以所属块 Schema 的默认值裁剪小组。不要直接将完整 helper 结果作为最终快照。

未启用效果不保存颜色、模糊等参数；等于 Schema 默认值的小组省略。缺省表示继承，
`none` 表示明确关闭（例如 WordArt 默认启用阴影，关闭时必须保存 `textShadow: "none"`）。
关闭轮廓同时清除其端点与箭头组。Shape、TextBox 默认轮廓及 WordArt 默认文字轮廓宽度
统一为 `1px`；显式样式/预设宽度仍有效，允许范围仍为 `0..100px`。

所有实时、Snapshot Viewer、行内和导出投影统一用
`normalizeBlockObjectFormat(props, capability)` 解码。HTML 小组直接保存字符串，不再 JSON 编码填充。旧 `effects/textFrame/textStyle` record 不迁移、不兼容。
缺失或不合法的小组安全回落至所属块默认值，不写回文档。

数值写入精度不变：渐变/阴影角度、阴影模糊与距离、发光半径及内边距取整；
轮廓宽度按 `0.25px` 收敛；字号、字距、行高、透明度、停点及图片位置保留两位。
定位使用 `storeBlockPosition()` 保留两位；宽高、旋转及比例保持原精度。只读行内解码可用 `{preservePrecision: true}`，
它保留新格式中的合法精度，不是旧格式兼容开关。`OBJECT_FORMAT_SECTION_KEYS` 描述
每项结构化操作拥有的小组；manager 只写变化的小组，并用 `null` 删除默认组。

`ObjectTextFrame.margins` is `[top, right, bottom, left]` in layout pixels.
文字区域采用 Word/DrawingML 的两层模型：先由形状几何确定文字矩形，再向内
叠加用户四边 margins。`0` 表示不增加用户边距，不表示取消形状文字矩形；
它与外部文字环绕距离无关。

普通目录形状通过 `resolveAdjustedShapeTextInsets(shapeType, adjustments,
definition.textInsets)` 计算比例边界：矩形为零；圆角随 `radius` 变化；
椭圆、剪角矩形、三角形、平行四边形、梯形、单向/双向箭头和矩形/圆角气泡
使用对应的文字矩形。气泡按尾部方向避开尾部。其余目录形状回退到已有
`definition.textInsets`；自定义路径保留原有目录文字矩形，装饰文本框优先使用
artwork 登记的文字矩形。Live TextBox/Shape、Snapshot Viewer 和 Inline Shape
使用同一计算规则。公式适配现有 1000 单位路径，不改变已有形状轮廓、默认圆角
或尺寸缩放规则，不等同于 Word 的完整预设几何实现。

### Built-in Word-like Text Box

> The block and interaction model below remain relevant, but any flat style
> props or `TextBoxToolbarPlugin` examples are historical. Use the unified
> object-format capability and `ObjectFormatToolbarPlugin` above.

The bundled `text-box` flavour is a fixed-size container whose text remains in
ordinary paragraph/list/blockquote child Blocks. Register the Schema and its
object toolbar together with the placement infrastructure and the child
schemas your document allows:

```typescript
import {
  ParagraphBlockSchema,
  ObjectFormatToolbarPlugin,
  PlacementLayoutBlockSchema,
  TextBoxBlockSchema,
} from "@ccc/blockcraft";

const schemas = new SchemaManager([
  ParagraphBlockSchema,
  PlacementLayoutBlockSchema,
  TextBoxBlockSchema,
]);
const plugins = [new ObjectFormatToolbarPlugin()];
```

`TextBoxBlockSchema.createSnapshot(text?, props?)` always starts with a normal
paragraph, so Enter, IME, Y.Text collaboration and Undo use the same path as
document prose. Its exact child allowlist is `paragraph`, `bullet`, `ordered`,
`todo` and `blockquote`; nested media, tables and drawing objects are rejected.
Deleting the last child restores the framework's normal fallback paragraph.

`TextBoxBlockProps` uses fixed `width`, `height`, `rotation` plus the unified
`lockRatio/shape` 以及上述独立外观和文字小组。 It also
accepts the same optional flat numeric `adjustments` record as catalog Shape
geometry. Callout presets use `tailX` / `tailY` in the normalized `0..1000`
shape coordinate plane; the nearest frame edge determines whether the tail is
top, right, bottom or left. The names
stay concise by omitting redundant domain prefixes while remaining readable.
每个小组为独立原子值； old surface aliases such as `fo/bw/wm/wa/backColor/borderColor`
must not be used for new snapshots. `position` and `placementLayer` remain
independent and are present only while the text box is structurally absolute.
Defaults are `240 × 120`, rectangle, rotation `0`,
`textFrame.margins: [8, 12, 8, 12]`, a white fill and a black outline. Text
direction is `textFrame.direction: 'horizontal' | 'vertical-rl' |
'rotate-90' | 'rotate-270'`; the former compact `wm` field is not persisted.

`TEXT_BOX_PRESETS` is the 58-style gallery grouped into `office`, `quote`,
`sidebar`, `editorial`, `shape`, `bubble`, `note`, `culture`, `material` and
`vertical`. The source module uses compact authoring data internally, but
`TEXT_BOX_PRESETS` and `getTextBoxPreset()` expose only canonical
上述经过默认值裁剪的独立小组。 Preset IDs and catalog authoring keys never enter
snapshots.
`getTextBoxPreset()` falls back to `office-simple` for unknown ids. The former
`classic`, `no-fill`, `outline-r-*`, `rect-r-*` and `bubble-r-*` IDs are not
retained. Decorated entries store their artwork registry reference
in the separate `artwork` prop because hand-drawn borders, ribbons and multi-color
ornament are catalog decoration, not a user picture fill. Query the catalog with
`getTextBoxPresetsFor()` / `getTextBoxPresetCategoriesFor()`.

Those drawings live in a registry, not in the document. `artwork` holds the
`bc:<id>` reference; `getTextBoxArtwork()` / `resolveTextBoxArtworkSrc()` turn it
into inline SVG at render time. A URL returned by the host upload service lives
only in the user picture `fill`. The registry is the same idea as the Shape
catalog: `shape` names geometry plus `textInsets`, while `artwork` names a drawing plus
its own `textInsets`. Two
consequences follow. The drawing
never travels in a snapshot, a Yjs sync, an undo entry or an export, which is
worth 0.3–1.6 KB per frame. And the frame's text-safe area is a _fraction_ of the
frame, so it tracks whatever size the author drags. Canonical
`textFrame.margins` remain optical padding in layout px and stack inward from
that proportional safe area.

Decorated entries split work between catalog artwork and the editable
`outline`. Ordinary gallery ornament is surface paint with zero geometry inset;
`textFrame.margins` owns its editable safe area. A drawing that owns silhouette
geometry, such as a leader-line callout, provides proportional `textInsets` in
the artwork registry. Other bubble entries use real `ShapeKind`
callout/cloud/explosion geometry plus canonical `adjustments`, so they remain
one editable TextBox object rather than a visual composition. Live Block,
picker and Snapshot Viewer all resolve the same adjusted path and directional
text-safe area.

Two consequences are worth knowing before adding entries. The surface image is
clipped to the shape and the outline paints above it, so ornament can neither
bleed past the frame nor interrupt the border; picking a shape whose
`detailPath` already breaks the outline (`folded-corner`) is the only way to get
that reading. 非矩形形状先按几何及 adjustments 求得文字矩形，再叠加
`textFrame.margins`；不要直接把目录默认 `textInsets` 当作最终边距。
普通矩形的形状内缩为零。

Child spacing inside a frame uses `margin-block-end`, which resolves to the
document's usual `margin-bottom` under `horizontal-tb`. A caret that leaves the
fixed frame is **not** scrolled into view in either direction —
`SelectionManager.scrollSelectionIntoView()` only scrolls the document-level
container on its vertical axis. Use `normalizeTextBoxProps()` at render
boundaries and `normalizeTextBoxSnapshotProps()` at creation/import boundaries;
there is no second text-box-specific padding or image record.

The live Block and Snapshot Viewer render the selected Shape geometry as SVG.
A real decorative `<img>` is clipped by that geometry behind a padded child
viewport; non-rectangular shapes also contribute their resolved text rectangle.
Optional WordArt values style the ordinary child text without changing
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

> Flat Shape style props and `ShapeToolbarPlugin` examples in this historical
> subsection were removed; use the unified object-format fields above.

The built-in shape feature is a `shape` container block with zero or one
collaborative `shape-text` editable child. Register both schemas together:

```typescript
import {
  ShapeBlockSchema,
  ShapeTextBlockSchema,
  ObjectFormatToolbarPlugin,
} from "@ccc/blockcraft";

const schemas = new SchemaManager([
  // ...
  ShapeBlockSchema,
  ShapeTextBlockSchema,
]);

const plugins = [
  // ...
  new ObjectFormatToolbarPlugin(),
];
```

`ShapeBlockSchema.createSnapshot(shapeType?, text?)` accepts one of the 103
exported `SHAPE_KINDS`. `SHAPE_CATEGORIES` groups the same canonical
`SHAPE_DEFINITIONS` into the Word-like **矩形 / 基本形状 / 线条 / 箭头总汇 /
公式形状 / 流程图 / 星与旗帜 / 标注** catalog. `ShapeBlockProps` persists
width/height, `shapeType`, the unified paint/line/effects/text sections,
optional `rotation` in degrees and optional absolute `position` /
`placementLayer`. Fill supports explicit none, solid, linear-gradient and
picture modes through the CSS `fill` string and optional `fillOpacity`. Gradients
render as per-block SVG `<linearGradient>` defs in both the block component and
the inline shape Embed; `SHAPE_FILL_GRADIENT_PRESETS` ships the Word-like
built-in gallery and preset IDs are never persisted.
Catalogue SVG paths and categories are never written into Yjs or snapshots.
Parameterised catalogue shapes may additionally persist one flat numeric
`adjustments` record. Editable line/freeform geometry persists as one validated,
versioned compact path string in `customGeometry`; it is an atomic top-level Yjs prop,
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
categorized picker; shape blocks expose fill/outline/effects in the unified
object panel, while text boxes retain the change-shape control. Its dense icon-only cells expose names through CSES Tooltip and
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
therefore participates in collaboration and undo/redo while rotating visually
with its parent shape. Users can apply the normal inline font, size, color and
other character formatting. Its separate `pastePlainTextOnly` capability keeps
clipboard input textual: shape creation/import retains formatting attributes on
text inserts but drops non-break inline embeds, and paste consumes `text/plain`
before HTML, Markdown, internal-snapshot or file parsing.

持久化语法：`v1|width height|nonzero或evenodd|f:M…L…C…A…Z|s:M…L…`。
`f:` 表示填充路径，`s:` 表示只描边；每条路径必须显式以 `M` 开始，只接受绝对
`M/L/C/A/Z` 命令。它是经过验证的路径数据，不接受 SVG/XML 元素。运行时
`CustomShapeGeometry` 仍为节点对象，坐标继续保留最多三位小数；圆弧不会因存储而
转成贝塞尔近似。旧 JSON 字符串不再读取，也不做自动迁移。

无位移点击或拖回起点不提交，避免生成无效 Undo。`onGeometryCommit()` 与
`normalizeShapeSnapshotProps()` 会省略和当前预设（含 adjustments）一致的覆盖；
恢复预设时通过原有 placement/CRUD 事务写 `customGeometry: null` 删除属性，
撤销可恢复完整路径。预设比较只发生在提交/快照边界，不进入 pointermove。

The exported `CustomShapeGeometry` format owns a separate finite `width/height`
coordinate space and one to eight safe paths. A path accepts only `move`,
`line`, `cubic`, `arc` and `close`, with at most 512 commands and a 64 KiB serialized
ceiling. Use `serializeCustomShapeGeometry()` before writing and
`normalizeCustomShapeGeometry()` when reading external data. Built-in line,
elbow, curved-connector and scribble definitions use
`createDefaultEditableShapeGeometry()` only as an edit projection; old
snapshots stay catalogue-only until a handle gesture actually changes geometry.

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
changed yellow-node gesture, so untouched snapshots remain path-free. Across
the parameter and path modes, all 103 built-in Shape kinds are editable.

`ShapeRotateCommit`, `calculateShapeRotation()`, `rotateShapeVector()` and
`normalizeShapeRotation()` are exported for custom shape UI and testing.
Pointer cancel, Escape, window blur and component destruction restore the
pre-gesture transform without writing props.

`ShapeResizerComponent` also accepts optional `resizeCalculator`,
`previewMirror`, `rotationLabel`, `borderDraggable` and `scaleVariable` inputs. The defaults
preserve shape behavior. Fixed-size editable objects such as WordArt can reuse
the same handles while supplying their own resize policy; enabling
`borderDraggable` adds four invisible edge hit regions without covering the
object's editable interior.

The bundled fixed toolbar creates a shape through
`insertAbsoluteSnapshot()`, so the first persisted state is a direct child of
the root `placement-layout` with the default `over` tier. The nested
`shape-text` editing surface is visually part of the shape: it has no separate
border, outline, shadow, background or block margin.

`scaleVariable` 缺省为 `null`，原有形状/文本框/艺术字路径不变。显式传入无单位 CSS
倍率变量名（如 `--pc-scale`）时，手势开始读取一次基值；角手柄预览按宽度比更新倍率，
边手柄不改变倍率；取消、Escape、失焦和销毁恢复原内联值。调用方负责在
`resizeCommit` 中将尺度与几何写入同一事务。它不代替 `resizeCalculator` 的比例约束。

### 人员块：排版空间与内容尺度

`person-card` 使用形状块同款八向手柄。边手柄独立调整 `width/height`，字号、头像和
间距不变；四角通过 `calculatePersonCardResize` 保持宽高比，并同步修改整体倍率。
几何在 `doc.crud.transact()` 用户事务内交给 `doc.placement.updateObjectGeometry()`，
浮动位置、组合边界和 Undo 跟随同一操作。
天气、日期卡继续使用原有缩放，不继承人员块的排版策略。

`PersonCardModel.props` 新增紧凑的 `PersonCardTypographyProps`：

| 字段 | 含义 | 默认 |
| --- | --- | --- |
| `sc` | 无单位整体倍率，最多两位小数 | 新快照显式存 `1`；缺省代表旧版按宽度推导 |
| `fsr` | 横排字号：`"姓名 部门"` | `15 12` |
| `fsp` | 横排拼音字号：`"姓名 拼音 部门"` | `15 9.5 11` |
| `fsc` | 竖排字号：`"姓名 部门"` | `14 11` |

字号 shorthand 只保留非默认值，`-` 表示该位置使用默认，省略尾部默认项；例如 `fsr:"20"`
只覆盖姓名，`fsr:"- 14"` 只覆盖部门。全部默认时不存该字段，恢复默认通过 `null` 删除。
不存空对象或三种样式完整的默认配置。设计字号最多两位小数；实际字号为设计字号乘 `sc`。
宽高提交取整；面板字号最多一位小数，缩放百分比取整。内部手势保留浮点计算，松手才归一化。

`personCardFonts(style, props)` 返回当前样式的分组字段名、文字角色、默认值和生效值；
`storePersonCardFont(style, props, role, size)` 返回经过默认裁剪与精度收敛的字号更新。
`personCardContentScale(props, legacyScale)` 处理旧数据回退，
`PersonCardRenderComponent.contentScale` 提供当前生效倍率（只读 getter，非持久字段）。

三种样式的姓名、拼音和部门分行，长文本自然换行，长英文必要时断词。高度由用户设置。
卡片不显示溢出提示。切换样式保留倍率与各样式字号覆盖，恢复该样式默认外框（乘倍率并取整）。
恢复字号只删除当前样式的覆盖字段，不重置倍率。

`width/height` 是最终外框尺寸；除以 `sc` 可得缩放前的排版空间。新卡片不再从宽度反推
字号；旧快照缺少 `sc` 时仍按原宽度推导，首次通过手柄或配置面板编辑时固定倍率，不在读取时
批量迁移。新快照的 `sc:1` 具有格式标记含义，不能当冗余默认值删除。

宿主字号控件显示最终字号，写回时除以当前倍率：

```ts
const scale = block.contentScale;
block.updateProps({
  sc: Math.round(scale * 100) / 100,
  ...storePersonCardFont(block.props.style, block.props, 'name', displayedFontSize / scale),
});
// 恢复当前样式字号；不清除其他样式
const key = personCardFonts(block.props.style, block.props)[0].key;
block.updateProps({[key]: null});
```

调试台左侧“人员块排版”提供真实块示例及宽高、倍率、头像、分角色字号控件，直接操作 Yjs
文档。人员样式共用 SCSS 仅用于此块；正文由 `--pc-layout-width:100%` 接收外框宽度，
缩略图未设置此变量时仍使用设计宽度。

### Built-in Editable WordArt Block

> Flat WordArt style props and `WordArtToolbarPlugin` examples in this
> historical subsection were removed; use `textFrame`/`textStyle` and
> `ObjectFormatToolbarPlugin`.

The built-in `word-art` flavour is an `editable` block, not a container. Its
text is stored directly in the block's Y.Text and participates in the normal
Input/IME, collaboration and undo path; it never creates a `shape-text` child.
Register the Schema and object toolbar together:

```typescript
import { ObjectFormatToolbarPlugin, WordArtBlockSchema } from "@ccc/blockcraft";

const schemas = new SchemaManager([
  // ...
  WordArtBlockSchema,
  PlacementLayoutBlockSchema,
]);

const plugins = [
  // ...
  new ObjectFormatToolbarPlugin(),
];
```

`WordArtBlockSchema.createSnapshot(text?, props?)` defaults to `艺术字`.
`WordArtBlockProps` 保存固定几何及上述独立文字小组；不持久化结构化 `textFrame/textStyle`。
`normalizeWordArtProps()` clamps external values and
`resolveWordArtPresentation()` resolves portable CSS without accepting raw CSS
expressions. The bundled catalog contains 16 `WORD_ART_PRESETS`, 10 safe
`WORD_ART_FONT_OPTIONS` and 19 allowlisted `ObjectTextTransform` values;
`getWordArtPreset()` and `wordArtPresentationToInlineStyle()` are public.

The interaction is object/edit dual-state. Clicking text or blank space enters
its direct text surface; normal clicks inside an active editor keep native
caret placement. `selectionInteraction` declares `editingBoundary: 'always'`
and `escapeToFrame: 'always'`, so core Selection owns Enter into editing and
Escape back to whole-object selection. The hover/focus-revealed
`.word-art-block__object-handle` matches the text-box handle: it selects and
moves the object without intercepting the editable text surface. Whole-object
selection applies the existing `.word-art-block--object-selected` chrome hook,
which alone exposes the
resizer and object toolbar; text editing shows neither. Object movement also
remains available from the four invisible selected-border hit regions. The
bundled fixed toolbar inserts an absolute `over` WordArt near the saved
selection. Its **插入艺术字** control is a scrollable 16-card visual preset dropdown;
choosing a card applies that preset while creating the default `艺术字`,
navigates to its mounted view and selects all text. The unified object rail
exposes layout, size, text fill/outline/effects, typography, Transform, stack
order and deletion. Its range controls
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

Use `DOC_WEATHER_SERVICE_TOKEN` to provide a host `DocWeatherService` without
coupling BlockCraft to application weather clients. The block resolves this
service from `doc.injector`, matching the bookmark block's link-preview service
boundary. `query()` receives no argument for the live anchor and
`{ date: 'YYYY-MM-DD' }` for a fixed document-day anchor. Fixed-date results are
asynchronously written to `props.frozen` through a no-Undo Yjs transaction when
the block is writable; live results are never persisted.

### 天气布局与色调

`WeatherModel.props` 新增可选展示属性，`date/frozen` 和宿主天气查询契约保持不变。
旧数据省略 `style/palette` 时仍显示 160×42 的经典紧凑样式及原近黑字色。
`WEATHER_STYLES` 通过现有 `MaterialStyleSet` 注册 `classic / inline / ruled / sidebar / card / stack / ledger`；
新布局默认跟随文档字色、透明底色，换布局会重置为该档固定宽高，等比缩放仍只写几何属性。

| 属性 | 值与语义 |
|---|---|
| `style` | `classic`（默认）、`inline` 行内组合、`ruled` 双线横栏、`sidebar` 侧线标记、`card` 基础信息卡、`stack` 纵向组合、`ledger` 气象分栏 |
| `palette` | `document / ink / blue / green / clay / dark`；省略保留旧经典配色，新布局跟随文档 |
| `fg / accent / line / bg` | 文字、强调、线条、背景 CSS 色；显式值覆盖色调，`null` 清除覆盖，`transparent` 是有效背景值 |
| `iconMode` | `original`（默认）/ `mono`（随强调色）；保留原有天气图形 |
| `range` | `on`（默认）/ `off`；经典紧凑始终不显示高低温，其他布局隐藏时保持固定框 |
| `bw / bc` | 既有外框线型与颜色，保持原契约；`line` 控制新增布局内部线条 |

渲染变量在 `.tpl-weather-chip` 及其内层使用 `--wt-fg / --wt-accent / --wt-line / --wt-bg`；
`--u` 仍由固定宽度推导。天气展示组件没有请求与模型写入；色调、高低温或图标变化不重设尺寸。
默认编辑器通过 `WeatherToolbarPlugin` 在天气块选中时提供浮动设置；自定义 Doc 可按需注册。
宿主可复用 `WEATHER_DISPLAY_CONFIGS` 作为物料 `displayConfigs`，或嵌入
`WeatherSettingsComponent` 并传入 `block`。面板先本地预览，点应用时把改过的字段作为一次事务提交，
模板态写入 `draft:*`（清空使用空串覆盖），普通文档写 props；取消不写入。组件发出 `apply/cancel`
供浮层宿主关闭，并在提交前检查只读和块存活状态。使用 `weatherPalettePatch(id)` 可在同一事务中
切换色调并清除 `fg/accent/line/bg` 覆盖；随后可单独设置透明底色。只改 `palette` 则保留显式覆盖。

```typescript
// 原有天气块无需迁移。主动启用新样式：
block.doc.crud.transact(() => block.updateProps({style: 'ledger', ...weatherPalettePatch('blue')}));
// 宿主面板原来的 fg/bw/bc 配置可替换成完整清单：
displayConfigs: WEATHER_DISPLAY_CONFIGS
```

模型快照与私有 HTML/Markdown 适配继续保留展示 props；通用可移植导出仍遵循原有天气文本占位契约。
导出完整视觉时使用已渲染的只读文档/打印路径。宿主升级包与接入其专属物料面板是独立步骤。

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

| Flavour                        | `selectionScope`                             |
| ------------------------------ | -------------------------------------------- |
| `root`                         | `document`                                   |
| `table`                        | `table`                                      |
| `columns`                      | `columns`                                    |
| `callout`                      | `container`                                  |
| `text-box`                     | relative `transparent`; absolute `container` |
| `mermaid` / `mermaid-textarea` | `transparent`                                |

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

When a block should remain manually formattable but paste must never import
HTML, Markdown, internal snapshots, files or their inline attributes, declare
the independent Schema capability:

```typescript
metadata: {
  pastePlainTextOnly: true,
}
```

`pastePlainTextOnly` affects only clipboard ingestion. It does not make the
block `plainTextOnly`, so fixed/floating formatting commands remain available.
The built-in `shape-text` block uses this split contract.

Editable rich-text blocks also accept compact paragraph typography props:

| Prop  | Unit / range     | Meaning                                                |
| ----- | ---------------- | ------------------------------------------------------ |
| `pfs` | ratio, `0.5..3`  | Paragraph base font scale; missing/`null` inherits `1` |
| `lh`  | unitless, `1..3` | Paragraph line-height ratio; missing inherits the root |
| `psb` | pt, `0..120`     | Space before                                           |
| `psa` | pt, `0..120`     | Space after; missing inherits `--bc-segments-gap`      |

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
    order: number;
    start?: number | null;
    ms?: OrderedMarkerStyleId | null;
  } & IEditableBlockProps;
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

## Mermaid 全屏双向编辑

Mermaid 保持 `mermaid` 容器与 `mermaid-textarea` 子块结构。源码仍是唯一持久数据；普通模式使用现有 SVG 预览，全屏可写模式才动态加载 `@visimer/core` / `@visimer/dom` 1.1.2。

- `mermaid-visual-session.ts` 是块内部适配层，不是公开包 API。图形操作按文本区间增量修改，通过 `replaceText` 与同一个 DocCRUD 事务写入；撤销/重做归 DocUndoManager。
- 退出全屏前提交未到防抖时间的标签输入，并销毁交互实例。只读、销毁或源码外部更新不回写过期输入；外部更新会取消旧的图形标签会话。
- 原源码编辑器、快照结构和 Markdown 导入导出保持原样。可视化编辑能力取决于上游支持的图表类型；不支持的语法仍可从源码编辑。
- 适配层使用文档已有 Mermaid 配置，禁止画布重新初始化全局 Mermaid 配置。普通预览与全屏画布不能同时负责渲染。

全屏交接保留上一次成功 SVG：普通渲染不向 Mermaid 提供可见容器，只有成功且源码仍匹配时才替换。全屏画布首次成功前保留普通预览；退出先转移原始 SVG，再释放实例。可见性恢复即重新检查预览，不依赖显示模式变化。

协同边界：没有节点锁，同一标签同时修改按 Yjs 文本合并；远端更新到来时取消旧的未提交标签输入并提示。销毁后的异步渲染结果必须按 mount 代次拒绝，避免上游重新创建 Observer。

## 有序列表的显式跨段续号

`OrderedBlockModel.props.continuePrevious?: boolean` 表示接续同父容器、同缩进和标题级别的最近前段列表。
由 `OrderedBlockPlugin` 按模型顺序重算，可跨非有序块，但不跨更浅缩进或相关标题边界。
正数 `start` 优先；缺省/false 保持普通列表默认断组规则。菜单“继续编号”同时写入
`{start: 0, continuePrevious: true}`，“重新编号”写入 `{start: 1, continuePrevious: false}`。
该字段随原生文档 props 持久化；`createSnapshot` 新建后继项不继承计数状态。
HTML/Markdown 使用输出编号表达结果，不承诺保留动态跨段接续意图。


## 日期卡片：字体与分样式字号

`DateCardModel.props.ff` 使用公共 `TYPOGRAPHY_FONT_FAMILIES` 的字体 ID；缺省跟随文档。
`DateCardTypographyProps` 的七个可选字段 `fsCalendar/fsSquare/fsBanner/fsMinibar/fsTicket/fsStamp/fsFlip`
分别保存对应样式的三个字号，顺序为日号、主行、副行。单位是未缩放的设计像素；
`DateCardRenderComponent.contentScale` 用于显示字号与设计字号之间的换算。

- `dateCardFonts(style, props, format?)` 返回 `role/key/label/size/fallback/visible`。
  `visible` 仅用于面板显隐，格式切换不删除隐藏行设置。
- `storeDateCardFont(style, props, role, size)` 生成 `updateProps()` 补丁；默认值用 `-` 占位，
  删除尾部默认值，整档恢复默认返回 `{[key]: null}`。不跨样式覆写。
- `DATE_CARD_FONT_KEYS` 列出七个字段，宿主的模板配置目录应声明为内部、可省略默认值的配置。
- 普通文档通过 transaction + `updateProps()` 写入；模板宿主写 `draft:ff` / `draft:<字号字段>`，
  建档时转为正式 props。若已有正式字号，恢复模板默认须写空字符串覆盖，避免移除 draft 后重新继承旧值。
- 日期卡模板负责将字体和 `--dc-font-day/primary/secondary` 投影到内壳；七种样式复用原 `--u`
  等比缩放。未设置的文档保持原字号、字重、几何与颜色。

```ts
const patch = storeDateCardFont(block.props.style, block.props, 'day', displaySize / block.contentScale)
doc.crud.transact(() => block.updateProps(patch))
```


### 日期卡片独立设置（无需宿主侧栏）

`DateCardRenderComponent` 自带右上角 28px 齿轮图标按钮（右边距 12px、顶部 4px，悬停/选中/键盘聚焦显示），保留“日期设置”无障碍名称，也可双击卡片打开 CDK 浮层。
支持样式、显示内容、字体、分层字号、文字/主色 `fg`、背景 `bg`、边框色 `bc` 和线型 `bw`。
取色器支持预设、自定义色和透明度；清空颜色恢复样式默认（与显式透明不同）。
浮层先本地预览，点击应用以单个 Yjs 事务提交修改字段；取消/Esc 不写模型。

普通文档写 props；已处于 draft 投影的模板写对应 `draft:*`，恢复默认时按原始 props 决定删除或用空字符串覆盖。
不更改 `date` 和日期来源，颜色/字体修改不重置固定宽高；切换样式/显示内容沿用既有几何规则。
浮层只在打开期间订阅只读状态，关闭时解除；删除、卸载或转只读立即关闭。打印/只读渲染没有设置按钮。
宿主已有面板可继续使用原字段，不需要注册新插件。
