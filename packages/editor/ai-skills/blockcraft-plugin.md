# BlockCraft: Creating Plugins

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> For configuring existing built-in plugins, see `blockcraft-plugins-ref.md`.
> For event system internals, see L2: `blockcraft-event.md`.
>
> Last updated: 2026-11-11

## 文档右键菜单装配

`ContextMenuPlugin` 的运行时名称为 `context-menu`，bundled 已注册，不要重复追加。
手动宿主可注册 `new ContextMenuPlugin()`；不注册时保持原有行为。
菜单仅在文档内容区域接管右键，原生输入控件、按钮、链接保持原有行为。
菜单使用 CDK Overlay，关闭/销毁清理监听；不更改通用 Selection/Input 事件默认行为。
详细能力及 ClipboardManager 命令入口见 `blockcraft-plugins-util.md`。

## 插件声明交互配置（未发布）

插件通过纯数据 `interactionConfigs` 声明配置，不修改 Doc 核心字段清单或调试台。每个声明有独立 namespace，允许一个插件提供多个声明。用 `defineInteractionConfig()` 校验、复制并冻结声明，在模块级导出，避免初始化时依赖 `this.doc`。

```typescript
import {DocPlugin, defineInteractionConfig} from '@ccc/blockcraft';
import {Subscription} from 'rxjs';

export const MY_INTERACTION = defineInteractionConfig({
  namespace: 'myFeature',
  label: '我的插件',
  fields: {
    showEntry: {type: 'boolean', label: '显示入口', default: false, presets: {design: true}},
    delay: {type: 'number', label: '显示延迟', default: 100, min: 0, max: 1000, integer: true, experiences: {light: 650}},
    side: {type: 'select', label: '入口位置', default: 'left', options: [
      {value: 'left', label: '左侧'}, {value: 'right', label: '右侧'},
    ]},
    caption: {type: 'text', label: '入口名称', default: '工具', maxLength: 20},
  },
});

export class MyFeaturePlugin extends DocPlugin {
  override name = 'my-feature';
  override readonly interactionConfigs = [MY_INTERACTION];
  private subscription?: Subscription;
  init() {
    this.subscription = this.doc.interaction.policyChanges$.subscribe(() => {
      const config = this.doc.interaction.get(MY_INTERACTION); // 类型化、只读值
      // 用 config.showEntry / delay / side / caption 更新自己的入口。
    });
  }
  destroy() { this.subscription?.unsubscribe(); }
}
```

宿主传 `interaction.overrides.plugins.myFeature`；解析优先级为字段 default → 当前 preset 字段值 → 当前 experience 字段值 → 用户覆盖。`boolean`、`number`、`select`、`text` 的值分别为布尔、有限数值、选项字符串、文本字符串。数值支持 min/max/integer，文本支持 maxLength；默认值、每个预设值和每个体验档位值也受相同校验。`experiences` 可选键为 focus/light/mixed/layout/design；未声明的档位继承基础 preset。插件只读取有效值，不分支判断档位名称。未知字段、未注册命名空间和非法值拒绝，`native` 为保留命名空间。

Doc 构造时收集 `DocConfig.plugins[]` 全部声明，再解析初始配置，因此任一插件 init 都能读取其他已声明配置，不受初始化顺序影响。后装插件在 `register(doc)` 内、事件注册及 init 前登记；同一实例的声明登记幂等，不表示可重复调用 register/init。不同插件占用同一 namespace（即使字段相同）会抛 TypeError，整批声明原子失败；活动输入/手势或 Doc 已销毁时后装登记抛 Error。

`get()` 必须传实际注册的声明对象，不接受复制对象或同名伪造声明。可从导出的声明获得类型推断；需要按字符串遍历时使用 `policy.plugins[namespace]`。`definitions` 提供冻结的表单元数据，`presets` 提供当前实例完整三模式预设，`experiences` 提供完整五档策略；后装插件也自动继承当前体验。Playground 按 definitions 自动生成控件，未安装插件不显示。

注册表属于 Doc，无进程级共享状态；随 Doc 释放。目前无独立插件卸载协议，手动调用 plugin.destroy() 不删除声明；后装插件应先注册，再设置覆盖。配置不能替代只读/锁授权，不自动安装插件，也不把插件构造参数自动并入交互配置。

## Plugin Lifecycle

