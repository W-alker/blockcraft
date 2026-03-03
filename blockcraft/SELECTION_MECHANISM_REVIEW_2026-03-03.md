# BlockCraft 选择机制评估与对标（2026-03-03）

## 1. 评估范围

- 代码范围：`blockcraft/framework/modules/selection`、`input`、`clipboard`、`table`、`event/control/selection`、主题样式。
- 对标对象：
  - 产品侧：Notion、Google Docs。
  - 引擎侧：Lexical、ProseMirror（含 prosemirror-tables）、Slate、Quill、CKEditor 5。

---

## 2. BlockCraft 当前选择机制（现状）

## 2.1 数据模型与状态

- 采用单一区间模型：`from + to + collapsed`，区间端点类型只有 `text` 和 `selected`（块选中）。
  - 见：`framework/modules/selection/types.ts:12-30`。
- `BlockSelection` 暴露 `isAllSelected`、`isInSameBlock`、`getDirection()` 等推导属性，供输入、快捷键和工具栏使用。
  - 见：`framework/modules/selection/blockSelection.ts:39-71`。

## 2.2 选区计算与约束

- 全局监听 `document.selectionchange`，每次触发 `recalculate()`。
  - 见：`framework/modules/selection/index.ts:69-78`。
- `normalizeRange()` 对 IME、zero-space、embed 节点做了较多浏览器兼容处理。
  - 见：`framework/modules/selection/index.ts:460-555`。
- 当前硬限制：跨父级的 `from/to` 会直接 `range.collapse()` 并返回空选区。
  - 见：`framework/modules/selection/index.ts:424-431`。

## 2.3 键盘行为

- 已支持：
  - `Shift + ↑/↓/←/→` 跨块扩选（含 editable 与 non-editable 块）。
    - 见：`framework/modules/selection/index.ts:118-218`。
  - `Cmd/Ctrl + A` 渐进全选（块内 -> 父级 -> 全文），并提示二次全选。
    - 见：`framework/modules/selection/index.ts:221-245`。
  - `Home/End`（含纯文本块按换行定位）。
    - 见：`framework/modules/selection/index.ts:247-286`。

## 2.4 视觉反馈

- 根节点默认 `user-select: none`，在编辑容器恢复文本可选。
  - 见：`themes/base.scss:25-31`、`themes/base.scss:83-98`。
- 通过 `selected/focused` 类标记块选中与聚焦；跨块“中间段”使用 `queryBlocksBetween()` 进行首层补齐。
  - 见：`framework/modules/selection/selected-manager.ts:36-70`。
  - 见：`framework/doc/index.ts:333-346`。
- `all-selected` 类被写入但暂无对应样式定义（仅逻辑标记）。
  - 见：`framework/modules/selection/selected-manager.ts:43`。

## 2.5 输入与剪贴板联动

- `beforeinput` 直接基于 `StaticRange` 做替换/删除，块选中输入时自动插入段落承接输入。
  - 见：`framework/modules/input/index.ts:100-149`。
- 复制支持文本片段与块快照混合导出（文本 + adapters）。
  - 见：`framework/modules/clipboard/index.ts:55-113`。
- 粘贴入口要求 `selection.from.type === 'text'`，块选中状态下粘贴会直接返回。
  - 见：`framework/modules/clipboard/index.ts:148-150`。

## 2.6 表格选择（专用路径）

- 表格单元格选择走独立实现（矩形选区、行列头联动），并未完全统一到通用 Selection 类型系统。
  - 见：`blocks/table-block/table.block.ts:206-339`、`340-366`。
- 表格插件通过快捷键把单元格选区提升为 table 级块选中。
  - 见：`plugins/tableBlockBinding.ts:71-111`。

## 2.7 事件状态机风险点

- `SelectionControl` 内定义了 `_handleSelectionChange()`（用于程序化选区 start/end 侦测），但 `listen()` 中未注册调用。
  - 定义：`framework/block-std/event/control/selection.ts:88-136`。
  - 监听入口：`framework/block-std/event/control/selection.ts:153-204`。
- Root 级别选择向外扩展依赖 `pointerleave + selectAllChildren()` 递归提升，代码中已有 “TODO 这样实现不太好” 注释。
  - 见：`blocks/root-block/root.block.ts:54-77`。

---

## 3. 对比结论（产品 + 引擎）

## 3.1 产品侧对比（用户可感知行为）

## Notion

- 官方快捷键提供了“文本/块”双态选择路径：
  - `Esc` 选中当前块；
  - `Cmd/Ctrl + A` 一次选块、再次选整页；
  - `Shift + Arrow` 可扩展块级选择。
- 与 BlockCraft 的差异：
  - BlockCraft 已有“连续 Cmd/Ctrl+A 扩大范围”思路，但块级选择入口和反馈一致性仍偏弱（尤其容器块、跨层级）。

## Google Docs

- 官方快捷键覆盖细粒度扩选（字符/词/行）以及多段文本选择（discontiguous selection）。
- 与 BlockCraft 的差异：
  - BlockCraft 当前是“单一区间模型”，不支持多段离散选区。
  - 文本粒度扩选策略（例如词级）尚不完整。

## 3.2 引擎侧对比（可借鉴能力）

## Lexical

- 明确区分 `RangeSelection / NodeSelection / TableSelection / null`，并强调 selection 是 `EditorState` 的一部分。
- 提供 `SKIP_DOM_SELECTION_TAG` 避免更新时强制同步 DOM 选区导致的焦点抖动。
- 对 BlockCraft 启发：
  - 需要从“端点类型”升级到“选择类型（Selection Kind）”。
  - 需要可控的 DOM 选区同步门控。

## ProseMirror

