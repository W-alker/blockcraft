# BlockCraft: Theme Customization

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Last updated: 2026-11-11

## 媒体块交互边框统一（0.12.3）

`media-object-resizer.scss` 和 `object-interaction-chrome.scss` 将图片、视频、网页嵌入及旧平台卡片、人员卡片与贴纸
的抓手呈现统一为 8px 圆点、1px 边框与 2px 外偏移。悬停／内部聚焦使用活跃色 35% 淡虚线，
整块选中只切换为活跃色实线；沿用根交互策略与打印隐藏规则。网页嵌入含抓手时不再叠加
卡片的彩色边框／阴影，原 1px 透明边框仍占位，无抓手的只读提示不变。

## 对象浮动抓手按钮的交互投影（未发布）

`overrides.native.objectFloatingHandles: false` 投影为根元素的 `data-bc-interaction-object-floating-handles="false"`；主题仅隐藏 `[data-bc-object-floating-handle]`。对象边框、边缘拖动区、缩放与正文 `bc-drag-handle` 保留各自的规则。默认 `true`，不改变既有主题表现；布局控件总开关仍优先。

## 浮动抓手反馈（未发布）

顶部浮动抓手保持 24×14px；悬停和键盘聚焦使用活跃色 12% 混合背景及 `--bc-shadow-sm`，按下为 20% 混合背景。
颜色来自 `--bc-active-color` / `--bc-bg-primary`，键盘轮廓沿用现有活跃色；reduced-motion 关闭过渡。
Tooltip 使用 CSES CDK 浮层，提供点击选择和拖拽移动说明，不写正文 DOM 或文档状态。

## 对象悬停与内部编辑提示

`components/object-interaction-chrome.scss` 统一文本框、形状、艺术字、图片、填写区的选择提示：
内部编辑时使用 `1px dashed color-mix(in srgb, var(--bc-active-color) 35%, transparent)`，整体选中时使用 1px 实线缩放框。
混合模式不因悬停显示对象边框或抓手（含图片、贴纸与填写区）；设计模式保留悬停提示。文字/键盘聚焦和整体选中入口保持可用。
虚实边框以原虚线位置为准：文本框/艺术字/填写区 `outline-offset: -1px`，形状 `0px`，图片 `2px`；整体组合保留 4px 外扩。两态均为 1px，仅改变线型与颜色。
缩放抓手保持 8px，回到各自的边框位置。旋转按钮采用 `--bc-active-color` 实心圆；按钮和 14px 连接线跟随北侧抓手的同一偏移定位，两端分别贴合旋转按钮和北侧抓手；媒体控件的连续悬停命中区域保持。形状默认仅显示有限参数调整点；显式顶点模式使用 `shape-block--editing-points` 本地视图类，临时隐藏聚焦框及缩放、旋转、沿边拖动控件，只显示真实路径顶点与曲线控制点。退出后恢复原框线和抓手。
旋转按钮悬停与拖动统一使用 24px 环形箭头光标（白色描边、黑色箭头），热点位于箭头尖端；资源不可用时回退 `crosshair`。抓手尺寸、命中区和旋转事务保持。
设计模式内部编辑时已显示的抓手框也采用淡虚线；不改变抓手显隐、命中带或拖动事务。
只作用于编辑态屏幕提示，不改变对象保存的轮廓、快照、只读锁定装饰及打印；填写区保留自身背景和装饰边框，整体选中不叠加通用块选中底色；贴纸保持原有样式。

## 交互策略视图标记（未发布）

`doc.interaction` 投影下列根属性（布尔值均为字符串 `true|false`）：
- `data-bc-interaction-layout-controls`：布局控件总显隐。
- `data-bc-interaction-hover-controls`：悬停反馈。
- `data-bc-interaction-content-resize-handles`：文字聚焦时的缩放抓手。
- `data-bc-interaction-group-outline`：组合选中和内部聚焦边框。
- `data-bc-interaction-move-existing-blocks`：移动意图；行为由控制器检查，不能用 CSS 代替。

主题以能力属性为条件，不再用模式名决定交互。`data-bc-interaction-mode="mixed|immersive|design"` 仍提供标签兼容，但存在个性化覆盖时不能推导有效行为。只读时模式标签为 mixed，布尔投影为 false；主题仍受只读和 screen/打印边界约束。销毁时清理这些属性。
`themes/components/interaction-mode.scss` 沿用已有 `.focused` 投影显示内部抓手，关闭布局控件优先；不改变选区、内容布局或打印。属性不能作为权限依据，也不进入文档数据。

## 代码块行容器

