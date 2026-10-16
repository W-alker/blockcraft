# BlockCraft: Text Formatting Plugins

> **Level 1: Plugin Reference** — Read `blockcraft-plugins-ref.md` for the full index.
>
> Last updated: 2026-10-16

## 当前输入格式

文字工具栏通过 `TextToolbarHelper` 与 Input 的持续格式状态交互。
光标处的字号、字体及字样命令持续作用于后续输入、删除和续写，直到用户修改格式或移动光标。
局部文本选区命令只修改所选文字；完整段落的命令同时更新 `props.textDefaults`。
空段落命令更新段落标记和本地输入状态，回显、导航和保存重开都继承该格式。
编辑后的续写保留选区公共格式；标题／引用段尾回正文按下一段样式规则重置覆盖。
自定义工具栏继续使用 `formatText()` / `formatTypography()` / `formatFontSizePixels()`，
无需自行保存最后一次格式。状态生命周期和兼容方法见 `blockcraft-input.md`。

## 段落对齐

固定工具栏、浮动文字工具栏、块菜单和段落设置均提供左／中／右／两端／分散对齐。
持久化新值为 `justify` 和 `distributed`，通过既有 Block/DocCRUD 写入，保持协同、撤销与只读保护。
段落设置使用下拉框容纳五种选项，预览同时投影末行与字符分配规则。
外部工具栏若维护对齐白名单，应接受这两个新值；无需迁移旧文档。

## FloatTextToolbarPlugin

> `plugins/float-text-toolbar/rich-text-toolbar.ts` — Floating rich-text formatting toolbar shown on text selection.

Shows a formatting toolbar 350ms after user makes a non-collapsed text selection. Provides bold/italic/underline/strikethrough/code shortcuts and extensible custom buttons. Model-owned table-cell rectangle selections do not open this toolbar, and text-shaped selections that cross different table cells are also ignored so table rectangle UI cannot be mistaken for a rich-text range. Normal text selection inside a single table cell still opens the toolbar.

### Configuration

```typescript
new FloatTextToolbarPlugin(options?: FloatTextToolbarPluginOptions)
```

| Option             | Type                     | Default | Description                       |
| ------------------ | ------------------------ | ------- | --------------------------------- |
| `extraItems`       | `IToolbarMenuItem[]`     | `[]`    | Extra buttons appended to toolbar |
| `onExtraItemClick` | `(item, doc) => boolean` | —       | Handler for custom button clicks  |

Each `IToolbarMenuItem` supports an optional `visible` predicate:

```typescript
interface IToolbarMenuItem {
  name: string;
  icon: string;
  label: string;
  visible?: (selection: BlockCraft.Selection) => boolean;
}
```

### Built-in Hotkeys

| Shortcut     | Action        |
| ------------ | ------------- |
| `Cmd/Ctrl+B` | Bold          |
| `Cmd/Ctrl+I` | Italic        |
| `Cmd/Ctrl+U` | Underline     |
| `Cmd/Ctrl+D` | Strikethrough |
| `Cmd/Ctrl+E` | Inline Code   |

### Public API

| Method                            | Description                                            |
| --------------------------------- | ------------------------------------------------------ |
| `openToolbar()`                   | Programmatically open the toolbar at current selection |
| `closeToolbar()`                  | Dismiss the toolbar                                    |
| `toggleFormatAttr(ctx, attrName)` | Toggle an inline format attribute                      |

### Usage Example

```typescript
new FloatTextToolbarPlugin({
  extraItems: [
    {
      name: "ai-rewrite",
      icon: "bc_icon bc_ai",
      label: "AI 改写",
      visible: (sel) => sel.isInSameBlock && !sel.collapsed,
    },
  ],
  onExtraItemClick: (item, doc) => {
    if (item.name === "ai-rewrite") {
      const text = doc.selection.getSelectedText();
      // call AI service...
      return true;
    }
    return false;
  },
});
```

---

## TextMarkerPlugin

> `plugins/float-text-toolbar/text-marker-toolbar.ts` — Lightweight text marker/highlighter toolbar for specific block types.

A simpler read-only-friendly toolbar shown after text selection on specified block flavours. Provides text color/highlight controls without full rich-text editing features.

