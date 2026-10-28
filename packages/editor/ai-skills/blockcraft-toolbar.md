# BlockCraft: Creating Toolbars & Overlay UI

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Last updated: 2026-10-28

## 模板浮层的点击固定

`BcOverlayTriggerDirective.openOverlay(persistent = false)` 支持显式传入 `true`，
立即打开并保持浮层；已由悬停打开时复用原浮层，同时取消待执行的离开关闭。
此模式下鼠标移出不关闭，点击触发器、菜单及同一 binding family 的子菜单均保留浮层。
点击外部、Escape、窗口失焦、禁用、`closePanel()` 或指令销毁会关闭并清理临时监听。
默认 `openOverlay()` 和模板悬停入口的延时及离开关闭行为保持不变。
模板浮层监听根触发器和当前触发器的祖先滚动，不要求容器注册 `CdkScrollable`。
定位在 Angular 区域外按动画帧合并，子菜单跟随父菜单同步移动；忽略无关区域滚动，
关闭时移除监听并取消待执行帧。

BlockController 点击完成整块/多段选择后使用此模式，并锁定当前抓手定位。
菜单关闭、目标失效、文档只读或真正开始拖拽时解除固定；仅按下抓手不关闭菜单。

## 对象动画设置面板（未发布）

`ObjectFormatToolbarComponent` 在现有侧边 rail 中内嵌 `ObjectAnimationSettingsComponent`。
其他可浮动对象由 `ObjectFormatToolbarPlugin` 使用内部 `ObjectAnimationToolbarController` 打开块侧边的 Connected Overlay。
两者都使用 `bc_icon bc_donghua` 独立 tab，设置组件共用；对象租约和选中外观随浮层关闭释放。
面板动态展开配置后通过 ResizeObserver + 合并 rAF 重新定位；CSES 下拉取焦归属遵循既有对象工具栏规则。
设置和播放调用 `doc.objectAnimation`，UI 不访问 Yjs，不直接修改定位/缩放样式。
草稿仅存在面板组件内，调整后合并 180ms 自动预览，确定时提交一次事务并结束对象编辑选区；关闭、切换 tab 或销毁时清理待播计时器和临时预览。
工具栏使用 `doc.objectAnimation.acquireEditingLease(ids)` 保持目标及相关组合静态，关闭时释放；`stopPreview()` 不会停止其他对象的已保存动画。


## 文本与段落设置入口

右键菜单与固定工具栏共用内部 `TypographySettingsController`，复用已有设置弹窗与
`ToolbarSelectionSession`。设置目标、只读检查、字体/段落事务和取消恢复统一处理；
右键入口无需固定工具栏组件。字体、段落数据格式与原工具栏入口保持兼容。
浮动文字工具栏的 350ms 延迟不变。

## 只读全局菜单

`createGlobalOverlay()` 的选项新增 `allowReadonly?: boolean`，与 connected overlay 一致。
默认仍在只读时关闭；显式设 true 可保留复制等只读操作。调用方自行禁用写入动作并在执行时复查。
`ContextMenuPlugin` 使用此选项，在只读文档中提供复制/全选。

## 固定工具栏引用输入面板

固定工具栏链接／公式输入通过 `doc.overlayService.createConnectedOverlay()` 托管，
退出时释放订阅和虚拟视图租约；Escape、遮罩、只读切换及宿主销毁都走同一关闭路径。
打开前用相对选区书签保存位置，提交前重新解析并检查可编辑性；输入控件不能覆盖插入光标。
`LinkInputPad.showTextInput` 缺省 `false`，保留浮动工具栏原有 URL-only 行为和
`onConfirm: EventEmitter<string>` 契约；固定工具栏的空光标插入启用显示文本输入，
通过 `textValue` 读取文本。浮动工具栏在原生输入框获焦后关闭时，链接面板继续持有
相对书签；确认检查文档和块的有效性／只读状态，不依赖已销毁的工具栏实例。公式继续复用 `FormulaBlockToolbar`，不新增公式数据格式。

## Overlay Service

`DocOverlayService` 的实现归属 `framework/angular/overlay.service.ts`，旧 services 路径转导出
同一个类；`doc.overlayService` 与主入口导入方式不变。Overlay 是 Angular/CDK 接入能力，
不放入纯宿主 ports，也不为它单独增加 npm 入口。

