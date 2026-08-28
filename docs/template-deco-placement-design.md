# 模板装饰 · 三态排版 + layout 悬浮层 设计

> **历史设计**：`template-layout`、`template-weather` 等名称仅用于旧快照迁移。现行 placement 使用 bundled `placement-layout`，动态物料生命周期见 [`template-dynamic-material-lifecycle.md`](./template-dynamic-material-lifecycle.md)。

> 状态：已定稿，按此实现（本轮仅 logo 验证）。
> 边界：全部在 `apps/playground/`，不碰 `packages/editor` 框架，不写 MIGRATIONS、不 bump 版本。

## 1. 目标

装饰物料（先做 logo）提供三种排版方式，右侧面板可切换：

| 模式 | 视觉 | 数据落点 | CSS |
|------|------|----------|-----|
| **独占一行** | 块，独占整行 | `root` 流内 | 默认 block |
| **图文环绕** | 图靠一侧、文字绕排 | `root` 流内 | `float:left\|right` + 防贴死 margin |
| **自由悬浮** | 绝对定位、可拖可缩、可压文字上下 | `layout` 容器 | `position:absolute` + `left/top/z` |

## 2. 结构决策：root 下的 layout 容器（不做平级节点）

**结论：悬浮物料放进 root 的一个专用子容器 `layout`，不做"和 root 平级的第二棵树"。**

论证（对着框架源码，非臆断）：

- **数据层本就是扁平的**：所有块存在一张 `yDoc.getMap(Y_BLOCK_MAP_NAME)`（id→yBlock，`doc/index.ts:147`），树只是各块 `children` 里的 id 引用。"平级"在存储上不存在，只是 layout 的 id 出不出现在 `root.children` 里。
- **框架从 root 单点装配**，平级要把整条线复制一份：
  - 渲染：`initBySnapshot` 只挂 root 一棵树、`if(this._root)return` 禁二次挂载（`doc/index.ts:152`）
  - 导出：`exportSnapshot()` 从 rootId 起 `toSnapshot()`（`doc/index.ts:431`）——平级树进不了模板，悬浮物存不下
  - 撤销：`new Y.UndoManager(yBlockMap)` 只追踪这张 map（`undoManger.ts:48`）——另开 map/doc 会让"浮起"迁移只回退一半，数据撕裂
  - 组件解析：`getBlockById` 走 vm 组件表，只为 root 树建组件——平级树的块拿不到组件，`updateProps`/面板/拖拽全废
- **隔离性来自独立 children 数组，与层级无关**：范围删除 `queryBlocksThroughPathDeeply` 只圈 from…to 之间的兄弟（`doc/index.ts:370`），layout 钉在 root 末尾、扫不进去；正文的退格/删除走 `prevSibling/nextSibling`（同父数组内），永远取不到 layout 里的物料。
- **业界同型**（训练知识，供参考）：BlockSuite/AFFiNE 的 `affine:surface`、PPT 的 `spTree` 都是"同文档树里的专用容器"；Word/GDocs 的锚定模型反而正是最初被否的"删段带走图"行为。

## 3. layout 容器规格

- flavour `template-layout`，`nodeType: block`，`props: {}`，component 渲染 `.children-render-container`。
- **视觉 = 零高度覆盖层**：host `position:absolute; top:0; left:0; width:100%; height:0; margin:0`（用 host 绑定/内联，压过 base.scss 的 `[data-block-id]{position:relative}`）。
  - 意义：它子物料的 `left:x%` 相对 layout 宽（=内容宽 768）、`top:y px` 从 layout 顶（=内容顶）——**原点与物料在 root 里时一致，迁移零改坐标**。
  - 零高度 → 不挡点击；子物料各自 absolute、可点可拖。
- schema：`renderUnit:true`、`hideInInsertMenu:true`；**绝不打 `isLeaf`**（isLeaf 块被 `schema/index.ts:52` 拒绝当 root 子块）。编辑/使用两套字典共用同一 schema（它只装子物料）。
- **懒建**：第一次有物料变"自由悬浮"才创建，钉为 **root 末子**；空模板导出保持干净。

