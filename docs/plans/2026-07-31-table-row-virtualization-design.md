# BlockCraft 表格行级虚拟渲染设计

> 状态：已确认，Phase A 已实现
> 日期：2026-07-31
> 范围：模型级表格高度估算、表格物理行稀疏挂载、行带、模型化表格交互
> 前置设计：`2026-07-19-model-first-root-virtualization-design.md`

## 1. 背景

BlockCraft 当前的虚拟渲染只窗口化 root 的直接子块。一个 table 是一个 root render unit；只要 table 进入 root 窗口，其 table-row、table-cell 和单元格内容组件就会被整棵创建。因此，一张几千行、十余列的表格仍可能一次创建数万级 Angular Component 和 DOM 节点。

现有表格能力同时大量依赖已挂载组件：

- 合并单元格矩阵通过 row/cell Component 构建；
- 表格结构命令使用 `getChildrenBlocks()` / `getBlockById()`；
- 矩形选区高亮持有 `TableCellBlockComponent` 集合；
- 行栏为全部 `rowIds` 创建 handle；
- 行高记录来自已挂载 `<tr>` 的 `ResizeObserver`；
- 分页在 `<tbody>` 中注入页缝行和续页表头克隆。

因此，目标不能通过递归调用 `RootVirtualizationManager` 达成。需要先建立模型化的表格结构/交互投影，再让表格拥有专用的行挂载策略。

## 2. 已确认需求

- 只做纵向行级虚拟化；所有列始终完整渲染。
- 表格继续随编辑器主页面滚动，不新增普通态内部纵向滚动区。
- 目标规模为单表几千行。
- `rowspan` 必须尽量保持原生语义；跨行合并覆盖的行作为不可拆分整体进入或退出窗口。
- 第一阶段显式启用，默认不改变现有表格渲染行为。
- 精确分页、打印和 PDF 可以显式要求完整表格视图。

## 3. 目标

### 3.1 功能目标

1. 未挂载的大表格能从完整模型估算合理总高度，主滚动条不再把几千行表格当作固定约 240px 的块。
2. table 挂载后只创建可见行、overscan 行、交互 pin 行以及必要的 `rowspan` 行带。
3. 表格文本输入、中文 IME、矩形选区、Arrow/Tab、复制剪切粘贴、行列操作、全屏和协同结构变化在稀疏行视图下保持一致。
4. 屏外表格数据仍完整存在于 Yjs / `BlockModelGraph`，命令不得为读取或写入屏外区域而批量创建组件。
5. 单表虚拟化异常只降级该表，不影响 root 虚拟化或其他表格。

### 3.2 性能目标

- 普通滚动帧的工作量与可见窗口相关，不扫描全表。
- 高度偏移查找保持 `O(log B)`，其中 `B` 为行带数量。
- 结构或合并关系变化允许在冷路径重建模型索引。
- 已访问窗口的增加不会让 retained row Component 数量无限增长。
- 选中一个跨几千行的矩形不会让挂载数量随选区面积增长。

## 4. 非目标

- 第一阶段不做列虚拟化。
- 不支持从 `rowspan` 行带内部切开 DOM；极端大跨度允许牺牲该局部的虚拟化收益。
- 不把任意 container 自动变成递归虚拟容器；第一阶段仅 root 和 table 使用内部稀疏子视图能力。
- 不用 CSS `content-visibility` 代替组件级虚拟化；它无法限制 Angular Component、InlineRuntime 和订阅数量。
- 不将 DOM 实测行高写回 Yjs。行高受内容宽度、字体、主题和浏览器影响，不是协同业务状态。
- 第一阶段不让 experimental sparse pagination 直接消费表格行带投影；精确分页先使用完整表格视图租约。

## 5. 核心方案

采用“通用纵向窗口内核 + 表格专用控制器”：

```text
主滚动容器
    │ scroll / resize（单一监听，rAF 合并）
    ▼
DocumentViewportCoordinator
    ├── RootVirtualizationManager
    └── TableRowVirtualizationController（仅已挂载且接近视口的 table）
            ├── TableRowBandIndex
            ├── TableModelGrid
            ├── VerticalWindowEngine
            ├── SparseChildViewAdapter
            └── TableSpacerLayer
```

通用内核只负责一维高度与窗口计算。表格控制器负责 `<table>` 结构、行带、表格交互、行栏和兼容降级。root 与 table 共享计算/生命周期原语，但不共享业务控制器。

## 6. Phase A：模型级表格高度估算

