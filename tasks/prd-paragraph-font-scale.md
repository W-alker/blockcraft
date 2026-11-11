# PRD：段落级字体缩放与列表前缀一致性

## 1. 简介

BlockCraft 当前把字体缩放持久化为行内 Delta 属性 `t:fs`，并以 `em`
作用于 `.edit-container` 内的文字 run。`ordered` 序号、`bullet` 圆点和
`todo` 勾选框是文字容器的兄弟前缀，因此不会继承行内字号；当整个列表项
被放大或缩小时，正文与前缀的视觉比例失衡。

本功能引入段落级字体缩放。完整段落或完整 Block 的字体缩放写入 editable
Block props；局部选择和折叠光标继续使用 `t:fs`。段落级缩放作为该段落的
基础字号，行内缩放继续作为相对倍率，两者相乘。列表前缀直接继承段落基础
字号，不再追踪、计算或监听首个文字 run。

本 PRD 采用以下已确认决策：

- 覆盖所有支持现有字体工具栏的标准富文本 editable Block；
- 完整段落/整块使用段落级缩放，局部选择/折叠光标使用行内缩放；
- 段落级缩放与 `t:fs` 采用相乘语义；
- 不迁移、不兼容已经保存的旧 `t:fs` 内容；
- 本次只增加段落级字体缩放，不提升字体族和字符间距的所有权层级。

## 2. 目标

- ordered、bullet、todo 在整段缩放后，前缀与正文保持一致的基础字号。
- 建立清晰的文档级、段落级、行内级字体缩放所有权。
- 完整段落与局部文字可以在一次跨 Block 选择中按覆盖范围正确分流。
- 实时编辑、协同更新、Undo/Redo、Snapshot Viewer 和 HTML 往返使用同一契约。
- 段落缩放参与虚拟高度估算和缓存失效，离屏布局不会继续使用旧字号几何。
- 不增加逐次输入监听、MutationObserver、ResizeObserver 或布局读取。

## 3. 非目标

- 不把字体族 `t:ff` 提升为段落级属性。
- 不把字符间距 `t:ls` 提升为段落级属性。
- 不修改文档根 `fs` 的含义；它仍是文档基础字号（CSS px）。
- 不自动迁移旧文档中覆盖整段的 `t:fs` 或旧 `s:fontSize`。
- 不为旧内容推导列表前缀字号；旧内容保持原样，用户重新执行整段缩放后才进入新契约。
- 不改变 `plainTextOnly` 或自有字号系统的组件，例如 code、mermaid textarea、WordArt。
- 不改变浮动文字工具栏的既有功能边界。
- 不修改 npm 包版本号；版本号仍由用户单独决定。

## 4. 领域模型与核心规则

### 4.1 排版所有权

| 层级 | 持久化字段 | 含义 |
|---|---|---|
| 文档 | root `fs` | 文档基础字号，单位 px |
| 段落 | editable props `pfs` | 段落基础字号倍率，范围 `0.5..3` |
| 行内 | Delta `t:fs` | 相对段落基础字号的局部倍率，范围 `0.5..3` |

有效字号：

```text
普通段落有效字号 = root.fs × paragraph.pfs × inline.t:fs
标题有效字号 = root.fs × headingScale × paragraph.pfs × inline.t:fs
```

缺少 `pfs` 等价于 `1`。为保持模型紧凑，设置为 `1` 时写入 `null`/删除属性，
不持久化中性值。`t:fs` 继续沿用相同的中性值规则。

### 4.2 字段命名

新增 `IEditableBlockProps.pfs?: number | null`：

- `pfs` 表示 paragraph font scale；
- 不复用 `fs`，因为 root `fs` 是绝对 px，复用会让同名字段在不同节点具有不同单位；
- 使用独立 `normalizeParagraphFontScale()`，范围与 `normalizeInlineFontScale()` 一致；
- 无效、NaN、越界值不投影到 DOM。

### 4.3 适用 Block

数据契约属于 `IEditableBlockProps`。内置字体工具栏只对现有可格式化集合生效：

```text
nodeType === editable && !plainTextOnly
```

包括 paragraph、heading paragraph、ordered、bullet、todo、blockquote、caption
以及同样采用标准 InlineRuntime 的富文本 editable Block。