All floating UI in BlockCraft uses Angular CDK Overlay via `doc.overlayService`. Two main patterns:

### 1. Connected Overlay (Anchored to Element or Block)

```typescript
const { componentRef, overlayRef } =
  this.doc.overlayService.createConnectedOverlay<MyComponent>(
    {
      target: anchorElement, // HTMLElement to position against
      component: MyComponent, // Angular standalone component
      positions: [
        // Try these positions in order
        getPositionWithOffset("top-left", 0, 8),
        getPositionWithOffset("bottom-left", 0, 8),
      ],
      backdrop: false, // Optional: add a click-outside backdrop
      clampTo: fullscreenHost, // Optional authoritative clamp rectangle
    },
    closeSubject$,
    closeCallback,
  );

// Pass data to component
componentRef.setInput("doc", this.doc);
componentRef.setInput("myData", someData);

// Listen to component outputs
componentRef.instance.myEvent
  .pipe(takeUntil(closeSubject$))
  .subscribe((value) => {
    /* handle */
  });
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
document scroller. Before translating a pane back into that boundary, the service
tries the first configured position that fits both the boundary and browser
viewport. This lets an above/below toolbar flip sides instead of covering its
anchor. The caller's position order is preserved for subsequent updates; if no
candidate fits, the existing size limits and final clamp remain the fallback.
Connected overlays follow scrolls from the document and their anchor's ancestors,
including independently scrolling template regions; unrelated panels are ignored.

`origin?: HTMLElement` 可单独指定视觉定位参照（例如八向抓手的完整外框）。
CDK 定位、边界回退和祖先滚动跟随都使用 origin；省略时仍使用 target 的元素。
`target` 继续负责原有的生命周期和虚拟化租约，不因改用视觉参照而改变。
创建结果的 `updatePosition()` 同时执行 CDK 定位和编辑区边界校验；对象几何提交后优先调用它，
避免连接方向未变时 CDK 不发事件而漏掉边界回退。关闭后调用无操作。

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
const { componentRef, overlayRef } =
  this.doc.overlayService.createGlobalOverlay<MyDialog>({
    component: MyDialog,
    backdrop: true,
    panelClass: "my-dialog-panel",
  });
```

## Position Helpers

```typescript
import { getPositionWithOffset } from "../../framework";

// Predefined positions with offset
getPositionWithOffset("top-left", xOffset, yOffset);
getPositionWithOffset("top-right", xOffset, yOffset);
getPositionWithOffset("bottom-left", xOffset, yOffset);
getPositionWithOffset("bottom-right", xOffset, yOffset);
getPositionWithOffset("top-center", xOffset, yOffset);
getPositionWithOffset("bottom-center", xOffset, yOffset);
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
  private _activeBlock: BlockCraft.IBlockComponents["my-block"] | null = null;

  init() {
    this._sub = this.doc.selection.selectionChange$.subscribe((selection) => {
      // Show toolbar when a specific block type is selected
      if (
        !selection ||
        !selection.isInSameBlock ||
        selection.firstBlock?.flavour !== "my-block"
      ) {
        this._overlayRef && this.closeToolbar();
        return;
      }

      const block =
        selection.firstBlock as BlockCraft.IBlockComponents["my-block"];
      if (this._activeBlock === block) return;

      this.closeToolbar();
      this._activeBlock = block;

      const { componentRef, overlayRef } =
        this.doc.overlayService.createConnectedOverlay<MyToolbarComponent>(
          {
            target: block, // Block-owned: keeps its virtualized root unit mounted
            component: MyToolbarComponent,
            positions: [
              getPositionWithOffset("top-left", 0, 8),
              getPositionWithOffset("bottom-left", 0, 8),
            ],
          },
          this._close$,
          this.closeToolbar,
        );

      this._overlayRef = overlayRef;
      componentRef.setInput("block", block);
      componentRef.setInput("doc", this.doc);
    });
  }

  closeToolbar = () => {
    this._close$.next();
    this._activeBlock = null;
    this._overlayRef = undefined;
  };

  destroy() {
    this.closeToolbar();
    this._sub?.unsubscribe();
  }
}
```

## Template: Toolbar Angular Component

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";