模型高度估算是独立里程碑，先于表格行稀疏挂载交付。

### 6.1 当前缺口

`estimateModelBlockHeightDetails()` 当前没有 table 专用估算。table 通常回退到 `estimatedHeights.table` 或默认高度，即使模型中已有几千个 table-row。

`table-row.props.height` 默认是 60；DOM 实测高度仅存在于 `TableBlockComponent._rowHeightsRecord`，不会持久化。因此模型估算应把 props height 作为估算下限，而不是把本地测量写回模型。

### 6.2 估算规则

新增内部 `TableModelHeightEstimator`，由 `estimateModelBlockHeightDetails()` 在 flavour 为 `table` 时调用：

```text
rowEstimate(rowId)
  = positive(row.props.height)
    ?? positive(config.estimatedHeights['table-row'])
    ?? DEFAULT_TABLE_ROW_HEIGHT

tableEstimate(tableId)
  = max(
      configuredTableFallback,
      tableChromeEstimate + sum(rowEstimate(rowId))
    )
```

约束：

- 只遍历 table 的直接 row children，复杂度 `O(rows)`；不展开全部 cell 内容。
- `rowspan` 不重复计高；估算按物理行求和，行带只影响挂载边界。
- table 不合法或无 row 时回退现有 flavour/default estimate。
- 结果标记为 model-driven，但不等于精确 DOM 几何；分页/打印仍必须检查自身的 `exact` 条件。
- 结构变化和 row height props 变化使相关 table 估算失效；文本变化不触发全表模型扫描。

### 6.3 通用价值

即使 `tableRows.enabled` 为 false，该估算也能改善：

- root 虚拟化首次进入大表格前的总滚动空间；
- `navigateToBlock()` 对大表格内部目标的初始投影；
- sparse pagination 的非精确预布局；
- 任何只依赖模型、不允许预挂载完整 table 的布局消费者。

## 7. 领域组件与职责

### 7.1 `VerticalWindowEngine`

包内纯计算内核，不依赖 Angular、Block、DOM 或 Yjs。

输入：

- 有序 item stable IDs；
- item 估算/实测高度；
- viewport 在本容器坐标系中的起止 offset；
- overscan；
- 多来源 pin indices；
- retained view budget。

输出：

- 应挂载的有序 segments；
- 每个未挂载 gap 的高度；
- 总投影高度；
- offset → item index 查询；
- stable-ID scroll anchor 的恢复偏移。

内部复用或抽取现有 `HeightMap`、`PinRegistry`、`mergeToSegments` 和 viewport-range 算法。高度更新和 offset 查询保持 `O(log N)`；普通窗口 diff 与已挂载范围相关。

### 7.2 `SparseChildViewAdapter`

`DocVM` 的包内稀疏子视图边界，解除“只有 root 可以稀疏挂载”的硬编码，但不开放任意递归配置。

每个注册 parent 的直接 child 有三种视图状态：

1. `uncreated`：YBlock 可达，无 Component；
2. `mounted`：Component 子树已创建并连接到 parent 容器；
3. `retained`：Component 子树断开并暂停视图工作，受有界缓存管理。

adapter 提供基于 stable ID 的内部操作：

- 确保一个 child subtree 被创建；
- 按 parent 模型 index 挂载；
- 从 DOM 卸载并保留；
- 销毁 retained subtree；
- 在结构事务后只重排当前 mounted children；
- 校验 mounted IDs 是模型 children 的有序子序列。

root 迁移为该 adapter 的一个所有者；table 是第二个所有者。现有公开 `doc.vm` 语义不改变。

### 7.3 `TableModelGrid`

从 `doc.model` 构建表格逻辑矩阵，替代热路径中的 Component 矩阵：

- `rowId ↔ rowIndex`；
- `cellId ↔ source coordinate`；
- 坐标 → master cell ID；
- master cell → rowspan/colspan rectangle；
- 可见/隐藏 cell 和损坏诊断；
- ID/坐标驱动的矩形调整。

结构或 `rowspan` / `colspan` / `display` 变化时重建。正常滚动不重建。几千行乘中等列数的矩阵构建属于冷路径；后续热操作使用 Map/数组直接查询。

### 7.4 `TableRowBandIndex`

把物理 row 转成不可拆分的虚拟 item。每个 item 是一个连续行带：

```ts
interface TableRowBand {
  id: string                 // 使用起始 row stable ID
  startRowIndex: number
  endRowIndex: number        // inclusive
  rowIds: readonly string[]
}
```

行带算法按 row 顺序扫描：