```
DocConfig.plugins[] → 收集交互声明并解析初始配置 → plugin.register(doc) → registerClassEvents() → plugin.init()
                                                                                              ↓
                                                          doc.destroy() ← plugin.destroy() ←──┘
```

1. Framework calls `register(doc)` — ensures interaction declarations are registered, sets `this.doc`, wires `@EventListen`/`@BindHotKey` decorators
2. Framework calls `init()` — your setup code runs
3. On doc destruction, framework calls `destroy()` — your cleanup code runs

## 通用对象移动的装配顺序

对象本体移动使用框架 `ObjectDragPlugin`，无需宿主复制实现。
手动装配顺序为 `ObjectFormatToolbarPlugin` → `ImgToolbarPlugin` → `ObjectDragPlugin`，
让组合首击、Shift 多选和专属对象交互先处理。默认 bundled 装配已按此顺序注册，
不要重复追加；每个文档仍必须使用独立实例。能力与控件避让契约见
`blockcraft-plugins-block.md` 的 ObjectDragPlugin 节。

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

`name` is a runtime identity, not a display label. Every Plugin instance in one
Doc must have a stable, unique name. The full reference-editor factory calls
`validateBundledEditorCapabilities()` and throws before Doc construction when
two Plugins share a name; do not inherit the base `"custom"` name in a
production Plugin.

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

## Headless Plugin Pattern

A Plugin does not need Angular components, Overlay or DOM ownership. Keep the
domain/controller layer headless when multiple hosts may provide different
review, toolbar or mobile UIs:

```typescript
const revisionReview = new RevisionReviewPlugin()

const doc = new BlockCraftDoc({
  ...config,
  plugins: [revisionReview],
})

revisionReview.state$.subscribe(state => {
  // Bind state.items/current to any host UI. This callback performs no editor
  // mutation until the host explicitly invokes a command.
})

revisionReview.activateRevision(revisionId)
revisionReview.readContent() // exact model-only type/text fragments
revisionReview.keep()   // accept/redecide the whole revision group
revisionReview.revert() // reject/redecide the whole revision group
```

The optional default UI stays outside the Plugin boundary. Bind
`RevisionReviewPanelComponent` to the same headless instance and forward its
`RevisionReviewIntent` values to `RevisionReviewUiController.handleIntent()`.
The controller may also be attached to the document scroller to open the
default marker popover. A custom host can replace either component while
retaining the same Plugin state and commands.

Headless Plugins should:

- depend on model/domain services rather than DOM attributes or geometry;
- expose readonly state and explicit commands;
- avoid role/permission policy when that belongs to the host;
- recompute indexes only on the owning domain's change stream, not input,
  selection or rendering hot paths;
- keep `init()` / `destroy()` subscription ownership symmetric.

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
| Model-first object selection + connected mixed format panel | `ObjectFormatToolbarPlugin` | `plugins/object-format-toolbar/` |
| Reversible layout controller | `PaginationPlugin` | `plugins/pagination/` |
| Headless domain command/state layer | `RevisionReviewPlugin` | `plugins/revision-review/` |


`MaterialToolbarPlugin` 是按日期、天气、人员块类型订阅选区并打开连接浮层的实现示例，见
`blockcraft-plugins-toolbar.md`。其原生输入取焦不会重新写入选区；插件保留操作目标与
选中外观，关闭时释放；设置面板先预览，应用时通过块 API 写入。

## 行内天气插件装配

`WeatherInlineExtensionPlugin`（`weather-inline-extension`）是零配置插件，
由 bundled factory 每个 Doc 新建。它只提供行内天气格式配置；取数归宿主模板实例化。
自组装时与 `weather` converter/adapter 一起注册。只读或锁定块不能打开/应用配置，
关闭和 destroy 清理 overlay 订阅。详见 `blockcraft-plugins-inline.md`。

## 行内人员插件装配

`PersonInlineExtensionPlugin`（`person-inline-extension`）由 bundled factory 每个 Doc 新建。
自组装时与 `person` converter / `personEmbedAdapters` 一起注册。仅编辑显示格式，
建档时的数据投影由宿主调用 `materializeInlinePersonSnapshots(snapshots, creator)`；
不触及现有 MentionPlugin 或人员卡片的行为。详见 `blockcraft-embed.md`。