编辑代码块和 Snapshot Viewer 的 `.code-block .edit-container` 使用直接子元素 `c-line`
包裹逻辑行。`c-line` 递增 CSS `line` counter，`c-line::before` 显示行号；空行同样计数，
自动折行仍只显示一个行号。行号沿用聚焦时可见的行为，不能选择或编辑，也不进入复制文本。
旧 `[data-line-break]` 和 `c-element:first-of-type` 行号规则已移除。宿主若自定义代码行号样式，
应将选择器迁移至 `.code-block .edit-container > c-line::before`，不自行维护数字属性或行号文本。
Mermaid 及普通富文本不使用该结构；不改变主题颜色变量。

## 表格自动列宽

`.table-block.is-auto-column-width` 使用 `table-layout:auto` 和正文容器的可用宽度；
旧表格样式不变。全屏时内部变量 `--bc-table-auto-content-width` 保留正文宽度预算，
由布局观察器维护，不作为宿主覆盖尺寸的配置入口。
`tfoot.bc-table-column-metrics` 是 `aria-hidden`、不可编辑、零高度的列轨道，
不属于模型/分页 tbody，也不应被宿主赋予行高、边框或内容。
快照渲染采用相同模式 class 与样式。

自动模式的媒体限宽放开仅作用于单元格内容容器的直接图片、视频和 `embed-frame-block`，
让媒体表面的像素宽度参与浏览器列宽分配；不穿透嵌套表格/分栏，也不改变静态快照媒体的百分比样式。
不覆盖内部图片填满表面所用的 `max-width:100%`，不添加媒体尺寸观察器。

## 通用浮动工具栏尺寸

`bc-float-toolbar` 的横向图标按钮默认 28×28px，按钮圆角沿用 `--bc-radius-md`（4px），
图标 16px，按钮间距 2px，外层内边距沿用 `--bc-padding-sm`（4px）。带文字或下拉箭头的
按钮按内容自然增宽；长工具条在视口边界内换行，纵向文字菜单继续使用整行布局。

可覆盖以下主题变量；尺寸变量定义于 `variables.scss`，浅色和深色共用：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `--bc-float-toolbar-item-size` | `28px` | 横向按钮高度与最小宽度 |
| `--bc-float-toolbar-icon-size` | `16px` | 横向按钮图标大小与分隔线高度 |
| `--bc-float-toolbar-gap` | `2px` | 横向按钮间距 |
| `--bc-float-toolbar-radius` | `7px` | 浮层外圆角 |

`--bc-float-toolbar-shadow` 统一为柔和投影，颜色面板沿用此投影变量。
固定工具栏的嵌套子菜单仍由 CSES 面板提供唯一外壳；虚拟滚动选择器保留自己的 itemSize 与布局。

## Theme Structure

```
themes/
├── base.scss           # CSS custom properties foundation
├── light.scss          # Light theme variable overrides
├── dark.scss           # Dark theme variable overrides
├── function.scss       # Utility SCSS mixins
├── variables.scss      # Shared design tokens
├── blocks/             # Per-block styles
│   ├── _paragraph.scss
│   ├── _divider.scss
│   ├── _callout.scss
│   └── ...
├── components/         # Per-component styles (toolbar, pickers)
└── plugins/            # Per-plugin styles loaded after ordinary block styles
    └── pagination.scss # Live/print pagination layout and block overrides
```

## 样式目录与发布边界

- 需要随包发布、由多个渲染入口共享的 SCSS 统一放在 `packages/editor/themes/`，按 `blocks/`、`components/`、`plugins/` 的职责分类。
- Angular 组件私有的 `:host`、上传态等样式可留在组件目录；组件可以引用 `themes/` 中的共享 partial，主题不得反向导入组件源码目录。
- 音频播放器的共享规则位于 `themes/blocks/_audio-player.scss`，音频组件和 Snapshot Viewer 引用同一份规则，保留各自的样式作用域。
- 打包继续统一使用 `themes/**/*`，不要为主题依赖追加单文件资源白名单，也不要复制一份共享样式到组件目录。
- `pnpm build:editor` 会自动执行主题回归检查：仅复制产物的 `themes/` 到临时目录，独立编译 base、light、dark。也可运行 `pnpm test:editor:package-styles` 单独检查已有产物。

## Theme Switching

```typescript
// Toggle theme programmatically
doc.toggleTheme('dark');   // Sets body[blockcraft-theme="dark"]
doc.toggleTheme('light');  // Sets body[blockcraft-theme="light"]
```

## Placeholder Styling Contract

`PlaceholderPlugin` uses this DOM contract for editable blocks:

- block host: `.bc-placeholder-empty` plus compatibility `.empty`;
- target element: `.bc-placeholder-target[data-placeholder]`;
- text color: `--bc-placeholder-color`, falling back to `--bc-color`.

