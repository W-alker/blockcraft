# template-deco 装饰开发规则（新增物料照这个来）

装饰尺寸**一律百分比、禁用固定 px**——要随容器自适应，且要移植到 cses（doc page 继承父元素宽，死 px 会撑破/对不上；cqw 太新已弃用，统一走 CSS）。按物料**长什么样**选参照系：

| 物料形态 | 参照 | 存 | 渲染 | 现有例子 |
|----------|------|-----|------|----------|
| **图/占一块**（宽度即内容） | root 内容宽 | `wr` 宽度比 + `ar` 宽高比 | `doc.objectSizing.resolve()` | logo · 图片/视频块 |
| **行内文字字形**（字体 glyph） | 正文字号 | `size` 字号% | `font-size:%` | 图标 |
| **复合卡片**（图标+文字，内部定死 px） | 列宽 | 不存（自动） | `zoom = 列宽/设计宽` | 天气 chip |
| **固定件**（不缩放） | — | 无尺寸属性 | — | 日期 · 头像 |

## 怎么落地

- **root 相对尺寸（图/块）** → Schema 声明 `metadata.objectSizing`，组件复用
  `doc.objectSizing.resolve()`、`deriveObjectSizeFromPixels()` 和
  `block-resizer.resizeCommit`，只存顶层 `wr/ar`；旧 `width/height` 仅用于载入兼容。
- **字号%（行内字形）** → `font-size:${size}%`，`100%`=齐正文。它是文字、跟文字走，不碰容器、不用 JS。
- **复合卡片（天气等）** → 内部写死 px、`width:%` 只撑框不缩内容，故整体 `zoom` 跟列宽：字段初始化器里
  `wireColumnZoom(s => this.zoom.set(s))` 一行接完（`_shared/page-size.ts`，= 列宽/设计宽；afterNextRender 时序、
  销毁成对、markForCheck 全封装在内，别再手挂 observeColumnScale）；流内 host 宽由基类给 `fit-content`
  （不存 width 的物料盒子收缩到内容，独占对齐才有目标可挪——**别**为对齐补 width%）。模板 `[style.zoom]="zoom() === 1 ? null : zoom()"`。cqw 也能纯 CSS 做但项目不用。

## 三条硬坑

1. **尺寸参照必须统一为 root children 内容盒**。不要在动态组件里再装自己的
   `ResizeObserver` 或同步 `getBoundingClientRect`；统一消费 `doc.objectSizing` 缓存。
2. **存储时算一次**（拖拽/提交那下写进 props），渲染只读 props，别每帧重算。
3. **移植 cses**：`.editor-container` 选择器要能选到其编辑列（选不到会落 `DESIGN_BASE_WIDTH=768` 兜底，那是 playground 设计宽、不是真值）；`--tpl-editor-scale` + 宽度滑块是**调试脚手架**，别带走，cses 让父容器驱动列宽、`%` 物料自动跟。

> 「整个模板随容器等比缩放（正文也缩）」是**尚未做的独立选项**：需在列上挂一个 ResizeObserver 按列宽算基准字号，届时文字/图标/复合卡片全部随容器缩。属于「正文要不要响应式」的决策，与单个物料无关，真做了字形/zoom 类会自动跟上。
