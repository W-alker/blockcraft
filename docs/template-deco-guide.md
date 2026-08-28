# 模板装饰系统 · 上手指南（基本结构 → 实现原理 → 快速上手）

> **历史指南（已被替代）**：文中的 `template-weather`、人员 Inline Embed 和双 Schema 示例只用于追溯旧原型。现行实现请以 [`template-dynamic-material-lifecycle.md`](./template-dynamic-material-lifecycle.md) 为准。

> 这份文档是「随身地图」：找不到文件、想不起原理、要加新装饰时,翻这一篇就够。
> 配套文档：`docs/template-deco-design.md`(设计决策) · `docs/template-deco-plan.md`(逐任务实施计划)。
> 代码全部在 `apps/playground/src/app/template-deco/`,**不改框架**(`packages/editor/**`)。

---

## 0. 30 秒定位

**这是什么**：在 BlockCraft 编辑器上做的一套「模板装饰」原型。装饰(天气/人员/日期/Logo/图标/图片/彩色块/背景图)在**模板编辑页**显占位、在**使用模版页**显真实数据。

**一句话核心**：
> 装饰的「编辑态 vs 渲染态」**不靠运行时变量判断**,而靠**「你在哪个界面」**决定。同一份快照,过哪本字典(SchemaManager)就变成哪个组件。

**怎么跑起来**：
```bash
npx ng serve playground          # 起开发服务器
# 浏览器打开 http://localhost:4200/template        ← 设计页（左调试 + 中编辑 + 右插入面板）
#            http://localhost:4200/template/use    ← 使用页（显真实数据，可继续填正文）
npx ng build playground --configuration development   # 验证构建（每次改完跑一次）
```

**文件总入口**（记住这 4 个,其余顺藤摸瓜）：
| 想找… | 去这个文件 |
|---|---|
| 有哪些装饰、怎么串起来 | `core/registry.ts` |
| 装饰的「编辑/渲染」两态怎么分流 | `host/create-deco-doc.ts` + 两个 `surfaces/*.ts` |
| 数据从哪来(假数据/真数据) | `data/template-data.ts` |
| 页面长什么样、路由 | `template-page.component.ts` / `template-use-page.component.ts` + `app/app.routes.ts` |

---

## 1. 基本结构

### 1.1 目录全景图（带注释）

```
apps/playground/src/app/template-deco/
│
├── core/                         ★ L1 注册层（声明式 plumbing，别套 DDD）
│   ├── deco.category.ts            装饰分类枚举：整页 / 卡片 / 随文
│   ├── deco.types.ts               block 工厂 defineDeco：一份定义 → 两套 schema
│   └── registry.ts                 ★清单中枢：聚合所有装饰，产出两套字典 + 物料面板数据
│
├── data/                         数据接缝 + 模板存储
│   ├── template-data.ts            TEMPLATE_DATA token + 接口 + MockTemplateData
│   └── template-store.ts           模板存储（内存 + localStorage），设计页存/使用页读
│
├── host/
│   └── create-deco-doc.ts          ★自建 BlockCraftDoc：标准块集 + DI providers + 拼装字典
│
├── flavours.ts                     block 装饰的 TS 全局类型声明（框架要求，集中写）
│
├── decos/                        ★ L2 组件层（block 装饰，独占一行）
│   ├── _shared/image-pick.ts       公共：选本地图片读成 data URL
│   ├── weather/                    天气（void 块）—— canonical 三文件结构
│   │   ├── weather.deco.ts            defineDeco 调用 + model + flavour
│   │   ├── weather.template-edit.component.ts     占位组件（显 {天气}）
│   │   ├── weather.template-render.component.ts   真实组件（显 28° 北京·晴）
│   │   └── weather-mark.component.ts  天气图标（CSS 画的太阳/云）
│   ├── logo/                       Logo（void 块，同结构）
│   └── colorbox/                   彩色文本块（★可编辑块，区别于 void）
│       ├── colorbox.deco.ts          手写双 schema（可编辑块不走 defineDeco）
│       ├── colorbox.edit.component.ts    设计页：带齿轮 + 缩放
│       └── colorbox.render.component.ts   使用页：只读样式
│
├── embeds/                       ★ L2 组件层（inline embed，随正文流）
│   ├── index.ts                    统一导出所有本地 inline embed
│   ├── shared/
│   │   └── index.ts                inline 工厂 + 公共浮层、尺寸控件、Y.Text 写回
│   ├── avatar/
│   │   └── index.ts                随文人员（头像 + 姓名）
│   ├── date/
│   │   └── index.ts                随文日期
│   └── icon/
│       └── index.ts                随文图标（点击弹浮层调图标 + 尺寸）
│
├── palette/
│   └── deco-insert-panel.component.ts   右侧物料面板（block 拖 / embed 点 / 背景设置）
│
├── surfaces/                     ★界面装配层（机制①的落点）
│   ├── template-edit.ts            编辑 surface：装「占位」字典 + 全套编辑插件 + 整页背景
│   └── template-use.ts             使用 surface：装「真实」字典，可编辑填正文
│
├── debug-panel/                  左侧可折叠调试栏（开发辅助，看快照/状态）
│   ├── template-debug-aside.component.ts
│   └── template-debug-panel.component.ts
│
├── template-page.component.ts    /template 设计页（左调试 + 中编辑 + 右面板 + 「使用模版」按钮）
└── template-use-page.component.ts  /template/use 使用页（左调试 + 中编辑，无插入面板）

# 应用级（在 template-deco/ 之外）：
apps/playground/src/app/app.routes.ts        路由表：'' → 主 playground，'template' / 'template/use'
apps/playground/src/app/app-shell.component.ts   应用外壳：只挂 <router-outlet>
apps/playground/src/main.ts                  根 provider：{ provide: TEMPLATE_DATA, useClass: MockTemplateData }
```