1. 从行 `start` 建立 `end = start`；
2. 扫描 `[start, end]` 中所有 master cell；
3. 对每个合法 `rowspan`，令 `end = max(end, sourceRow + rowspan - 1)`；
4. 新扩入行可能包含新的跨度，继续扫描直到 `end` 不再增长；
5. 输出 `[start, end]`，从下一行继续。

该算法自然得到重叠 rowspan 的传递闭包。跨度超出表格末尾时 clamp；矩阵无法一致解释时报告失败，由该 table 降级完整渲染。

### 7.5 `TableRowVirtualizationController`

每个已启用的大表格拥有一个控制器，负责：

- 注册当前 viewport source；
- 建立/更新 `TableModelGrid` 和 `TableRowBandIndex`；
- 把主 viewport 换算为 table body 的局部 offset；
- 驱动 window engine、sparse child adapter 和 spacer layer；
- 管理 row height cache、selection/IME/drag leases；
- 发布可见 row IDs 给 row bar；
- 与分页、全屏和降级路径协调；
- 在 destroy 中对称释放 observer、frame、subscription 和 lease。

### 7.6 `DocumentViewportCoordinator`

同一编辑器只安装一组主 scroll/resize 监听，并在 Angular zone 外用 rAF 合并。root manager 和 table controller 从同一帧快照读取：

```ts
interface ViewportFrame {
  scrollTop: number
  clientHeight: number
  revision: number
}
```

只有已挂载且接近 viewport 的 table controller 参与计算。避免每张表安装高频监听，也避免对所有文档表格执行同步 DOM 查询。

## 8. 配置与启用

在现有 `VirtualizationConfig` 上增加显式、向后兼容的 tableRows 配置：

```ts
interface TableRowVirtualizationConfig {
  enabled?: boolean          // default false
  minRows?: number           // default 200
  overscan?: number          // default 8 physical rows on each side
  retainedRowLimit?: number  // default 40 physical rows
}

interface VirtualizationConfig {
  // existing fields
  tableRows?: TableRowVirtualizationConfig
}
```

规则：

- `virtualization.enabled` 仍是总开关；tableRows 不单独创建第二套文档虚拟化运行时。
- `tableRows.enabled` 默认 false。
- row 数小于 `minRows` 时保持完整渲染。
- overscan 以物理 row 数表达；窗口向两侧累计到目标行数后，再扩展到完整 band 边界。
- retention 按物理 row 数计费，不按 band 数计费；单个巨大 band 不得借一个 cache item 绕过预算。
- 配置是初始化期配置，与当前 root virtualization 一样，不支持运行中无损切换。
- tableRows 关闭时不注册 table controller、稀疏 parent 或额外表格滚动工作；Phase A 的纯模型高度估算仍可由现有 root/pagination 投影调用。

## 9. 初始化与视图生命周期

### 9.1 创建 table view

当 tableRows 启用且 row 数达到阈值时，`DocVM` 创建 table Component 和 table 自身 DOM，但停止递归创建其直接 row children。该判断发生在递归建树之前，不能等到 `TableBlockComponent.ngAfterViewInit()` 才决定。

table 完成 view 初始化后：

1. 注册 sparse child adapter；
2. 构建完整 model grid 和 row bands；
3. 立即写入代表完整投影高度的 table spacer rows；
4. 从当前主 viewport 计算首个窗口；
5. 只创建并挂载目标 bands。

未启用、低于阈值或初始化失败时沿用完整递归创建路径。

### 9.2 spacer DOM

table 不能复用 root 的 `<div class="bc-virtual-spacer">`。`TableSpacerLayer` 为每个未挂载 gap 创建：

```html
<tr class="bc-table-virtual-spacer"
    contenteditable="false"
    aria-hidden="true">
  <td colspan="当前列数"></td>
</tr>
```

要求：

- 高度取 gap 内所有 band 的投影高度；
- 使用与分页 spacer 相同的 collapse-border 隐藏策略，避免页缝/虚拟空洞出现竖线；
- `data-block-id` 不得伪装为模型 row；
- 支持 viewport segment 与远端 selection/interaction pin segment 之间的多个 gap；
- 列数变化时刷新 colspan；
- spacer 不进入 ResizeObserver、行栏、选区、命中测试或分页真实行集合。

### 9.3 高度测量

mounted `<tr>` 使用 `ResizeObserver` 测量 border-box height：

