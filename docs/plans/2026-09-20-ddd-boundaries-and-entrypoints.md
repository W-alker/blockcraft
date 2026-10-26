# BlockCraft DDD 边界与公共入口渐进整理

日期：2026-09-20。状态：七个阶段的实现及入口评估已完成，最终回归记录见文末；尚未提交。
各阶段保留当时的验证记录，第四阶段的过渡兼容桥已由第五阶段替换。

## 决策与范围

以领域职责、数据所有权和依赖方向为主，npm 子入口用于独立消费场景。
一个目录不等于一个限界上下文，也不自动对应一个 npm 入口；继续使用现有
`@ccc/blockcraft` 包，不把本次整理扩大为多个独立发版包。

文档编辑的输入、选区、块、行内运行时和撤回必须协同，属于同一编辑上下文内部模块。
保留 `block-std` 与 `modules` 的基础运行时/编辑能力分工，避免仅为扁平目录移动所有文件。

## 上下文与规则

| 边界 | 责任与所有权 | 约束 |
|------|------------|------|
| 共享内容模型（Shared Kernel） | 各消费方共用的块属性、行内内容、Delta 和持久化格式标识 | 只表达数据契约；不得依赖 DOM、Angular、Yjs、组件注册表或排版实现 |
| 文档编辑 | 文档生命周期、块树操作、输入、选区、协作、撤回 | BlockCraftDoc 负责文档级协调；数据变更继续走 DocCRUD / DocChain 与 Yjs transaction；选区和撤回语义不变 |
| 格式转换 | 外部 HTML/Markdown/YNE 与内容模型之间的转换 | 外部格式细节属于适配层；框架剪贴板通过契约调用，不直接绑定内置块和特定来源转换器 |
| 只读展示与导出 | 内容模型到 DOM/打印输出的投影 | 共享格式规则；不通过构造完整编辑器获取类型或规则，不拥有文档写入职责 |
| 宿主能力端口 | 文件、消息、链接预览、天气等宿主能力的请求/结果契约 | 只有类型；Angular Token 与默认实现单独归位，不把基础设施当作独立业务上下文 |
| 默认编辑器装配 | 组合内置块、插件、转换器和宿主服务默认实现 | 依赖框架及能力实现；核心契约不能反向依赖默认装配 |

共享模型是受控的小型契约集合，不能成为所有 interface、运行时服务与 UI 类型的收纳处。
字体 ID 表达持久化数据；字体菜单、标签、CSS 字体栈及规范化规则归 typography。
对象格式、分页算法等保持各自职责，不因“没有 DOM”就放入共享模型。

## 依赖方向

```text
通用数据类型 global/types
            ↑
共享内容模型 framework/model
       ↑             ↑
领域规则/格式转换      文档编辑/只读展示
       ↑             ↑
         默认编辑器装配
```

`global/utils` 是历史兼容聚合，包含 Delta 工具：允许仅以类型依赖共享模型，
不允许它引用排版算法或编辑器运行时。共享模型只依赖 `global/types`，不能依赖
`global` 聚合入口，避免通过工具反向形成循环。

## npm 入口策略

- 保留主入口及已有子路径兼容；旧路径转导出同一份实现，枚举与常量不重复定义。
- 第一阶段提供一个 `@ccc/blockcraft/framework/model` 入口，供内容工具、转换器和展示能力共享；
  不为 block、inline、delta、字体标识分别增加子入口。
- 第三阶段增加一个 `@ccc/blockcraft/framework/ports` 聚合类型入口；不为每个宿主服务或 Angular 接入层新增入口。
- 之前已补充的轻量入口继续兼容，不以本次 DDD 整理为由删除。
- adapters、snapshot-viewer、导出等入口只有在契约和实现真正独立后再评估；
  npm 入口数量不作为完成度指标。

## 第一阶段：共享内容模型

迁入 `framework/model/`：`BlockNodeType`、`IBlockProps`、`IEditableBlockProps`、
`InlineNodeType`、行内属性、Delta 契约、`InlineModel`、字体 ID 和紧凑排版键。
旧 block-std 类型文件及 typography 入口保留转导出，API 签名和数据含义不变。
`global/utils` 的 Delta 工具改为仅引用共享模型类型，移除对 typography 声明的依赖。

不迁移：`IBlockSnapshot` / `BaseBlockDesc` 当前依赖 `BlockCraft.BlockFlavour` 注册体系，
需要在下一阶段决定通用数据模型与注册表约束的关系。本阶段不扩大 flavour、
不修改泛型默认值、不调整 children 或属性约束，也不宣称完整快照已独立。
不修改数据格式、默认行为、包版本，不执行提交或发布。

### 影响与验证