### Configuration

```typescript
new TextMarkerPlugin(markTextBlockFlavours: BlockCraft.BlockFlavour[])
```

| Parameter               | Type             | Description                                             |
| ----------------------- | ---------------- | ------------------------------------------------------- |
| `markTextBlockFlavours` | `BlockFlavour[]` | **Required.** Block flavours that activate this toolbar |

### Public API

| Method           | Description             |
| ---------------- | ----------------------- |
| `openToolbar()`  | Open the marker toolbar |
| `closeToolbar()` | Dismiss the toolbar     |

### Usage Example

```typescript
// Show marker toolbar only for paragraph and blockquote blocks
new TextMarkerPlugin(["paragraph", "blockquote"]);
```

---

## FixedTextToolbarComponent

> `plugins/fixed-toolbar/widgets/fixed-toolbar.component.ts` — Fixed-position toolbar embedded in host app template.

**Not a `DocPlugin`** — this is an Angular standalone component (`<bc-fixed-toolbar>`) meant to be placed directly in the host application's template. Provides heading selection, inline formatting, font/actual-pixel-size/character-spacing dropdowns, paragraph line-height and consolidated alignment dropdowns, color pickers, list conversion, shape/text-box/table/column insertion, image insertion, video/audio insertion, and link editing.

选择文本框/艺术字预设后，点击文档放置默认开启内容自适应，拖拽绘制则保持固定尺寸。
使用现有 4px 屏幕距离阈值区分手势；横排点击创建保留预设宽度，按内容调整高度。
普通形状、已有对象和 Schema/API 的固定尺寸缺省值不变；自适应支持范围见 `blockcraft-block.md`。

### Typography groups

- The fixed toolbar presents font family and effective CSS pixel size as one
  adjacent, iconless Word-style control pair. Character spacing and paragraph
  line height remain independent dropdowns, with character spacing immediately
  before line height. The floating text toolbar keeps its previous compact
  formatting actions and does not add these typography controls. Neither
  surface owns document defaults.
- Font, scale, character spacing, alignment and line-height menus reuse the same
  `BcFloatToolbarComponent` / `BcFloatToolbarItemComponent` vertical menu chrome
  as the heading dropdown; typography does not introduce a parallel picker UI.
- Every fixed-toolbar dropdown is hosted by `CsDropdownDirective` and
  `CsDropdownMenuComponent`; the compact **更多格式** branches use
  `CsSubmenuComponent`. All first-level dropdowns and nested submenus open on
  hover, while CSES retains click/touch and keyboard activation. The inner
  BlockCraft picker/menu components remain the content surface. Tooltip overlays
  opened from a menu item therefore do not dismiss the owning dropdown merely
  because the pointer enters the Tooltip. Open first-level triggers retain the
  same background as their hover state; nested picker wrappers become
  backgroundless content so the CSES submenu draws the only popup card.
  Responsive second-level pickers add no extra host gap; the CSES panel and the
  inner 4px content padding are the only spacing owners.
- 顶部字体族触发框宽 104px，下拉框按内容展开以完整显示字体名称；字号触发框及
  下拉框保持严格等宽；触发框最小宽 56px，随数值展开。字体族菜单保留完整 title／aria-label。其他 first-level overlays
  use the trigger width as their minimum and expand only when menu content needs more room. Pixel-size quick choices are
  `12/14/16/18/20/24/28/32/36/48/64/72`, without an inherited-size action; custom `1..512px` input is available in **更多设置…**; character-spacing quick choices are
  `-0.05/-0.025/0.025/0.05/0.1em` plus default. The complete numeric range
  remains available through **更多设置…**.
- Split controls use one hover surface across their main action and caret. The
  caret adds a second local highlight on hover/open so its separate dropdown
  action remains discoverable. Ordered-list style and superscript/subscript use
  this pattern; the baseline main action repeats the active or most recently
  chosen command, and choosing one baseline clears the other.
- Each corresponding menu ends with **更多设置…** and the
  `bc_version_settings` icon. The narrow top size menu uses the icon alone with a full title/aria-label. Font family, actual pixel size and character spacing
  open the CSES font modal at that field; alignment and line height open the
  CSES paragraph modal at that field. Modal, tabs, selects, numeric inputs,
  segmented controls, color pickers and buttons come from `@cses/ui`.