code、mermaid textarea、WordArt 等 `plainTextOnly` 或自有字号系统不在本次
工具栏写入范围内，避免一个组件同时受 `pfs` 和专用 fontSize props 控制。

### 4.4 覆盖范围判定

字体缩放命令必须按每个目标 Block 分别判定：

- 折叠文字光标：行内目标，只更新 next-insert `t:fs`；
- 非折叠文字范围完整覆盖 `[0, textLength]`：段落目标；
- whole-block selected point：段落目标；
- 容器/root boundary 范围完整覆盖的 editable 子 Block：段落目标；
- 首尾只覆盖部分文字：对应 Block 为行内目标；
- 跨 Block 选择中间被完整覆盖的 editable Block：段落目标；
- 空段落只有在 whole-block/boundary 明确覆盖时才是段落目标；位于 offset 0 的折叠光标仍是行内输入状态。

例如，从段落 A 中部选择到段落 C 中部：A、C 写行内 `t:fs`，完整覆盖的 B
写段落 `pfs`。三者必须在一个 Yjs transaction 中完成。

### 4.5 写入规则

当目标为段落级：

1. 将规范化倍率写入 `props.pfs`，倍率 `1` 写为 `null`；
2. 清除该 Block 全部文字范围内的 `t:fs` 和兼容字段 `s:fontSize`；
3. 保留字体族、字符间距、颜色、粗斜体、链接等其他行内属性；
4. 不创建额外的文本 run；相邻属性一致的 run 继续由 InlineRuntime/Y.Text 合并；
5. 一个用户操作只产生一个 Undo 记录。

当目标为行内级：

1. 保留 Block 的 `pfs`；
2. 对精确选区写 `t:fs`，倍率 `1` 清除 `t:fs`；
3. 清除同范围旧 `s:fontSize`；
4. 折叠光标只更新 next-insert attrs，不修改已有文本和 `pfs`。

### 4.6 相乘语义

行内倍率永远相对当前段落基础字号。例如：

```text
root.fs = 16px
pfs = 1.25
t:fs = 1.2
有效字号 = 16 × 1.25 × 1.2 = 24px
```

工具栏中的 `1.2×` 表示“相对当前段落基础字号 1.2 倍”，不是文档绝对 120%。

## 5. 用户故事

### US-001：持久化段落字体缩放

**描述：** 作为文档用户，我希望整段缩放成为段落属性，使段落内文字和结构前缀共享同一基础字号。

**验收标准：**

- [ ] `IEditableBlockProps` 增加 `pfs?: number | null`。
- [ ] 只接受 `0.5..3` 的有限数字。
- [ ] 中性值 `1` 规范化为缺省/`null`。
- [ ] Yjs、Snapshot 和 JSON 中只保存紧凑数字，不保存 CSS 单位字符串。
- [ ] 类型检查与定向单元测试通过。

### US-002：按选区覆盖范围分流缩放

**描述：** 作为用户，我希望完整段落调整基础字号，而局部选择只调整选中文字。

**验收标准：**

- [ ] 单段 `[0, textLength]` 选择写入 `pfs` 并清除整段 `t:fs`/`s:fontSize`。
- [ ] 局部文字选择只写 `t:fs`，不修改 `pfs`。
- [ ] 折叠光标只修改 next-insert attrs。
- [ ] whole-block 和 boundary 完整覆盖可以写段落级缩放。
- [ ] 跨段混合覆盖按 Block 分区处理。
- [ ] 只读目标保持不可写，沿用现有只读提示与失败边界。
- [ ] 整个命令只有一个 Yjs transaction 和一个 Undo 记录。
- [ ] 选区在格式化引发 DOM run 重组后保持原方向和端点。
- [ ] 类型检查与 Selection/TextToolbarHelper 定向测试通过。

### US-003：列表前缀跟随段落字号

**描述：** 作为列表用户，我希望序号、圆点和勾选图标与列表正文同步缩放。

**验收标准：**

- [ ] ordered 前缀继承 `pfs` 对应的段落基础字号。
- [ ] 圆圈序号已有 digit scale 在段落基础字号之上继续相乘。
- [ ] bullet 的 point/circle/square 使用相对 `em` 几何，不再直接依赖固定 `--bc-fs`。
- [ ] todo 图标跟随基础字号，交互按钮仍保留不小于现有值的点击区域。
- [ ] `pfs=0.5`、`1`、`1.5`、`3` 均无截断、重叠或错位。
- [ ] 不新增逐输入订阅、MutationObserver、ResizeObserver 或同步布局读取。
- [ ] 使用 dev-browser skill 在浏览器中验证 ordered、bullet、todo 的视觉结果。