The base theme renders
`.bc-placeholder-empty .bc-placeholder-target::before`. A block that supports
placeholder rendering should not reuse `::before` on that target for
decorative chrome. Put the decoration on the host or a sibling, or use a
non-conflicting property such as an inset `box-shadow`.

```scss
[data-blockcraft-root='true'] {
  --bc-placeholder-color: color-mix(
    in srgb,
    var(--bc-color) 72%,
    transparent
  );
}
```

## Block Lock Styling Contract

The editor projects effective block lock state onto each block host:

- `data-bc-readonly="self|inherited"` identifies the effective lock scope;
- `data-bc-lock-kind="user|template"` identifies the persisted lock origin;
- document-level readonly has no lock kind.

The base theme decorates an explicit user lock with the readonly border,
background and lock icon. An explicit template lock keeps the same readonly
behavior but is visually neutral by default. Template-authoring surfaces can
reveal that decoration by placing `data-bc-reveal-template-locks` on any
ancestor of the document root:

```html
<section data-bc-reveal-template-locks>
  <div data-blockcraft-root="true">...</div>
</section>
```

Do not remove or rewrite `data-bc-lock-kind` to change permissions. It is a
rendered projection of Yjs metadata; use
`doc.setBlockReadonly(blockId, readonly, {kind})` for model changes. Likewise,
the reveal attribute changes only appearance and never grants unlock access.

## Ordered Marker DOM Contract

Live rendering and Snapshot rendering share this marker structure:

```html
<button class="ordered-block-prefix">
  <span class="ordered-block-prefix__text">1.</span>
</button>
```

The circle preset adds `data-bc-marker-enclosure="circle"` to the button. Its
compact ring is theme-owned CSS geometry using `currentColor`, and even a
single digit is optically reduced inside it. The ring includes print color
adjustment and is not a Unicode circled-number glyph. Hosts may style the
documented classes and attribute but must keep the inner text span because live
and Snapshot views use the same contract. Pointer handlers should resolve the
button with `closest('.ordered-block-prefix')` instead of assuming it is the
direct event target.

## Collaboration Cursor Colors

`BlockCraftAwareness.setLocalUser()` accepts an optional concrete CSS
`color`. When omitted or invalid, the stable user ID maps to a curated
medium-dark palette. The runtime applies:

- the solid color to the 2px remote caret and `.blockcraft-cursor-tag`;
- the same color at 18% opacity to non-collapsed remote ranges;
- white label text, so it does not inherit the light theme's dark
  `--bc-color`.

Color is written to the collaboration overlay as runtime user state rather than
a theme token. A host that needs a product/account color should send
`{id, name, color}` through Awareness; ordinary theme overrides should focus on
the tag's typography, radius and shadow.

## Revision Markup Contract

Inline projection uses
`c-element[data-bc-revision-kind][data-bc-revision-state]`. Block insertion,
deletion and structural boundaries use the same state/kind attributes on the
block host plus `data-bc-revision-boundary-before`. Conflict state never reuses
comment markers; comments and revisions remain separate visual channels.

Hosts can override the light/dark defaults through these tokens:

```scss
--bc-revision-insert-color
--bc-revision-insert-bg
--bc-revision-delete-color
--bc-revision-delete-bg
--bc-revision-boundary-color
--bc-revision-conflict-color
--bc-revision-conflict-bg
```

The reusable review components use the existing iconfont and these variables;
do not replace their single-color icons with inline SVG or image assets.

Absolute objects keep their persisted `under` / `over` stacking layer while
marked. Because their image/canvas/frame descendants may be opaque, the base
theme does not use the ordinary host fill or inset stripe for them: pending
insertions use an external solid outline, pending deletions a dashed outline,
and conflicts a double outline. Host overrides must not raise `z-index` merely
to expose a marker, because that would change document placement semantics.

## Snapshot Viewer Styling

The standalone snapshot-viewer reuses the same block class naming and `[data-blockcraft-root="true"]` readonly styling model as the editor wherever practical.

Current viewer-specific entrypoints:

- `packages/editor/themes/components/snapshot-viewer.scss`
- `packages/editor/themes/base.scss` imports that file automatically

Practical rules:

- Keep viewer-only styles scoped under `.bc-snapshot-viewer`
- Reuse existing block classes such as `.paragraph-block`, `.table-block`, `.bookmark-block`, `.embed-frame-block`
- Prefer existing `--bc-*` tokens instead of hardcoded colors or spacing
- Treat viewer inline embeds (`.bc-snapshot-inline-embed`) as a lightweight display shell, not an interactive widget

## Adding Styles for a New Block

### 1. Create the style file

```scss
// themes/blocks/_my-block.scss
.my-block {
  padding: var(--bc-block-padding, 8px 0);
  border-radius: var(--bc-border-radius, 4px);

  .my-block-content {
    // Block-specific styles
  }

  // Dark theme overrides
  [blockcraft-theme="dark"] & {
    // Dark-specific styles
  }
}
```