- Font settings include family, actual px size, advanced relative scale, bold/italic style, text and
  highlight colors, underline/strike/code and character spacing. The **高级**
  tab contains scale, spacing and preview; it does not duplicate
  baseline effects or preset buttons. Paragraph settings include alignment,
  space before/after and line height. Paragraph values persist as `psb/psa/lh`;
  adjacent spacing is
  `max(previous.psa, next.psb)` and is not stored as a redundant third value.
- Dialog edits are drafts: preview changes immediately, but Yjs changes only
  after **确定**. **取消**, Escape, mask policy and readonly transitions do not
  commit. A saved model Selection is replayed before applying the result, and
  every confirm uses one transaction. Paragraph settings always target the
  complete eligible selection.
- Mixed fields remain untouched until the user changes that field. This keeps
  a single known setting from flattening unrelated mixed formatting across the
  selection. Individual fields expose document-default values where applicable;
  the dialogs do not expose a whole-dialog reset action.
- Paragraph style keeps its current heading icon. The paired font-family and
  pixel-size fields intentionally omit leading icons; responsive
  **更多格式** uses `bc_zihao` for the pixel-size submenu. Character spacing uses
  `bc_zijianju` and stays adjacent to paragraph line height.
- 顶部字号触发框和预设仅显示数字，不追加 px 文案；实际字号回显最多一位小数，
  整数不补零，仅格式化展示，不改变模型精度；菜单不附加原生数值输入行，
  自定义字号通过字体设置弹窗调整。触发框最小宽 56px，按完整数字自然展开，字号菜单保持等宽并采用更小的内容边距；
  窄屏字号子菜单用 `bc-fixed-toolbar-font-size-submenu` 单独取消 CSES 默认最小宽度。
  顶部字号菜单只操作实际 px；整段、局部和光标均回显实际大小，不同大小显示“混合”。
  `formatFontSizePixels()` 反算段落 `fs`／行内 `t:px`，保留 `pfs/t:fs`。
  字号菜单不再提供“继承字号”；`formatFontSizePixels(null)` 的继承 API 保持兼容。高级缩放在字体弹窗 **高级** 标签中以 `50%..300%`
  编辑，调用 `formatFontScale()` 保留基础字号和另一层倍率。
  例如基础 20px、倍率 1.5 显示 30px；顶部选择 24 后基础为 16px、倍率仍 1.5。
  标题的 `heading` 语义保留，显式固定字号覆盖默认标题大小。相关段落或祖先的模型
  字号变更也会按 40ms 合并刷新回显，不仅依赖光标移动。
  Family and letter spacing use `t:ff` / `t:ls`; paragraph line height uses block prop `lh`.
- Relative font scale stays available in advanced font settings. Character
  spacing exposes `-0.1em` through `0.5em`; menu items and toolbar state show
  the real numeric `em` value rather than descriptive names. The neutral item
  is shown as `默认（0em）` and is still omitted from persisted Delta attrs.
- Mixed selections display a mixed state; inherited/default values are `null`.
  Picker mousedown preserves the live editor selection. A collapsed caret writes
  pending insert attrs, so subsequent input inherits selection typography.
- Line-height is enabled when a multi-block selection contains at least one
  editable rich-text block. Applying it updates every eligible editable block
  in one transaction and skips container, void and plain-text-only blocks;
  other inline-format controls retain their all-blocks-editable requirement.
- 固定工具栏默认采用简略模式，用户可通过右侧展开／收起箭头切换简略／双层；模式是组件本地展示状态，
  不写入文档或修改选区。简略的命令区保持一行，双层保持两行，不显示分组说明行。
- 文本设置与段落设置以组内图标常驻，保留 tooltip 和无障碍名称，直接复用现有设置弹窗、选区恢复和权限判断。
  字号、加粗在最窄档位仍可直接操作；完整文字格式、编号样式、样式／列表、
  格式刷及扩展命令可从“更多格式”进入。