- 主入口、旧类型路径、block-base 与 typography 子入口必须保持原有导出和身份。
- Inline/Delta 字段、模板索引签名、null 清除语义、枚举值与字体 ID 集合保持不变。
- 发布的 model 入口在无第三方依赖、无 DOM 类型库和无 BlockCraft 全局声明的环境中通过严格类型检查。
- 运行时与声明依赖分别检查；从源码检查 model 不引用模型外的实现层。
- 运行 editor 完整构建和包检查，覆盖原 global 入口；运行排版、对象格式、分页及共享 inline 路径定向测试。

本阶段验证结果：完整构建与包检查通过；模型无 DOM 类型库的严格检查、源码/产物依赖边界、
旧入口导出及符号身份检查通过；98 项 Chrome Headless 定向测试通过。
23 个迁入模型的声明与原定义一致。以上不代表全编辑器交互或所有浏览器端到端回归。

## 第二阶段：通用快照与注册表约束

状态：已实现并定向验证。本阶段不增加 npm 子入口。

模型入口新增 `BlockDescriptor<P, M, F>`、`BlockSnapshot<P, M, F>`，`F` 缺省为 `string`，
用于不依赖组件注册表的数据交换；调用方可传入有限 flavour 集合，并递归约束整个子树。
基础元数据 `IBaseMetadata` / `IMetadata` / `BlockPlaceholderMode` 移入 model。
格式、字段、节点类型判别与空 children 规则保持原快照表达。

编辑器继续使用 `BaseBlockDesc<P, M>` / `IBlockSnapshot<P, M>`：前者继承模型描述，
并用 `BlockCraft.BlockFlavour` 限定 flavour；后者保留原有递归定义，子块使用缺省 P/M，
不把父块的专有属性约束传播给所有后代。保留 BaseBlockDesc 为 interface 及现有引用关系，
避免破坏使用者对该接口的类型增强。注册表与组件/Schema 推导继续归属编辑器运行时。

通用快照是数据契约，不是运行时校验器，也不会自动注册 flavour。外部数据写入编辑器仍需
现有 Schema、权限与事务路径。当前只拆模型边界，不批量放宽 adapters / snapshot-viewer / Agent
已有公开 API 的快照参数。后续入口解耦时分别评估转换边界。

验证包含：无 DOM/全局注册表的独立模型编译；通用快照递归、void/editable children 的正反类型断言；
旧注册表接口的 flavour 与 props/meta 泛型约束、接口增强及子块递归等价性；editor 与 Agent 包构建；
Schema 创建、快照导出/CRUD、只读展示定向回归。不改 Yjs 数据、Schema 注册、序列化或文档写入算法。

本阶段验证结果：editor 完整构建与包检查、blockcraft-agent 独立构建通过；
独立通用快照与注册表兼容 fixture 均通过无 DOM 严格类型检查，包含正反断言与接口增强。
184 项 Chrome Headless 定向回归通过。3 个迁移元数据声明及原 IBlockSnapshot 递归定义保持不变。
未进行全部编辑器功能及跨浏览器端到端回归，未提交或发布。

## 第三阶段：宿主能力端口与 Angular 接入

状态：已实现并定向验证。范围限于文件、消息、链接预览、天气，增加一个聚合 `framework/ports` 入口，
不为每种服务创建 npm 子入口。

- `framework/ports/` 只包含结构化接口和请求/结果数据类型，不包含 DI Token、浏览器动作或网络默认实现。
- `framework/angular/host-service-tokens.ts` 持有四个原 Token 的唯一定义，保持描述字符串和原泛型服务类不变。
  Token 的旧类类型引用是兼容桥，全部为 type-only，不在接入模块加载默认实现。
- 文件与消息的原基类留在 services 作为兼容层，显式实现相应 Port。保留文件基类的下载/文件选择默认方法，
  避免修改下游 extends 的抽象方法要求。端口不继承这些默认实现。
- 链接预览网络实现及天气未配置默认实现移到 editor/services。旧 services 路径转导出同一个类，
  主入口和现有 provider 使用方式不变。外部链接 API 的响应 DTO 继续归属具体实现，不混入宿主 Port。
- HTML/Markdown adapter 与 AdapterContext 只依赖等价的文件 Port 类型，解除对默认基类的声明依赖。

`framework/services` 的旧路径转导出属于渐进迁移的兼容桥；整个 framework 尚未脱离默认实现。
独立的 ports 不引用该兼容层，也不加载 Angular Token。File/FileList/AbortSignal 保留浏览器类型库要求，
因此它与无 DOM 类型依赖的 model 是不同边界。

本轮不改变接口参数、错误行为、链接 endpoint、abort 行为、文件选择/下载方式、ObjectURL 映射与清理，
不调整 DocConfig/BlockCraftDoc 注入结果的公开类型。接口与旧基类的结构等价性要显式验证。

