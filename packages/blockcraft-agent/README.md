# blockcraft-agent

BlockCraft Editor Agent 的编辑器适配包，覆盖文档写作、模型读取、Schema 感知和
受控编辑操作。

当前包提供：

- `DocumentAgentPlugin`：监听 BlockCraft 选区并生成模型上下文；
- `captureBlockCraftAgentContext()`：生成紧凑的 v2 Agent Document IR；保留真实 `nodeType`，将容器 `childIds` 与 editable `text.{plain,delta}` 分离，并始终提供文档末尾插入锚点；
- `DocumentAgentPanelComponent`：最小 Angular 请求面板；
- `DocumentAgentTransport`：由宿主应用实现的后端调用接口；
- `validateDocumentAgentResult()`：校验模型返回的结构化操作。
- `BLOCKCRAFT_AGENT_HANDBOOK`：运行时注入给 LLM 的 BlockCraft 规则；
- `BLOCKCRAFT_AGENT_API_REFERENCE`：面向模型的 Doc、Model、Schema、CRUD、Selection
  和内置设计块 API 参考；
- `DocumentAgentRunner`：调用 Transport 并校验 LLM 结果；
- `DocumentAgentTurnRequest`：Provider 无关的 Master 回合协议，可在最终结果前请求受控工具；
- `DocumentAgentOperationApplier`：校验版本、只读状态后通过 CRUD 应用操作，或写成可审阅的 Revision Diff。
- `DOCUMENT_AGENT_TOOL_DEFINITIONS`：供支持 function calling 的模型声明工具；
- `DocumentAgentToolExecutor`：提供读取、搜索、预览和确认后写入的受控工具执行器。

Agent 操作目前支持文本替换、富文本 Delta、Schema 驱动创建/替换块、块删除、块移动和
受控的 `update-block-props`。模型不再具有原始 Snapshot 插入协议；新块必须经过
Capability 的 `createParameters` 校验并由 Schema 生成 ID/默认值。属性更新必须匹配
对应 Block Capability 的 `writableProps` JSON Schema。

Master 返回最终结果后，宿主会先按当前文档、Schema 和 Inline Embed Capability 做一次
完整语义预检。若结果结构合法但违反实际能力契约，支持 `runTurn()` 的 Transport 会在
有界循环内收到失败原因并重新生成，页面不会直接接收到第一次无效计划。冻结日期/时间
使用已安装的 `blockcraft.inline-embed.date`；能力不可用时退化为普通文本，不会借用
`mention` 或其他语义不相干的 Embed。

`BlockCraftEditorAgent.stageRevisionDiff()` 会立即执行完整的合法操作集：Revision v1
支持的文本和块结构操作进入同一个文档内修订组，不改变 `doc.revisions.mode`，也不会
让用户后续输入进入修订模式；已有块属性/格式修改、块移动、仅格式 Delta 和新增行内
对象等暂不支持 Diff 的操作仍走正常 CRUD/Yjs/Undo 路径直接生效，只是不显示修订样式。
混合结果允许同时包含两类操作，并全部落在一个外层 Yjs transaction 和独立 Undo Item
中。返回结果的 `undoItemToken` 允许宿主在它仍是最新本地编辑时撤回整批修改；一旦用户
继续编辑，定向撤回会安全失败而不会退化成普通 Undo。接收修订组表示保留有 Diff 的
提议和同一批普通修改；逐条审阅仍只裁决 Revision 能表达的部分。

新块优先使用 `create-blocks`：模型只返回 flavour 和 Schema createSnapshot 参数，
宿主负责调用 Schema、生成 block ID、应用默认值并验证父子关系，避免模型手写 ID
和完整 Snapshot。追加内容直接使用 `context.document.append` 的 parentId/index，
不先创建再通过 `move-blocks` 搬到末尾。

同一结果中的 operation 使用顺序坐标：每一步的 offset/index 都基于前一步完成后的
影子模型。宿主会先模拟整批文本长度、父子结构、Schema、只读和 Capability 约束，
全部通过后才打开一个 Yjs transaction。`create-blocks` / `replace-block` 可声明唯一
`clientRef`；后续可将 `$ref:<clientRef>` 用作嵌套创建的 `parentId`，或把已有内容
移动进去时的 `targetId`。同一计划中不要再替换、删除或移动刚创建的块，而应直接
生成最终结构与位置。新块初始文字和 props 必须放在 Schema params 中，不能通过
新块引用补写。