- 实测值按 row stable ID 缓存；
- band 高度为成员物理行高度之和；
- 未测量 row 使用 Phase A 的 row estimate；
- band 重建后复用 row 级缓存；
- 容器宽度、主题或字体度量发生变化时，使受影响的本地实测缓存失效并重新测量可见窗口；
- 测量批次只安排一个协调帧。

### 9.4 retained view 一致性

unmounted retained row subtree 上的模型变化不得留下陈旧 DOM。若模型 content/props/structure 事件影响 retained band，其 Component subtree 标记 dirty 并从缓存销毁；下次挂载从当前 Yjs 状态重建。mounted band 继续走正常增量视图同步。

## 10. 滚动窗口与锚定

### 10.1 viewport 换算

普通态使用编辑器主 scroll container。控制器只在 table 接近 viewport 或几何失效时读取 table body 相对主容器的位置，并缓存坐标；原始 scroll handler 不调用 `getBoundingClientRect()`。

局部 viewport：

```text
localStart = mainViewportStart - tableBodyDocumentOffset
localEnd   = mainViewportEnd   - tableBodyDocumentOffset
```

window engine 对局部 offset 做 Fenwick 查询，得到可见 bands，加 overscan 和 pins 后输出 segments。

### 10.2 深层锚点所有权

root 和 table 不得在同一帧各自修正 `scrollTop`。文档级协调器选择最深的可见 anchor owner：

- viewport anchor 落在 table 内部：table 持有 `{bandStartRowId, offsetWithinBand}`，恢复具体内容位置；root 只维护 table host 的整体顺序。
- viewport 位于 table 之后：table 高度变化由 root 以后续 root block ID 为 anchor 恢复。
- anchor row 被删除：从旧模型顺序寻找最近存活 row；没有存活 row 时退回 table host/root anchor。

一次结构/高度批次最多提交一个 scroll correction。

## 11. Yjs 与结构同步

所有数据仍由 Yjs / `BlockModelGraph` 持有，行虚拟化只改变视图物化。

- table children 变化：更新完整 row ID 顺序、band index 和 sparse mounted order。
- unmounted row 的 cell children 变化：只更新 model grid；不创建 row Component。
- cell 的 `rowspan` / `colspan` / `display` 变化：使 grid 和 bands 失效，在下一协调帧重建。
- 屏外文本/普通 props 变化：更新模型与必要的 row-height estimate invalidation，不挂载对应 row。
- delete/move/undo/redo：以 stable IDs 重算 mounted membership，不能把旧 numeric index 跨事务保存为事实。

表格结构命令必须使用 `DocCRUD` / `DocChain`，禁止直接修改 props、DOM 或 Yjs 原语。

## 12. 选区、输入与表格命令

### 12.1 模型化交互前置

在真正启用 sparse rows 前，先把以下路径迁到 `TableModelGrid` / stable IDs：

- cell 坐标和 master-cell 解析；
- 矩形 selection adjust；
- Copy/Cut/Delete/Paste 的目标 cell 集合；
- 行列增删、合并/取消合并的结构读取；
- Arrow/Tab 的目标 cell 计算；
- table normalizer 的模型预检。

需要 DOM 能力的最后一步才调用 mount/reveal bridge。

### 12.2 pin 规则

- collapsed 文本光标 pin 所在 cell 的完整行带；
- native text selection pin anchor/head 所在行带，不 pin 中间全部行；
- table-cell 矩形 selection 保留 model-owned anchor/head cell IDs，仅给当前 mounted rectangle cells 绘制 class；
- IME 从 composition 开始到 commit、native Selection replay 完成持续 pin 活跃行带；
- row drag pin source band 和当前 target band；
- overlay/toolbar lease 只 pin 其真实 DOM anchor 所在 band；
- pins 高于 viewport 和 retention budget，交互结束后对称释放。

### 12.3 Arrow、Tab 与 reveal

键盘导航顺序：

1. 从 `TableModelGrid` 算出目标 cell ID；
2. 解析目标 band；
3. 同步或有界异步确保目标 band mounted；
4. 使用投影先滚动到估算位置；
5. 用目标 cell 的真实几何做有界修正；
6. 最后 replay 文本光标或 table-cell selection。

不得先调用 `getBlockById(targetCellId)` 再决定是否挂载。

### 12.4 大范围矩形命令

跨几千行的 Copy/Cut/Delete/Paste 直接遍历模型 grid 和 snapshots。执行时间可以与操作目标规模成正比，但 Component/DOM 数量不能与目标规模成正比。

### 12.5 鼠标拖选与自动滚动

