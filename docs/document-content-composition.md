# 独立区域内容与组合文档设计

日期：2026-10-23。状态：已实现并完成下述框架定向验证；新增可选能力，普通文档保持原路径。

## 目标与领域边界

同一份共享文档保留正文与容器壳，指定容器的 children 由宿主独立 JSON 提供。
共享模板可保留初始默认内容；用户填写后的子树只保存在个人 JSON，不替换共享模板默认值。
BlockCraft 不拥有用户、租户、网络协议、存储、权限或 CSES 的 tplFieldName。
宿主把业务区域名称映射为稳定 regionId 与当前 container blockId，并只将 sharedDoc 连接协同服务。

- DocumentCompositionSession：拥有独立 editorDoc，组合共享内容与个人子树，维护数据归属及增量投影。
- BlockCraftDoc：继续以单一 editorDoc 执行原有输入、IME、选区、布局和撤销，不混合多个 Y.Doc 内部类型。
- 共享源：sharedDoc 是共享事实唯一权威。会话仅按已确认归属回写块、属性、children delta 和 text delta。
- 独立区域：JSON 是持久化交换格式，运行时编辑在 editorDoc 中，导出包含完整块快照子树。
- 宿主：负责稳定身份、鉴权、JSON revision 冲突、缓存隔离、保存时机及不同数据范围的导出/搜索/AI。

## 不变量

1. editorDoc 的二进制 update、state vector 和 Awareness relative positions 绝不发送到共享通道。
2. 不对组合后的共享祖先导出整棵 snapshot 回写 sharedDoc，避免夹带独立区域后代。
3. 普通共享文本使用 Y.Text delta 增量转投，保留 sharedDoc 作为并发合并权威。
4. 共享投影使用 Y.transact(editorDoc, ..., origin, false)，进入原有远端选区与 IME 路径，不入本地撤销。
5. 区域绑定显式启用，区域不能嵌套、重复或绑定 root。区域壳仍共享；后代完整归属独立区域。
6. 默认值只用于没有个人记录的区域；显式空数组表示用户清空。默认后代生成独立块 ID。
7. 绑定容器的 textFit 是个人内容派生尺寸，仅在本地运行时保留，其他壳样式继续共享。
8. 个人块 ID 与共享 ID 不得冲突；运行期不能将原私人 ID 重新归类为共享后转投。
9. 删除共享区域壳保留最后个人 JSON；源恢复相同壳后可重新显示。重新绑定由宿主显式重建会话。
10. 编辑器操作预检阻止跨域移动、替换和范围编辑，避免部分删除；复制/导出是明确的内容输出行为。
11. 非法/未知源结构使会话进入失败状态并停止回写，不猜测归属。

## 公共接口

DocumentCompositionSession 接收 sharedDoc、rootId、regions 与可选 personalData。
regions 使用 {id, blockId}，不固化特定 meta 字段或 Block flavour。
personalData 使用带 formatVersion 的区域记录；每条记录包含 regionId 与 children 快照。
公开 editorDoc、rootId、exportPersonalData、exportSharedSnapshot、个人变更订阅与 dispose。
DocConfig 增加可选 `contentComposition`，其 `editorDoc` 必须与 `yDoc` 一致；初始化与销毁生命周期校验关联。
Builder 使用 `.contentComposition(session)` 同时设置会话和 `yDoc`。
通过 `!!doc.config.contentComposition` 判断是否配置启用；未提供时不启用任何新监听、扫描或策略。
该配置在构造时确定；切换前保存个人 JSON 并重建会话与文档，不在运行中直接修改配置。

## 第一版边界

支持共享正文和独立区域内普通富文本编辑、结构编辑、格式、撤销重做，增量同步与 JSON 重开。
跨区域移动/范围删除与替换拒绝；区域绑定与模板版本迁移由宿主重建会话。
首版编辑器拒绝将 columns 本身绑定为独立区域，其列数/列宽属于内部结构派生状态。
使用外层 render-unit/text-box 绑定，内部普通分栏完整归属个人 JSON。
自定义容器需自行核对 children 派生的壳属性归属。
修订/审阅的跨域持久化不属于首版，组合模式必须显式拒绝开启修订；源已有或后续收到非空修订域时拒绝组合，不能静默丢失记录。
Awareness 需要按共享源重新编码位置；首版不转发组合运行时的相对位置。
组合快照用于当前用户输出，不可交给共享快照/搜索持久化入口。

## 影响评估

