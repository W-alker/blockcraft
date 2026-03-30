# BlockCraft: Creating Blocks

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> For inline system internals, see L2: `blockcraft-inline.md`
> For Yjs data model, see L2: `blockcraft-data.md`

## Block Types

| nodeType | Base Class | Has Inline Text? | Has Children? | Template Pattern |
|----------|------------|-------------------|---------------|-----------------|
| `void` | `BaseBlockComponent` | No | No | Custom template with `contenteditable="false"` |
| `editable` | `EditableBlockComponent` | Yes (Y.Text) | No | Empty template, host has `edit-container` class |
| `block` | `BaseBlockComponent` | No | Yes | Template with `children-render-container` div |

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
  flavour: 'my-block';
  nodeType: BlockNodeType.void;
  props: {
    src?: string;
    caption?: string;
  };
}

// 2. Define the schema
export const MyBlockSchema: IBlockSchemaOptions<MyBlockModel> = {
  flavour: 'my-block',
  nodeType: BlockNodeType.void,
  component: MyBlockComponent,
  createSnapshot: (src?: string) => ({
    id: generateId(),
    flavour: 'my-block',
    nodeType: BlockNodeType.void,
    props: { src },
    meta: {},
    children: [],
  }),
  metadata: {
    version: 1,
    label: "My Block",
    icon: "bc_icon bc_my-block",
    // svgIcon: "bc_my-block-color",  // optional colored icon
  },
};

// 3. Declare global types
declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'my-block': MyBlockComponent;
    }
    interface IBlockCreateParameters {
      'my-block': [string?];  // matches createSnapshot params
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
  selector: 'div.my-block',
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
    if (this.doc.isReadonly) return;
    // Handle interaction...
    this.updateProps({ src: 'new-value' });
  }
}
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
  flavour: 'my-editable';
  nodeType: BlockNodeType.editable;
  // Add custom props if needed:
  // props: EditableBlockNative['props'] & { level?: number };
}

