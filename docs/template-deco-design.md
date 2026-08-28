# 模板装饰系统设计（MVP1 · playground 原型）

> **历史文档（已被替代）**：本文记录早期“双 Schema + `template-*` flavour + 人员 Inline Embed”原型，不能再作为现行实现依据。2026-08-28 起的唯一现行模型见 [`template-dynamic-material-lifecycle.md`](./template-dynamic-material-lifecycle.md)：动态块统一使用 `weather` / `date-card` / `person-card`，模板配置写入 `meta.draft:*`，建档时物化为真实 `props`。

> 状态：设计已定，落地点 = blockcraft playground 原型（MVP1）。设计成可移植 cses-client（MVP2+）。
> 本文是 100 天模板装饰路线（MVP1-9）的**地基设计**。MVP1 只造装饰机制 + 基础装饰；领域层/联动/真实数据留接缝。
>
> 命名约定：装饰的两态组件统一叫 **`templateEdit`**（模板编辑界面里显示/配置）与 **`templateRender`**（文档里渲染真实值）。下文一律用这对名字。

## 0. 目标

在 BlockCraft 上做一套**装饰块体系**:右侧物料面板插入装饰(天气/日期/人员/logo/背景图…),装饰支持 **`templateEdit` / `templateRender` 两态**显示,数据全 mock 且走一个可替换的注入接缝。两种装饰形态并存:**区块(block,独占一行)** 与 **行内(embed,嵌句子里)**。

**核心洞见(本设计的根)**:装饰的"编辑 vs 渲染"**不由编辑器可编辑状态决定、也不靠运行时变量**,而由**"你在哪个界面"**决定——模板编辑界面里装饰显 `templateEdit`,文档界面里装饰永远显 `templateRender`(哪怕用户在编辑文档)。

## 1. 范围

**MVP1 做**:
- 装饰机制:`defineDeco`(block)+ `defineEmbed`(仅模板域自有 embed)两个工厂、registry、两个 surface 装配。
- 基础装饰(block 形态):日期、人员、天气、logo、背景图。
- 至少一个模板域行内装饰(embed 形态)示例；通用 date/icon/image 直接复用 editor 内置 Embed。
- 物料面板:**block 拖拽落点插入**(框架原生 `dragController`)/ **embed 光标插入**(`applyDeltaOperations`);模板编辑视图 + 文档(渲染)视图;mock 数据接缝。
- **playground 自建编辑器宿主**(`new BlockCraftDoc(...)`),**不用** bundled `<block-craft-editor>`(理由见 §2.1)。

**MVP1 不做(留接缝)**:
- 领域层:`Template` 聚合、可改区域规则、角色权限(MVP2/3)。
- 高级物料缩放/拉伸、调色、贴纸/边框/倒计时(MVP4)。
- 联动(任务/会议)与真实数据源(MVP5-8)。

## 2. 核心机制 ①（同标识 + 两个 surface 各注册各的）

| 界面 | 用途 | 装饰显示 | 注册 |
|---|---|---|---|
| **模板编辑界面**(单独) | 创作/编辑模板 | **`templateEdit`** 组件/converter | templateEdit 套 |
| **文档界面**(cses-client 现有编辑器) | 编辑/阅读文档(其 readonly 与装饰无关) | **`templateRender`** 组件/converter,**永远渲染** | templateRender 套 |

- block:同一个 `flavour`,模板编辑界面注册 `templateEdit` 组件、文档界面注册 `templateRender` 组件。
- embed:同一个 `name`,模板编辑界面注册 `templateEdit` converter、文档界面注册 `templateRender` converter。
- **组件/函数内无 `@if (mode)`**;两态分流落在"哪个 surface 注册了哪套"。
- 一份快照 `{ flavour:'template-weather' }`,**过哪本字典(SchemaManager)就变成哪个组件** —— 这就是机制①的全部魔法。一本字典里一个 key 只能对一个 value,所以**必须每个 surface 一本独立字典**。

