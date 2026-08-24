# blockcraft-agent

BlockCraft 文档写作与优化 Agent 的编辑器适配包。

当前包提供：

- `DocumentAgentPlugin`：监听 BlockCraft 选区并生成模型上下文；
- `captureBlockCraftAgentContext()`：有明确选区时读取选区；没有选区时读取整篇文档、文档块和结构版本；
- `DocumentAgentPanelComponent`：最小 Angular 请求面板；
- `DocumentAgentTransport`：由宿主应用实现的后端调用接口；
- `validateDocumentAgentResult()`：校验模型返回的结构化操作。
- `BLOCKCRAFT_AGENT_HANDBOOK`：运行时注入给 LLM 的 BlockCraft 规则；
- `DocumentAgentRunner`：调用 Transport 并校验 LLM 结果；
- `DocumentAgentOperationApplier`：校验版本、只读状态后通过 CRUD 应用操作。
- `DOCUMENT_AGENT_TOOL_DEFINITIONS`：供支持 function calling 的模型声明工具；
- `DocumentAgentToolExecutor`：提供读取、搜索、预览和确认后写入的受控工具执行器。

Agent 操作目前支持文本替换、插入块和受控的 `update-block-props`。属性更新只
允许白名单中的文档/排版属性或请求上下文中已有的属性，并且必须经过版本校验
和用户确认后才会通过 `DocCRUD` 写入。

宿主接入 function calling 时，把 `DOCUMENT_AGENT_TOOL_DEFINITIONS` 传给模型，
再将模型的工具调用交给 `DocumentAgentToolExecutor`。`preview_changes` 永远不
写入；`apply_changes` 只有宿主显式传入 `allowWrite: true` 才会通过 `DocCRUD`
提交，不能由模型参数自行绕过确认。

模型 API、用户权限、文档脱敏和服务端写入策略由宿主应用负责。本包不绑定具体模型供应商，也不在浏览器内保存模型密钥。

Playground 的本地服务支持两种模式：

- 设置 `OPENAI_API_KEY` 时走 OpenAI Responses API；
- 没有 API Key 时默认调用本机已通过 `codex login` 登录的 Codex CLI。该模式只适合本地开发，服务绑定 `127.0.0.1`，不应暴露给其他用户或部署到生产环境。