export const MyEditableBlockSchema: IBlockSchemaOptions<MyEditableBlockModel> = {
  flavour: 'my-editable',
  nodeType: BlockNodeType.editable,
  component: MyEditableBlockComponent,
  createSnapshot: editableBlockCreateSnapShotFn<MyEditableBlockModel>('my-editable'),
  metadata: {
    version: 1,
    label: "My Editable Block",
    icon: "bc_icon bc_my-editable",
  },
};

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'my-editable': MyEditableBlockComponent;
    }
    interface IBlockCreateParameters {
      'my-editable': EditableBlockCreateSnapshotParams;
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
  selector: 'div.my-editable-block',
  template: ``,  // Empty! InlineRuntime renders into host element
  standalone: true,
  host: {
    '[class.edit-container]': 'true',  // REQUIRED for InlineRuntime
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
  //   this.plainTextOnly  — set to true to disable rich formatting
}
```

---

## Template: Container Block

**`blocks/my-container/index.ts`**

```typescript
import { generateId, NoEditableBlockNative } from "../../framework";
import { BlockNodeType, IBlockSchemaOptions } from "../../framework";
import { ParagraphBlockSchema } from "../paragraph-block";
import { MyContainerComponent } from "./my-container.block";

export interface MyContainerModel extends NoEditableBlockNative {
  flavour: 'my-container';
  nodeType: BlockNodeType.block;
  props: {
    backgroundColor?: string;
    icon?: string;
  };
}

export const MyContainerSchema: IBlockSchemaOptions<MyContainerModel> = {
  flavour: 'my-container',
  nodeType: BlockNodeType.block,
  component: MyContainerComponent,
  createSnapshot: () => ({
    id: generateId(),
    flavour: 'my-container',
    nodeType: BlockNodeType.block,
    props: {
      backgroundColor: '#f5f5f5',
      icon: '📌',
    },
    meta: {},
    children: [ParagraphBlockSchema.createSnapshot()],  // Pre-seed with a paragraph
  }),
  metadata: {
    version: 1,
    label: "My Container",
    icon: "bc_icon bc_my-container",
    renderUnit: true,  // Standalone render unit
    includeChildren: ['paragraph', 'divider', 'bullet', 'ordered', 'todo'],
    // excludeChildren: ['table'],  // Takes priority over includeChildren
  },
};

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'my-container': MyContainerComponent;
    }
    interface IBlockCreateParameters {
      'my-container': [];
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
  selector: 'div.my-container-block',
  template: `
    <span class="container-icon" contenteditable="false">{{ props.icon }}</span>
    <div class="container-content children-render-container">
      <!-- Framework renders children here automatically -->
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.background-color]': 'props.backgroundColor',
  },
})
export class MyContainerComponent extends BaseBlockComponent<MyContainerModel> {
  // Optional: react to children changes
  override onChildrenChange(childrenIds: string[]) {
    // Called when children array changes
  }
}
```

---

## Registration Steps

### 1. Export from `blocks/index.ts`

```typescript
export { MyBlockSchema, MyBlockComponent } from './my-block';
```

### 2. Add schema to SchemaManager

```typescript
// Where schemas are constructed (usually in editor.ts)
const schemas = new SchemaManager([
  ParagraphBlockSchema,
  MyBlockSchema,  // Add here
  // ...
]);
```

### 3. Add styles (optional)

Create `themes/blocks/_my-block.scss` and import in the theme entry.

---

## BaseBlockComponent Key API

```typescript
// Properties (via Yjs proxy)
this.props              // Typed props object
this.meta               // Metadata object
this.model              // NativeBlockModel (full model)
this.yBlock             // Raw Y.Map

// Mutations (create undo history)
this.updateProps({ key: value })

// Mutations (no undo history)
this.setInitProps({ key: value })

// Navigation
this.childrenIds        // string[]
this.getChildrenBlocks() // BlockComponent[]
this.firstChildren      // First child block
this.lastChildren       // Last child block
this.getPath()          // Block path in tree
this.getIndexOfParent() // Index within parent

// Serialization
this.toSnapshot(deep?)  // IBlockSnapshot
this.textContent()      // Plain text

// Event binding (local to this block)
this.bindEvent('click', handler)

// Lifecycle
this.onViewInit$        // Subject (fires after view init)
this.onDestroy$         // Subject (fires on destroy)
this.hostElement        // HTMLElement
this.changeDetectorRef  // ChangeDetectorRef
```

## EditableBlockComponent Additional API

```typescript
this.yText                          // Y.Text
this.runtime                        // InlineRuntime
this.textDeltas()                   // DeltaInsert[]
this.textLength                     // number

// Text mutations
this.insertText(index, text, attrs?)
this.deleteText(index, length?)
this.replaceText(index, length, text, attrs?)
this.formatText(index, length, attrs)
this.applyDeltaOperations(delta)

// Cursor
this.setInlineRange(index, length?)

// Config
this.plainTextOnly = true           // Disables rich text (for code blocks)

// Events
this.onTextChange                   // Subject<void>
```

## DocChain: Block Operations

```typescript
// Insert after a block
doc.chain().insertAfter(existingBlock, 'my-block', ...params).run();

// Insert before
doc.chain().insertBefore(existingBlock, 'paragraph', 'Hello').run();

// Insert at specific position in parent
doc.chain().insert(parentId, index, 'my-block', ...params).run();

// Replace a block
doc.chain().replaceWith(blockId, 'my-block', ...params).run();

// Delete
doc.chain().deleteById(blockId).run();

// Chain multiple operations
doc.chain()
  .insertAfter(block, 'paragraph', 'New paragraph')
  .task(ctx => { /* custom async work */ })
  .setCursorAtBlock(newBlock)
  .run();
```

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
- [ ] Styles added in `themes/blocks/` if needed