### US-004：统一固定工具栏与字体设置弹窗

**描述：** 作为用户，我希望预设下拉和更多字体设置对同一选区产生一致结果。

**验收标准：**

- [ ] 字体缩放预设和字体设置弹窗调用同一个缩放命令服务。
- [ ] 完整段落选区显示共同 `pfs`；局部/光标显示共同 `t:fs`。
- [ ] 混合覆盖或混合值显示“混合”。
- [ ] 字体族和字符间距继续写行内属性，不随字体缩放提升到段落层。
- [ ] 弹窗一次确认中的字体族、字体缩放和字符间距写入一个 transaction。
- [ ] 格式刷按来源覆盖类型携带 `pfs` 或 `t:fs`，目标仍按覆盖范围分流。
- [ ] 浮动文字工具栏没有新增控件或行为。
- [ ] 使用 dev-browser skill 在浏览器中验证下拉、弹窗和 Undo/Redo。

### US-005：实时与 Snapshot/HTML 一致投影

**描述：** 作为查看者和导出使用者，我希望编辑态、只读态和 HTML 往返保持相同字号层级。

**验收标准：**

- [ ] BaseBlockComponent 和 Snapshot Viewer 都投影同一段落缩放变量。
- [ ] Snapshot Viewer 中 ordered、bullet、todo 前缀与正文同步缩放。
- [ ] HTML BlockCraft 往返使用 `data-bc-pfs` 精确保留倍率。
- [ ] HTML 样式输出使用相对字号，嵌套行内 `em` 保持相乘语义。
- [ ] 标准 Markdown 继续只保留可表达内容，不承诺保留字号。
- [ ] 非法 HTML `data-bc-pfs` 和任意 CSS 表达式不能进入模型。
- [ ] 实时、Snapshot 和 HTML adapter 定向测试通过。
- [ ] 使用 dev-browser skill 在浏览器中验证编辑态与 Snapshot 的视觉一致性。

### US-006：虚拟高度估算响应段落缩放

**描述：** 作为长文档用户，我希望离屏段落缩放后滚动范围和分页估算同步更新。

**验收标准：**

- [ ] editable 模型估算将 `pfs` 同时用于字符宽度和行高。
- [ ] heading scale 与 `pfs` 相乘。
- [ ] 表格单元格内 editable 估算同样读取 `pfs`。
- [ ] `pfs` props 变化使连续虚拟化和稀疏分页相关估算失效。
- [ ] mounted DOM 测量仍是精确修正路径。
- [ ] 估算路径不读取 DOM、不展开完整 inline Delta。
- [ ] 虚拟估算和 layout cache 定向测试通过。

### US-007：同步公共文档和迁移说明

**描述：** 作为 BlockCraft 集成方，我需要明确新字段、CSS 变量和工具栏行为。

**验收标准：**

- [ ] 更新 `blockcraft.md` 的排版所有权 Quick Reference。
- [ ] 更新 `blockcraft-block.md` 的 `IEditableBlockProps` 契约。
- [ ] 更新 `blockcraft-theme.md` 的段落字号变量和计算公式。
- [ ] 更新 `blockcraft-plugins-formatting.md` 的选区分流规则。
- [ ] 在 `MIGRATIONS.md` 增加行为变化条目，明确旧 `t:fs` 不迁移。
- [ ] 所有被改 ai-skills 文档刷新 `Last updated` 日期。
- [ ] 未经用户明确要求不修改 `packages/editor/package.json` 版本号。

## 6. 功能需求