### 2. Import in theme entry

```scss
// In the main theme file that imports all block styles
@import './blocks/my-block';
```

## CSS Custom Properties (Key Variables)

Read `themes/base.scss` and `themes/variables.scss` for the current variable list. Common patterns:

```scss
// Typography
--bc-font-family
--bc-font-size
--bc-line-height
--bc-fs                         // document base font size; root `fs` may override
--bc-lh                         // document unitless line-height; root `lh` may override
--bc-block-fs-scale             // editable paragraph `pfs` ratio
--bc-block-lh                   // editable block line-height override

// Spacing
--bc-segments-gap               // default inter-block gap in CSS px
--bc-block-sb                   // persisted paragraph space-before in pt
--bc-block-sa                   // persisted paragraph space-after in pt
--bc-next-block-sb              // following editable sibling's space-before
--bc-block-leading-sb           // first-child leading space-before
--bc-block-padding
--bc-block-margin

// Colors
--bc-text-color
--bc-bg-color
--bc-border-color
--bc-accent-color
--bc-selection-color
--bc-revision-insert-color
--bc-revision-insert-bg
--bc-revision-delete-color
--bc-revision-delete-bg
--bc-revision-boundary-color
--bc-revision-conflict-color
--bc-revision-conflict-bg
--bc-block-background-color         // current block's persisted backColor
--bc-block-border-color             // current block's persisted borderColor
--bc-render-unit-background-color   // content region's persisted backColor
--bc-render-unit-background-opacity // optional backOpacity; defaults to the shared solid-surface opacity
--bc-render-unit-border-color       // content region's persisted borderColor
--bc-render-unit-padding-top        // resolved content padding in layout px
--bc-render-unit-padding-right
--bc-render-unit-padding-bottom
--bc-render-unit-padding-left
--bc-text-box-writing-mode        // vertical-rl on vertical frames; unset = horizontal-tb
--bc-text-box-background-color    // text-box persisted backColor
--bc-text-box-border-color        // text-box persisted borderColor
--bc-text-box-padding-top         // resolved fixed-frame reserve (applied as an offset, not padding)
--bc-text-box-padding-right
--bc-text-box-padding-bottom
--bc-text-box-padding-left
--bc-text-box-shape-inset-top       // Shape catalog text-safe frame
--bc-text-box-shape-inset-right
--bc-text-box-shape-inset-bottom
--bc-text-box-shape-inset-left
--bc-text-box-word-art-*            // optional WordArt presentation projection
--bc-solid-block-background-opacity // default 82%; solid block surface opacity

// Border
--bc-border-radius
```

## Document Background Compatibility

Content surfaces that intentionally carry a solid fill must preserve the
document background context. Every editable `BaseBlockComponent` projects
`props.backColor` and `props.borderColor` through the public
`--bc-block-background-color` / `--bc-block-border-color` variables and
`data-bc-block-background` / `data-bc-block-border` attributes. The base theme
uses `color-mix()` with `--bc-solid-block-background-opacity` (default `82%`)
for the fill and paints a 1px solid outline only when a concrete border color is
present, so persisted appearance does not change block geometry or replace a
block's own border. No common padding is added. Every
`data-node-type="editable"` block host receives a 4px radius whether or not it
has a persisted outline. Block-specific focused/selected highlights keep their
existing priority when they use outline, border, box-shadow or an internal
overlay. Selection may still provide its existing background feedback without
rewriting the persisted appearance.
Blockquote is the deliberate exception: its `borderColor` colors the 1px left
accent bar and does not add a rectangular host outline.

Non-editable blocks do not receive the common variables or state attributes,
even if an older snapshot contains these props. A block-specific compatibility
surface such as Callout may continue consuming its own legacy variable. The
bundled `render-unit` content region deliberately owns
`--bc-render-unit-background-color` and `--bc-render-unit-border-color`: its
fill uses the shared solid-surface opacity, while its 1px inner outline does not
change region geometry. Live blocks and Snapshot Viewer shells project the same
opaque props into these variables; `transparent`, empty and missing values
render as no visible override.

The same region projects resolved surface insets through
`--bc-render-unit-padding-top/right/bottom/left` (each defaults to `0px`) onto
`.render-unit-content`. A persisted background image is an absolutely
positioned `.render-unit-background-image` sibling behind that content, not a
CSS `background-image`; it is non-interactive, inherits the region radius and
uses `object-fit/object-position/opacity` from the normalized model. Do not move
the image inside `.render-unit-content`, where padding would shrink it, and do
not replace it with raw `url(...)` CSS because print/PDF resource waiting tracks
real images.