### 2.1 为什么 playground 必须自建 doc（不用 bundled `<block-craft-editor>`）

- bundled `<block-craft-editor>`(`packages/editor/editor/editor.ts`)用一个 **module 级单例 SchemaManager**(`const schemas = new SchemaManager([...])`,**所有实例共享**)+ **硬编码 embeds**(`mention`/`latex`),无任何扩展 `@Input`。→ 同 flavour 没法一个 surface 映射 `templateEdit`、另一个映射 `templateRender`,embed 也加不进去。
- **cses-client 不用 bundled 编辑器**:它每个场景(EasyNote/Comment/Meeting/QuickEditor…)都**自己 `new BlockCraftDoc({ schemas: 自己一本 SchemaManager, embeds: 自己一个数组 })`**。所以机制① 在 cses-client **原生成立、零框架改动**——加一个"模板编辑场景"= 再 new 一本字典(塞 `templateEdit`)。
- **playground 照 cses-client 自建**(`new BlockCraftDoc(...)` + `doc.initBySnapshot(...)`),`surfaces/*.ts` 写出来基本能**原样搬进 cses-client** 当那两个场景的装配代码。代价:把 editor.ts 那段 bootstrap(DI providers + plugins + logger,~50 行)在 playground 复刻一份(集中在 `host/create-deco-doc.ts`)。

## 3. 三层架构（分层别混）

- **L1 注册层(声明式)**:`core/` 两个工厂 + `registry` —— 有哪些装饰、各用哪个组件。**别套 DDD**(框架 plumbing)。
- **L2 组件层(OO/函数)**:`decos/` Angular 组件、`embeds/` DOM 画法函数 —— 长啥样、怎么取数。
- **L3 领域层(DDD,MVP2+)**:`Template` 聚合、区域规则、权限、联动 —— 现在只留接缝,不建。

## 4. 两条装饰路

| | 区块 block | 行内 embed |
|---|---|---|
| 位置 | 独占一行 | 嵌句子里 |
| 插入方式 | **拖拽落点**(`dragController.startDrag` + `new-block`) | **光标处插入**(`applyDeltaOperations`) |
| 工厂 | `defineDeco` → 产 **schema** | `defineEmbed` → 产 **EmbedConverter** |
| 渲染 | Angular 组件(模板) | `toView` 裸 DOM 函数(返回一个根,内部结构任意:icon+span…) |
| 数据来源 | 组件 `inject(TEMPLATE_DATA)` | surface 注入后**闭包**传入 |
| 退订 | `takeUntilDestroyed` 自动 | `onDestroy` 手动 `unsubscribe` |
| 数据存哪 | block `props` | inline delta `attributes`(`__attrs` 快照,`toDelta` 写回) |
| declare global | 需要(集中 `flavours.ts`) | 不需要(不走 schema) |
| 文件数 | 3(deco + `templateEdit` 组件 + `templateRender` 组件) | 1(spec 含两个画法函数) |
| 选用 | **能独立成块就用它** | **必须行内**才用它 |

> 文件数跟"产物重量"走:组件重→各一文件;函数轻→挤一文件。可调,非铁律。

## 5. 接口契约

