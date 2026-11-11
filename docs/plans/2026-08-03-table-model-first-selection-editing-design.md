# BlockCraft 表格矩形选择与编辑 Model-First 设计

> 日期：2026-08-03
> 状态：已完成（2026-08-03）
> 范围：表格模型投影、矩形选择解析、输入/IME、复制剪切粘贴、键盘导航与已挂载视图投影
> 不包含：表格行稀疏挂载、行虚拟控制器、`DocVM` 稀疏子树改造

## 1. 问题

当前表格矩形选择虽然已经用 `table-cell` selection point 保存稳定 ID，但真正执行输入、删除、复制和导航时仍重新读取 `TableBlockComponent`、`TableRowComponent`、`TableCellComponent`：

- Input 通过 `getBlockById()` 解析表格与两个端点，再从 Component 矩阵取得整个矩形；
- Selection 通过已挂载 cell 的 `textContent()` 生成 TSV；
- TableBlockBinding 通过 DOM `closest()` 和 Component 坐标执行 copy/cut/paste/delete/Arrow/Tab；
- TableBlock 通过 Component master map 调整合并单元格矩形并绘制选区。

这让一个本应由模型表达的矩形意图依赖视图完整性。端点或中间行未挂载、组件正在重建、分页投影插入视图节点、远端事务刚改变表格结构时，选择仍然存在，但后续编辑可能失败、漏写或写到错误单元格。直接引入问题分支的行虚拟控制器会同时扩大 `DocVM`、分页和生命周期改动，不能作为这个一致性问题的修复前提。

## 2. 决策

先完成表格交互的 model-first 领域基础，保持当前表格完整渲染；行虚拟渲染在模型契约稳定后单独接入。

```text
Yjs / BlockModelGraph
        │
        ▼
TableModelGrid（纯模型、只读、稳定 ID）
        │
        ├── resolveTableCellSelectionTarget（矩形业务语义）
        │       ├── InputTransformer（按 ID 规划并通过 DocCRUD 写入）
        │       ├── SelectionManager（按模型生成 TSV）
        │       └── TableBlockBinding（按模型复制/粘贴/删除/导航）
        │
        └── TableBlockComponent（只把模型矩形投影到当前已挂载 cell）
```

核心规则：

1. 表格矩形是否有效、端点坐标、合并单元格闭包和目标 cell 集合只由模型决定。
2. 数据写入只接受 stable ID，通过 `DocCRUD` 在 Yjs transaction 中完成。
3. Component/DOM 仅用于焦点、光标和当前已挂载 cell 的视觉高亮；不能决定矩形的数据范围。
4. 模型投影损坏时 fail closed，不猜测坐标、不回退到另一块表格的视图状态。
5. 兼容没有 `BlockModelGraph` 的旧测试/非标准 Doc 可以保留有界 Component fallback；真实 BlockCraft Doc 始终走模型路径。

## 3. DDD 边界

### 3.1 Table Model Domain

位置：`framework/modules/table/`

职责：

- 从 `doc.model` 读取 table → row → physical cell 的完整拓扑；
- 建立 `cellId ↔ coordinate`、coordinate → physical/master cell、master → span；
- 对包含 rowspan/colspan 的矩形求传递闭包；
- 区分 physical cell IDs（序列化形状）和唯一 visible master IDs（编辑目标）；
- 产生诊断但不修改或修复 Yjs。

该领域不依赖 Angular、DOM、表格 Block Component 或分页。它位于 framework，是因为 Input 与 Selection 也是 framework domain，不能反向依赖 `blocks/table-block`。

### 3.2 Selection Target Resolver

`resolveTableCellSelectionTarget()` 把 `{tableId, anchorCellId, headCellId}` 解析为一个不可变、短生命周期目标：

```ts
interface TableCellSelectionModelTarget {
  tableId: string
  anchorCellId: string       // 归一到 visible master
  headCellId: string         // 归一到 visible master
  rectangle: TableModelRectangle
  physicalCellIds: string[][]
  visibleCellIds: string[]   // 行优先、去重后的 master cells
}
```

端点如果落在 `display:none` coverage cell，先映射到 master。矩形必须包含整个合并区域。任何端点失效、table 不匹配或模型诊断失败都返回 `null`。

### 3.3 Input Application Layer

Input 不持有 cell Component：

- typing/Enter/Delete/IME 先解析一次 selection target；
- transaction 内按 `visibleCellIds` 清空/替换 cell；
- 每个 cell 插入一个新 paragraph snapshot，再删除旧 children；
- anchor paragraph 接收文本，其余 cell 接收空 paragraph；
- 最终 caret/table selection 通过 stable ID 提交，不用 DOM `recalculate()` 确认。

