# 超高表格单元格可编辑跨页设计与实现说明

日期：2026-08-03

## 背景与根因

BlockCraft 当前的分页链路由 `LiveHeightSource` 测量顶层 Block，自纯分页引擎生成页面与片段，再由 `GapApplier`、`TableBreakApplier` 和表格组件把结果投影到 live DOM。普通超高表格通过 `<tr>` 底边生成 `splitOffsets`，表格组件只会在下一真实行之前插入分页占位行。

该模型遗漏了“单个表格行本身高于一页”的情况。超长单元格会把所属 `<tr>` 撑到超过页面内容高度，但这一行内部没有 `<tr>` 边界。分页引擎为了保证进展，会接受一个超过页面容量的片段；视图层又无法把该片段映射到下一行，因此不会插入有效页缝。结果是：

- 表格文字和竖向边框连续穿过纸张间隙；
- 引擎页数已经推进，但 live DOM 没有产生对应纵向位移；
- 后续 Block 的页归属、页面背景和实际视觉位置失去一致性；
- 打印路径用裁剪窗口消费同一超页片段时，可能裁掉片段尾部。

现有测试明确允许“可拆块没有安全切点时退化为单片溢出”，且打印表格测试仅覆盖多行表格按行拆分，没有覆盖超高单行。这不是 CSS 单点问题，而是分页领域模型缺少“行内内容流”的结果。

## 目标

- 一个逻辑单元格可以跨两个或更多页面连续展示。
- 每个续页片段均可直接点击、输入、删除、跨页选区和协同编辑。
- 页缝内不显示文字、单元格背景或连续边框；续页顶部和上一页底部具有正确表格边线。
- 屏幕、打印和 PDF 消费同一份稳定分页计划，不丢失或重复内容。
- 表格的虚拟流高度与屏幕内部页缝共同进入根布局投影，表格后的普通 Block 从正确纸张内容区继续。
- 不修改表格、行、单元格或内部文本的 Yjs 结构，不为分页生成 Undo 历史。
- 普通未超页表格和仅需按行拆分的表格保持现有行为。
- 高频输入只重算受影响表格，并在 Angular Zone 外按 animation frame 合并。
- Chrome、Safari/WebKit 和 Firefox 的选区、IME 与布局行为可验证。

## 非目标

- 不把一个逻辑表格行持久化拆成多个 Yjs 行。
- 不用只读克隆替换 live 编辑 DOM。
- 不新增宿主必须配置的分页选项。
- 不改变连续布局模式。
- 不在本次恢复续页重复表头功能；现有临时禁用状态保持不变。
- 不修改 `packages/editor/package.json` 的版本号。

## 方案选择

采用“原位可编辑分页投影”：保留唯一真实编辑 DOM，在单元格内容的安全断点加入零模型长度的布局装饰，再用表格级页缝遮罩和边线层形成跨页视觉片段。

未采用的方案：

- 每页克隆续表或续行：打印实现简单，但克隆不是 InlineRuntime 和 Angular 组件持有的真实编辑节点；直接编辑会引入双 DOM、IME、选区和协同映射风险。
- 自动拆分 Yjs 表格行：会在输入过程中改变文档结构，破坏合并单元格、撤销、协同和导出语义。
- 单元格限高并内部滚动：能阻止错位，但不满足 Word 式跨页和 WYSIWYG 打印要求。
- 只用 CSS 遮住页缝：遮罩会隐藏穿过页缝的内容，但不会为被遮住的内容补偿高度，仍会造成内容丢失与后续坐标错位。

## 领域边界

### TablePaginationPlanner

新增包内私有的纯规划器，放在 `framework/modules/pagination/` 的表格分页子域。它只消费页面容量、自然表格几何和安全内容锚点，不读取 DOM、不写 Yjs，也不直接修改视图。

规划器负责：

- 判断表格是否只需沿用现有行边界拆分；
- 对超高行中的每个逻辑单元格独立推进内容流；
- 为每页选择各单元格能容纳的最后一个安全锚点；
- 生成高度不超过页面容量的表格预分片；
- 保证锚点严格前进、内容范围不重叠且无遗漏。