```ts
// —— L1 枚举 ——
enum DecoCategory { Basic = '基础', Advanced = '高级', Linkage = '联动' }

// —— block 工厂 ——
interface DecoDef<M extends NativeBlockModel> {
  flavour: M['flavour']; nodeType: M['nodeType']; category: DecoCategory;
  label: string; icon: string; defaultProps: M['props'];
  templateEdit: Type<unknown>; templateRender: Type<unknown>;   // 两个 Angular 组件
}
defineDeco<M>(d: DecoDef<M>): {
  kind: 'block'; def: DecoDef<M>;
  templateEditSchema: IBlockSchemaOptions<M>;     // 同 flavour,component = templateEdit
  templateRenderSchema: IBlockSchemaOptions<M>;   // 同 flavour,component = templateRender
}

// —— embed 工厂 ——
defineEmbed<V>(spec: {
  name: string; label: string; icon: string; category: DecoCategory;
  fetch: (data: TemplateData, attrs) => Observable<V>;   // 渲染态取值
  renderDom: (el: HTMLElement, value: V) => void;        // templateRender 画 DOM
  editDom: (el: HTMLElement, attrs) => void;             // templateEdit 画 DOM
}): {
  kind: 'embed'; def: { name; label; icon; category };
  templateEdit(): [string, EmbedConverter];              // 编辑 converter(无需 data)
  templateRender(data: TemplateData): [string, EmbedConverter];  // 渲染 converter(闭包 data)
}

// —— 数据接缝(MVP1 合一个文件:接口 + token + Mock)——
interface TemplateData {                                  // 契约;实现可换(Mock→Real)
  doc:  { date(field: string): Observable<string> };
  user: { current(): Observable<User> };
  // task / meeting … MVP5-8 加域
}
const TEMPLATE_DATA: InjectionToken<TemplateData>;

// —— registry 对外 ——
DECOS / EMBEDS                                            // 唯一清单,加装饰往这加一行
TEMPLATE_EDIT_SCHEMAS / TEMPLATE_RENDER_SCHEMAS           // block 两套(仅装饰 schema)
TEMPLATE_EDIT_EMBEDS() / TEMPLATE_RENDER_EMBEDS(data)     // embed 两套 [name, converter][]
MATERIALS                                                // 物料面板(block+embed,kind 区分插入方式)
```

**关键约定**:
- `defineDeco`/`defineEmbed` 是**两个独立工厂**(block 走 schema、embed 走 EmbedConverter,框架两套机制,不能合一)。
- ⚠️ `category` **放在 `DecoDef` 顶层,不进 `schema.metadata`**:框架 `IBlockSchemaOptions.metadata` **没有 `category` 字段**(只有 `version/label/icon/svgIcon/description/isLeaf/renderUnit/includeChildren/excludeChildren/placeholder`),写进去是 TS 多余属性报错。工厂里 `base.metadata` 只填 `{ version, label, icon }`;`category` 由 `DecoDef`→`MATERIALS` 携带,供物料面板分组。
- `declare global { namespace BlockCraft { IBlockComponents/IBlockCreateParameters } }` 是 TS 模块增强,**block 每个 flavour 必须有**(框架 schema 类型要求),集中写在 `flavours.ts`,`registry` 顶部 `import './flavours'` 触发。embed 不需要。
- `createSnapshot` 产**数据快照(IBlockSnapshot)**,不是 DOM;DOM 由组件/`toView` 渲染。
- 数据返回 **Observable**:`of`(静态)/`http`(异步)/`Subject`(联动实时)统一,组件不改。MockTemplateData 用 `of(假值)`,移植换 `RealTemplateData`(surfaces 改 `useClass`/`fetch` 来源一处)。
- **surface 各自建一本字典**:`new SchemaManager([...BASE_SCHEMAS, ...TEMPLATE_EDIT_SCHEMAS])` / `new SchemaManager([...BASE_SCHEMAS, ...TEMPLATE_RENDER_SCHEMAS])`(`BASE_SCHEMAS` = 标准块集,由 `host/create-deco-doc.ts` 提供)。

## 6. 数据流

```
作者在 templateEdit 组件/editDom 配置 → 写 block.props / embed attrs
        ▼  随快照存
模板/文档 content
        ▼  渲染时
templateRender 组件 inject(TEMPLATE_DATA) / embed surface 闭包 data
        ▼  按 props/attrs 取值
TemplateData 实现(MVP1 mock:of(...))
        ▼  subscribe
显示真实值（block 模板 {{date()}} / embed renderDom 画 DOM）
```

## 7. 交互 / 插入模型（block 拖拽 · embed 光标，框架原生 DnD）

**结论:不自造 HTML5 拖拽**。BlockCraft 原生提供两套现成入口,正好对上"block 拖、embed 插光标"。物料面板的每个物料带 `kind`(block / embed),决定走哪条插入路。

