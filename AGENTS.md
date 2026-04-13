<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **blockcraft** (2842 symbols, 8209 relationships, 223 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/blockcraft/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/blockcraft/context` | Codebase overview, check index freshness |
| `gitnexus://repo/blockcraft/clusters` | All functional areas |
| `gitnexus://repo/blockcraft/processes` | All execution flows |
| `gitnexus://repo/blockcraft/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## CLI

- Re-index: `npx gitnexus analyze`
- Check freshness: `npx gitnexus status`
- Generate docs: `npx gitnexus wiki`

<!-- gitnexus:end -->

# AI Skills 文档（框架知识库）

## 概述

`packages/editor/ai-skills/` 目录包含了 BlockCraft 编辑器框架的 AI 技能文档，采用三层渐进式披露结构。当你需要在本项目中创建 Plugin、Block、Embed 或进行其他框架相关开发时，请按需阅读这些文档。

## 使用方式

1. **接到任务时**：先读 `packages/editor/ai-skills/blockcraft.md`（L0 概览），通过路由表确定需要加载的子文档
2. **执行具体任务**：按路由表指引读取对应的 L1 任务指南（如 `blockcraft-plugin.md`）
3. **涉及底层机制时**：按需读取 L2 深潜文档（如 `blockcraft-selection.md`）

## 文档同步规则（MANDATORY）

> **核心原则**：只有在**架构层 / 公共契约 / 扩展点**发生变化，或本次任务**明确同步更新相关 ai-skills 文档**时，BlockCraft 框架代码、ai-skills 文档与 `MIGRATIONS.md` 才需要在同一个 commit/PR 中同步演进。
>
> **默认规则**：普通 bug fix、实现细节修复、兼容性补丁、测试补充、非架构性行为修正，**不要默认**追加 `MIGRATIONS.md`，也**不要因为代码有变化就机械更新**无关 ai-skills 文档。
>
> **版本号规则**：`packages/editor/package.json` 的版本号**不联动**上述同步流程，属于用户手动定义的发布决策。**除非用户明确要求**，否则任何任务中都**不要自动修改版本号**。
>
> **谁会看这些规则**：在这个仓库工作的所有 AI agent 和人类开发者。下游依赖 `@ccc/blockcraft` 的项目是这套规则的最终受益者——他们升级版本时只要看 `MIGRATIONS.md` 就知道要改什么。

### 触发条件

当你修改了 `packages/editor/framework/`、`packages/editor/blocks/`、`packages/editor/plugins/`、`packages/editor/adapters/`、`packages/editor/themes/`、`packages/editor/editor/` 等目录下，且改动满足以下任一条件时，才触发本节的强制同步要求：

- 任何 exported 类、接口、函数、常量的新增 / 修改 / 删除 / 重命名
- Plugin / Block / Embed / Schema / Service Token 的新增 / 删除 / 重命名
- DocConfig / DocPlugin / BaseBlockComponent / EditableBlockComponent / SelectionManager / DocChain / DocCRUD 等公开 API 的签名或行为变化
- CSS class 名、CSS custom properties (`--bc-*`)、theme token 的变动
- 默认值 / 默认行为的变动（即使签名不变）
- 事件名、事件 payload 形状的变动
- 原本会抛错的边界情况改为静默（或反之）

如果本次改动只是局部实现修复，且**没有改变公共契约 / 架构 / 使用方式**，则不触发下面三项默认要求。

当且仅当触发上述条件时，你**必须**做下列三件事，任一遗漏均视为未完成本次任务：

1. **同步 ai-skills 文档** — 见下表，按"变更类型 → 受影响文档"映射更新。所有被改动文件的顶部 `Last updated:` 日期一并刷新。
2. **追加 MIGRATIONS.md 条目** — 在 `packages/editor/ai-skills/MIGRATIONS.md` 顶部插入新版本块（紧跟在最近条目之上），按文件内的 entry 模板填写。即使 severity 是 patch 也要写，理由写"内部修复，无外部影响"也算。
3. **版本号是否调整由用户决定** — 不要把修改 `packages/editor/package.json` 的 `version` 视为默认步骤；只有在用户明确要求发布、bump version、对齐版本策略时才修改。

### 变更类型映射表

| 变更类型 | 需要更新的文档 |
|----------|---------------|
| 修改 `DocPlugin` 基类、Plugin 注册方式 | `blockcraft-plugin.md` |
| 修改 `BaseBlockComponent`/`EditableBlockComponent` | `blockcraft-block.md` |
| 修改 Block Schema 接口 (`IBlockSchemaOptions`) | `blockcraft-block.md` |
| 修改 `EmbedConverter` 接口或 Embed 注册方式 | `blockcraft-embed.md` + `blockcraft-app.md` |
| 修改 Adapter matcher 接口或 `ASTWalker` | `blockcraft-adapter.md` |
| 修改 `OverlayService` 或 Overlay 创建方式 | `blockcraft-toolbar.md` |
| 修改 `SelectionManager` 或选区模型 | `blockcraft-selection.md` + `blockcraft.md` (Quick Reference) |
| 修改 `InputTransformer` 或 `CompositionSession` | `blockcraft-input.md` |
| 修改 Blot 系统 (`InlineRuntime`, `ScrollBlot` 等) | `blockcraft-inline.md` |
| 修改 `UIEventDispatcher` 或事件装饰器 | `blockcraft-event.md` |
| 修改 `DocCRUD`、`proxyMap`、Yjs 数据结构 | `blockcraft-data.md` |
| 修改 `DocConfig` 或 `BlockCraftDoc` 构造参数 | `blockcraft-app.md` |
| 修改 DI Token (`DOC_FILE_SERVICE_TOKEN` 等) 或 service 接口 | `blockcraft-app.md` |
| 新增/删除/重命名 Block 类型 | `blockcraft.md`（Block 分类表） |
| 新增/删除/重命名 Plugin | `blockcraft.md`（Plugin 列表） + `blockcraft-plugin.md` + 对应的 `blockcraft-plugins-*.md` 分类文件 + `blockcraft-plugins-ref.md`（索引表） |
| 修改现有 Plugin 的构造参数、Options 接口、扩展点、公开 API | 对应的 `blockcraft-plugins-*.md` 分类文件（按插件所属分类定位：`formatting` / `block` / `toolbar` / `inline` / `util`） |
| 修改 DocChain API | `blockcraft.md` + `blockcraft-block.md` |
| 修改主题系统结构 | `blockcraft-theme.md` |
| 重构 / 新增 / 删除任何上述未列出的对外 API | `blockcraft.md` + 受影响的 L1 + `MIGRATIONS.md` |

> 只有触发本节的“架构层 / 公共契约 / 扩展点变化”条件时，才需要更新 `MIGRATIONS.md`。
>
> 不要把普通 bug fix、内部实现调整、测试补充、浏览器兼容性兜底、局部 UX 修正机械记录进 `MIGRATIONS.md`。只有当外部使用者升级时**确实需要知道这件事**，或者本次任务**明确同步更新相关 ai-skills 文档**时，才留迁移痕迹。

### 操作流程（每次架构性修改都执行）

1. **完成代码修改**
2. **对照映射表**，确定本次改动覆盖的 ai-skills 文件
3. **更新对应的 ai-skills 文件**：API 签名、代码模板、文件路径、deprecation 标记等
4. **在被改文件顶部更新 `Last updated:` 日期**（YYYY-MM-DD）
5. **打开 `MIGRATIONS.md`**，在顶部紧跟最近条目之上插入新版本块，按 entry 模板填写：
    - 新版本号（按 severity 决定 patch / minor / major）
    - 日期、severity、What changed、Why
    - Affected ai-skills files 列出实际改动的文件名
    - 如果是 minor/major：填 New APIs、Deprecations、Migration Recipe（含 before/after 代码）
    - 如果是 major：填 Breaking Changes 节
    - 行为变化填 Behavior Changes 节
6. **仅在用户明确要求时再更新 `packages/editor/package.json` 的 `version`**
7. **PR 描述中显式列出**本次同步更新了哪些 ai-skills 文件，以及 MIGRATIONS 新增的版本号——评审者会照此对照检查
8. **如果不确定是否触发本节，先判断是否真的影响外部契约 / 架构 / skill 使用方式**；不要因为“代码变了”就自动补版本号或迁移记录

### 反面案例（明令禁止）

- ❌ 修改 `BaseBlockComponent` 的方法签名，但不动 `blockcraft-block.md`
- ❌ 删除一个 exported type，但不写 MIGRATIONS 条目
- ❌ 在没有用户明确要求的情况下，擅自提升 `package.json` 版本号
- ❌ "顺手"把一个 deprecated API 删掉，PR 里既没有 major bump 也没有 MIGRATIONS 条目
- ❌ 新增一个 plugin，但 `blockcraft.md` 的 Plugin 列表和 `MIGRATIONS.md` 都没有提
- ❌ 把 `blockcraft.md` 改了但忘记更新 `Last updated` 日期

### 执行边界

- **bug fix（无 API / 架构 / 扩展点变化）**：默认不更新 `MIGRATIONS.md`，默认不修改版本号；相关 ai-skills 文件只有在本次任务明确同步修正文档时才更新
- **重命名内部 helper 函数**：如果它没有 export，不需要任何文档变化
- **README / 项目文档变更**：不需要 MIGRATIONS 条目
- **测试代码 / 脚手架代码变更**：不需要 MIGRATIONS 条目
- **新增 ai-skills 文件本身**：作为 minor 写一条条目，列出新文件
- **只更新 ai-skills 文档本身**：如果没有版本发布意图、没有公共契约变化，可以只改相关 skill 文档，不必默认 bump 版本号
- **版本号管理**：版本号由用户自己定义；只有当用户明确要求发布、升级版本、对齐 release 计划时才修改
- **用户明确要求不要改版本号 / 不记迁移记录**：遵循用户要求，除非用户随后又明确要求发布相关操作

## 文件清单

```
packages/editor/ai-skills/   # 同时随 npm 包发布到 node_modules/@ccc/blockcraft/ai-skills/
├── SKILL.md                # AI 工具发现入口（含 frontmatter）
├── README.md               # 给外部消费者的安装与使用说明
├── MIGRATIONS.md           # 版本适配文档：每次架构变更必须在此追加条目
├── install.mjs             # 一键安装到 ~/.claude/skills 或 ~/.agents/skills 的脚本
├── blockcraft.md           # L0: 概览 + 路由表
├── blockcraft-app.md       # L1: 在宿主 Angular 应用中嵌入 BlockCraft
├── blockcraft-plugins-ref.md # L1: 内置插件索引（按分类路由到子文件）
├── blockcraft-plugins-formatting.md # L1: 文本格式化插件
├── blockcraft-plugins-block.md      # L1: 块管理插件
├── blockcraft-plugins-toolbar.md    # L1: 块工具栏插件
├── blockcraft-plugins-inline.md     # L1: 行内扩展 + 键盘绑定插件
├── blockcraft-plugins-util.md       # L1: 工具类插件
├── blockcraft-plugin.md    # L1: 创建 Plugin
├── blockcraft-block.md     # L1: 创建 Block
├── blockcraft-embed.md     # L1: 创建 Inline Embed
├── blockcraft-adapter.md   # L1: 创建 Adapter Matcher
├── blockcraft-toolbar.md   # L1: Toolbar / Overlay UI
├── blockcraft-theme.md     # L1: 主题定制
├── blockcraft-debug.md     # L1: 调试排错
├── blockcraft-perf.md      # L1: 性能优化
├── blockcraft-test.md      # L1: 测试策略
├── blockcraft-selection.md # L2: Selection 机制（anchor/head 模型）
├── blockcraft-input.md     # L2: Input / IME 机制
├── blockcraft-inline.md    # L2: Inline / Blot 系统
├── blockcraft-event.md     # L2: Event 事件系统
└── blockcraft-data.md      # L2: Yjs 数据模型
```

> **External distribution**: `ng-package.json` 在 `assets` 中包含 `ai-skills/**/*`，所以这套技能包会随 `@ccc/blockcraft` npm 包一起发布。外部应用安装包后即可在 `node_modules/@ccc/blockcraft/ai-skills/` 目录中找到完整文档；AI 工具（Claude Code / Codex）通过根目录的 `SKILL.md` frontmatter 自动发现，或运行 `node node_modules/@ccc/blockcraft/ai-skills/install.mjs` 一键安装到全局 skill 目录。修改任何 ai-skills 文件后**不需要**额外的发布步骤——只要随下次 `pnpm publish:editor` 一起带出去即可。

# BlockCraft 项目特定规则

> 通用规则（多方案评估、一致性、DDD、浏览器兼容）已提取至全局 `~/.claude/rules/`，所有项目共享。
> 以下是 BlockCraft 编辑器的**项目特定**补充规则。
> 详细的代码模板和决策树参见 `.claude/agents/blockcraft-engineer.md`。

## 性能检查清单（BlockCraft 特定）

- [ ] Angular 组件使用 `ChangeDetectionStrategy.OnPush`
- [ ] 高频事件（mousemove, scroll, selectionchange）使用 `throttle` / `debounce`
- [ ] 大数据操作在 `ngZone.runOutsideAngular()` 中执行
- [ ] Yjs observe 回调中避免触发 Angular 变更检测
- [ ] Overlay/Toolbar 使用 CDK Overlay，不污染文档 DOM 结构
- [ ] `destroy()` 中清理所有订阅、定时器、事件监听
- [ ] 不在渲染路径中执行同步 DOM 查询（如 `getBoundingClientRect`、`offsetHeight`）

## 浏览器兼容性补充（BlockCraft 特定）

> 通用浏览器规则见全局 `~/.claude/rules/typescript/browser-compat.md`。以下是富文本编辑器的额外要求。

- `contenteditable` 行为在不同浏览器中差异巨大。所有内容突变必须走 `InputTransformer` 拦截 + Yjs 写入，**禁止**依赖浏览器原生 contenteditable 行为
- IME 相关代码必须使用框架的 `CompositionSession` 状态机（参见 `blockcraft-input.md`），不要自行处理 composition 事件
- `@BindHotKey` 中的 `shortKey` 自动映射 macOS Cmd / Windows Ctrl，**禁止**在 Plugin 中硬编码 `metaKey` 或 `ctrlKey`

## 数据一致性（BlockCraft 特定）

- 所有 Block 数据突变**必须**通过 Yjs transaction（`DocCRUD` / `DocChain`），**禁止**直接修改 props 或 DOM
- Inline 内容的单一数据源是 `Y.Text`。DOM 状态必须与 `Y.Text.toDelta()` 一致，不一致时以 Y.Text 为准重渲染
- Undo/Redo 必须完整恢复选区状态（`DocUndoManager` 的 selection snapshot）
- 本地操作和远程协同操作经过相同渲染路径，**禁止**为本地操作绕过 Yjs
- 使用 `Y.RelativePosition` 处理协同位置引用，**禁止**绝对 index
- Block ID 使用 `generateId()` 生成，**禁止**手动拼接

## 接口一致性（BlockCraft 特定）

- Block 组件：`standalone: true`、`OnPush`、selector 格式 `tag.flavour-block`
- Plugin 生命周期：`init()` / `destroy()` 严格对称
- 事件处理器：返回 `true` = 已消费停止冒泡，`void`/`false` = 继续冒泡
- `updateProps()` 生成 undo 历史，`setInitProps()` 不生成
- Plugin **禁止**直接访问 `Y.Text` / `Y.Map`，通过 `BlockComponent` 公开方法和 `DocChain` 操作
- 主题变量（CSS custom properties）是统一外观的唯一手段，**禁止**硬编码颜色/字号

## 图标规范（BlockCraft 特定）

- 所有 icon **必须**使用字体图标（iconfont），图标资源位于 `packages/editor/assets/iconfont/`
- 使用方式：`<i class="bc_icon bc_图标名"></i>` 或 Schema 中的 `icon: "bc_icon bc_图标名"`
- 如果现有图标不满足需求，可以向 `packages/editor/assets/iconfont/` 中新增字体图标
- **唯一例外**：需要多色的图标允许使用 SVG（Schema 中的 `svgIcon` 字段），单色图标一律用字体图标
- **禁止**使用图片（png/jpg）作为图标，**禁止**内联 base64 图标

## DDD 领域边界（BlockCraft 特定）

> 通用 DDD 原则见全局 `~/.claude/rules/common/patterns.md`。以下是本项目具体的领域划分。

| 领域 | 职责 | 目录 | 核心实体 |
|------|------|------|----------|
| **Document** | 文档生命周期、块树、CRUD | `framework/doc/` | `BlockCraftDoc`, `DocCRUD`, `DocVM` |
| **Block** | 数据模型、组件基类、Schema | `framework/block-std/block/`, `schema/` | `BaseBlockComponent`, `NativeBlockModel`, `SchemaManager` |
| **Inline** | 行内富文本、Blot 树、Embed | `framework/block-std/inline/` | `InlineRuntime`, `ScrollBlot`, `EmbedConverter` |
| **Selection** | 选区模型、光标、范围 | `framework/modules/selection/` | `SelectionManager`, `BlockSelection` |
| **Input** | 输入拦截、IME、内容突变 | `framework/modules/input/` | `InputTransformer`, `CompositionSession` |
| **Event** | 事件分发、装饰器、冒泡 | `framework/block-std/event/` | `UIEventDispatcher` |
| **Clipboard** | 复制粘贴、序列化 | `framework/modules/clipboard/` | `ClipboardManager` |
| **Adapter** | HTML/Markdown ↔ Snapshot 转换 | `adapters/` | `HtmlAdapter`, `MarkdownAdapter`, `ASTWalker` |
| **Plugin** | 扩展行为、工具栏、快捷键 | `framework/plugin/`, `plugins/` | `DocPlugin` |

**跨域限制**：
- Selection 不直接操作 Blot 树 → 通过 `EditableBlockComponent` API
- Plugin 不直接访问 Yjs → 通过 `BlockComponent` + `DocChain`
- Block 组件不解析 HTML → 通过 `Adapter` 防腐层
- Embed 渲染/序列化 → 封装在 `EmbedConverter` 中
