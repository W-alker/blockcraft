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

当你修改了 `packages/editor/framework/`、`packages/editor/blocks/`、`packages/editor/plugins/` 等目录下的**架构性代码**（而非单纯的 bug fix），你**必须**检查并同步更新 `packages/editor/ai-skills/` 中受影响的文档。

具体判定标准：

| 变更类型 | 需要更新的文档 |
|----------|---------------|
| 修改 `DocPlugin` 基类、Plugin 注册方式 | `blockcraft-plugin.md` |
| 修改 `BaseBlockComponent`/`EditableBlockComponent` | `blockcraft-block.md` |
| 修改 Block Schema 接口 (`IBlockSchemaOptions`) | `blockcraft-block.md` |
| 修改 `EmbedConverter` 接口或 Embed 注册方式 | `blockcraft-embed.md` |
| 修改 Adapter matcher 接口或 `ASTWalker` | `blockcraft-adapter.md` |
| 修改 `OverlayService` 或 Overlay 创建方式 | `blockcraft-toolbar.md` |
| 修改 `SelectionManager` 或选区模型 | `blockcraft-selection.md` |
| 修改 `InputTransformer` 或 `CompositionSession` | `blockcraft-input.md` |
| 修改 Blot 系统 (`InlineRuntime`, `ScrollBlot` 等) | `blockcraft-inline.md` |
| 修改 `UIEventDispatcher` 或事件装饰器 | `blockcraft-event.md` |
| 修改 `DocCRUD`、`proxyMap`、Yjs 数据结构 | `blockcraft-data.md` |
| 新增/删除/重命名 Block 类型 | `blockcraft.md`（Block 分类表） |
| 新增/删除/重命名 Plugin | `blockcraft.md` + `blockcraft-plugin.md` |
| 修改 DocChain API | `blockcraft.md` + `blockcraft-block.md` |
| 修改主题系统结构 | `blockcraft-theme.md` |

**操作流程**：
1. 完成代码修改后，检查上表，确定是否涉及文档更新
2. 如果涉及，读取对应的 ai-skills 文档，更新受影响的部分（API 签名、代码模板、文件路径等）
3. 在文档顶部更新 `Last updated` 日期
4. 如果不确定是否需要更新，宁可更新，不要遗漏

## 文件清单

```
packages/editor/ai-skills/
├── blockcraft.md           # L0: 概览 + 路由表
├── blockcraft-plugin.md    # L1: 创建 Plugin
├── blockcraft-block.md     # L1: 创建 Block
├── blockcraft-embed.md     # L1: 创建 Inline Embed
├── blockcraft-adapter.md   # L1: 创建 Adapter Matcher
├── blockcraft-toolbar.md   # L1: Toolbar / Overlay UI
├── blockcraft-theme.md     # L1: 主题定制
├── blockcraft-debug.md     # L1: 调试排错
├── blockcraft-perf.md      # L1: 性能优化
├── blockcraft-test.md      # L1: 测试策略
├── blockcraft-selection.md # L2: Selection 机制
├── blockcraft-input.md     # L2: Input / IME 机制
├── blockcraft-inline.md    # L2: Inline / Blot 系统
├── blockcraft-event.md     # L2: Event 事件系统
└── blockcraft-data.md      # L2: Yjs 数据模型
```

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