Overlay 属于 Angular UI 能力，块创建器依赖注册表；两者不为了得到“纯 ports”而删减或泛化契约。
布局/对象格式 manager 属于编辑器领域，后续按所有权归位，不并入宿主 ports。

验证：ports 发布声明在不提供 Angular/Yjs/默认实现时严格编译；旧类与端口的双向结构兼容；
旧/新模块 Token 和实现类身份一致且通过 Injector 注入；默认链接预览与天气错误语义；
文件基类方法及本地预览 URL 映射；相关 adapter、拖放与音视频定向回归。网络测试使用可控 stub，
不请求真实外部服务。

本阶段验证结果：editor 完整构建及所有包检查、blockcraft-agent 构建通过；
ports 的空运行时导出、独立严格类型检查、源码与发布依赖边界、主入口类型导出检查通过。
74 项 Chrome Headless 定向测试通过，四个旧服务类的全部成员签名和实现与迁移前 AST 比对一致。
未进行真实远端 API、全编辑器交互或跨浏览器端到端验证；未提交或发布。

## 第四阶段：剪贴板来源适配

状态：已实现并定向验证。本阶段不新增 npm 入口，范围限于有道云 YNE JSON / HTML 的来源适配与装配。

影响评估：当前 ClipboardManager 同时在文本选区和 gap 粘贴中直接识别有道云；附件转换生成临时
meta 标记，插入前剥离、下一 tick 重传，保留 snapshot 引用以读取最终 ID。通用 HTML 解析期间使用
Y.RelativePosition 重定位选区。内部快照优先级、纯文本块、文件粘贴、只读检查、格式切换均应保持不变。
YNE 解析器直接引用内置 Schema；它是具体来源到内置内容模型的适配，不能混入通用 ASTWalker / registry。

实施方案：

- `framework/modules/clipboard/source-adapter.ts` 定义同步来源识别与插入准备契约。该契约涉及编辑器
  注册快照和文档生命周期，不属于纯 `framework/ports`。来源转换只返回快照；文档插入仍由剪贴板负责。
- 具体实现及测试归入 `adapters/sources/yne/`，保留原算法、Schema、URL 与错误行为。
  `adapters/sources` 是来源集成层；通用转换核心不能反向依赖它，不能经 adapters 核心 barrel 隐式加载。
- `editor/clipboard-source-adapters.ts` 负责默认组合，默认 AdapterService 显式提供此列表。
  DocAdapterService 增加可选 `clipboardSourceAdapters`；缺省时保持原宿主的 YNE 行为，显式空列表可关闭。
- 原 `clipboard/adapters` 文件只做兼容转导出；旧宿主未声明列表时经一个明确的兼容装配入口取默认列表。
  不使用全局可变注册或新增 DI Token。核心剪贴板不再识别有道云字段，也不直接引用内置 Schema。

兼容限制：原来所有自定义 DocAdapterService 都隐式支持 YNE，直接去掉缺省实现会改变下游行为。
本轮保留兼容装配的反向依赖，不宣称整个 framework 已与默认编辑器物理解耦；未来收紧这一默认值
需单独明确迁移契约。本阶段先治理职责与扩展方向。

验证：移动原 YNE 转换/附件回归测试；新增来源接口与装配测试，覆盖旧宿主缺省、显式列表/空列表、
内部快照/YNE/HTML 优先级、无匹配回退、文本/gap 路径、标记剥离及最终 ID/删除竞态；运行剪贴板、
格式切换、默认 AdapterService 定向回归和 editor / Agent 构建。新增源码边界检查限制兼容入口，
防止来源实现回流 framework 或通用转换核心。

本阶段验证结果：150 项 Chrome Headless 定向测试通过；editor 完整构建与全部包检查、
blockcraft-agent 构建通过。8 个迁移文件除文件服务类型引用改用等价 DocFilePort 外，
声明与算法 AST 比对一致。主入口新增导出与来源列表的可选性已检查。
未执行真实有道云客户端、系统剪贴板、Tauri/WKWebView 或全量跨浏览器端到端测试；未提交或发布。

## 第五阶段：领域所有权与兼容装配

状态：已完成。文件/消息/转换/块创建基类归入 `framework/host`，仍保留原继承和注册表约束；
Overlay 归入 `framework/angular`；文档缩放、排版事实、全屏状态归入 `framework/doc/view`；
对象布局、尺寸、格式归入 `framework/modules/object`；拖放归入 `framework/modules/drag-drop`。
`framework/services` 只保留旧路径转导出。Token 统一由 Angular 接入层定义。

Document 和 Clipboard 的实现只接收运行时依赖；`editor` 负责默认来源和 Embed 的组合。
原 BlockCraftDoc / ClipboardManager / Builder 导入位置保持兼容，原自定义 AdapterService 的缺省 YNE
能力、主入口类身份、事件注册、生命周期与默认 Embed 优先级均需回归。兼容入口允许指向装配层，
领域实现不得经兼容 barrel 绕回默认装配；不用全局可变注册表或初始化副作用补默认值。