### 7.1 block 装饰 —— 拖拽落点（`dragController`，框架全包）

物料项 `pointerdown` 里喊一句 `startDrag`,之后 ghost / drop line / 命中 / 落点 / 插入全是框架的事。

```ts
// 物料面板「块装饰」项:镜像 block-controller / img-toolbar 的 pointerdown→startDrag
onPointerDown(evt: PointerEvent): void {
  if (evt.button !== 0) return            // 只响应左键(右/中键不拖)
  if (this.doc.isReadonly) return         // 只读文档禁拖
  this.doc.dragController.startDrag(       // ← 唯一要写的一句
    evt,
    { kind: 'new-block', flavour, initProps },   // initProps 可选:装饰默认 props
    { ghostLabel: label },                       // ghost 文字
  )
}
// 物料项 CSS 必须:touch-action: none(否则触摸滚动手势抢走 pointer,拖不动)
```

**框架白送(一行不用写)**:ghost 预览、蓝色 drop line、`elementFromPoint` 命中块、落点 `before/after/left/right`、边缘自动滚动、Esc 取消、`.drag-over` 祖先高亮、`isValidChildren` 校验、**经 DocChain 在落点插入 + 自动设光标**。
落子提交链:`pointerup → dragController._commitDrop → dndService.onInsertNewBlock(flavour, initProps, 落点块, 位置)`。

**已核实的接缝**:`onInsertNewBlock` 先调 `blockCreator.getParamsByScheme(schema)`;playground 实现是个 `switch`,**只有 image/video/attachment 等弹选择框,其余 flavour 一律 `return []`** → 我们的 `template-*` 装饰**落点即插,零对话框**。(将来某装饰需创建参数/选择器,在该 switch 加 `case`。)
**前提**:被拖 `flavour` 须注册在该 doc 的 SchemaManager(= 模板编辑 surface 那本)→ 拖拽只在**模板编辑界面**可用,正合机制①。

### 7.2 embed 装饰 —— 光标插入（`applyDeltaOperations`，无拖拽）

点击物料项,把 embed delta 写进当前光标位置的 Y.Text —— 与 mention `@` chip 同一条路:

```ts
onEmbedPick(name: string, defaultValue: string): void {
  const sel = this.doc.selection.value
  if (!sel || sel.start.type !== 'text') return   // 必须落在可编辑文本里
  const block = sel.start.block                    // EditableBlockComponent
  block.applyDeltaOperations([
    { retain: sel.start.offset },                  // 跳到光标 offset
    { insert: { [name]: defaultValue } },          // 插入 embed(name = 注册 key)
  ])
}
```

> 实现参考:block 拖拽 `framework/services/internal-drag.controller.ts` + `framework/services/dnd.service.ts`(`onInsertNewBlock`);embed 插入 `plugins/mention/index.ts`(`applyDeltaOperations` 写 embed delta)。L1 文档 `blockcraft-app.md` §`doc.dragController`。

## 8. 生命周期（copy / 快照，咬合 cses-client 现成流程）

cses-client 已有:`IDocTemplate { content: IBlockSnapshot[] }` + 选模板建文档(`template2Snapshot` → `initNewDoc`,原样拷快照)。装饰块/embed 就活在 `content` 里:

```
模板编辑界面(templateEdit 套)→ 编排 → IDocTemplate.content[](装饰快照 + 配置)
        │ 新建文档选模板 → template2Snapshot → initNewDoc(原样拷,零转换)
        ▼
文档界面(templateRender 套)→ 同 flavour/name 命中 templateRender 组件 → 取真实值 → 显示
        编辑模板不影响已建文档(快照独立)
```

> playground 用一颗按钮预演这条链:模板编辑 surface `doc.exportSnapshot()` → 文档 surface `doc.crud.insertBlocks(rootId, idx, [...])`,看同一装饰从 `templateEdit` 变 `templateRender`。

## 9. 文件结构