可见 cell 继续使用 DOM 命中。指针拖出 viewport 触发自动滚动后，纵向位置通过 band height projection 映射到目标 row；横向仍使用完整列几何。selection head 以 cell ID 更新，不要求中间行 mounted。

## 13. 行栏、拖拽与合并行带

- `table-row-bar` 改为消费 visible row projection，不再为全部 row IDs 创建 handle。
- 行栏的 top/height 使用与 table body 相同的 row-height cache，保证对齐。
- 列栏完整渲染，不进入本次虚拟化范围。
- row drag 的 drop boundary 不能落入 rowspan band 内部，必须吸附到 band 前或 band 后。
- 虚拟 band 是挂载原子单位，不必强制改变所有物理行命令的业务语义；但任何会切断合法 rowspan 的交互必须先走现有合并规则或吸附边界。
- 拖拽 preview 和 drop line 使用投影几何；不为远端 target 临时挂载从 source 到 target 的完整区间。

## 14. 全屏、分页与打印

### 14.1 全屏

表格全屏会锁住 body，并让 table 容器成为有效滚动 viewport。控制器切换 viewport source，但复用同一 model grid、band index、height cache 和 mounted rows。切换发生在 rAF 边界，并用 stable row anchor 保持当前位置。

### 14.2 分页

第一阶段采用清晰兼容边界：

- 默认精确 live pagination 获取 table full-row view lease；
- print/PDF 获取完整表格视图并执行只读精确 reflow；
- Phase A 模型高度可以参与预布局，但输出必须保留 non-exact 状态；
- pagination spacer/header clone 与 table virtual spacer 使用不同 class/registry，双方不会把对方当成模型 row；
- experimental sparse pagination 与 row-band projection 的直接整合另立后续设计。

## 15. 保留策略与状态型子块

retention 以物理 row 数为预算。普通离屏 band 进入 LRU；超预算后销毁 Component subtree，下次从 Yjs 重建。

若 cell 内存在需要 `viewRetention: 'keep-alive'` 的状态型子块，其 lease 归属最近的虚拟边界，即所在 row band，而不是把整张 table 永久 pin 在完整行视图。删除状态型块或 table 时必须释放 lease。

## 16. 故障隔离与降级

每张 table 独立记录 reconcile failure：

1. 第一次失败记录诊断并安排重建；
2. 连续失败未达到阈值时有界重试；
3. 连续三次失败后永久切换该 table 的完整行挂载，直到 table Component 重建。

降级必须按以下顺序：

1. 暂停 table 虚拟协调；
2. 清除所有 table virtual spacer；
3. 从 canonical model row 顺序修复 sparse child adapter；
4. 挂载全部 row；
5. 恢复 selection endpoint/IME 所需视图；
6. 断开该 table 的滚动调度和 row ResizeObserver 虚拟逻辑；
7. 告警一次，避免每帧刷日志或消息。

以下情况直接或最终触发完整挂载：

- model grid 无法建立一致的 row/cell 矩阵；
- mounted row IDs 不是模型 row 顺序的子序列；
- spacer 高度、band 数量或索引长度持续不一致；
- DOM 操作连续失败；
- 合法单个 rowspan band 覆盖大量行时，必须完整挂载该 band；这不是错误，但应输出性能诊断。

## 17. 性能约束

- scroll/resize 监听在 Angular zone 外运行，并按 animation frame 合并。
- 原始 scroll handler 不做同步布局查询、全表遍历或 Angular change detection。
- ResizeObserver 批次只更新变化 row 的高度，并安排一次 frame。
- selection 高频路径不得重建 `TableModelGrid`。
- row bar 的 DOM 数量与 mounted rows 相关。
- offscreen model content change 不创建 Component。
- 所有 observer、subscription、event listener、frame、lease 在 destroy 中严格对称释放。
- 几千行结构重建属于可接受冷路径，但必须按 Yjs transaction 合并，不能对一次事务内每个 cell 分别全表重建。

## 18. 测试策略

### 18.1 纯单元测试

- `TableModelHeightEstimator`：0/1/3000 行、无效 height、配置 fallback、结构变化失效。
- `VerticalWindowEngine`：变高 item、overscan、多 segment pins、offset binary search、anchor restore。
- `TableRowBandIndex`：无合并、单跨度、重叠跨度传递闭包、越界跨度、损坏矩阵。
- `TableModelGrid`：row/col span、hidden cells、坐标/master cell 双向查询、远端结构变化。
- retention：按物理 row 预算，巨大 band 不绕过预算。

### 18.2 VM/CRUD 集成测试