- **FR-1：** 系统必须将 `pfs` 限制在 `0.5..3`，并将 `1` 规范化为缺省。
- **FR-2：** 字体缩放命令必须以稳定 Block ID 和模型选区判断完整/局部覆盖，不依赖 DOM Range 几何。
- **FR-3：** 同一跨 Block 命令必须在一个 Yjs transaction 中分别处理段落目标和行内目标。
- **FR-4：** 段落目标必须清除完整文字范围的 `t:fs` 与 `s:fontSize`，避免双重缩放。
- **FR-5：** 行内目标不得修改 `pfs`。
- **FR-6：** 段落基础字号必须被普通正文和列表前缀共同继承。
- **FR-7：** 标题自身倍率、caption 等内置基础倍率必须与 `pfs` 相乘，而不是覆盖它。
- **FR-8：** `t:fs` 必须继续以 `em` 相对段落基础字号生效。
- **FR-9：** fixed toolbar 预设和字体弹窗必须共用同一命令入口。
- **FR-10：** Snapshot Viewer 必须投影与实时编辑器相同的字段和 CSS 变量。
- **FR-11：** HTML BlockCraft 往返必须精确保留 `pfs`，普通外部 HTML 不要求推断段落倍率。
- **FR-12：** 虚拟高度估算必须把 heading scale、`pfs`、行高和段落间距组合到同一模型估算中。
- **FR-13：** 旧文档中的整段 `t:fs` 不得在加载时自动改写或派生为 `pfs`。
- **FR-14：** 远端协同、Undo/Redo 和 Snapshot 更新必须经过与本地相同的投影路径。

## 7. UI 与交互设计

### 7.1 工具栏显示值

- 段落目标读取 `pfs ?? 1`；
- 行内目标读取选区/next-insert 的 `t:fs ?? 1`；
- 所有目标值相同则显示该倍率；
- 任一目标值不同、非法或覆盖类型混合且无法形成共同值时显示“混合”；
- “默认”操作等价于倍率 `1`，分别清除目标层级的字段。

### 7.2 混合覆盖示例

```text
A: 选择 offset 3..末尾   -> 写 A 的 t:fs
B: 完整覆盖              -> 写 B.props.pfs，清 B 全文 t:fs
C: 选择开头..offset 5    -> 写 C 的 t:fs
```

命令完成后仍恢复原 A→C 选区，不折叠到单个光标。

### 7.3 列表前缀

- ordered 序号保持当前可点击 marker toolbar 行为；
- bullet 几何使用 `em`，不同 depth 的 point/circle/square 规则不变；
- todo 只扩大/缩小图标视觉，按钮仍是稳定交互目标；
- 前缀颜色、完成状态、序号样式不因字号功能改变。

## 8. 技术设计

### 8.1 建议代码边界

```text
framework/block-std/typography.ts
  normalizeParagraphFontScale()

framework/block-std/types/block.type.ts
  IEditableBlockProps.pfs

framework/utils/text-toolbar-helper.ts
  resolveFontScaleTargets(selection)
  applyFontScale(value, selection, optionalInlinePatch)

framework/block-std/block/component/base-block.ts
  pfs -> --bc-block-fs-scale

snapshot-viewer/dom/create-block-shell.ts
  同契约投影

adapters/html-adapter/typography.ts
  data-bc-pfs 往返

framework/modules/virtualization/model-height-estimator.ts
  headingScale × paragraphScale
```

命令编排属于 `TextToolbarHelper`/格式化领域；Block 组件只投影模型，不自行判断
选区或回写 Yjs。列表 Block 不监听文字变化，也不解析首个 run。

### 8.2 CSS 投影

建议公共变量：

```scss
--bc-block-fs-scale: 1;
--bc-block-base-fs: calc(var(--bc-fs) * var(--bc-block-fs-scale, 1));
```

标准 editable host 使用 `--bc-block-base-fs` 作为基础字号。heading、caption 等
自带倍率的主题规则必须以它为基数。ordered/todo 使用继承的 `1em`；bullet
点形尺寸由固定 `calc(var(--bc-fs) * 0.4)` 改为 `0.4em`。

不使用 typed `attr()`、大量 `:has()` 档位选择器或从子元素向父元素反推样式，
以保持 Chromium、Safari/WKWebView 和 Tauri 的一致性。

### 8.3 性能边界

- 选区覆盖判断复杂度为 O(目标 Block 数)，只在用户执行格式命令时发生；
- 不在 keydown、input、selectionchange 或滚动热路径增加遍历；
- 不读取 `getBoundingClientRect`、offsetHeight 或 computed style；
- 不展开离屏 editable 的完整 Delta 来估算高度；
- props 投影由现有 OnPush/Yjs 更新链路触发；
- Snapshot 每次 render/update 只处理当前快照字段。

### 8.4 协同与 Undo