### 表格测量与投影

`TableBlockComponent` 继续作为表格分页协作边界，但内部几何描述扩展为可表达行内 cell flow。表格组件负责收集真实 DOM 的自然几何，并把纯计划投影到当前已挂载视图。

它不负责决定页面容量或分页策略，也不持久化任何分页状态。

### InlineRuntime 布局装饰

单个 Editable Block 需要在文本行边界跨页时，由 InlineRuntime 管理零模型长度的 `PaginationGapDecoration`。该装饰是包内布局能力：

- 不写入 `Y.Text`；
- 不计入文本长度；
- DOM 到模型、模型到 DOM 和复制序列化均忽略它；
- 光标不能落入装饰；
- 生命周期由分页计划的 revision 管理。

禁止分页插件绕过 InlineRuntime 直接改写 contenteditable 子树。

### 通用分页引擎

超高表格先由 planner 形成预分片，通用引擎只安排这些确定性片段。引擎不再为这种表格走“没有安全切点时接受单片溢出”的兜底。普通文本 Block 和原子 Block 的既有策略不在本次改动范围内。

## 分页计划

分页计划仅存在于内存，不进入快照或 Yjs：

```ts
interface TableCellFlowPlan {
  /** 多列错位安全点可能使该值大于自然表格高度。 */
  paginationHeight: number;
  segments: TableFlowSegment[];
  splitOffsets: number[];
}

interface TableFlowSegment {
  fromOffset: number;
  toOffset: number;
  height: number;
  breakAfter?: TableFlowBreak;
}

type TableCellFlowAnchor =
  | {kind: 'cell-start'}
  | {kind: 'block'; blockId: string}
  | {kind: 'text'; blockId: string; offset: number}
  | {kind: 'cell-end'};
```

文本锚点是当前稳定布局 revision 内的 Y.Text UTF-16 offset。任何本地或远程模型更新都会先撤销旧投影，再由最新 Delta 重新测量；计划不会跨 revision 复用，因此不需要把临时分页锚点写入 Yjs 或持久化为 `Y.RelativePosition`。应用时任何锚点无法解析都会撤销整张表格的 cell-flow 投影，不能留下部分页缝。

每个预分片必须满足：

- `0 < segment.height <= 当前页可用内容高度`，允许 1px 测量容差；
- 每个 cell 的 `slice[i].to` 与 `slice[i + 1].from` 连续；
- 每个文本范围或子 Block 恰好属于一个 slice；
- 至少一个未完成 cell 在每个后续片段中取得进展；
- 已完成或较短 cell 在当前页剩余区域留白，不拉伸或复制内容。

## 安全断点

断点按以下优先级选择：

1. 单元格直属子 Block 之间的边界；
2. Editable Block 内完整文本行的边界；
3. 原子子 Block 之前或之后的边界；
4. 不可拆原子内容的局部页高策略。

不同单元格不要求在相同内容锚点停止。规划器以相同物理页底为约束，分别选择每个 cell 的安全锚点；较短 cell 可以提前结束并在页底留白。下一 slice 的内容统一从下一页内容区顶部开始。

不得在以下位置断开：

- 文本行盒内部；
- IME composition 当前拥有的 DOM 范围内；
- 图片、公式、附件、video 或 iframe 等原子 Block 内部；
- Inline Embed 的模型长度内部；
- 无法解析到当前 Y.Text 的过期协同锚点。

## 重排流程

1. 文本、props、表格结构、列宽、字体、主题或分页配置变化时，把直接受影响的顶层表格标记为 dirty。
2. 在下一 animation frame、Angular Zone 外合并测量请求。
3. 测量层读取子 Block 边界、Editable Block 文本行、合并单元格矩阵、固定行高和原子内容尺寸。
4. 已应用的布局装饰在 Selection projection guard 内同步撤销，测量唯一自然 DOM 后立即恢复上一稳定投影；测量输入不会包含旧 gap，也不会写模型。
5. planner 在纯数据上生成新的 `TablePaginationPlan`。
6. 通用分页引擎消费表格预分片，生成页面布局与后续顶层 Block 位置。
7. 新计划完整验证成功后，视图层原子替换旧计划；失败时保留旧稳定计划。
8. decoration、页缝遮罩、续页边线和片段 rect 一次性同步。
9. 应用相同计划导致的 ResizeObserver 通知通过计划签名去重，不再次触发有效重排。