- table view 创建时不递归创建全部 row；
- sparse table parent 的 insert/delete/move/undo/redo；
- unmounted row/cell 的模型更新不创建 Component；
- dirty retained row 被销毁并从最新 Yjs 重建；
- root sparse view 与 nested table sparse view 同时工作；
- 单表 fallback 不触发 root full-mount fallback。

### 18.3 Selection/Input 测试

- 光标/文本选区/table-cell 选区的 band pin；
- 选区跨第 10–3000 行不挂载中间区间；
- Arrow/Tab 跨窗口边界；
- printable input、Enter、Backspace/Delete；
- 中文 IME 期间滚动、远端插行、composition end 和 selection replay；
- Copy/Cut/Delete/Paste 大矩形走模型路径。

### 18.4 Angular/DOM 测试

- `<tbody>` 内 spacer 结构和 colspan；
- border-collapse 下无贯穿虚拟 gap 的边框；
- ResizeObserver 高度更新和 row bar 对齐；
- rowspan band 永不被 spacer 切开；
- 多 pinned segment 的 DOM 顺序；
- 全屏 viewport source 切换；
- pagination spacer/header clone 与 virtual spacer 互不污染。

### 18.5 浏览器与性能验证

Chrome、Firefox、Safari/WebKit 至少覆盖：

- 原生 table spacer 高度；
- selection/replay；
- scroll anchoring；
- fullscreen；
- IME。

3000 行基准至少验证：

- 初次创建不物化全部 row/cell/paragraph；
- 普通滚动帧无全表扫描；
- 多窗口往返后 retained row 数稳定；
- viewport 上方远端插入/删除/变高后锚点误差约 1 CSS px；
- 大矩形选区不扩大 mounted window。

## 19. 交付顺序

1. **Phase A：模型级表格高度估算**——独立可验收，不改变表格 DOM。
2. **Phase B：TableModelGrid 与模型化表格命令**——仍完整渲染，用现有行为作对照。
3. **Phase C：VerticalWindowEngine 与 SparseChildViewAdapter**——先建立纯内核和 VM 生命周期。
4. **Phase D：TableRowVirtualizationController**——行带、spacer、测量、row bar 和滚动锚定。
5. **Phase E：交互与兼容**——IME、选区、拖拽、全屏、分页/打印租约和故障降级。
6. **Phase F：opt-in 验证与发布准备**——大表格基准、跨浏览器测试、文档和迁移记录。

每个 Phase 必须能独立通过相关单元/集成测试；在 Phase B 模型化交互完成前，不开启真实 sparse row DOM。

## 20. 公共契约与文档同步

实现将新增 `VirtualizationConfig.tableRows` 并改变开启 root virtualization 时 table 的模型高度估算行为，属于公共配置和默认行为演进。实现 PR 必须同步：

- `packages/editor/ai-skills/blockcraft.md`：更新 virtualization Quick Reference 和“nested subtrees atomic”说明；
- `packages/editor/ai-skills/blockcraft-app.md`：补充 `DocConfig.virtualization.tableRows`；
- `packages/editor/ai-skills/blockcraft-perf.md`：补充表格高度估算、行带、性能边界和降级；
- `packages/editor/ai-skills/blockcraft-selection.md`：补充 table row virtualization 下 endpoint pin/reveal；
- `packages/editor/ai-skills/blockcraft-data.md`：补充 sparse table parent 的 model/view 同步边界；
- `packages/editor/ai-skills/MIGRATIONS.md`：新增对应版本块。

所有被改 ai-skills 文件更新 `Last updated` 日期。除非用户明确要求发布或 bump version，否则不修改 `packages/editor/package.json` 的版本号。

## 21. 最终验收标准

- 3000 行普通表格在 opt-in 模式下不会创建全部 row/cell/paragraph Component。
- Phase A 在 table 从未挂载时提供与 row 数量同量级的总高度估算。
- 常规滚动只操作 visible/overscan/pinned bands，高度定位为 `O(log B)`。
- 跨几千行矩形选区、复制和删除不造成全表视图物化。
- Arrow、Tab、文本输入和中文 IME 能跨虚拟窗口边界恢复到正确 cell。
- rowspan 传递闭包正确，spacer 不从行带内部切开。
- row bar、全屏、精确分页、打印和单表 fallback 路径行为正确。
- 连续访问不同窗口后 retained row 数量不随历史访问总量增长。
- 关闭 `tableRows.enabled` 时，现有表格 DOM、交互和性能基线保持不变。