现有块的表示变换使用 `replace-block`，宿主通过
`DocCRUD.replaceBlockSnapshots()` 原子替换，适合链接视图、卡片视图、嵌入视图等
由编辑器 Schema 定义的变换。Mermaid 的文本/预览切换属于持久化 `props.mode`，
使用 `update-block-props`；全屏、缩放和图片预览属于临时宿主 UI 状态，不是文档操作。

宿主接入 function calling 时，把 `DOCUMENT_AGENT_TOOL_DEFINITIONS` 传给模型，
再将模型的工具调用交给 `DocumentAgentToolExecutor`。`preview_changes` 永远不
写入；`apply_changes` 只有宿主显式传入 `allowWrite: true` 才会通过 `DocCRUD`
提交，不能由模型参数自行绕过确认。

模型 API、用户权限、文档脱敏和服务端写入策略由宿主应用负责。本包不绑定具体模型供应商，也不在浏览器内保存模型密钥。
它理解的是 BlockCraft 的模型/API 契约，不会直接执行任意 Angular、DOM、Yjs 或文件系统代码。

会话记忆由宿主服务端根据请求中的 `sessionId` 保存为有界的最近几轮指令、Agent 摘要和操作摘要；每次请求仍重新读取当前文档上下文，旧文档快照和图片不会进入记忆。当前本地服务的记忆只存在于内存，服务重启后清空；生产环境应替换为带 TTL、租户隔离和访问控制的存储。

## Master 工具循环

`BlockCraftEditorAgent.run()` 会优先使用 Transport 的 `runTurn()`，让 Master
Agent 在生成最终 `DocumentAgentResult` 前按需调用 BlockCraft 或宿主工具。旧
Transport 只实现 `run()` 仍可工作，并会直接返回最终结果。

当前循环默认最多 6 个模型回合、每回合最多 8 个工具调用；回传给无状态模型的
工具历史最多保留 24 条、约 32 KB，单个参数或结果超过约 12 KB 时只保留截断预览。
每次用户请求最多执行 3 个 specialist 委派，避免图片分析或质量复核造成无界模型成本。
这些边界可通过 `BlockCraftEditorAgentOptions.orchestration` 调低或在安全范围内调高。

Master 循环只以 `allowWrite: false` 执行工具。读取工具会立即返回当前模型状态；
`blockcraft.apply_changes`、宿主 `document-write` 和 `external-write` 只返回
`requiresConfirmation`。Playground 不再通过“应用修改”按钮二次确认文档修改，
而是在 Master 返回结果后调用 `stageRevisionDiff()`，让用户在可见 Diff 上决定
接收或拒绝。接收会通过 Revision 的正常决定事务物化内容并清除该组记录；撤回
使用 Agent 批次的精确 Undo token。外部系统写入仍由宿主确认后显式传入
`allowWrite: true`。未知工具
直接失败，不会降级成 DOM 操作。

### Specialist sub-agent

Master 可以通过 `blockcraft.delegate` 启动一个独立、只读的 specialist 模型回合：

- `document-analysis`：问答、总结、事实与需求提取；
- `content-writing`：长短文案、改写和语气一致性；
- `structure-planning`：Block 树、Schema 参数和候选 operations；
- `visual-reconstruction`：读取上传图片，映射文本层级、几何和样式到文本框、形状、艺术字、表格等可用 Block；
- `host-workflow`：结合任务、会议等宿主上下文和自定义 Capability；
- `quality-review`：在最终返回前复核内容、结构、安全与视觉还原度。

Specialist 不能调用工具或执行写入，只返回 findings、recommendations、draft 和
候选 operations；Master 负责合并，最终结果仍走宿主校验与 Revision Diff 审阅。Transport
未实现 `runSubAgent()` 时会明确失败，不会假装完成委派。

Editor Agent 的读取工具包括编辑器状态和单块模型查询；写入工具还支持富文本
Delta、连续块删除和跨容器移动。它们仍需经过版本校验、只读检查、Schema
兼容性检查；文档内可表达的操作进入 Revision Diff，外部写入仍需宿主确认。

Playground 的本地服务支持两种模式：

- 设置 `OPENAI_API_KEY` 时走 OpenAI Responses API；
- 没有 API Key 时默认调用本机已通过 `codex login` 登录的 Codex CLI。该模式只适合本地开发，服务绑定 `127.0.0.1`，不应暴露给其他用户或部署到生产环境。

本机 Codex CLI 模式会把浏览器上传并压缩后的 JPEG/PNG/WebP 写入单次请求的临时目录，
通过 CLI `--image` 参数真实传给模型，并在请求结束后删除；不再只发送“存在图片”的文字说明。

## 宿主扩展