```
apps/playground/src/app/template-deco/
├── core/
│   ├── deco.category.ts       DecoCategory 枚举
│   ├── deco.types.ts          DecoDef + defineDeco
│   └── registry.ts            DECOS/EMBEDS → TEMPLATE_EDIT/TEMPLATE_RENDER 套 + MATERIALS
├── flavours.ts                block 装饰 declare global 集中
├── data/
│   └── template-data.ts       TEMPLATE_DATA token + 接口 + MockTemplateData(合一)
├── decos/<deco>/              区块装饰(3 文件):
│   ├── <deco>.deco.ts             defineDeco 调用 + model + flavour 声明
│   ├── <deco>.template-edit.component.ts     templateEdit 组件
│   └── <deco>.template-render.component.ts   templateRender 组件
├── embeds/                    行内装饰统一边界
│   ├── index.ts               统一导出 avatar/shared
│   ├── shared/index.ts        模板域 defineEmbed 工厂
│   └── avatar/index.ts        模板域自有行内人员
├── host/
│   └── create-deco-doc.ts     自建 doc 宿主:BASE_SCHEMAS/BASE_EMBEDS/plugins + DI providers + initBySnapshot
├── palette/                   物料面板(block 项 pointerdown→startDrag / embed 项 click→插光标)
└── surfaces/
    ├── document.ts            文档:createDecoDoc({ extraSchemas: TEMPLATE_RENDER_SCHEMAS, extraEmbeds: TEMPLATE_RENDER_EMBEDS(data) })
    └── template-edit.ts       模板编辑:createDecoDoc({ extraSchemas: TEMPLATE_EDIT_SCHEMAS, extraEmbeds: TEMPLATE_EDIT_EMBEDS() }) + 挂 palette
```

> playground 调试页并排两个 surface:左"模板编辑"(templateEdit 套 + 物料面板),右"文档"(templateRender 套),验证同一装饰两态。两个都由 `createDecoDoc(...)` 自建,各持各的 SchemaManager + embeds。

## 10. 关键决策

- 机制 **①**(同标识、两 surface);两态组件命名 **`templateEdit` / `templateRender`**。
- **playground 自建 doc**(`new BlockCraftDoc` + `initBySnapshot`,集中在 `host/create-deco-doc.ts`),**不用 bundled `<block-craft-editor>`**(它共享 module 级单例 + 硬编码 embeds)。这同时是 cses-client 集成方式的预演。
- **两个工厂** `defineDeco` / `defineEmbed`。
- `category` **枚举**,放 `DecoDef` 顶层(**不进 schema.metadata**);`declare global` **集中** `flavours.ts`。
- 数据层 MVP1 **合一个文件**;`Observable` 契约;`inject`(block)/闭包(embed)。
- block **3 文件** / embed **1 文件**(按重量,可调)。
- 生命周期 **copy 快照**,复用 cses-client `IDocTemplate` + 建文档流程。
- embed 边界:能独立成块就 block,必须行内才 embed(裸 DOM + 手动数据/生命周期)。
- 插入交互:**block 拖拽**(框架 `dragController` + `new-block`)/ **embed 光标**(`applyDeltaOperations`);**不自写 HTML5 DnD**,落点/ghost/校验/插入全交框架。

## 11. 验收标准（MVP1 · playground）

- [ ] 调试页并排两个**自建** surface(模板编辑 / 文档),各持独立 SchemaManager + embeds,均由 `createDecoDoc(...)` 起。
- [ ] 物料面板能插入 block 装饰(日期/人员/天气/logo/背景图)与 ≥1 个行内 embed 装饰。
- [ ] block 装饰从物料面板**拖拽**入模板编辑 surface:拖动有 drop line 指示,落点正确插入(框架原生 `dragController`,非点击插 root)。
- [ ] embed 装饰**点击**在当前光标处插入(`applyDeltaOperations`)。
- [ ] **模板编辑 surface**:装饰显 `templateEdit`(配置 UI / 占位效果),改配置写进 props/attrs。
- [ ] **文档 surface**:同一装饰显 `templateRender`(真实 mock 值),哪怕处于可编辑状态也渲染。
- [ ] 两态由"在哪个 surface"决定,组件内无 `@if (mode)`。
- [ ] 预演 copy:模板编辑 `exportSnapshot()` → 文档 `insertBlocks(...)`,装饰从 `templateEdit` 变 `templateRender`。
- [ ] 数据全来自 `MockTemplateData`(零真实请求;头像图等静态资源除外)。
- [ ] 加一个新 block 装饰 = 新建 `decos/x/`(3 文件)+ `DECOS` 加一行,两套 schema 自动出;新行内 = `embeds/x.embed.ts`(1 文件)+ `EMBEDS` 加一行。
- [ ] `ng build playground` 绿(注:block 模板 NG5002——字面量 `{}` 需转义)。