The bundled `text-box` projects the same resolved surface contract through
`--bc-text-box-background-color`, `--bc-text-box-border-color` and
`--bc-text-box-padding-top/right/bottom/left`. Shape catalog geometry is painted
as fill and outline SVG layers around the child viewport. Its decorative
`.text-box-block__background-image` is a real image between those layers and is
clipped to the same Shape path. `--bc-text-box-shape-inset-*` carries the text-safe
frame — from the artwork registry when `bgi` names a drawing, otherwise from the
Shape definition and is summed with the padding variables into the
viewport's own `top/right/bottom/left`, with `padding: 0` — the reserve is
geometry on all four sides. As real padding it only held on the two start
edges: padding offsets where the first line begins, while the end edges are
trailing space in the flow and `overflow` clips at the padding box, so text
taller than the frame painted straight through the bottom reserve. Layout is
unchanged while the text fits. Segment spacing inside the frame is
restated logically (`margin-block-start` / `margin-block-end`) so a vertical
frame stacks on the right axis, and keeps base.scss's `--bc-block-sb` /
`--bc-block-sa` fallbacks — writing the gap literally there outranks those two
variables and breaks 段落设置 spacing inside text boxes only.
`--bc-text-box-word-art-*`
projects an optional WordArt presentation without moving text ownership out of
ordinary child Blocks. The fixed paint viewport owns clipping/scrolling so the
outer shell does not clip resize and rotation handles. Live editing may scroll
overflowing prose, while readonly, Snapshot Viewer and print output clip to the
persisted frame. Keep exactly one `data-bc-print-visual-surface` on the painted
object and mark transform handles `data-bc-print-exclude`. While a descendant
text selection owns the frame, only the lightweight entry remains visible:
resize/rotation handles and the stronger selected outline are exclusive to the
whole-object `.selected` state, matching the shape block convention, and the
hidden browser focus outline and scrollbar chrome on the editable viewport stay
suppressed. The intentional nested
`contenteditable=false → true` editing island remains in place. Ordinary
text-box prose uses a column layout whose last real child grows across remaining
block-axis space, so native caret hit testing reaches the paragraph throughout
the frame without a blank-area event handler. The WordArt presentation variant
does not grow its last child because it owns vertical alignment itself.

形状的边缘入口由 `bc-object-edge-controls` 与对象交互主题控制；混合模式仅聚焦时显框，设计模式也允许悬停显框；
中心不拦截文字，命中带外侧 6px、内侧 2px，选中后交给已有形状操作控件。
该入口不复用整块 hover 的主题 mixin；嵌套形状出现时外层容器入口让位。

文本框、可编辑艺术字和填写区共享内部 `object-corner-controls` 主题 mixin，
负责显示各自 `bc-object-corner-controls` 的轻量入口。设计模式整块悬停、各模式内部聚焦时（沉浸模式除外），
细边框与顶部 24×14px 浮动抓手同时出现；默认不再创建四个轻量 L 角、角部按钮与其命中区。
顶部抓手沿对象顶边居中，使用 `bc_yidong` 字体图标，沿用轻量入口的显隐和打印排除规则。
颜色使用 `--bc-active-color` 与背景主题变量，正文编辑区域不作为拖动面。
文本框、填写区通过 `.selected` 隐藏入口，艺术字使用 Plugin 持有的
`.word-art-block--object-selected`，因为 editable Block 的 `.focused` 同时用于文字光标与整块覆盖。
整块选中后显示既有 `shape-resizer`；普通文字聚焦仅显示轻量入口，不显示缩放器。
嵌套对象只显示最近对象的入口，拖动源隐藏入口；只读不创建，打印排除该控件。

Snapshot Viewer creates the same common or block-specific variables and
attributes on its block shells.
Replacement block components that extend `BaseBlockComponent` receive the live
projection automatically; themes should consume the variables instead of
writing opaque inline backgrounds.

Callout models continue to persist the original opaque `props.backColor`.
The renderer also keeps the legacy `--bc-callout-background-color` binding for
replacement-theme compatibility; do not store an alpha-adjusted replacement in
Yjs, because repeated edits or exports would otherwise compound opacity.

```typescript
host: {
  '[style.--bc-callout-background-color]': 'props.backColor',
}
```

> **`--bc-lh` is a unitless line-height *ratio* (default `1.5`), not a px length.** This is deliberate:
> CSS `zoom` (e.g. the table fullscreen view) does **not** scale a px `line-height` in WebKit / WKWebView
> (Tauri, Safari) — only the font grows, so a px line-height makes text rows overlap as you zoom in.
> A unitless ratio scales with the font on every engine.
> - When overriding it, supply a **unitless number** (`--bc-lh: 1.6`), never a px length.
> - Need a "one line tall" px length? Derive it: `calc(var(--bc-lh) * var(--bc-fs))`.
> - Headings use `line-height: var(--bc-lh)` directly — the ratio already scales against each
>   heading's enlarged `font-size`, so no `* N` multiplier is needed.