任务、会议等宿主模块可以通过 `BlockCraftEditorAgentOptions.extensions`
向 Agent 声明自定义 Block、Inline Embed、Plugin、Context、Skill 和语义工具。希望 Agent 理解
或写入的外部 Block 应在自身目录中提供并导出 `agent/index.ts`；不需要 AI 参与的
Block 不必提供，也不应注册。Inline Embed 同样在 `embeds/<key>/agent/index.ts`
声明，并且必须同时安装同 key converter；只装 converter 只能渲染现有数据，不会授权
Agent 生成。Block 能力声明
使用 `createParameters` / `writableProps` JSON Schema、`semanticRoles`、`atomicProps`
和 examples 描述生成边界；能力声明
只描述模型可以理解的语义和参数，不会把宿主服务或组件实例暴露给模型：

```typescript
// task-card/agent/index.ts
import {
  defineBlockAgentCapability,
  defineInlineEmbedAgentCapability,
} from '@ccc/blockcraft'
import type {DocumentAgentHostExtension} from 'blockcraft-agent'

export const TASK_CARD_AGENT_CAPABILITY = defineBlockAgentCapability({
  id: 'task.block.task-card',
  kind: 'block',
  flavour: 'task-card',
  schemaVersion: 1,
  title: '任务卡片',
  description: '绑定宿主任务并展示状态、负责人和截止时间',
  domains: ['task'],
  semanticRoles: ['task', 'action-item'],
  createParameters: {
    type: 'array',
    prefixItems: [{type: 'string', description: '任务 ID'}],
  },
  writableProps: {
    type: 'object',
    properties: {displayMode: {enum: ['card', 'compact']}},
  },
})

// embeds/task-reference/agent/index.ts
export const TASK_REFERENCE_AGENT_CAPABILITY =
  defineInlineEmbedAgentCapability({
    id: 'task.inline-embed.task-reference',
    kind: 'inline-embed',
    embedKey: 'task-reference',
    title: '任务引用',
    description: '引用一个已解析的宿主任务 ID',
    semanticRoles: ['task-reference'],
    insert: {
      value: {type: 'string', minLength: 1},
      attributes: {
        type: 'object',
        properties: {status: {enum: ['open', 'done']}},
        additionalProperties: false,
      },
    },
  })

const taskExtension: DocumentAgentHostExtension = {
  id: 'task.agent',
  version: '1',
  description: '任务模块的文档和业务能力',
  capabilities: [
    TASK_CARD_AGENT_CAPABILITY,
    TASK_REFERENCE_AGENT_CAPABILITY,
    {
      id: 'task.tool.create-items',
      kind: 'tool',
      name: 'task.create_items',
      title: '创建任务',
      description: '在任务模块创建经过用户确认的行动项',
      domains: ['task'],
      effect: 'external-write',
      parameters: {
        type: 'object',
        properties: {items: {type: 'array'}},
        required: ['items'],
      },
    },
  ],
  toolHandlers: {
    'task.create_items': (args, context) => {
      if (!context.allowWrite) throw new Error('需要用户确认')
      return taskService.createItems(args)
    },
  },
}

const agent = new BlockCraftEditorAgent(doc, runner, {
  extensions: [taskExtension],
  resolveHostContext: () => ({
    module: 'task',
    entityId: currentTaskId,
    userRole: currentUser.role,
    locale: 'zh-CN',
  }),
})
```

上例还要求文档配置中存在
`embeds: [['task-reference', taskReferenceEmbedConverter]]`。如果只希望 Agent 理解
这个 Embed 而不生成它，保留 capability 的描述但省略 `insert`；如果完全不需要 AI
理解，则不写、不注册 `agent/` 即可。

`BlockCraftEditorAgent` 会过滤当前文档没有注册的自定义 Block flavour 和 Inline
Embed converter，
并把有效能力目录附加到每次请求的 `runtime`。支持 function calling 的宿主
还可以使用 `blockcraft.get_capability_directory` 和
`blockcraft.get_capability` 按需读取能力详情。没有声明 Agent Capability 的
自定义 Block 仍可通过通用模型上下文读取，但 Agent 不应猜测其创建参数或业务写入行为。
Inline Embed 对模型 offset 恒为 1；object insert 必须是单 key primitive 值并匹配
capability 的完整 value/attributes Schema。`retain` 只允许通用文字格式，修改 Embed
语义必须 `delete: 1` 后插入完整新值。通用文本范围删除仍可删除只理解的 Embed。
宿主工具通过 `agent.executeHostTool()` 执行；`document-write` 和
`external-write` 始终先返回确认要求，只有宿主再次传入 `allowWrite: true`
才会调用对应 handler。后端仍需重新校验当前用户权限，不能把此客户端门禁当成安全边界。