### 1.2 三层架构（分层别混）

| 层 | 一句话职责 | 在哪 | 现状 |
|---|---|---|---|
| **L1 注册层** | 「有哪些装饰、各用哪个组件」——声明式 | `core/` | ✅ 已做 |
| **L2 组件层** | 「长啥样、怎么取数」——Angular 组件 / DOM 函数 | `decos/`、`embeds/` | ✅ 已做 |
| **L3 领域层** | Template 聚合、区域规则、权限、联动 | （未建） | 🚧 只留接缝，后续 MVP |

### 1.3 两条装饰路（block vs embed）

装饰有两种形态,框架机制不同,所以用**两个独立工厂**：

| | **block 装饰** | **inline embed** |
|---|---|---|
| 工厂 | `defineDeco`（`core/deco.types.ts`） | `defineEmbed`（`embeds/shared/index.ts`） |
| 位置 | 独占一行 | 嵌句子里随正文流 |
| 插入 | **拖拽**落点（框架 `dragController`） | **点击**光标处插入（`applyDeltaOperations`） |
| 产物 | 两套 schema（Angular 组件） | 两个 converter（裸 DOM 函数） |
| 取数 | 组件 `inject(TEMPLATE_DATA)` | surface 闭包传入 `data` |
| 数据存哪 | block `props` | inline delta 的 `attributes` |
| 退订 | `takeUntilDestroyed` 自动 | `onDestroy` 手动 `unsubscribe` |
| 文件数 | 3（deco + 编辑组件 + 渲染组件） | 1 个目录（`index.ts` 含两个画法） |
| 现有 | 天气、Logo、彩色文本块 | 模板域人员；日期、图标、图片复用 editor 内置 Embed |
| 选用 | **能独立成块就用它** | **必须行内**才用它 |

### 1.4 两个页面 / 两个 surface

| | 设计页 `/template` | 使用页 `/template/use` |
|---|---|---|
| 页面组件 | `template-page.component.ts` | `template-use-page.component.ts` |
| surface | `surfaces/template-edit.ts` | `surfaces/template-use.ts` |
| 装哪本字典 | `TEMPLATE_EDIT_SCHEMAS`（占位组件） | `TEMPLATE_RENDER_SCHEMAS`（真实组件） |
| 右侧插入面板 | ✅ 有 | ❌ 无 |
| 装饰显示 | 占位（`{天气}` / `{人员}`） | 真实 mock 值（`28° 北京·晴` / 头像+张三） |
| 是否可编辑 | ✅（编排模板） | ✅（在真实数据模板上填正文） |

---

## 2. 实现原理

### 2.1 机制①（整套设计的根）—— 同标识、两本字典各注册各的