@Component({
  selector: "my-toolbar",
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
      case "delete":
        doc.chain().deleteById(block.model.id).run();
        break;
      // ...
    }
  }
}
```

## Existing Reusable Components

分栏使用就地结构按钮，不再随文字光标自动创建 connected Overlay。
悬停、模型选区位于分栏内、键盘聚焦或触摸环境下显示两端及栏间的加号，分别用于首栏前插入、末尾追加和栏间插入。
栏间插入按稳定子栏 ID 重查索引，避免协同修改后错位；最多 8 栏，达到上限时移除加号。
两端加号复用同一套绝对定位样式：首端 `left: 4px`，末尾 `.column-add-point--end` 使用 `right: 4px`，
形成镜像布局，不引入 Overlay。完整命中区域收在分栏边界内并给两侧 gap 光标留出空间；
不可重新挂到伸出 `100%` 右边界的末尾 divider，也不可通过裁剪填写区滚动来掩盖溢出。
局部不显示取消分栏按钮；取消继续使用顶部固定分栏入口中的 1 栏选项。
默认加栏入口显示无背景的小圆点，悬停或键盘聚焦时显示 20px 蓝底圆圈和白色字体加号；
复用 `--bc-active-color` 和 `--bc-columns-handle-color`，命中尺寸固定，悬停不扩大滚动范围。
栏间分割线继续调宽；结构按钮位于既有上下留白及水平边界内，不参与栏宽分配。
只读时不渲染加号，内部拖拽期间隐藏加号并让出命中区域。
此组件是分栏内部 UI，不需要宿主额外注册 Plugin，快照格式、`columnWidths` 与 `addColumn()` 契约不变。
子栏悬停时显示底部居中的 mini 抓手（`column-drag-handle`），背景透明、图标继承正文颜色，接入既有
`doc.dragController`，仅在当前分栏组内移动整栏；UI 命中与执行命令都拒绝组外落点。
拖动时通过 CDK Overlay 显示半透明整栏预览和主题色插入线，离开分栏范围立即隐藏。
预览按视口坐标绘制，避免填写区裁剪；高频移动按动画帧合并，结束或取消时销毁。
只有有效落点才捕获独立历史项，取消拖拽不留下 pending bookmark。
子栏换位独立记录历史；减栏后的单栏自动展开仍在原事务内完成，Undo/Redo 恢复焦点。

| Component                        | Import From                   | Description                                                                                                                                                                                                                                                  |
| -------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FloatToolbarComponent`          | `components/`                 | Base floating toolbar shell                                                                                                                                                                                                                                  |
| `ColorPickerComponent`           | `components/`                 | Color selection grid                                                                                                                                                                                                                                         |
| `BlockResizerComponent`          | `components/`                 | Block resize handles                                                                                                                                                                                                                                         |
| `TableSizePickerComponent`       | `components/`                 | Table row/column picker                                                                                                                                                                                                                                      |
| `ColumnCountPickerComponent`     | `components/`                 | Column count selector                                                                                                                                                                                                                                        |
| `MediaCreatorComponent`          | `components/`                 | Media upload/URL input                                                                                                                                                                                                                                       |
| `ShapePickerComponent`           | `components/`                 | Categorized Shape catalog; `supportsTextOnly` removes non-text geometries and `embedded` removes popup chrome inside a settings card                                                                                                                         |
| `TextBoxPresetPickerComponent`   | `components/`                 | 58-style Word-inspired text-box gallery in 10 `CsTabsComponent` categories; only the tab strip scrolls horizontally, and `embedded` removes standalone popup chrome                                                                                          |
| `RevisionReviewPopoverComponent` | `components/revision-review/` | Minimal connected quick-review UI with actor identity, revision time and iconfont “接收修订 / 拒绝修订” actions with tooltips                                                                                                                                |
| `RevisionReviewPanelComponent`   | `components/revision-review/` | Content-sized comment-card-style review panel whose default queue contains only pending/conflicted cards; accepted/rejected history is explicit, cards follow mounted document anchors, and structural overlaps show one focused conflict with exact choices |
| `RevisionReviewUiController`     | `components/revision-review/` | Optional marker/Overlay/navigation adapter over the headless review Plugin                                                                                                                                                                                   |

Column-oriented `BcFloatToolbarComponent` menus use border-box items constrained
to the menu width. Long labels are clipped inside the item and the menu must not
gain a horizontal scrollbar; bounded long lists scroll vertically only.

