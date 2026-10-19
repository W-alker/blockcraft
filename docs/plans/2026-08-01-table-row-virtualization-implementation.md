# BlockCraft 表格行级虚拟渲染实施计划

> 日期：2026-08-01
> 状态：Phase B 交互基础已完成，行级虚拟渲染尚未开始
> 当前分支：`refactor`（设计参考 `codex/table-row-virtualization-workbench`，未整体合并）
> 设计：`docs/plans/2026-07-31-table-row-virtualization-design.md`

## 实施原则

- 每个 Phase 独立测试、独立审查，避免在模型化交互完成前开启 sparse row DOM。
- 所有文档数据变化继续经过 Yjs transaction；虚拟化只负责视图物化。
- 普通滚动帧不得执行全表扫描、同步 Angular CD 或与总行数成正比的 DOM 工作。
- 公开配置/默认行为变化同步 ai-skills 与 `MIGRATIONS.md`；不自动修改 package version。
- 当前 worktree 不自动 commit，由用户决定提交边界。

## Phase A：模型级表格高度估算

### A1. 测试

- [x] 在 `model-height-estimator.spec.ts` 增加 table 模型 harness。
- [x] 覆盖 0 行回退、逐行 props.height、无效行高、配置 floor。
- [x] 覆盖非 table-row child 不参与行高累计。
- [x] 覆盖 3000 行只读取直接 row facts，不访问 cell/text/DOM。

### A2. 实现

- [x] 在 `model-height-estimator.ts` 增加包内 table 分支。
- [x] 复用 `doc.model.getChildrenIds/getFlavour/getProps`，保持 `O(rows)`。
- [x] 行高优先级：有效 `row.props.height` → `estimatedHeights['table-row']` → 默认 60。
- [x] table 高度取模型累计值与 `estimatedHeights.table/defaultHeight` 的最大值。
- [x] 无有效 table-row 时沿用旧 fallback，避免空/损坏 table 被放大。

### A3. 文档与迁移

- [x] 更新 `blockcraft.md` 的 Root Virtualization 估算说明。
- [x] 更新 `blockcraft-perf.md` 的模型级 table 估算和 exact 边界。
- [x] 在 `MIGRATIONS.md` 顶部追加行为变化条目。
- [x] 更新被改 ai-skills 的 `Last updated: 2026-08-01`。

### A4. 验证

- [x] 运行聚焦 estimator 测试。
- [x] 运行 virtualization / pagination 相关测试（348 项通过）。
- [x] 运行 editor build/type check。
- [x] 检查无 DOM 依赖、无 cell 展开和无工作区越界改动。

## Phase B：`TableModelGrid` 与模型化表格命令

### B1. 只读模型投影

- [x] 新增 `TableModelGrid` 及纯单元测试。
- [x] 建立 row/cell stable-ID 坐标、master-cell、span rectangle 和诊断。
- [ ] 新增 `TableRowBandIndex`，覆盖 rowspan 传递闭包。
- [x] 将 grid rebuild 收敛到 transaction-invalidated 冷路径；band 等 Phase D 再接入。

### B2. 交互读路径迁移

- [x] 矩形选区调整改用 model grid。
- [x] Copy/Cut/Delete/Paste 目标集合改用 stable IDs/snapshots。
- [x] Arrow/Tab 目标解析改为 model-first。
- [ ] 行列增删、合并/取消合并的结构读取移除 Component 全表依赖。
- [ ] table normalizer 预检改用模型。

### B3. 对照验证

- [x] sparse rows 仍关闭，完整 editor 测试 `2044 SUCCESS`，editor build 通过。
- [x] 增加 grid 缓存结构失效、未挂载单元格和损坏矩阵测试。
- [ ] 在真正开启 sparse rows 前补真实远端 Yjs 结构事务与 undo/redo 端到端测试。

## Phase C：通用窗口内核与稀疏子视图

- [ ] 从 root virtualization 抽取 `VerticalWindowEngine`。
- [ ] 以现有 `HeightMap`/`PinRegistry`/segment 算法保证行为对照。
- [ ] 新增包内 `SparseChildViewAdapter`，迁移 root 但不改变公开行为。
- [ ] 扩展 `DocVM`/`DocCRUD` 支持注册的 sparse parent。
- [ ] 覆盖 uncreated/mounted/retained/dirty/evicted 生命周期。
- [ ] 保持 root virtualization 全套测试通过。

## Phase D：表格行控制器

- [ ] 增加 `VirtualizationConfig.tableRows`，默认关闭。
- [ ] table 创建路径按阈值停止递归 row 物化。
- [ ] 实现 `TableRowVirtualizationController`。
- [ ] 实现 `<tr>/<td>` 专用 `TableSpacerLayer`。
- [ ] 接入 row ResizeObserver、row-height cache 和 band height projection。
- [ ] row bar 改为只渲染 mounted/visible rows。
- [ ] 增加每表三次失败后完整挂载降级。

## Phase E：选区、IME 与兼容

- [ ] endpoint、table-cell、IME、drag 和 overlay band leases。
- [ ] `ensure/reveal` 到屏外 cell 的有界挂载与几何修正。
- [ ] 跨窗口大矩形命令不物化中间行。
- [ ] row drag drop boundary 吸附到完整 rowspan band。
- [ ] 全屏切换 viewport source 并保持 stable row anchor。
- [ ] 精确 pagination/print/PDF 获取完整 table-row view lease。

## Phase F：发布准备

- [ ] 3000 行性能基准与 retained-view 稳定性检查。
- [ ] Chrome、Firefox、Safari/WebKit 的 table spacer、selection、IME、fullscreen 验证。
- [ ] 完成 `blockcraft-app.md`、`blockcraft-selection.md`、`blockcraft-data.md` 等公共能力文档。
- [ ] 补齐最终 `MIGRATIONS.md` 条目，不修改 package version。