框架的 `SchemaManager` 就是一本「flavour → 组件」的字典,**一个 key 只能映射一个 value**。所以「编辑态」和「渲染态」**必须各用一本字典**：

```
一份快照 { flavour: 'template-weather' }
        │
        ├─ 过「编辑」字典 ──► WeatherTemplateEditComponent  ──► 显 {天气}
        └─ 过「渲染」字典 ──► WeatherTemplateRenderComponent ──► 显 28° 北京·晴
```

`core/registry.ts` 把同一批装饰产出两套 schema：

```ts
// 同一批 DECOS，map 出两套同 flavour、不同 component 的 schema
export const TEMPLATE_EDIT_SCHEMAS   = [...DECOS.map(d => d.templateEditSchema),   ColorboxEditSchema]
export const TEMPLATE_RENDER_SCHEMAS = [...DECOS.map(d => d.templateRenderSchema), ColorboxRenderSchema]
```

两个 surface 各装一套（`surfaces/template-edit.ts` / `surfaces/template-use.ts`）：

```ts
// 编辑 surface
createDecoDoc({ extraSchemas: TEMPLATE_EDIT_SCHEMAS,   ... })   // flavour → 占位组件
// 使用 surface
createDecoDoc({ extraSchemas: TEMPLATE_RENDER_SCHEMAS, ... })   // flavour → 真实组件
```

**结果**：组件内部**没有一行 `if (是不是编辑态)`**。两态由「在哪个 surface」决定,彻底解耦。

### 2.2 为什么必须「自建 doc」（不用打包版 `<block-craft-editor>`）

- 打包版编辑器用一个**全局共享的单例字典** + **写死的 embed**,没法让同一个 flavour 在 A 界面映射占位、B 界面映射真实。
- cses-client 本来就是「每个场景 `new BlockCraftDoc(自己一本字典)`」。
- 所以 playground 照 cses 自建（集中在 `host/create-deco-doc.ts`）,**机制① 天然成立,改框架零行**,而且这套写法**将来能近乎原样搬进 cses**。

`host/create-deco-doc.ts` 干三件事：
```ts
export function createDecoDoc(opts) {
  const schemas = new SchemaManager([...BASE_SCHEMAS, ...opts.extraSchemas])  // ① 标准块 + 本 surface 的装饰套
  const doc = new BlockCraftDoc({ schemas, injector, embeds: opts.extraEmbeds, plugins: opts.plugins ?? [] })  // ② 自建 doc
  doc.initBySnapshot(root, opts.container)                                     // ③ 挂载渲染
  return doc
}
```
> `DECO_DOC_PROVIDERS` 是自建 doc 需要的 DI service（文件服务/消息/block 创建器/适配器/logger…）,镜像打包版编辑器的 providers。两个 surface 都 `providers: [DECO_DOC_PROVIDERS]`。

### 2.3 两个工厂

**`defineDeco`（block）核心逻辑**——一份定义产两套同 flavour、不同 component 的 schema：
```ts
// core/deco.types.ts
export function defineDeco<M>(d: DecoDef<M>): DecoRegistration<M> {
  const base = { flavour: d.flavour, nodeType: d.nodeType, createSnapshot: ..., metadata: { version, label, svgIcon } }
  return {
    templateEditSchema:   { ...base, component: d.templateEdit },    // 同 flavour
    templateRenderSchema: { ...base, component: d.templateRender },  // 不同 component
  }
}
```
> ⚠️ `category` 放 `DecoDef` 顶层,**绝不进 `schema.metadata`**（框架 metadata 没这个字段,写进去 TS 报错）。

**`defineEmbed`（inline）核心逻辑**——产出「编辑」「渲染」两个 converter：
```ts
// embeds/shared/index.ts
return {
  templateEdit:   ()     => [name, { toView: 画占位, toDelta }],                         // 不取数
  templateRender: (data) => [name, { toView: 订阅 data 画真实值, toDelta, onDestroy: 退订 }],  // 闭包拿 data
}
```

### 2.4 数据接缝 —— 一个 token,Mock/Real 一键换

所有装饰取数都不直接 fetch,而依赖一个 token,**方法一律返回 `Observable`**（静态/异步/实时统一,组件不改）：