For revision review, keep the connected popover, overall panel and domain
Plugin as separate lifecycles. `RevisionReviewUiController.attach()` installs
one delegated listener on the document scroller. `reveal(itemId)` navigates by
stable block ID and acquires only that block's virtual view lease; closing the
Overlay releases it. The panel maintains the complete model-side review order,
but renders only cards whose `data-bc-revision-ids` anchors are mounted by the
document virtualization window. Document scroll, resize and `viewChange$`
events coalesce into one animation-frame measurement; panel wheel input is
forwarded to `doc.scrollContainer`. It must not acquire a full-document lease.
Neither UI component owns permission policy. Keep previous/next controls in
panel cards rather than the connected popover. Use iconfont buttons with
tooltips for card navigation and the “接收修订 / 拒绝修订” decisions; the
popover shows actor, revision time and the same two decision icons, then closes through the Overlay
outside-pointer/Escape lifecycle.
The panel opens on its “待处理” queue. Once a `keep` / `revert` decision updates
an item to accepted or rejected, that card leaves the current projection
immediately. The headless item remains available under the explicit “已处理”
filter for history and redecision; the UI does not compact or delete Revision
records.
Do not label structural-overlap decisions as an abstract “former/latter” pair.
The default panel presents one conflict at a time, maps both revision IDs back
to headless `readContent()` data, and shows each actor, revision type, time and
exact fragment. Choosing “接收此项” emits one `resolve-overlap` intent; the
Revision domain rejects the mutually exclusive side.

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

固定工具栏的有序列表与上下标沿用分体按钮。字体和实际字号在宽屏相邻展示，
收窄时优先保留字号。单行模式隐藏独立文本／段落设置图标，优先保留链接，行内公式随空间不足先收纳；
双层模式保留组内设置图标并直接打开现有弹窗，tooltip 和 aria-label 提供名称。
完整设置、格式命令和低优先级快捷项可从“更多格式”或“插入”进入。

工具栏默认双层，支持简略／双层两种组件本地模式，通过右侧箭头展开／收起；分别保持一／两行命令，
不渲染额外模式条或分组说明行。
工具栏按内容宽度整体居中；依实际溢出逐组收起低优先级快捷项，避免轻微溢出就整档隐藏。
双层模式将标题并入字体区，并平衡插入项的上下行，不把整个分组换到下一行。
字符间距、行距和公式先于常用插入项收纳；段间距从段落设置进入。收起间距后，段落操作重新排成两行，紧凑档不重新显示间距。
只测量 `.toolbar-body`，不把弹出菜单模板计入宽度；在 Angular zone 外观察宽度，
通过合并的 RAF 测量，在档位变更时刷新视图。销毁时清理观察器和待执行帧。
宿主容器需要自然高度；宿主投影插槽的超宽内容仍允许在命令区滚动访问。
具体优先级与菜单路径见 `blockcraft-plugins-formatting.md`。
菜单命令通过 CSES 的 `csClick` 统一处理鼠标和键盘；二级菜单由 `.cs-submenu-panel`
承载背景、圆角和阴影，嵌入的选择器不重复绘制卡片，独立选择器保留原外观。
文字颜色和背景颜色使用两个独立图标按钮，各自显示当前颜色；点击直接打开对应的 `CsColorPickerPanelComponent`，更多颜色和 HEX/RGB 输入由组件库提供。
输入获得焦点时保留工具栏已有选区记录，在 `csChangeComplete` 时验证选区和权限并格式化。
面板无触发器与浮层外壳，由工具栏单独承载卡片与定位。背景图形仅显示在背景颜色面板，最近使用色按两类分别保存；同一时间只打开一个颜色面板，关闭或切换按钮时销毁原面板。

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
`ObjectFormatToolbarComponent` is the bundled reference for this two-level
pattern: it preserves the established side-aware 42px iconfont rail, 288px
format card, compact 228px layout card, center-first connected positions and
RAF panel repositioning. Secondary cards omit redundant title/description
headers. Layout modes use compact CSES buttons with the icon above a visible
one- or two-line label, plus tooltips and an active state. Their equal-width
columns fill the available row after capability filtering. Mixed absolute-object
selection bypasses this format rail and uses the restored compact horizontal
group toolbar for alignment, distribution and grouping; a selected group reuses
that surface for layout, hierarchy and ungrouping. Preserve the historical group
focus handoff: first click selects the group, second click may enter a member,
and member Selection retains the ancestor group frame. Resolve those commands from
the absolute placement selection even when some targets have no `objectFormat`
capability. Filter single-object layout buttons through the
`doc.placement.supportsObjectLayout()` intersection and repeat that guard in the
action layer, so TextBox and other blocks without an inline adapter never offer
or partially apply inline layout.
For inline and top-bottom objects, render only the layout-mode choices: page
alignment, object arrangement and hierarchy are absolute-only and must stay
hidden until the object uses under/over layout. Reject those commands again in
the Plugin action layer to cover stale Overlay events.
Shape and text format cards use one CSES segmented tab strip and render only the active content area;
the active tab has no trailing section divider or reset action. The text font
is a searchable CSES select backed by the shared font catalogs and writes the
catalog's bounded CSS stack so Shape, TextBox and WordArt render the same choice.
Shape fill and text fill both embed the established `ShapeFillPanelComponent`
surface: one CSES Select chooses none/solid/gradient/picture and reveals only
that mode's controls; the established preset swatches, start/end colors and
angle controls adapt directly to one atomic `ObjectPaint` value. Keep picture
details and whole-paint opacity in the owning format card instead of cloning
another gradient editor. Internal `bc:` artwork references remain rendering
details: the card never echoes them as user URLs and does not reveal fit,
position or picture opacity controls until a user image URL/upload exists.
Section labels remain only where they distinguish command groups.
The rail/card continue to use `--bc-float-toolbar-*` and
`--bc-fixed-toolbar-shadow` theme variables. Its commands,
tooltips and generic form fields use CSES UI (`CsButton`, `CsTooltip`,
`CsSelect`, `CsInput`, `CsInputNumber`, `CsColorPicker`, `CsSlider`,
and `CsSwitch`); only editor-specific rail/panel layout geometry
stays BlockCraft-owned.
When a CSES control creates a sibling CDK pane, the
owning Plugin must recognize that pane only while the corresponding control
inside its own toolbar has an open state. Pointer/focus in unrelated CSES panes
must still close stale toolbars.
The first owned pointerdown must retain the already-selected object host before
the native-input selection gap begins, then reapply its visual chrome after the
same synchronous selection broadcast settles. This keeps the outline/resizer
stable on the first rail click without replaying Selection or stealing focus.