保留现有范围控制：整表未超过一页时仍 keep-together；只有整表超过一页才进入表内拆分，并沿用 `splitStartsNewPage` 从新页顶部开始。这样不改变普通小表格与页面剩余空间的现有行为。

## Live DOM 投影

### 子 Block 边界

当 slice 在两个 cell 子 Block 之间结束时，表格组件在后一个真实子 Block 之前应用包内布局占位。占位不带 `data-block-id`、不可编辑、不可选中，不改变 Block 父子关系。

### 文本行边界

当 slice 在单个 Editable Block 内结束时，InlineRuntime 在相应 `Y.RelativePosition` 安装 `PaginationGapDecoration`。它只增加从当前安全行尾到下一页内容区顶部所需的垂直空间，不改变文本 Delta。

DOM selection 映射必须跳过装饰。跨页拖选仍产生连续的 BlockCraft `anchor/head`，复制结果不包含页缝字符或节点。

### 表格边框与背景

原 `<td>` 仍可能在布局盒层面跨越多个页面，因此新增表格级 gap mask 覆盖纸张间隙：

- mask 使用分页 backdrop 的同源主题颜色；
- mask 使用 `pointer-events: none`，保证跨页原生拖选不会被中断；
- 遮住 cell 背景、竖边框、选择背景和其他不应出现在页缝的绘制；
- 在上一页底部和下一页顶部按逻辑 cell matrix 绘制片段边线；
- colspan/rowspan 的边线宽度与原列几何一致。

由于 mask 不接管命中，表格事件分发必须先查询计划中的 gap rect：单击或双击落在 gap 内时直接忽略，拖选经过 gap 时继续让浏览器更新 Selection。这样既不会把光标放入被遮住的 td 区域，也不会阻断跨页选区。

分页关闭或表格卸载时，所有 mask、边线和 decoration 必须对称清理。

## 选区、IME 与工具栏

- `PaginationGapDecoration` 设置 `contenteditable="false"` 和 `aria-hidden="true"`，模型长度为零。
- 光标导航、Delete/Backspace、Home/End 和跨页拖选不得停在页缝装饰上。
- IME composition 期间冻结当前 Editable Block 内的断点；其他不涉及 composition 范围的表格片段可继续使用旧稳定计划。`compositionend` 后统一重排。
- Undo/Redo 只恢复模型与选区；分页计划随后从恢复后的模型重算，不进入 UndoManager。
- 远程更新使相对位置失效时废弃旧计划，不把部分 decoration 留在 DOM。
- 单元格选中背景、拖选范围、表格工具栏和浮动控件不得使用一个跨多页的整体 rect。表格投影提供“包含当前原生选区或最近交互点的可见片段 rect”；没有活动片段时使用首个可见片段。
- `navigateToBlock()` 导航到 cell 内具体文本时以 caret rect 为准；只定位逻辑 cell 时选择其首个可见片段。

## 合并单元格

planner 使用逻辑 cell matrix，只有 rowspan/colspan 的合并源单元格参与内容流。被覆盖的隐藏 cell 不生成独立 flow，也不会为了续页而恢复成可编辑节点。

普通行边界仍优先使用现有安全拆分。超高行进入 cell flow 后，同一个合并单元格可以延续到后续页面；mask 隐藏页缝中的连续边框，边线层按合并后的逻辑列范围绘制续页边缘。

当前 cell-flow 的触发边界是“一个物理 `<tr>` 自身超过 `contentHeight`”。内容型 rowspan 若跨越多个本身均未超页的物理行，仍沿用现有 `coveredByContentMerge` keep-together 规则，不在本次把一个合并源复制成多个可编辑节点。