## 4. 物料属性（logo）

- `float?: 'left' | 'right'` —— 单属性编码独占/环绕：无=独占，`left/right`=环绕并定侧。
- `x/y/z`：有 x（且在 layout 里）=悬浮，优先级最高。
- `width`：现状（页宽%）。

**渲染判定（优先级）**：在 layout/有 x → 悬浮(absolute + x/y/z)；否则 `float` 有值 → 环绕(`float` + margin)；否则 → 独占(block)。编辑、渲染两组件同步。

## 5. 右侧面板

- 「排版方式」三选一（独占一行 / 图文环绕 / 自由悬浮），切换即迁移。
- 环绕时出「图在左 / 右」；悬浮时出 X/Y/Z（+置顶/文字后）。
- **新增「删除物料」按钮**：悬浮物料绕开了框架选区（`active-deco.service.ts` 注释），键盘删除够不着单个物料，必须给删除入口。
- 迁移逻辑收进 **`core/placement.ts`（排版域，2026-07 结构审查后从 `decos/_shared/` 迁入）**：`ensureLayout` / `applyPlacement(doc, id, mode)` / `commitAbsolute`，move + 改属性打进**一个 Yjs 事务** = 一步撤销（顺带修掉旧的 floatToEnd+updateProps 两步撤销）。该文件同时是**坐标系唯一真源**（`resolvePlacementBox`/`pxToPlacementPct`/`measurePlacementXY`，free-drag 与面板共用）和 `LAYOUT_FLAVOUR`/`handleContainerBlankMousedown` 的归属地；三态 → host CSS 的映射收敛在组件基类 `decos/_shared/placeable-deco.base.ts`（编辑/渲染组件共同继承）。
  - ⚠️ **实现关键**：layout 的懒建（`ensureLayout` 的 `insertBlocks`）**必须在迁移事务之外**先跑。因为 Yjs observer 在**最外层**事务结束才触发、块组件才被创建；若把建 layout 嵌进迁移事务，`moveBlocks` 的 `vm.get(layoutId)` 会拿不到目标组件而**静默不动**。撤销步数：两个事务前后脚落在 Y.UndoManager `captureTimeout`(500ms) 合并窗内，**实测（2026-07-15，真实拖拽路径）首次悬浮也是一步撤销**（此前本行写"两步"是未实测的推断）；注意这是时间窗涌现行为而非框架显式保证——框架若改 captureTimeout 或中间插入异步会退化成两步（仅 UX，不损数据）。
- 切"自由悬浮"时**就地**量当前视觉 x/y（同 free-drag 的 lift），点一下即浮起、不跳。

## 6. 隔离保证 & 诚实边界

- ✅ 悬浮物料对"删正文"（中间删、选到末尾删）免疫——它们的 id 在 `layout.children`，不在 `root.children`。
- ✅ 全选删 root 会连 layout 一并清 = "清空文档带走装饰"（符合预期；平级方案反而会留幽灵装饰）。
- ⚠️ layout 容器本身是 root 末子，文末段尾按 Delete 会先 `selectBlock(layout)`（高亮），**再按一下**才删（连带删光悬浮物）——看得见、两步、非误删。已确认 playground 级够用，不为它动框架。

## 7. 必改点（不改埋雷）

1. **两个 surface 的 `onContainerMousedown`**：现在点空白在 root 末尾追加段落，会插到 layout 之后、破坏"钉底"，且默认层级乱（同层 z-auto 按树序绘制）。改为：取最后一个**非 layout** 子块判断、新段插在 **layout 之前**。
2. **layout schema 注册进两套字典**（`TEMPLATE_EDIT_SCHEMAS` + `TEMPLATE_RENDER_SCHEMAS`）——否则使用页渲染不出 layout。
3. **面板删除按钮**（见 §5）。

## 8. 留给实测（无崩溃风险，验手感）

- 全选删后光标落点；文末两步选删 layout 的观感。
- 三态互切后位置/环绕/层级的视觉正确性。

## 9. 范围

本轮仅 logo 跑通全链路；验证 OK 后再把 `float` 属性、host 绑定、placement 调用铺到 colorbox/weather。