## Overlay Lifecycle Management

`createConnectedOverlay()` 的 `allowReadonly?: boolean` 默认关闭：普通浮层仍在文档进入只读时关闭。
只有浏览、刷新、外部打开等只读可执行的控件才可显式启用；调用方仍须逐项保护写入命令。
启用后，块/文档销毁、显式关闭、脱离 DOM 和视图 lease 清理规则保持不变。
嵌入块在只读状态创建工具栏时启用该选项；编辑状态打开的菜单仍遵循原只读关闭规则。

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

`ObjectFormatToolbarPlugin` keeps effect editing local until confirmation.
Shape shadow/glow changes preview through RAF without touching Yjs; **Apply**
writes the whole compact `effects` record once and **Cancel** restores the current
model projection. Text shadow/glow follow the same rule and write the whole
`textStyle` record once. Other high-frequency paint/outline sliders keep their
pointerup/keyboard/blur single-write behavior. All visible controls are CSES UI
components; focus in an input, stepper, select or owned child overlay remains
inside the existing toolbar ownership boundary.

| Plugin                      | Pattern                                                                | Path                             |
| --------------------------- | ---------------------------------------------------------------------- | -------------------------------- |
| `FloatTextToolbarPlugin`    | Selection-based text formatting                                        | `plugins/float-text-toolbar/`    |
| `DividerExtensionPlugin`    | Block-type toolbar                                                     | `plugins/divider-toolbar/`       |
| `ImgToolbarPlugin`          | Block-type toolbar with resize                                         | `plugins/img-toolbar/`           |
| `ObjectFormatToolbarPlugin` | Shape/TextBox/WordArt formatting plus mixed-object layout and grouping | `plugins/object-format-toolbar/` |
| `CalloutToolbarPlugin`      | Block-type toolbar with color picker                                   | `plugins/callout-toolbar/`       |
| `InlineLinkExtension`       | Inline element popover                                                 | `plugins/inline-link-extension/` |