现有 DocCRUD、EditableBlockComponent 和格式 API 均写同一运行时 Y.Doc；组合方案保留该模型。
部分 Y.Text 写入绕过 DocCRUD.transact，因此独立内容捕获必须观察完整运行时块图。
现有 BlockMutationPolicy 仅覆盖结构/meta/history；范围与插入需补齐组合模式的预检入口。
DocCRUD 远端投影、Selection 的 relative bookmark、IME 延迟同步与 Undo 仍复用既有机制。
发布包公共入口与 ai-skills/MIGRATIONS 随新 API 同步，包版本不由本任务修改。

## 验证

- 内核：两会话同共享源不同个人数据、共享 state vector 不随私人输入变化、完整共享 update 不含私人数据。
- 并发：独立 source 副本并发编辑、乱序/重复更新及重连后收敛；个人区域保持独立。
- JSON：默认值/清空、嵌套富文本/marks、保存销毁重开、删除恢复区域、冲突 ID 与无效绑定拒绝。
- 编辑器：真实输入、四向箭头、前后删除、选择替换、Enter/Escape/slash、撤销重做和边界保护。
- 浏览器：Chromium/Firefox/WebKit 定向 E2E，DOM、模型选区与共享源共同断言。
- 性能：文本编辑只处理变更事件与相关区域，不按键重建全文；大文档场景记录操作规模。
- 回归：受影响的 CRUD、Undo、结构、输入用例及编辑器包构建/边界检查。

以上属于框架验证；不代表 CSES 后端、Tauri 或真实系统 IME 验收。

## 性能成本

显式组合会话保留 sharedDoc 与独立 editorDoc，因此共享正文有第二份运行时副本。初次装配和完整导出按内容量线性处理；结构变更重算归属，文本/属性变更仅处理事件命中的块。不得将算法定向检查当作超大文档内存或真实宿主性能验收。


## 本次验证结果

- ChromeHeadless 定向回归 **385/385** 通过：组合内核与 guards、公共 Builder、CRUD、Undo、
  mutation/readonly policy、structure-transform、输入 planner/footprint/IME session、revision manager、
  clipboard paste/selection restore。新增内核测试使用真实 Yjs，包括独立 source 副本的并发、乱序更新和重连。
- Playwright **12/12** 通过：Chromium、Firefox、WebKit 各 4 项。实际鼠标/键盘驱动，
  两个独立 BrowserContext 经本机真实 WebSocket 同步；个人 JSON 存在各自 localStorage。
  覆盖私人输入不改共享 state vector、双向共享编辑、保存重开、重连、富文本格式及 Undo/Redo、
  全文跨区域删除拒绝，以及 text-box 自动增高的本地派生尺寸。
- `pnpm build:editor` 通过，包含公共入口、主题、领域依赖边界和生成 Angular 组件依赖检查。
- `tsconfig.spec.json` 的完整 TypeScript 检查通过。`tsconfig.lib.json` 全文件检查仍有 **31 项存量诊断**，
  与未修改 HEAD 源码的虚拟读取对照一致；本次未新增。问题集中于 frame-block 的旧类型名、
  text-box 预设分类以及 comment-pad 的旧选区字段。本次未扩大修复范围。
- 最终配置命名收敛为 `contentComposition` 后，重新通过 TypeScript 检查、**298/298** 项定向回归，
  以及 Chromium/Firefox/WebKit 的 **3/3** 项双用户隔离、保存重开与重连主流程。
- `git diff --check` 通过。未发布、未调整包版本；保留工作区原有版本号改动。

### 已知验证边界

浏览器富文本用例在每次编辑器选区投影完成后执行下一次按键，不代表快速连续导航验收。
同一 fixture 的普通模式（`mode=plain`，直接使用 sharedDoc，未启用 contentComposition）已复现存量问题：
删除后约 74ms 内立即 ArrowUp，原生光标移动到上一段，模型选区仍停在下一段；2 秒后仍未补齐。
本次不修改 SelectionManager 的程序选区抑制机制，快速连续方向键问题保留为独立待修项。

本机 WebSocket 与 localStorage 只证明框架组合和浏览器行为；不代表 CSES 的按用户鉴权、
服务端持久化、多设备 JSON 冲突处理、真实 Tauri 或操作系统输入法已验收。网络 Awareness 仍需宿主转换。
CSES 的 name 到稳定 regionId 映射、每用户读取/保存接口、搜索/导出/AI 的数据范围接线尚未实施。