共享字体目录包含 `xingkai`（行楷）、`dengxian`（等线）、`lishu`（隶书）、
`youyuan`（幼圆）、`cambria`、`palatino`、`trebuchet`（Trebuchet MS）与 `courier`（Courier New）。
正文、文本框和艺术字的字体选择器共用此目录。
该预设优先使用系统的 `Xingkai SC` / `STXingkai`，缺少时回退到楷体、衬线体；
不捆绑或下载字体文件。外部 HTML 的行楷字体栈会识别为 `xingkai`，优先于其中的楷体回退。

Root `ff/fs/lh` are persisted document defaults. `ff` resolves a short catalog
ID to a portable platform font stack; `fs` projects `--bc-fs`; `lh` projects
`--bc-lh`. Editable `lh` projects `--bc-block-lh` and takes precedence only for
that paragraph. Snapshot Viewer follows the same precedence.

Editable `pfs` projects `--bc-block-fs-scale` and an effective relative
`font-size` on the editable host. `resolveEditableBlockFontScale()` combines
the paragraph value with built-in heading/caption presentation scale before
that percentage is written. Inline `t:fs` remains an `em` multiplier, so
effective text size is root `fs × pfs × t:fs`; ordered/bullet/todo prefixes
inherit the same host size. This percentage projection avoids relying on
nested CSS typed-arithmetic support in older WebKit/WKWebView.
Every `[data-block-id]` resets the scale variable to `1` to prevent a container's
custom property from leaking into nested paragraphs.

Paragraph spacing and indentation use typographic points in persisted props,
then project through the variables above. The common theme owns exactly one
gap between siblings:

```scss
margin-bottom: max(
  var(--bc-block-sa, var(--bc-segments-gap)),
  var(--bc-next-block-sb, 0pt)
);
```

The last child resets that margin to zero. A first editable child's `psb`
projects as `padding-block-start` through `--bc-block-leading-sb`; later
paragraphs contribute through the previous sibling's
`--bc-next-block-sb`. Do not add an independent `margin-top` rule: it would
reintroduce browser-dependent collapse,
double gaps in flex/text-box containers and pagination stride drift. Snapshot
Viewer projects the same sibling variables after mounting or patching children.

### Whole-document visual scale

`doc.viewScale.attach(surface)` applies an inline CSS `zoom` plus the public
`data-bc-view-scale` attribute to the supplied host surface. The surface is
host-owned and should wrap only document chrome/content that must scale; fixed
toolbars and zoom controls should remain outside it. Do not add a competing
`transform: scale(...)` or CSS `zoom` to BlockCraft roots, pagination surfaces
or root block hosts—the manager uses the browser's effective layout/visual
ratio to keep virtualization and pointer placement coordinates consistent.

BlockCraft restores the surface's previous inline `zoom` value and attribute on
detach/destroy. Print and PDF rendering do not inherit this live-view scale.

### Table Block Fullscreen View

Defined in `themes/variables.scss`; theme-neutral defaults (override per theme if needed):

| Variable | Default | Purpose |
|---|---|---|
| `--bc-table-fullscreen-z` | `800` | z-index of the fullscreen table container (kept below `1000` so CDK Overlay panes — structure-toolbar, float-toolbar, mention panel — naturally float above the table) |
| `--bc-table-fullscreen-mask-z` | `799` | Reserved compatibility token for the former dimming-mask implementation |
| `--bc-table-fullscreen-overlay-bg` | `rgba(0, 0, 0, 0.55)` | Reserved compatibility token for the former dimming-mask implementation |
| `--bc-table-fullscreen-padding` | `24px` | Horizontal padding between viewport edge and the table |
| `--bc-table-fullscreen-radius` | `8px` | Corner radius (overridden to `0` in the default `is-fullscreen` rule) |
| `--bc-table-fullscreen-bg` | `var(--bc-bg-elevated, #fff)` | Background color behind the table while fullscreen |

Companion class names (also part of the public CSS contract):

- `.table-block.is-fullscreen` — applied to the table host while in fullscreen view
- `.bc-table-fullscreen-btn` — hover button at the top-right of every table block
- `body.bc-table-fullscreen-lock` — applied to `<body>` to suppress background scrolling while a table is fullscreen
- `.bc-table-fullscreen-isolation-container` — applied to each ancestor on the active table's DOM ownership path
- `.bc-table-fullscreen-isolation-branch` — applied to the child branch that continues from an isolation container toward the active table