这样选区中间 cell 即使没有 Component，也会被一致写入。IME 的结构物化和 composition commit 仍属于同一个 Undo capture group。

### 3.4 View Projection

TableBlock 读取相同 selection target：

- 业务矩形由 `TableModelGrid` 调整；
- 当前完整渲染下可直接从 stable ID 解析已挂载 cell；
- 将来稀疏行渲染时只给 `doc.vm` 中已挂载的 master cell 添加 class；
- 未挂载 cell 不因高亮而物化，重新挂载后从当前 model selection 重放视觉状态。

拖拽过程也使用 grid 的坐标/master 查询。Pointer hit-test 仍从当前 `<td>` 得到 cell ID，但跨格后不再重建全表 Component master map。

## 4. 缓存与失效

`TableModelProjectionStore` 以 Doc 为 WeakMap key、table ID 为 cache key：

- table / table-cell props 变化使对应 grid dirty；
- table / table-row children 变化使对应 grid dirty；
- cell 内 paragraph/text 变化不改变表格拓扑，不重建 grid；
- table 被删除时清理 cache；
- Doc destroy 时释放订阅和 WeakMap entry。

构建复杂度为 `O(rows × columns)`，属于结构/合并属性变化后的冷路径。普通输入与 Pointer 跨格只查询数组/Map，不扫描 cell descendants、不读文本、不读布局。

## 5. 命令语义

| 操作 | 目标集合 | 结果 |
|---|---|---|
| typing / printable fallback | unique visible masters | 清空全部，anchor 写入文本并落 caret |
| IME | unique visible masters | 先物化空 anchor paragraph，再由 CompositionSession 写 Y.Text |
| Backspace/Delete/Enter | unique visible masters | 清空；Delete 保留矩形，Enter 落 anchor caret |
| getSelectedText | physical matrix | 每个物理坐标输出一格 TSV，合并 coverage 保留矩形形状 |
| copy/cut | physical matrix | 由 model snapshot 构造子表；cut 只清 visible masters |
| paste | coordinate → visible source ID | 只覆盖可写 master，跳过 coverage cell |
| Arrow/Tab | coordinate/master | 选择下一个 visible source cell，不依赖目标 Component |

## 6. 一致性与边界条件

- 合并 cell 的 coverage physical IDs 只用于快照/TSV 形状，不重复执行清空操作。
- selection anchor/head 归一到 master 后提交，避免保留一个 `display:none` 端点。
- target 在异步 paste 解析期间失效时重新解析当前模型，失败即放弃，不按旧索引写入。
- readonly footprint 仍以 selection plan 的 table/cell IDs 校验；写操作继续经过现有 DocCRUD guard。
- 远端结构变化、Undo/Redo 和本地操作经过相同 projection invalidation 与 Yjs observer 路径。
- malformed grid 不使用局部 Component 结果掩盖错误，防止对错位表格执行破坏性命令。

## 7. 验证

必须覆盖：

1. 常规表格、rowspan/colspan、矩形传递扩张和 malformed diagnostics；
2. selected middle/endpoint cell 没有 Component 时，typing/Delete/Enter/IME 仍按 ID 写入；
3. `getSelectedText()` 在没有 cell Component 时输出正确 TSV；
4. copy/cut/paste/Arrow/Tab 使用模型目标且不调用全表 Component matrix；
5. TableBlock 只高亮已挂载 cell，重新同步时不改变 selection 模型；
6. 现有 Selection、Input、TableBinding、table block、pagination 测试保持通过；
7. editor build/type check 通过。

## 8. 后续阶段

本次完成后，`docs/plans/2026-07-31-table-row-virtualization-design.md` 的 Phase B 有了可靠前置。下一阶段才能接入 `TableRowBandIndex`、稀疏 child view adapter 和行虚拟控制器。届时不得重新引入 Component 矩阵作为模型真相，也不得让大矩形选择 pin/挂载全部中间行。

## 9. 实施结果

- 已新增 `TableModelGrid`、`TableModelProjectionStore` 与 selection target resolver；
- Input、Selection、TableBlockBinding 和 TableBlock 已切换到 model-first 主路径；
- 未挂载中间单元格的输入/删除/TSV/键盘导航和仅挂载视图高亮均有回归测试；
- `pnpm build:editor` 通过；完整 editor 测试 `2044 SUCCESS`；
- 本阶段保持表格完整渲染，没有移植问题分支的行虚拟控制器，也没有修改 package version。