```ts
// data/template-data.ts
export interface TemplateData {
  weather: { get(): Observable<Weather> }
  user:    { current(): Observable<User> }
  doc:     { date(field: string): Observable<string> }
}
export const TEMPLATE_DATA = new InjectionToken<TemplateData>('TEMPLATE_DATA')

@Injectable()
export class MockTemplateData implements TemplateData {       // MVP1：假数据 of(...)
  weather = { get: () => of(CURRENT_WEATHER) }
  user    = { current: () => of({ name: '张三', avatarUrl: ... }) }
  doc     = { date: (field) => of(formatYMD(...)) }
}
```
渲染组件这样用（以天气为例,`decos/weather/weather.template-render.component.ts`）：
```ts
export class WeatherTemplateRenderComponent extends BaseBlockComponent<WeatherModel> {
  private readonly data = inject(TEMPLATE_DATA)
  protected readonly w = signal<Weather | null>(null)
  override ngOnInit(): void {
    super.ngOnInit()                                   // ⚠️ 必须先调 super（内部 _init）
    this.data.weather.get().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => this.w.set(v))
  }
}
```

### 2.5 完整数据流（配置 → 存储 → 渲染）

```
① 作者在设计页拖入/插入装饰
        ▼ 写进 block.props（block）或 delta attributes（embed）
② 内容随快照存进 TemplateStore（内存 + localStorage）
        ▼ 点「使用模版」按钮 → 跳 /template/use
③ 使用页读 TemplateStore → 灌进「渲染」套 doc
        ▼ 同 flavour/name 命中 templateRender 组件 / render converter
④ 组件 inject(TEMPLATE_DATA) 订阅取值（MVP1 = mock，of(...)）
        ▼
⑤ 显示真实值：28° 北京·晴 / 张三头像 / 2026年06月23日
```

### 2.6 生命周期 / TemplateStore

`data/template-store.ts` 是个 root 级 service：
- 设计页内容变更 → 防抖自动存（`surfaces/template-edit.ts` 监听 Yjs `afterAllTransactions`）+「使用模版」前 flush 一次。
- 使用页加载时 `store.load()` 读出来灌进 doc。
- 同时镜像一份到 localStorage,刷新/直接打开使用页也能恢复。
- **移植 cses**：把 `save/load` 换成调后端接口（保存模板 / 拉模板）,上层组件不动。

---

## 3. 快速上手

### 3.1 推荐阅读顺序（从简单到复杂）

1. `docs/template-deco-design.md` §0–§2 —— 先把「机制①」吃透（20 行）。
2. `core/deco.category.ts` —— 最简单,看三个分类。
3. `data/template-data.ts` —— 看数据接缝（token + Mock）。
4. `core/deco.types.ts` + `embeds/shared/index.ts` —— 两个工厂,看「一份定义产两套」。
5. `decos/weather/`（三个文件）—— 一个完整 block 装饰的标准结构。
6. `core/registry.ts` —— 看所有装饰怎么被串成两套字典。
7. `host/create-deco-doc.ts` —— 看自建 doc 怎么把字典装进编辑器。
8. `surfaces/template-edit.ts` + `surfaces/template-use.ts` —— 看两个 surface 各装哪套（机制①落地）。
9. `palette/deco-insert-panel.component.ts` —— 看 block 拖 / embed 点两种插入。

### 3.2 配方 A：加一个新的 block 装饰（最常见任务）

以「新增一个装饰 X」为例,照 `decos/weather/` 复制改：

1. **建 3 个文件** `decos/x/`：
   - `x.deco.ts`：写 `XModel`（`flavour: 'template-x'`、`nodeType: BlockNodeType.void`、`props`）+ `defineDeco<XModel>({...})`。
   - `x.template-edit.component.ts`：占位组件（显 `{X}`）。
   - `x.template-render.component.ts`：真实组件（`inject(TEMPLATE_DATA)` 订阅取值）。
2. **在 `flavours.ts` 加两行**：`IBlockComponents` 加 `'template-x': BaseBlockComponent<XModel>`；`IBlockCreateParameters` 加 `'template-x': []`。
3. **在 `core/registry.ts` 的 `DECOS` 数组加一行**：`XDeco`。
4. **构建**：`npx ng build playground --configuration development`。

→ 两套 schema、物料面板条目**自动生成**,面板/字典/surface 都不用动。