- 所有 `pfs` 和 `t:fs` 修改经 `DocCRUD.transact()`；
- 不直接修改 props、Y.Map、Y.Text 或 DOM；
- 本地、远端、Undo/Redo 复用同一 HostBinding/Snapshot 投影；
- 格式命令保存并恢复 model selection，不用 DOM `recalculate()` 确认写入；
- 整段写 `pfs` 与清行内缩放属于一个原子事务。

### 8.5 HTML 契约

BlockCraft HTML 输出：

```html
<li data-bc-pfs="1.5" style="font-size: 150%">...</li>
```

`data-bc-pfs` 是精确往返来源；相对 `font-size` 供普通 HTML 查看器保留视觉。
嵌套行内 `font-size: 1.2em` 继续相对该段落字号。导入时只接受规范数字；
不接受 `var()`、`calc()`、`attr()`、`url()` 或越界数据。

## 9. 测试策略

### 9.1 纯函数与数据

- `pfs` 的最小值、最大值、中性值、NaN、Infinity、字符串和越界值；
- 完整、局部、折叠、whole-block、boundary、跨父容器选区的目标分区；
- 混合 plainTextOnly/void/readonly 目标的失败关闭行为。

### 9.2 命令与协同

- 完整段落写 `pfs` 并只清字号属性；
- 局部范围保留 `pfs`；
- 跨 Block 混合分流只产生一个 transaction；
- Undo/Redo 恢复 props、Delta attrs 和选区；
- 远端 props 更新与本地显示一致。

### 9.3 渲染

- paragraph、heading、blockquote、caption 的基础字号；
- ordered 普通/圆圈/多位数 marker；
- bullet 三种 depth marker；
- todo checked/unchecked；
- pfs 与 t:fs 相乘；
- live 与 Snapshot computed style 一致；
- 横排和文本框内嵌标准 editable Block 不发生轴向回归。

### 9.4 导出与估算

- HTML exact round-trip 和恶意值拒绝；
- Markdown 可读降级；
- 连续虚拟化、稀疏分页和表格单元格估算；
- pfs 更新触发缓存失效，mounted 测量可覆盖估算。

### 9.5 验证命令建议

```text
focused Karma suites:
  typography / TextToolbarHelper / fixed-toolbar
  ordered / bullet / todo
  Snapshot Viewer / HTML adapter
  model-height-estimator / layout metrics

pnpm ng build editor
git diff --check
browser visual smoke: Chrome + Safari/WKWebView/Tauri 可用环境
```

## 10. 成功指标

- 整段设置 150% 后，ordered、bullet、todo 前缀与正文基础字号比例一致。
- 局部设置 150% 不改变该段列表前缀。
- 跨三段混合选择可在一次 Undo 中完整撤销。
- live、Snapshot 和 HTML round-trip 的 `pfs` 与有效字号一致。
- pfs 改变后离屏高度、可见范围和滚动条几何重新估算。
- 格式化实现新增 0 个逐输入监听器、0 个布局读取、0 个 DOM MutationObserver。
- 所有定向测试、editor build 和 diff check 通过。

## 11. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 完整选区误判导致整段局部样式被清除 | 使用模型 offset/Block coverage 判定，覆盖边界写纯函数测试 |
| pfs 与 t:fs 双重放大 | 段落目标原子清除整段 t:fs/s:fontSize |
| 标题/caption 固定 `--bc-fs` 覆盖 pfs | 审计所有 editable font-size 规则，统一改用 block base token |
| todo 缩小后难以点击 | 图标缩放与按钮最小点击区域分离 |
| 虚拟滚动仍使用旧高度 | 将 pfs 纳入模型估算 facts 和 props 失效路径 |
| 旧内容仍有列表前缀不一致 | 已确认不兼容；在 MIGRATIONS 中明确，不做隐式模型迁移 |
| specialized editable 出现双字号系统 | plainTextOnly/自有字号组件明确排除 |

## 12. 开放问题

产品决策已关闭。实现阶段仅保留以下工程确认项，不改变产品规则：

- todo 按钮当前实际点击区域尺寸，需在视觉 smoke 后确定是否需要独立最小值；
- 宿主若存在未登记的自定义 editable Block，需要确认其主题是否继承标准基础字号 token；
- 包版本号由用户在发布阶段单独决定。