Fullscreen is a viewport-isolated view. The table remains at its Angular-owned
DOM position so pagination, virtualization and collaborative block reconciliation
keep ownership of the same node. BlockCraft marks the active table's ancestor path
with the isolation classes above and hides only sibling branches. Do not hide an
ancestor on that path: Chromium can otherwise dispatch native `input` without
`beforeinput`, bypassing the editor input transformer and collaborative text model.
The markers are refreshed if pagination or virtualization reparents the table.

While a paginated table is fullscreen, BlockCraft also suspends its page-only
spacers, inline gaps and masks, and temporarily removes the paginated root's own
centering transform. This lets `position: fixed; inset: 0` use the viewport rather
than the paper coordinate system. The latest pagination projection is replayed on
exit. A host document scale attached through `doc.viewScale` is cancelled on the
fullscreen table host and restored exactly on exit; table-local fullscreen zoom
continues to work independently. CDK overlay containers remain visible for menus
opened from the table.

Override example (dark theme can adjust the isolated fullscreen background):

```scss
body[blockcraft-theme="dark"] {
  --bc-table-fullscreen-bg: var(--bc-bg-primary, #171d24);
}
```

### Inline Object Views

Bundled inline shapes and WordArt share
`.bc-inline-object-shell > .bc-inline-object-frame`. The frame is also marked
with `[data-bc-inline-float-frame]`; wrapped shells use
`[data-bc-inline-float-layout="wrap"]`. Shape-specific presentation uses
`.bc-inline-shape-frame`, `.bc-inline-shape__geometry` and
`.bc-inline-shape__text`; WordArt uses `.bc-inline-word-art-frame` and
`.bc-inline-word-art__text`.

`.bc-inline-object-shell--selected` is ephemeral Plugin UI state and controls
the default active-color outline. Host themes may refine that outline and the
presentation classes, but must not change the frame's positioned geometry,
remove the data attributes or add/remove the selected class directly.
During a Shape/WordArt Embed drag, the presentation-only
`.bc-inline-object-drag-proxy` is appended under `body`. Themes may refine its
opacity/outline, but it must remain inert and must not participate in editor
layout or serialization. Because that proxy is outside `[data-blockcraft-root]`,
the bundled theme repeats the WordArt frame/text display and box-model rules on
the proxy itself. Keep those global proxy rules aligned with the ordinary
`.bc-inline-word-art-frame` / `.bc-inline-word-art__text` rules; otherwise CSS
WordArt can change size or lose its effect transform only while dragging.

### Inline Embed Selection

Every inline Embed receives `.bc-inline-embed--selected` on its outer
`c-element` while the local model selection fully covers that one-length
Embed. This applies equally to built-in and host-registered converters. The
base theme applies `--bc-select-background-color` directly to the atomic
wrapper, without a border, outline or ring. This makes Shift+Arrow selection
visible even though the converter-owned content is
`contenteditable=false`. The class is ephemeral Selection presentation state:
host themes may refine its background color or radius, but must not add/remove
the class or persist it in document content.

### Pagination View

`PaginationPlugin` applies these public tokens only while live pagination is enabled:

| Variable | Default | Purpose |
|---|---|---|
| `--bc-page-sheet-bg` | `#fff` | Sheet background |
| `--bc-page-sheet-shadow` | subtle border/shadow | Sheet elevation |
| `--bc-pagination-backdrop-bg` | `#f5f5f4` | Scroll-container background between sheets |
| `--bc-page-chrome-color` | `#9b9b97` | Header/footer text color |
| `--bc-page-chrome-fs` | `12px` | Header/footer font size |
| `--bc-page-content-height` | runtime page content height | Maximum height inherited by oversized atomic/code blocks and direct-root fixed flow objects in live and print pagination |
| `--bc-object-group-padding` | `4px` | Visual-only outward group selection-frame offset; does not reduce content sizing or pagination caps |

Runtime classes are `.bc-paginated` on the document root,
`.bc-paginated-scroll` on the actual scroll container,
`.bc-pagination-surface` on the root's direct parent, plus
`.bc-pagination-backdrop`, `.bc-page-sheet`, `.bc-page-header` and
`.bc-page-footer`. A configured first-page host header additionally receives
`.bc-pagination-document-header` while projected. The scroll container and pagination surface can be the same
element, but need not be: the former owns scrolling/background while the latter
owns page/content centering and their shared coordinate origin. These are
plugin-owned states: host code may style them but must not add/remove them
directly.

Absolute block placement remains relative to the root children container in
both continuous and paginated views. Pagination publishes the deterministic
`--bc-placement-content-origin-y` runtime value, equal to the root's effective
top content padding, and placement rendering, pointer geometry and virtual
visibility all consume that same origin. Themes must not override it. A
projected host `documentHeader` must never introduce a separately measured
offset.