### 3.3 配方 B：加一个行内 embed

1. 先检查 `@ccc/blockcraft` 是否已有相同数据语义的 Embed；已有时直接使用其 key、converter 和 Delta helper，不在宿主重复实现。
2. 只有模板域确有独立数据语义时，才建目录入口 `embeds/x/index.ts`：`defineEmbed<V>({ name, label, svgIcon, fetch, renderDom, editDom })`。
3. **在 `embeds/index.ts` 统一导出**，再在 `core/registry.ts` 从 `../embeds` 导入，并在 `EMBEDS` 数组加一行。
4. **构建**。
> Embed 不需要 `flavours.ts` 声明（不走 Schema）。当前宿主仅自带 `avatar`；`date` 与 `icon` 由 bundled editor 注册，物料面板只负责生成标准 Delta。

### 3.4 配方 C：把假数据换成真数据（移植 cses）

1. 写一个 `RealTemplateData implements TemplateData`（读后端：用户信息 / 文档时间 / 天气接口）。
2. 把 `main.ts` 里 `{ provide: TEMPLATE_DATA, useClass: MockTemplateData }` 的 `useClass` 换成 `RealTemplateData`。
3. **组件一行不动**（都只依赖 `TEMPLATE_DATA` 接口）。

### 3.5 常见坑（踩过的）

| 坑 | 现象 | 解法 |
|---|---|---|
| **NG5002** | block 内联模板里字面量 `{` / `}` 编译报错（`tsc` 抓不到,只有 `ng build` 报） | 写成 `&#123;` / `&#125;`。embed 是裸 DOM `textContent`,不受此限 |
| **`category` 写进 metadata** | TS 多余属性报错 | `category` 只放 `DecoDef` 顶层,`metadata` 只填 `version/label/svgIcon` |
| **忘了 `super.ngOnInit()`** | 渲染组件内部 `_init` 没跑,行为异常 | 渲染组件 `ngOnInit` 第一行必须 `super.ngOnInit()` |
| **自建 doc 缺 DI** | 控制台报 token 缺失 / Schema not found | surface 组件 `providers: [DECO_DOC_PROVIDERS]`；用到的标准块（表格/分栏）要在 `BASE_SCHEMAS` 里 |
| **embed 插不进去** | 点物料项没反应 | 点面板时 `mousedown` 要 `preventDefault`,否则编辑器光标/选区被清,读不到落点 |
| **数据突变绕过 Yjs** | undo/协同出问题 | block 用 `updateProps()`；插入用 `doc.crud` / `dragController`；embed 用 `applyDeltaOperations`。禁止直接改 DOM/props |

---

## 4. 名词对照表

| 名词 | 含义 |
|---|---|
| **templateEdit** | 「模板编辑态」组件 / converter —— 设计页里显占位、配置 |
| **templateRender** | 「文档渲染态」组件 / converter —— 使用页里显真实值 |
| **surface** | 一个自建的编辑器实例（一个 `BlockCraftDoc` + 一本字典 + 一组 embed） |
| **机制①** | 同 flavour/name,两个 surface 各注册各的字典,过哪本变哪个组件 |
| **flavour** | block 类型标识（如 `template-weather`）——字典的 key |
| **void 块** | 不可编辑的块（天气/Logo）；**可编辑块** = 彩色文本块（能在里面打字） |
| **embed** | 行内嵌入元素（随正文流的图标/日期/人员/图片） |
| **物料面板** | 右侧插入面板（`deco-insert-panel`）,block 拖、embed 点 |

---

## 5. 现状与边界

**已做（✅）**：装饰机制（两工厂 + registry + 两 surface）、自建 doc 宿主、5+ 类装饰（天气/Logo/彩色块 + 人员/日期/图标/图片 + 整页背景）、设计页↔使用页双向链路（TemplateStore）、可替换的 Mock 数据接缝、物料面板拖/点两种插入。

**未做（🚧 留接缝）**：领域层（`Template` 聚合、可改区域规则、角色权限）、联动（任务/会议）与真实数据源、高级物料（缩放/调色/贴纸/边框/倒计时）。

**纪律**：纯 playground 应用代码,**不改框架、不改版本号、不写 MIGRATIONS**；数据突变一律走 Yjs；图标用字体/svg symbol,不用图片。
