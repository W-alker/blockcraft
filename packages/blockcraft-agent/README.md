# blockcraft-agent

BlockCraft Editor Agent 的编辑器适配包，覆盖文档写作、模型读取、Schema 感知和
受控编辑操作。

当前包提供：

- `DocumentAgentPlugin`：监听 BlockCraft 选区并生成模型上下文；
- `captureBlockCraftAgentContext()`：有明确选区时读取选区；没有选区时读取整篇文档、文档块和结构版本；
- `DocumentAgentPanelComponent`：最小 Angular 请求面板；
- `DocumentAgentTransport`：由宿主应用实现的后端调用接口；
- `validateDocumentAgentResult()`：校验模型返回的结构化操作。
- `BLOCKCRAFT_AGENT_HANDBOOK`：运行时注入给 LLM 的 BlockCraft 规则；
- `BLOCKCRAFT_AGENT_API_REFERENCE`：面向模型的 Doc、Model、Schema、CRUD、Selection
  和内置设计块 API 参考；
- `DocumentAgentRunner`：调用 Transport 并校验 LLM 结果；
- `DocumentAgentOperationApplier`：校验版本、只读状态后通过 CRUD 应用操作。
- `DOCUMENT_AGENT_TOOL_DEFINITIONS`：供支持 function calling 的模型声明工具；
- `DocumentAgentToolExecutor`：提供读取、搜索、预览和确认后写入的受控工具执行器。

Agent 操作目前支持文本替换、富文本 Delta、Schema 驱动创建块、Schema 驱动替换块、插入已形成的
Snapshot、块删除、块移动和受控的 `update-block-props`。属性更新只
允许白名单中的文档/排版属性或请求上下文中已有的属性，并且必须经过版本校验
 和用户确认后才会通过 `DocCRUD` 写入。

新块优先使用 `create-blocks`：模型只返回 flavour 和 Schema createSnapshot 参数，
宿主负责调用 Schema、生成 block ID、应用默认值并验证父子关系，避免模型手写 ID
和完整 Snapshot。

现有块的表示变换使用 `replace-block`，宿主通过
`DocCRUD.replaceWithSnapshots()` 原子替换，适合链接视图、卡片视图、嵌入视图等
由编辑器 Schema 定义的变换。Mermaid 的文本/预览切换属于持久化 `props.mode`，
使用 `update-block-props`；全屏、缩放和图片预览属于临时宿主 UI 状态，不是文档操作。

宿主接入 function calling 时，把 `DOCUMENT_AGENT_TOOL_DEFINITIONS` 传给模型，
再将模型的工具调用交给 `DocumentAgentToolExecutor`。`preview_changes` 永远不
写入；`apply_changes` 只有宿主显式传入 `allowWrite: true` 才会通过 `DocCRUD`
提交，不能由模型参数自行绕过确认。

模型 API、用户权限、文档脱敏和服务端写入策略由宿主应用负责。本包不绑定具体模型供应商，也不在浏览器内保存模型密钥。
它理解的是 BlockCraft 的模型/API 契约，不会直接执行任意 Angular、DOM、Yjs 或文件系统代码。

会话记忆由宿主服务端根据请求中的 `sessionId` 保存为有界的最近几轮指令、Agent 摘要和操作摘要；每次请求仍重新读取当前文档上下文，旧文档快照和图片不会进入记忆。当前本地服务的记忆只存在于内存，服务重启后清空；生产环境应替换为带 TTL、租户隔离和访问控制的存储。

Editor Agent 的读取工具包括编辑器状态和单块模型查询；写入工具还支持富文本
Delta、连续块删除和跨容器移动。它们仍需经过版本校验、只读检查、Schema
兼容性检查和宿主确认。

Playground 的本地服务支持两种模式：

- 设置 `OPENAI_API_KEY` 时走 OpenAI Responses API；
- 没有 API Key 时默认调用本机已通过 `codex login` 登录的 Codex CLI。该模式只适合本地开发，服务绑定 `127.0.0.1`，不应暴露给其他用户或部署到生产环境。