Oversized table-cell continuation additionally owns
`.bc-pagination-table-flow-mask`, `[data-bc-inline-pagination-gap]` and
`.bc-page-nested-height-locked`. Block/cell-start continuations use a reversible
inline margin on the existing Block host instead of inserting a sibling gap
element. Text-line continuation markers are transparent and contribute only
layout height; the table-level mask is the sole owner of sheet/background bands
in the shared table coordinate system. The nested-height class caps only an
irreducible nested atomic child to the page content height. Nested
media and embeds are clipped at that boundary; nested code blocks keep their
header visible and scroll `.edit-container-wrapper` inside the one-page cap. These
classes/attributes are reversible plugin state, not document data. Host themes
may change their inherited page colors through `--bc-page-sheet-bg` and
`--bc-pagination-backdrop-bg`, but must not attach, remove, resize or make the
mask/inline marker interactive.

`--bc-page-content-height` is geometry-owned: the pagination controller derives
it from paper size, margins and header/footer bands. The theme predefines the
top-level atomic/code-block cap with `max-height: var(--bc-page-content-height)`;
hosts may read the token but should change page geometry through
`PaginationPlugin.updateConfig()` rather than overriding it independently.
Direct-root top-bottom `object-group`, `text-box`, `word-art` and `shape` frames
are always capped by the same token. Their Block hosts keep overflow visible so
selection outlines, resize endpoints and rotation controls outside the frame
are not clipped; each object's existing inner content layer remains responsible
for content overflow. The selector is deliberately owned by root flow:
absolute objects below `placement-layout` remain uncapped, while members of a
top-bottom `object-group` inherit the same frame cap from that outer flow unit.
The member cap uses the full page content height. `--bc-object-group-padding`
only controls the outward selection frame and drag edges; host padding is zero
and local placement geometry is independent of interaction chrome.

Pagination overrides live in `themes/plugins/pagination.scss`, imported at the
end of `base.scss` so they can safely override ordinary block styles. The cap
is applied according to each block's measurement needs: code keeps its host
overflow visible and scrolls `.edit-container-wrapper`; image retains host
clipping so its uncapped `scrollHeight` remains available to pagination, and
moves its horizontal resize handles inside the clipping boundary. Other
top-level void blocks retain whole-host clipping. The same rules target `.bc-paginated` and
`.bc-print-content`; do not create a separate host-only print variant.

Live pagination normalizes every direct root block to `margin-top: 0`; the fixed
print compositor repeats that invariant after reparenting blocks into page boxes.
Themes must not reintroduce a direct-child top margin under `.bc-print-content`,
because the stable item heights and page breaks were measured without it.

## Checklist

- [ ] Block styles use CSS custom properties for theme-ability
- [ ] Dark theme overrides via `[blockcraft-theme="dark"]` selector
- [ ] Styles scoped to block class (e.g. `.my-block {}`)
- [ ] Style file imported in theme entry
- [ ] Toolbar/overlay styles don't leak to document content

## Source Files to Read

For the current variable definitions and theme patterns, read:
- `packages/editor/themes/base.scss`
- `packages/editor/themes/variables.scss`
- `packages/editor/themes/light.scss`
- `packages/editor/themes/dark.scss`
- `packages/editor/themes/plugins/pagination.scss`
- Any existing block style file in `packages/editor/themes/blocks/` as reference

## 迷你对象浮动工具栏（未发布）

对象格式、整组、块级图片和内容区域共用的侧条由 42px 缩为 34px，按钮 26px、图标 14px、内距 3px、间距 2px。
共享 `bc-floating-toolbar` 在快捷条上方显示 20px 圆形加/减按钮（24px 命中范围、3px 间距）；收起仅保留该按钮。
整组和图片块使用侧栏加二级布局面板；多对象混选保留横向命令条。触摸主指针保留较大操作面积。
常规设置卡宽 240px，内容区域设置卡宽 208px；内距 8px、设置行间距 6px，桌面输入控件统一 24px 高。
布局卡独立使用 `object-layout-panel`：宽 176px、内距 6px，选项为 28px 单列行（触摸主指针 34px），左侧图标和名称、右侧选中标记；底部对齐与层级命令分组紧凑排列。
颜色、背景、分隔线与投影复用既有 `--bc-float-toolbar-*` 和 `--bc-fixed-toolbar-shadow`，
不新增文档样式或持久化属性。收起状态的创建与运行时切换见 `blockcraft-toolbar.md`。

`--bc-floating-toolbar-content-height` 是工具栏根据 Overlay 可用空间投影的只读布局预算，设置卡和快捷条分别限制自身高度；外壳不承担滚轮滚动。