## 12. 移植 cses-client 注意（已核实其编辑器构造方式）

事实(2026-06-24 核实):cses-client **每场景自己 `new BlockCraftDoc({ schemas, embeds })`**,每场景一本 module 级 `SchemaManager`(`SchemaStore`/`EasyNoteSchemaStore`/`CommentSchemaStore`/…),**不用** bundled 编辑器。模板**选择/套用已建好**(`IDocTemplate.content` + `template2Snapshot` + `initNewDoc`),模板**编辑界面尚未做**。

- **新增「模板编辑场景」**= 仿现有场景再建一本 `new SchemaManager([...标准块, ...TEMPLATE_EDIT_SCHEMAS])` + 自己的 `embeds: [...base, ...TEMPLATE_EDIT_EMBEDS()]` + 物料面板;保存 → `doc.exportSnapshot()` → 存 `IDocTemplate.content`。**机制① 原生成立,改 blockcraft 框架零行。**
- **文档场景**:现有 `SchemaStore.register(...)` 加 `TEMPLATE_RENDER_SCHEMAS`;现有 `EMBED_CONVERTERS` 数组加 `TEMPLATE_RENDER_EMBEDS(data)`。
- 数据:`{ provide: TEMPLATE_DATA, useClass: MockTemplateData }` → 换 `RealTemplateData`,读 `ctx.userInfo`(name/deptName/orgName/userId)、`docDetail.createdAt`、权限 `docDetail.localUser.role`;embed 的 `fetch` 数据源同理换一处。
- 插入交互直接复用:`doc.dragController.startDrag`(block)/`block.applyDeltaOperations`(embed)是框架公共 API,自建 doc 即得,无需移植自写逻辑。
- 复用现成 `IDocTemplate` + `template2Snapshot`/`initNewDoc`;装饰快照原样拷(机制①零转换)。
- playground 的 `surfaces/template-edit.ts` / `surfaces/document.ts` / `host/create-deco-doc.ts` 基本可原样搬过去当那两个场景的装配。

## 附：与现有 playground MVP 的差异（要改的）

本设计**取代**早先那版 MVP 的"mode 机制"与"bundled 编辑器"做法:
- **删** `TemplateModeService`(signal)与组件里的 `@if (mode)`。
- **删** bundled `<block-craft-editor>` 路径与 `onDecoPick`(点击→`editor.doc.schemas.register` 进共享单例→插 root 底部);改成**自建两个 doc**(`host/create-deco-doc.ts` + 两个 surface)。
- 每个卡 **拆成 `templateEdit` / `templateRender` 两个组件**(原来是一个组件 if 切),文件名 `<deco>.template-edit.component.ts` / `<deco>.template-render.component.ts`。
- **改插入交互**:**block 拖拽落点**(`dragController.startDrag`)+ **embed 光标插入**(`applyDeltaOperations`);均框架原生,删自写插入逻辑。
- 新增 `defineDeco`/`defineEmbed`/`registry`/`flavours`/`host`/`palette`/两个 surface。
- 数据层保留(`TEMPLATE_DATA` + Mock),合并为一个文件;`MockTemplateData` 的 mock 值沿用(天气 `⛅ 26° 多云`、人员 `张三` + placehold 头像、日期 `2026-06-22`)。