`block-std` 继续承载 Block / Inline / Event / Schema 基础运行时，`modules` 承载编辑能力；
两者是同一编辑上下文的内部组织，不为对称目录强行拆成独立包，也不机械添加 domain/application 子层。

已完成：44 个服务实现/测试归位；20 个打印导出文件归入 `tools/export`；图片数据归一化从 converter
拆出给行内布局和虚拟化复用。公共文档与剪贴板使用兼容子类装配，默认能力在构造时显式传入；
原 DocConfig、Builder、类身份、事件注册和 config 引用保持不变。构造相关回归覆盖自定义
Embed 覆盖、默认 YNE、显式空来源与每实例只注册一次剪贴板事件。

源码边界检查覆盖 232 个领域实现、49 个纯转导出兼容路径和固定的公共聚合入口；
领域内部禁止引用兼容入口。链接/天气 Token 保留原具体服务类的 type-only 泛型引用，
没有把这种声明兼容关系伪装成整个 framework 的独立发布能力。

## 第六阶段：转换、展示和导出入口审计

状态：已完成，结论是不新增这三个 npm 入口。

| 能力 | 运行时审计 | 声明/装配约束与结论 |
|---|---|---|
| adapters | 15 处兼容 barrel 引用按真实符号归属拆开（含 export-manager）；codec 可达源码限于 adapters/framework/global，无 Angular | 仍使用注册快照 `IBlockSnapshot` / `BlockCraft.BlockFlavour`；不放宽公开类型，继续主入口 |
| snapshot-viewer | 基础 DOM 渲染之外，流式 Markdown 解析依赖 `editor/bundled-adapter-registry`，闭包包含内置块/Embed/Angular | 当前聚合 API 不是无编辑器声明依赖的包；保留职责目录与主入口 |
| tools/export | 复用只读投影、分页、资源准备；DocExportManager 仍识别 `PaginationPlugin` | 依赖 Doc 生命周期、修订投影和打印后端；归位到输出层，继续主入口 |

审计分别检查移除类型导入后的静态模块闭包与公开类型引用；没有用 tree-shaking 或源码目录名证明
包已独立，也不把静态依赖结果当作加载耗时测量。通用 codec 的边界已纳入构建检查；纯 model、ports
和此前轻量入口继续执行发布产物和隔离类型验证。

## 第七阶段：应用层归位与最终回归

状态：已完成。`desktop` 归入 `apps/desktop`，调整相对资源路径、构建脚本及 TypeScript 配置，
保留 Tauri 标识、文件关联、端口和前端构建产物位置的含义。检查 workspace 发现、Angular 构建/测试
与 Rust 工程；不把源码/构建通过描述为打包桌面端和跨浏览器交互验收。

全部阶段完成后统一审计旧符号身份、默认装配、发布入口和下游 Agent；同步 ai-skills / MIGRATIONS，
保留用户版本号及其他并行修改，不自动提交、推送或发布。

桌面工程已被 pnpm workspace 识别。新增根脚本 dev/build/test:desktop；Tauri 标识、文件关联、
端口、Rust 源码与前端产物相对 Tauri 工程的位置保持不变。本地旧 Cargo 缓存因记录原绝对路径
无法直接复用，已保留到临时备份，并在新规范目录重新生成；不是修改 Rust 逻辑来兼容旧缓存。

## 最终验证

- editor 完整生产构建、发布样式、42 项依赖声明、global 聚合/七个子入口、model/ports/轻量入口、
  隔离运行与严格类型、剪贴板来源边界、领域边界全部通过；blockcraft-agent 构建通过。
- 580 项定向 Chrome Headless 回归通过；487 个迁移声明/成员 AST 比对一致，仅 Token 所有权与
  显式运行时装配是预期改变。运行时旧路径与新路径的类/函数/常量身份回归通过。
- desktop 生产构建、3 项前端单元测试、Cargo check（locked/offline）、2 项 Rust 文件格式测试通过。
- 编辑器全量 3430 项单元测试：3427 通过、3 失败。在未修改 HEAD（`37f4d2a6`）的独立副本、相同本地依赖下
  运行全量基线：3371 项中 3367 通过、4 失败，包含当前全部 3 项失败。既有失败为引用块边框
  宽度、文本框空段落占位位置、虚拟化测试夹具缺少 `_selectionScrollViewports`；未纳入本轮
  架构重构修复，也不把全量结果标成通过。基线另一次远端光标重建断言失败不在本轮结果中。
- 未执行真实系统剪贴板、有道云客户端、Windows/WKWebView、桌面安装包或全量跨浏览器 E2E。
  本轮没有调整用户版本号，没有 commit、push 或发布。