- 基础类型完善：`TextSelection / NodeSelection / AllSelection`。
- `SelectionBookmark` 支持把选区映射到变更后的文档（适合撤销/重做、协同）。
- `prosemirror-tables` 通过 `CellSelection` 将表格区间选择一等化。
- 对 BlockCraft 启发：
  - 跨结构映射（bookmark）与表格专有类型都应成为一等能力，而非插件层临时行为。

## Slate

- `Range` 由 `anchor/focus` 组成，可跨节点；`RangeRef` 可在操作后持续跟踪区间。
- 对 BlockCraft 启发：
  - 现有 Yjs 相对位置能力可继续扩展到“范围级”与“表格级”持久锚点。

## Quill

- 提供稳定 API：`getSelection/setSelection`、`selection-change`、`scrollSelectionIntoView`。
- 文档明确指出：`text-change` 期间 selection 可能尚未更新，应监听 `selection-change`。
- 对 BlockCraft 启发：
  - 应建立更清晰的“文本变更事件 vs 选区变更事件”边界，减少时序依赖。

## CKEditor 5

- `DocumentSelection` 是 live 选择，会随模型变更自动更新 ranges。
- 支持 fake selection（用于 widget/对象选中）与可访问性标签。
- 对 BlockCraft 启发：
  - 可将当前 fake range 体系与语义化对象选择（含 a11y）整合。

---

## 4. 核心差距总结

1. 单一区间模型能力上限明显。
- 缺少一等 `table-cell-range`、`node/object`、`multi-range` 类型。

2. 跨层级选择被硬性收缩。
- 当前跨父级直接折叠选区，导致容器块/嵌套块选择链不稳定。

3. 事件状态机不闭环。
- `SelectionControl` 中 selectionchange 逻辑未接入，程序化选区 start/end 语义不完整。

4. 粘贴与块选中语义不一致。
- 块选中时粘贴被直接忽略，违背多数编辑器用户预期（替换所选对象/块）。

5. 表格选择“能用但分裂”。
- 表格矩形选区未进入统一 Selection 类型系统，后续工具栏、撤销、协同扩展成本高。

---

## 5. 优化方向与优先级

## P0（建议先做，1-2 个迭代）

1. 引入统一的 `SelectionKind`（最低包含 `text | block | table`）。
- 目标：把表格矩形选择从插件状态提升到核心 Selection。
- 落点：
  - `framework/modules/selection/types.ts`
  - `blocks/table-block/table.block.ts`
  - `plugins/tableBlockBinding.ts`

2. 去掉“跨父级直接 collapse”硬限制，改为“提升到最近公共祖先 + 深路径选择”。
- 目标：支持容器块跨层选择和稳定复制/删除。
- 落点：
  - `framework/modules/selection/index.ts`（`recalculate/normalizeRange`）
  - `framework/doc/index.ts`（复用 `queryBlocksThroughPathDeeply`）

3. 修复选择事件状态机闭环。
- 目标：保证程序化选择也能触发稳定的 `selectStart/selectEnd`。
- 落点：
  - `framework/block-std/event/control/selection.ts`（接入 `_handleSelectionChange` 或重构）
  - `blocks/root-block/root.block.ts`（减少 pointerleave 递归 hack）

4. 打通“块选中 -> 粘贴替换”链路。
- 目标：与主流编辑器一致，避免“看起来选中了但粘贴无效”。
- 落点：
  - `framework/modules/clipboard/index.ts`（`onPaste` 分支）
  - `framework/modules/input/index.ts`（替换策略复用）

## P1（中期，2-4 个迭代）

1. 引入 Selection Bookmark/Ref（文本、块、表格三类）。
- 目标：撤销重做、协同、异步工具栏流程中的选区恢复更稳。
- 参考实现基础：当前已有 `OneShotCursorAnchor` 与 undo 相对位置。

2. 规范 DOM 选区同步策略（增加 skip/suspend 标记）。
- 目标：避免工具栏/协同更新造成焦点跳变。
- 可借鉴：Lexical 的 `SKIP_DOM_SELECTION_TAG` 思路。

3. 统一视觉语义。
- 目标：补齐 `all-selected` 样式、聚焦环、对象选中态与 fake selection 对齐。
- 落点：
  - `themes/base.scss`
  - 各 block 主题样式

## P2（长期）

1. 支持多段离散选区（高级编辑场景）。
2. 选区能力测试基线（keyboard matrix + IME + table + collaboration）。
3. 与虚拟渲染的选区钉住策略联调，避免跨虚拟边界选区丢失。

---

## 6. 建议的验收指标

1. 交互一致性
- 20 个核心选择场景（文本、块、表格、嵌套）通过率 >= 95%。

2. 稳定性
- IME 输入、撤销重做、协同远端更新后，选区恢复正确率 >= 99%。

3. 性能
- 连续拖选时 `selectionchange -> normalizeRange` 平均耗时下降（建议目标 < 2ms/次，按设备分层）。

---

## 7. 外部参考（本次对标来源）

- Notion Keyboard Shortcuts  
  https://www.notion.com/help/keyboard-shortcuts
- Google Docs Editors Help: Keyboard shortcuts  
  https://support.google.com/docs/answer/179738
- Lexical Concepts: Selection  
  https://lexical.dev/docs/concepts/selection
- ProseMirror Reference（Selection 相关）  
  https://prosemirror.net/docs/ref/
- ProseMirror Tables（CellSelection）  
  https://github.com/ProseMirror/prosemirror-tables
- Slate Locations / Selection  
  https://docs.slatejs.org/concepts/03-locations
- Quill API（Selection）  
  https://quilljs.com/docs/api
- CKEditor 5 API（selection）  
  https://ckeditor.com/docs/ckeditor5/latest/api/module_engine_model_selection-Selection.html