- 文字／背景颜色入口以 Tab 切换，直接复用组件库 `CsColorPickerPanelComponent` 的 palette 模式，保留“更多颜色”、HEX/RGB、调色板及最近使用色。
  输入期间保留原格式选区，仅在 `csChangeComplete` 时走原有选区有效性、只读判断和格式化事务。
  背景图形仅放在背景 Tab，文字色和背景色的最近使用记录独立保存；旧的共享 `ColorPickerComponent` 不受此面板调整影响。
- 工具栏按实际内容宽度整体居中。双层模式将标题并入字体行，插入项按上下行均衡排列。
  ResizeObserver 观察组件自身宽度；轻微溢出时先逐组收起引用、低频插入项等，
  每一步重新测量，能放下就停止；更窄时才进入字体／历史／段落快捷项的紧凑布局，
  最窄档位保留核心操作和设置入口。宽度扩大或模式切换时重新尝试完整布局。
  测量在合并的 RAF 中完成；观察器在 Angular zone 外注册，档位变更才触发检查，
  销毁时取消 RAF 并断开观察器。菜单模板不参与宽度测量。
- `extensionActions` 在宽屏仍直接展示，窄屏通过“更多格式”访问，保留原来的
  disabled、事件和选区恢复语义。宿主投影插槽保留；宿主应允许工具栏自然增高，
  不要固定为 40px。对于宿主提供的超宽投影内容，命令区保留横向滚动兜底。

### Insertion Actions

- 图片、表格等快捷项随可用宽度逐级收起，“插入”菜单始终保留全部已注册功能。
  形状、文本框、艺术字、表格、分栏沿用原选择器和命令；菜单与快捷项共用
  Schema、选区和只读限制。未注册的形状／文本框／艺术字不展示入口。
- When the document registers `ShapeBlockSchema`, the toolbar shows a Shape
  action using the existing `bc_tuxing` iconfont glyph. Click or keyboard
  activation opens the bounded categorized shape picker. Its 103
  entries come from eight `SHAPE_CATEGORIES` backed by the shared
  `SHAPE_DEFINITIONS`; each compact icon-only item renders its actual
  main/detail geometry through `ShapeIconComponent` and exposes its label by
  Tooltip plus `aria-label` instead of visible per-cell text.
- When the document registers `TextBoxBlockSchema`, **插入文本框** opens the
  58-style Word-inspired catalog directly. Its `cs-tabs` categories are 办公
  经典 / 引言 / 侧边栏 / 杂志 / 异形 / 气泡 / 纸张 / 文化风格 / 材质效果 /
  竖排. Only the tab strip scrolls horizontally; the card content expands and
  is not placed in a nested vertical scroller. Vertical presets carry their
  own `vertical-rl` frame direction.
- Picking a shape, WordArt or text-box preset arms a one-shot drawing surface
  bounded by `doc.scrollContainer` rather than the root block, without requiring
  a focused block, active Selection or saved selection snapshot; it does not
  write Yjs or create a block yet. A
  primary-pointer drag shows a theme-colored rectangle preview and commits that
  rectangle's scale-normalized width, height and absolute position only on
  pointer release. A press/release without a drag commits the selected type at
  its normal default size.
- The inserted shape is whole-block selected. A text box is selected and
  revealed, staying whole-object selected so its resize handles and settings
  rail are visible; entering its text is one content click or Enter away.
  Inserted WordArt is selected,
  revealed and enters text editing with its default text selected. Escape,
  pointer cancellation, window blur, scrolling, readonly transitions and
  toolbar destruction cancel an armed or active drawing gesture without a
  model mutation. Shape/text-box/WordArt entries remain hidden when their Schema is not
  registered and are disabled only while the document is readonly; a missing
  or detached drawing surface fails safely when the preset is picked.
- Table and column actions open their existing picker overlays directly.
- Image insertion remains a direct action and supports either a direct image
  URL or local image upload.
- Video and audio remain grouped under their own dropdown and reuse the shared
  media-creator flow.

### Format Brush