现有 `_splitMergedCellsAtBreaks` 可继续服务普通行边界，但行内计划不能把模型占位 cell 变成第二份编辑节点。实现阶段应收敛两条路径的公共边线与清理逻辑，避免两套 gap 状态互相覆盖。

## 不可拆内容与降级

- 图片和 canvas 等可缩放原子内容：在分页视图中等比适配单页可用高度，模型尺寸保持不变。
- video 和 iframe：限制到单页高度并保留内部交互区域。
- 公式、附件等普通原子 Block：当前页空间不足时整体移到下一页。
- 单个原子 Block 即使在空页也高于一页时，复用 `capHeight` 的局部安全策略并记录诊断；只限制问题原子，不把整个单元格转为滚动容器。
- 普通文本、列表和多个 cell 子 Block 不允许裁剪、内部滚动或丢弃尾部。

计划必须先完整生成和验证，再替换当前视图。瞬时测量失败、字体尚未稳定或锚点过期时保留上一份稳定计划并在下一帧重试。连续失败只能让具体不可拆原子进入局部安全策略，不允许重新启用超页片段污染后续页面计算。

## 打印与 PDF

稳定布局需要携带与表格计划关联的 revision 或不可变快照。当前分页视图导出时，打印面必须消费该计划，不得只复用旧的整表 `{fromOffset, toOffset}` 像素窗口猜测行内内容。

只读打印渲染根据 cell slice 构造每页表格片段：

- 复用真实 BlockCraft readonly 组件输出，不退回 snapshot-viewer；
- 每个文本范围和子 Block 只出现在一个页面片段；
- 续页按相同 cell matrix 绘制边线；
- 页面内容区不允许超过 `contentHeight`；
- 显式 readonly reflow 与当前稳定 live plan 在相同字体和几何下产生相同页数与断点。

打印 DOM 是只读表面，可以按计划生成片段结构；live 编辑表面仍必须保持唯一真实编辑 DOM。两者共享纯计划，不共享可变 DOM 节点。

## 性能约束

- 非分页模式不安装 cell flow 测量器、decoration 或 gap mask。
- 普通未超页表格只走现有行几何路径，不测量行内文本断点。
- 仅当某行自然高度超过页面内容高度时，惰性收集该行的 cell flow 候选。
- cell-flow 计划存入 GeometryIndex 与稳定布局快照；模型、列宽、字体、主题或页面几何变化会使对应测量 revision 失效。
- 同一 animation frame 内同一表格最多规划和应用一次。
- 不扫描其他顶层 Block，不在渲染路径反复执行全表 `querySelectorAll`。
- 保留 `performanceTest('pagination view recompute', 16)`，并分别记录 table planner、DOM measure 和 decoration apply 的耗时。
- 100×20 表格作为基准场景；性能验证同时检查耗时和“没有整篇文档扫描”的结构性指标。

## 实施分期

该功能按依赖关系分期实现，但在全部验收通过前不改变 `PaginationPlugin` 的外部行为：

1. 建立纯 `TablePaginationPlanner`、计划校验和超高行测试，不接入 live view。
2. 接入子 Block 边界的 cell flow、表格 gap mask、边线和自然坐标还原。
3. 接入 InlineRuntime 文本行 decoration、选区、IME 和工具栏片段 rect。
4. 统一合并单元格、不可拆原子和 ResizeObserver 收敛路径。
5. 让稳定布局、readonly reflow、打印和 PDF 消费同一计划。
6. 完成跨浏览器、性能回归、ai-skills 和迁移文档同步后再移除旧的超页单片兜底。

各阶段的内部代码和测试可以独立落地，但不能通过默认分页路径暴露“只支持子 Block、尚不支持单段落”等半完成状态。需要中间集成时使用包内测试开关，不新增公共选项。

## 测试计划

### 纯逻辑测试

- 单个长 cell 跨 2 页、3 页及更多页面。
- 同一行多个不同高度 cell，各自在不同内容锚点结束当前页。
- 多个子 Block、单个超长段落、列表、空 cell、固定行高。
- rowspan、colspan 与同时跨行跨列的合并结构。
- 表头、普通行断点和行内断点混合。
- 每个 segment 不超过页面容量；断点严格前进；无负 gap、重复范围、遗漏范围或死循环。
- 相同输入生成确定性相同计划。
- 过期 revision 和无法解析的相对位置使整份计划失效。

### 编辑器集成测试

- 在第一页末尾持续输入，使 cell 实时扩展到下一页。
- 在每个续页直接点击、输入、删除、回车和跨页拖选。
- 中文、日文等 IME composition 期间 DOM 不移动，结束后正确重排。
- Undo/Redo 后内容、选区和页数恢复。
- 远程协同在断点前后插入或删除，旧计划被丢弃且无残留 decoration。
- 分页 enable、disable、destroy 与纯 recompute 均产生零 Yjs transaction。
- 行列调整、合并/取消合并、列宽变化后没有旧 gap 或边线。
- 表格工具栏锚定当前可见片段而不是整表 union rect。

### 浏览器验证

- Chrome、Safari/WebKit、Firefox。
- 80%、100%、125%、150% 页面缩放。
- 中英文混排、不同字号与字体加载完成前后。
- gap 区域没有文字、背景或连续表格竖线。
- 续页边线位置误差不超过 1px。
- 后续顶层 Block 页面与纵向位置误差不超过 2px。
- 应用相同签名后 ResizeObserver 不产生持续重排。

### 打印与 PDF

- 屏幕和打印使用相同 plan revision、页数和断点。
- 所有文本范围和子 Block 在全部片段中恰好出现一次。
- 每个打印片段高度不超过页面内容区。
- 不切断文本行，不丢失最后一个 cell、最后一行或最后一个字符。
- 合并 cell 在续页保持正确列宽和边框。
- 当前稳定布局导出与显式 readonly reflow 一致。

### 回归验证

- 运行 pagination engine、live height、table split、table break applier、print paginator、selection、InlineRuntime、IME 和 table block 相关测试。
- 构建 editor 包。
- 在 Playground 构造与问题截图等价的长列表 cell，进行真实键盘、鼠标选区和打印复测。

## 验收标准

- 超高 cell 内容完整跨页，页缝不显示内容或连续边框。
- 任意续页均可直接编辑，光标和跨页选区映射到正确 Yjs 位置。
- composition、Undo/Redo 和远程协同不会造成输入丢失或断点残留。
- 分页重算不写 Yjs，不生成 Undo 历史。
- 所有页面 `usedHeight` 不超过容量加 1px 容差。
- 后续顶层 Block 与页面背景对齐，不再出现逻辑页与视觉页错位。
- 屏幕、打印和 PDF 无内容丢失、重复或断点分歧。
- 同一计划应用后稳定收敛，不形成 ResizeObserver 反馈环。
- 禁用分页或销毁文档后恢复自然表格 DOM 与几何。

## 文档与发布影响

该改动会改变 `PaginationPlugin` 在超高表格单元格上的默认行为，并增加分页运行时视图类，因此属于需要同步记录的公共行为变化。实现完成时同步更新并刷新 `Last updated: 2026-08-03`：

- `packages/editor/ai-skills/blockcraft.md`
- `packages/editor/ai-skills/blockcraft-plugin.md`
- `packages/editor/ai-skills/blockcraft-plugins-util.md`
- `packages/editor/ai-skills/blockcraft-theme.md`
- `packages/editor/ai-skills/blockcraft-perf.md`
- `packages/editor/ai-skills/MIGRATIONS.md`

`MIGRATIONS.md` 以 patch 行为修复登记，说明无需宿主迁移，但启用分页时超高 cell 将从“允许单片溢出”变为可编辑跨页投影。内部 planner、计划类型和 InlineRuntime decoration 不从公共 barrel 导出，不形成新的宿主扩展点。

版本号由用户决定；本任务不修改 `packages/editor/package.json`。除非用户明确要求，也不创建 Git commit。