- The fixed toolbar includes a one-shot format-brush action.
- Activating it can use either a collapsed text caret or a normal text selection as the source format.
- After activation, the brush waits for the user to finish a later non-collapsed target text selection before applying formatting, then automatically exits.
- The brush copies common inline text styling — including compact font family
  and letter spacing — plus context-sensitive font scale and paragraph `lh`.
  A complete target block receives `pfs`; a partial target receives `t:fs`.
  It does not copy document
  defaults, heading, list flavour, alignment, links, inline formulas, or
  non-text block contents.
- `Cmd/Ctrl+Shift+C` can be used to quickly enable the brush; cancellation still uses the toolbar button or `Escape`.

### Selection Behavior

- A whole selected container exposes font, paragraph and heading commands when
  its subtree contains editable rich-text blocks. Commands walk nested children
  in model order, apply to eligible editable leaves, and skip void and
  `plainTextOnly` leaves. Mixed values reflect the eligible descendants.
  A locked descendant disables the batch command. A model-owned table-cell
  rectangle uses its selected visible master cells (including merged-cell
  closure) as roots, then applies the same commands to their editable
  descendants. Ordinary whole-leaf selections keep their existing behavior.
- Paragraph settings expose before/after spacing for a selected non-editable
  flow block. The dialog hides alignment and line height for a whole selected
  non-editable flow block or a selection without eligible rich-text descendants.
  In mixed selections, spacing updates covered
  flow blocks while text-only fields update eligible editable descendants in
  the same transaction. Absolute objects and structural row/cell/column blocks
  are excluded from flow spacing. A whole selected image or other eligible
  container owns its own spacing; an editable caption does not receive that value.
- Heading and list transforms work on cross-block text selections as long as every covered block is editable and not `plainTextOnly`.
- The ordered-list control is a split button: its main area toggles the list, while the caret opens the ordered marker library. Picking a marker updates each automatic-numbering group reached by the selection; same-level ordinary paragraphs do not split that group.
- Link and inline-formula actions remain restricted to same-block text selections; on cross-block selections the buttons stay visible but disabled.
- Inline-format buttons still follow text-range availability; block-level transforms are more permissive than inline text formatting.

`TextToolbarHelper.transformBlocks()` accepts an optional third `props` argument
and forwards it to the target Schema snapshot. This lets one command transform
the block flavour and initialize semantic props atomically:

```typescript
helper.transformBlocks("ordered", selection, { ms: "r2" });
```

For font scale, use `TextToolbarHelper.formatTypography()` instead of writing
an inline patch directly. `getFontScaleTargets()` is model-only and partitions
cross-block selections into complete paragraph targets and partial inline
targets; it does not read DOM geometry or install observers.

### Component Inputs

| Input              | Type                             | Default      | Description                            |
| ------------------ | -------------------------------- | ------------ | -------------------------------------- |
| `doc`              | `BlockCraft.Doc`                 | **required** | Document instance                      |
| `utils`            | `TextToolbarHelper`              | —            | Optional external toolbar helper       |
| `readonly`         | `boolean`                        | `false`      | Disable toolbar in readonly mode       |
| `stickyTop`        | `number`                         | `0`          | Top offset for sticky positioning (px) |
| `visible`          | `boolean`                        | `true`       | Show/hide the toolbar                  |
| `extensionActions` | `IFixedToolbarExtensionAction[]` | `[]`         | Custom action buttons                  |

### Component Outputs

| Output            | Type                                                | Description                           |
| ----------------- | --------------------------------------------------- | ------------------------------------- |
| `extensionAction` | `EventEmitter<IFixedToolbarExtensionActionContext>` | Fired when a custom action is clicked |

### Extension Action Interface

```typescript
interface IFixedToolbarExtensionAction {
  key: string;
  icon: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
}
```

### Usage Example

```html
<bc-fixed-toolbar
  [doc]="doc"
  [stickyTop]="48"
  [extensionActions]="customActions"
  (extensionAction)="onExtensionAction($event)"
>
</bc-fixed-toolbar>
```

```typescript
customActions: IFixedToolbarExtensionAction[] = [
  { key: 'export-pdf', icon: 'bc_icon bc_pdf', title: '导出 PDF' },
];

onExtensionAction(ctx: IFixedToolbarExtensionActionContext) {
  if (ctx.action.key === 'export-pdf') { /* ... */ }
}
```
