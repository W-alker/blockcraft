# 模板装饰 MVP1 实施计划（playground · 自建 doc）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 blockcraft playground 用「自建 BlockCraftDoc」搭出模板装饰机制 —— 两个 surface(模板编辑/文档)、两个工厂(`defineDeco`/`defineEmbed`)、5 个 block 装饰 + 1 个行内 embed,block 拖拽插入、embed 光标插入,数据走可替换的 `TEMPLATE_DATA`。

**Architecture:** 不用 bundled `<block-craft-editor>`(它共享 module 级单例 SchemaManager + 硬编码 embeds);改为每个 surface 自己 `new BlockCraftDoc({ 各自一本 SchemaManager, 各自一个 embeds })`(集中在 `host/create-deco-doc.ts`)。同一 `flavour` 在模板编辑 surface 映射 `templateEdit` 组件、在文档 surface 映射 `templateRender` 组件 —— 两态由"在哪个 surface"决定,组件内无 `@if(mode)`。这套自建方式正好预演 cses-client 集成(它也是每场景自建 doc)。

**Tech Stack:** Angular 20(standalone + OnPush)、`@ccc/blockcraft`(BlockCraftDoc / SchemaManager / BaseBlockComponent / EmbedConverter / dragController)、Yjs、RxJS。

**设计来源:** `docs/template-deco-design.md`(spec)。本计划落地它的 §2–§12。

## Global Constraints

每个任务都隐含遵守以下(逐条 verbatim,改动前必读):

- **无单元测试**:用户已删除本特性的测试。每个任务的验证 = `npx ng build playground --configuration development`(EXIT 0)+ 必要时浏览器运行时核对。**不要新增 `.spec.ts` / tsconfig.spec / 测试管线。**
- **不提交、不 push**:除非用户明确要求。代码留在主仓库 `/Users/mac06/projects/blockcraft/blockcraft`(branch `dev-test`)工作区,未提交。
- **不碰无关 WIP**:`packages/editor/tools/export-manager.ts`、未跟踪的 `.agents/`、`xlsx` 等一律不动。
- **不改 blockcraft 框架**(`packages/editor/**`):本特性全部落在 `apps/playground/`。`host/` 通过 `@ccc/blockcraft` 与 `@ccc/blockcraft/editor/services/*` deep import 复用框架,**不修改框架源**。
- **不改版本号 / 不写 MIGRATIONS**:纯 playground 应用代码,不触发 ai-skills 同步。
- **命名固定**:两态一律 `templateEdit` / `templateRender`(组件、schema、registry、文件名全套)。
- **`category` 放 `DecoDef` 顶层,绝不进 `schema.metadata`**(框架 `IBlockSchemaOptions.metadata` 无此字段,写入即 TS 报错)。
- **Angular block 组件**:`standalone: true`、`ChangeDetectionStrategy.OnPush`、selector `tag.flavour-block` 形态。
- **NG5002**:Angular 内联模板里的字面量 `{` / `}` 必须写成 `&#123;` / `&#125;`(`tsc` 抓不到,只有 `ng build` 报)。embed 的 `editDom`/`renderDom` 是裸 DOM `textContent`,不受此限。
- **图标**:`icon` 字段先留实际 iconfont glyph 或空串;物料面板以 `label` 文本为主、`icon` 可选,空串不渲染图标(MVP 不被图标阻塞;字体图标在 `packages/editor/assets/iconfont/`)。
- **数据突变走 Yjs**:block 用 `updateProps()`;插入用 `doc.crud` / `dragController`;embed 用 `applyDeltaOperations`。禁止直接改 DOM/props。

---

## Task 1: 自建 doc 宿主（探针 · 最高风险先验）

先把"自建 BlockCraftDoc 能渲染 + 可编辑"跑通,再往上堆装饰。这是全计划的地基,单独成任务先验证 DI bootstrap。

**Files:**
- Create: `apps/playground/src/app/template-deco/host/create-deco-doc.ts`
- Modify(临时验证,Task 11 会替换): `apps/playground/src/app/app.component.ts`(加一个临时按钮挂载探针)

**Interfaces:**
- Produces:
  - `BASE_SCHEMAS: IBlockSchemaOptions[]`(标准块集,含 `RootBlockSchema`/`ParagraphBlockSchema`)
  - `DECO_DOC_PROVIDERS`(DI providers 数组,供 surface 组件 `providers: [DECO_DOC_PROVIDERS]`)
  - `createDecoDoc(opts: { injector: Injector; container: HTMLElement; extraSchemas: IBlockSchemaOptions[]; extraEmbeds: [string, EmbedConverter][]; snapshot?: IBlockSnapshot }): BlockCraftDoc`

- [ ] **Step 1: 写 `host/create-deco-doc.ts`**

```ts
import * as Y from 'yjs'
import { Injector } from '@angular/core'
import {
  BlockCraftDoc, SchemaManager, ConsoleLogger, generateId,
  IBlockSchemaOptions, IBlockSnapshot, EmbedConverter,
  BLOCK_CREATOR_SERVICE_TOKEN, DOC_FILE_SERVICE_TOKEN, DOC_MESSAGE_SERVICE_TOKEN,
  DOC_ADAPTER_SERVICE_TOKEN, DOC_LINK_PREVIEWER_SERVICE_TOKEN, DocLinkPreviewerService,
  RootBlockSchema, ParagraphBlockSchema, OrderedBlockSchema, BulletBlockSchema, TodoBlockSchema,
  DividerBlockSchema, ImageBlockSchema, CodeBlockSchema, BlockquoteBlockSchema, CalloutBlockSchema,
} from '@ccc/blockcraft'
// bundled 编辑器用的 service 实现走 deep import（playground 已用 @ccc/blockcraft/editor/* 形态，见 app.component.ts:22）
import { MyBlockCreatorService } from '@ccc/blockcraft/editor/services/block-creator.service'
import { MyDocFileService } from '@ccc/blockcraft/editor/services/doc-file-service'
import { MyDocMessageService } from '@ccc/blockcraft/editor/services/doc-message.service'
import { AdapterService } from '@ccc/blockcraft/editor/services/adapter.service'

/** 标准块集：每个 surface 的 SchemaManager 都以它打底，再拼各自的装饰 schema。 */
export const BASE_SCHEMAS: IBlockSchemaOptions[] = [
  RootBlockSchema, ParagraphBlockSchema, OrderedBlockSchema, BulletBlockSchema, TodoBlockSchema,
  DividerBlockSchema, ImageBlockSchema, CodeBlockSchema, BlockquoteBlockSchema, CalloutBlockSchema,
]

/** 自建 doc 需要的 DI token 实现，镜像 editor.ts:181-192（复用 bundled 同款 service）。 */
export const DECO_DOC_PROVIDERS = [
  { provide: DOC_FILE_SERVICE_TOKEN, useClass: MyDocFileService },
  { provide: DOC_MESSAGE_SERVICE_TOKEN, useClass: MyDocMessageService },
  { provide: BLOCK_CREATOR_SERVICE_TOKEN, useClass: MyBlockCreatorService },
  { provide: DOC_LINK_PREVIEWER_SERVICE_TOKEN, useClass: DocLinkPreviewerService },
  { provide: DOC_ADAPTER_SERVICE_TOKEN, useClass: AdapterService },
]

export interface CreateDecoDocOptions {
  injector: Injector                       // 来自宿主组件 inject(Injector)，需带 DECO_DOC_PROVIDERS
  container: HTMLElement                    // doc 渲染挂载点
  extraSchemas: IBlockSchemaOptions[]       // 该 surface 的装饰 schema（templateEdit 或 templateRender 套）
  extraEmbeds: [string, EmbedConverter][]   // 该 surface 的 embed 套
  snapshot?: IBlockSnapshot                 // 初始内容，缺省给一个空段落
}

/** 每个 surface 自己一个 doc + 一本 SchemaManager + 一个 embeds 数组（机制①的落点）。 */
export function createDecoDoc(opts: CreateDecoDocOptions): BlockCraftDoc {
  const docId = generateId()
  const schemas = new SchemaManager([...BASE_SCHEMAS, ...opts.extraSchemas])
  const doc = new BlockCraftDoc({
    yDoc: new Y.Doc({ guid: docId, gc: false }),
    docId,
    schemas,
    logger: new ConsoleLogger(),
    injector: opts.injector,
    embeds: opts.extraEmbeds,
    plugins: [],                            // MVP 不挂插件：编辑 + dragController 拖拽 + 渲染均为 doc 内建能力
  })
  const root = opts.snapshot
    ?? schemas.createSnapshot('root', [docId, [schemas.createSnapshot('paragraph', [])]])
  doc.initBySnapshot(root, opts.container)  // root.flavour 必须是 'root'，否则抛错
  return doc
}
```

- [ ] **Step 2: 在 app.component 临时挂一个探针验证(Task 11 会删)**

在 `apps/playground/src/app/app.component.ts` 的模板里加一个临时块(放在显眼处,例如顶部),并在类里加最小宿主逻辑。**这是临时验证脚手架,Task 11 用正式 demo 组件替换。**

模板片段:
```html
<div style="border:1px dashed #999;padding:8px;margin:8px">
  <button type="button" (click)="mountDecoProbe()">挂载自建 doc 探针</button>
  <div #decoProbe></div>
</div>
```
类里:
```ts
@ViewChild('decoProbe', { read: ElementRef }) decoProbe?: ElementRef<HTMLElement>;
private readonly _probeInjector = inject(Injector);
mountDecoProbe(): void {
  if (!this.decoProbe) return;
  // 注意：app.component 的 injector 需能解析 DECO_DOC_PROVIDERS；
  // 若解析不到，临时在 app.component 的 @Component({ providers: [...] }) 里加 DECO_DOC_PROVIDERS（Task 11 移到 surface 组件）。
  createDecoDoc({
    injector: this._probeInjector,
    container: this.decoProbe.nativeElement,
    extraSchemas: [],
    extraEmbeds: [],
  });
}
```
> 实现者注意:`createDecoDoc` 的 `injector` 必须能解析 `DECO_DOC_PROVIDERS`。本临时步骤可把 `DECO_DOC_PROVIDERS` 加进 app.component 的 `@Component({ providers })`;Task 10 起正式做法是放在 surface 组件的 `providers`。

- [ ] **Step 3: 构建**

Run: `npx ng build playground --configuration development`
Expected: EXIT 0(重点验证 deep import `@ccc/blockcraft/editor/services/*` 能解析、`BlockCraftDoc`/`SchemaManager`/`ConsoleLogger` 等 barrel 导出可用)。

- [ ] **Step 4: 运行时核对(浏览器)**

`npx ng serve playground` → 打开页面 → 点"挂载自建 doc 探针" → 期望:`#decoProbe` 内出现一个**可点击聚焦、可输入文字**的空段落(说明 doc 自建成功、DI 齐、input 管线通)。若控制台报 DI/token 缺失 → 按报错补 `DECO_DOC_PROVIDERS` 或修正 deep import 路径。

> 本任务一旦绿,全计划的地基就稳了。

---

## Task 2: 数据层 + 分类枚举（并清掉旧 mode 机制）

**Files:**
- Create: `apps/playground/src/app/template-deco/core/deco.category.ts`
- Create: `apps/playground/src/app/template-deco/data/template-data.ts`(合并:接口 + token + Mock)
- Delete: `apps/playground/src/app/template-deco/data/mock-template-data.ts`(并入上面)
- Delete: `apps/playground/src/app/template-deco/data/template-mode.service.ts`(机制①不再需要 mode signal)

**Interfaces:**
- Produces: `DecoCategory`(enum);`TemplateData` / `Weather` / `User`(interface);`TEMPLATE_DATA`(InjectionToken);`MockTemplateData`(class)。

- [ ] **Step 1: 写 `core/deco.category.ts`**

```ts
/** 装饰分类：放在 DecoDef 顶层 + 物料面板分组用；不进 schema.metadata。 */
export enum DecoCategory {
  Basic = '基础',
  Advanced = '高级',
  Linkage = '联动',
}
```

- [ ] **Step 2: 写 `data/template-data.ts`(契约 + token + Mock 合一)**

```ts
import { InjectionToken, Injectable } from '@angular/core'
import { Observable, of } from 'rxjs'

export interface Weather { icon: string; temp: number; desc: string }
export interface User { name: string; avatarUrl: string }

/** 数据契约：按域分格、方法返回 Observable。实现可换(Mock→Real)，组件不改。 */
export interface TemplateData {
  weather: { get(): Observable<Weather> }
  user: { current(): Observable<User> }
  doc: { date(field: string): Observable<string> }
  // task / meeting … MVP5-8 加域
}

export const TEMPLATE_DATA = new InjectionToken<TemplateData>('TEMPLATE_DATA')

/** MVP1 假数据：of(...) 即"冷流推一次"。移植时换 RealTemplateData(读 ctx.userInfo/docDetail)。 */
@Injectable()
export class MockTemplateData implements TemplateData {
  weather = { get: () => of({ icon: '⛅', temp: 26, desc: '多云' }) }
  user = { current: () => of({ name: '张三', avatarUrl: 'https://placehold.co/40x40' }) }
  doc = { date: (_field: string) => of('2026-06-22') }
}
```

- [ ] **Step 3: 删除旧文件**

```bash
rm apps/playground/src/app/template-deco/data/mock-template-data.ts
rm apps/playground/src/app/template-deco/data/template-mode.service.ts
```
> `template-mode.service.ts`、旧 `mock-template-data.ts` 的引用会在 Task 5/6/11 随旧卡片与 app.component 清理一并消失;本步删文件,后续步骤补引用。删后若 `ng build` 因残留 import 失败属预期,Task 11 收口;本任务只验证新文件自身可编译(下步)。

- [ ] **Step 4: 构建(允许旧引用暂时报错,但新文件须自洽)**

Run: `npx ng build playground --configuration development`
Expected: 若仍 EXIT 0 最好;若因 app.component / 旧卡片仍 `import` 已删的 mode service 而报错,记录报错文件,留待 Task 11 清理。**新建的 `deco.category.ts` / `template-data.ts` 不得有自身编译错误。**

---

## Task 3: 两个工厂 `defineDeco` / `defineEmbed`

**Files:**
- Create: `apps/playground/src/app/template-deco/core/deco.types.ts`
- Create: `apps/playground/src/app/template-deco/core/define-embed.ts`

**Interfaces:**
- Consumes: `DecoCategory`(Task 2);`TemplateData`(Task 2)。
- Produces:
  - `DecoDef<M>` / `DecoRegistration<M>` / `defineDeco<M>(d): DecoRegistration<M>`(产 `templateEditSchema` / `templateRenderSchema`)
  - `EmbedSpec<V>` / `EmbedRegistration` / `defineEmbed<V>(spec): EmbedRegistration`(产 `templateEdit()` / `templateRender(data)`)

- [ ] **Step 1: 写 `core/deco.types.ts`(block 工厂)**

```ts
import { Type } from '@angular/core'
import { IBlockSchemaOptions, IBlockSnapshot, NativeBlockModel, generateId } from '@ccc/blockcraft'
import { DecoCategory } from './deco.category'

export interface DecoDef<M extends NativeBlockModel = NativeBlockModel> {
  flavour: M['flavour']
  nodeType: M['nodeType']
  category: DecoCategory                 // 顶层携带，物料面板用；不进 metadata
  label: string
  icon: string
  defaultProps: M['props']
  templateEdit: Type<unknown>            // 模板编辑界面用的组件
  templateRender: Type<unknown>          // 文档界面用的组件
}

export interface DecoRegistration<M extends NativeBlockModel = NativeBlockModel> {
  kind: 'block'
  def: DecoDef<M>
  templateEditSchema: IBlockSchemaOptions<M>      // 同 flavour，component = templateEdit
  templateRenderSchema: IBlockSchemaOptions<M>    // 同 flavour，component = templateRender
}

/** 一个装饰定义 → 两套 schema（同 flavour、不同 component）。 */
export function defineDeco<M extends NativeBlockModel>(d: DecoDef<M>): DecoRegistration<M> {
  const base = {
    flavour: d.flavour,
    nodeType: d.nodeType,
    // void 装饰：createSnapshot 无参，props 取默认。机制①靠"过哪本字典"分流，快照里只存 flavour+props。
    createSnapshot: (): IBlockSnapshot => ({
      id: generateId(),
      flavour: d.flavour,
      nodeType: d.nodeType,
      props: { ...d.defaultProps },
      meta: {},
      children: [],
    }),
    // metadata 只放框架认的字段：version/label/icon。category 不在这（框架 metadata 无此字段）。
    metadata: { version: 1, label: d.label, icon: d.icon },
  }
  return {
    kind: 'block',
    def: d,
    templateEditSchema: { ...base, component: d.templateEdit } as IBlockSchemaOptions<M>,
    templateRenderSchema: { ...base, component: d.templateRender } as IBlockSchemaOptions<M>,
  }
}
```

- [ ] **Step 2: 写 `core/define-embed.ts`(embed 工厂)**

```ts
import { Observable, Subscription } from 'rxjs'
import { EmbedConverter, DeltaInsertEmbed } from '@ccc/blockcraft'
import { TemplateData } from '../data/template-data'
import { DecoCategory } from './deco.category'

// 把订阅与属性快照挂在 DOM 节点上：onDestroy 时退订；toDelta 时写回 attributes。
type EmbedEl = HTMLElement & { __sub?: Subscription; __attrs?: Record<string, unknown> }

export interface EmbedSpec<V> {
  name: string; label: string; icon: string; category: DecoCategory
  fetch: (data: TemplateData, attrs: Record<string, unknown>) => Observable<V>  // 渲染态取值
  renderDom: (el: HTMLElement, value: V) => void                                // 渲染态画 DOM
  editDom: (el: HTMLElement, attrs: Record<string, unknown>) => void            // 编辑态画 DOM
}

export interface EmbedRegistration {
  kind: 'embed'
  def: { name: string; label: string; icon: string; category: DecoCategory }
  templateEdit(): [string, EmbedConverter]
  templateRender(data: TemplateData): [string, EmbedConverter]
}

export function defineEmbed<V>(spec: EmbedSpec<V>): EmbedRegistration {
  // toView 通用骨架：建一个不可编辑 span、缓存 attrs、交给 paint 画内部。
  const makeView = (paint: (el: EmbedEl) => void) => (delta: DeltaInsertEmbed): HTMLElement => {
    const el = document.createElement('span') as EmbedEl
    el.setAttribute('contenteditable', 'false')
    el.__attrs = delta.attributes ?? {}
    paint(el)
    return el
  }
  const toDelta = (el: HTMLElement): DeltaInsertEmbed => ({
    insert: { [spec.name]: '' },
    attributes: (el as EmbedEl).__attrs ?? {},
  })
  return {
    kind: 'embed',
    def: { name: spec.name, label: spec.label, icon: spec.icon, category: spec.category },
    // 编辑态：不取数，只画占位/配置。
    templateEdit: () => [spec.name, {
      toView: makeView(el => spec.editDom(el, el.__attrs!)),
      toDelta,
    }],
    // 渲染态：闭包拿到 data，订阅取值画 DOM；onDestroy 退订。
    templateRender: (data) => [spec.name, {
      toView: makeView(el => { el.__sub = spec.fetch(data, el.__attrs!).subscribe(v => spec.renderDom(el, v)) }),
      toDelta,
      onDestroy: (el) => (el as EmbedEl).__sub?.unsubscribe(),
    }],
  }
}
```

- [ ] **Step 3: 构建**

Run: `npx ng build playground --configuration development`
Expected: 两工厂文件无类型错误(被装饰任务消费前不影响别处)。EXIT 0(或仅余 Task 2 遗留的旧引用错误)。

---

## Task 4: 第一个 block 装饰 —— weather（templateEdit + templateRender）+ flavours.ts

canonical 装饰,后续装饰照此 3 文件结构复制改字段。

**Files:**
- Create: `apps/playground/src/app/template-deco/decos/weather/weather.deco.ts`
- Create: `apps/playground/src/app/template-deco/decos/weather/weather.template-edit.component.ts`
- Create: `apps/playground/src/app/template-deco/decos/weather/weather.template-render.component.ts`
- Create: `apps/playground/src/app/template-deco/flavours.ts`(集中 declare global)

**Interfaces:**
- Consumes: `defineDeco`(Task 3)、`BaseBlockComponent`/`TEMPLATE_DATA`/`NoEditableBlockNative`/`BlockNodeType`。
- Produces: `WeatherModel`、`WeatherDeco`(DecoRegistration)、`WeatherTemplateEditComponent`、`WeatherTemplateRenderComponent`;`flavours.ts` 注册 `template-weather`。

- [ ] **Step 1: 写 `weather.template-render.component.ts`**

```ts
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { BaseBlockComponent } from '@ccc/blockcraft'
import { TEMPLATE_DATA } from '../../data/template-data'
import type { WeatherModel } from './weather.deco'

@Component({
  selector: 'div.template-weather-render-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="tpl-card" contenteditable="false">@if (text(); as t) { {{ t }} } @else { … }</span>`,
})
export class WeatherTemplateRenderComponent extends BaseBlockComponent<WeatherModel> {
  private readonly data = inject(TEMPLATE_DATA)
  private readonly destroyRef = inject(DestroyRef)
  protected readonly text = signal('')

  override ngOnInit(): void {
    super.ngOnInit()                                  // 必须先调 super（内部 _init）
    this.data.weather.get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(w => this.text.set(`${w.icon} ${w.temp}° ${w.desc}`))
  }
}
```

- [ ] **Step 2: 写 `weather.template-edit.component.ts`**

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { BaseBlockComponent } from '@ccc/blockcraft'
import type { WeatherModel } from './weather.deco'

@Component({
  selector: 'div.template-weather-edit-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // 字面量大括号必须转义（NG5002）：&#123;天气&#125; 渲染成 {天气}
  template: `<span class="tpl-card tpl-edit" contenteditable="false"><span class="ph">&#123;天气&#125;</span></span>`,
})
export class WeatherTemplateEditComponent extends BaseBlockComponent<WeatherModel> {}
```

- [ ] **Step 3: 写 `weather.deco.ts`(model + defineDeco)**

```ts
import { NoEditableBlockNative, BlockNodeType } from '@ccc/blockcraft'
import { defineDeco } from '../../core/deco.types'
import { DecoCategory } from '../../core/deco.category'
import { WeatherTemplateEditComponent } from './weather.template-edit.component'
import { WeatherTemplateRenderComponent } from './weather.template-render.component'

export interface WeatherModel extends NoEditableBlockNative {
  flavour: 'template-weather'
  nodeType: BlockNodeType.void
  props: { field: string }                  // 取哪天/哪城的天气，MVP 固定 'today'
}

export const WeatherDeco = defineDeco<WeatherModel>({
  flavour: 'template-weather',
  nodeType: BlockNodeType.void,
  category: DecoCategory.Basic,
  label: '天气',
  icon: '',                                  // TODO：填 iconfont glyph（packages/editor/assets/iconfont/）；空串=面板只显文字
  defaultProps: { field: 'today' },
  templateEdit: WeatherTemplateEditComponent,
  templateRender: WeatherTemplateRenderComponent,
})
```

- [ ] **Step 4: 写 `flavours.ts`(集中 declare global，先放 weather)**

```ts
import { BaseBlockComponent } from '@ccc/blockcraft'
import type { WeatherModel } from './decos/weather/weather.deco'

// block 装饰每个 flavour 必须声明：组件类型用基类即可（两态组件都 extends BaseBlockComponent<同 Model>，均可赋值）。
declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'template-weather': BaseBlockComponent<WeatherModel>
    }
    interface IBlockCreateParameters {
      'template-weather': []                 // createSnapshot 无参
    }
  }
}
```

- [ ] **Step 5: 构建**

Run: `npx ng build playground --configuration development`
Expected: weather 三文件 + flavours 无类型/模板错误(尤其确认 `&#123;`/`&#125;` 没触发 NG5002)。EXIT 0(或仅余 Task 2 旧引用错误)。

---

## Task 5: avatar + date 两个数据型 block 装饰

照 weather 结构复制,改 model/flavour/订阅源/占位文字。

**Files:**
- Create: `decos/avatar/avatar.deco.ts`、`decos/avatar/avatar.template-edit.component.ts`、`decos/avatar/avatar.template-render.component.ts`
- Create: `decos/date/date.deco.ts`、`decos/date/date.template-edit.component.ts`、`decos/date/date.template-render.component.ts`
- Modify: `apps/playground/src/app/template-deco/flavours.ts`(加 avatar/date 声明)

**Interfaces:**
- Produces: `AvatarModel`/`AvatarDeco`/`AvatarTemplate{Edit,Render}Component`;`DateModel`/`DateDeco`/`DateTemplate{Edit,Render}Component`。

- [ ] **Step 1: avatar render**

`decos/avatar/avatar.template-render.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { BaseBlockComponent } from '@ccc/blockcraft'
import { TEMPLATE_DATA, User } from '../../data/template-data'
import type { AvatarModel } from './avatar.deco'

@Component({
  selector: 'div.template-avatar-render-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="tpl-card" contenteditable="false">
    @if (user(); as u) { <img class="tpl-avatar" [src]="u.avatarUrl" alt="" /> {{ u.name }} } @else { … }
  </span>`,
})
export class AvatarTemplateRenderComponent extends BaseBlockComponent<AvatarModel> {
  private readonly data = inject(TEMPLATE_DATA)
  private readonly destroyRef = inject(DestroyRef)
  protected readonly user = signal<User | null>(null)
  override ngOnInit(): void {
    super.ngOnInit()
    this.data.user.current().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(u => this.user.set(u))
  }
}
```

- [ ] **Step 2: avatar edit**

`decos/avatar/avatar.template-edit.component.ts`:
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { BaseBlockComponent } from '@ccc/blockcraft'
import type { AvatarModel } from './avatar.deco'

@Component({
  selector: 'div.template-avatar-edit-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="tpl-card tpl-edit" contenteditable="false"><span class="ph">&#123;人员&#125;</span></span>`,
})
export class AvatarTemplateEditComponent extends BaseBlockComponent<AvatarModel> {}
```

- [ ] **Step 3: avatar deco**

`decos/avatar/avatar.deco.ts`:
```ts
import { NoEditableBlockNative, BlockNodeType } from '@ccc/blockcraft'
import { defineDeco } from '../../core/deco.types'
import { DecoCategory } from '../../core/deco.category'
import { AvatarTemplateEditComponent } from './avatar.template-edit.component'
import { AvatarTemplateRenderComponent } from './avatar.template-render.component'

export interface AvatarModel extends NoEditableBlockNative {
  flavour: 'template-avatar'
  nodeType: BlockNodeType.void
  props: { role: string }                   // 取哪个角色的人，MVP 固定 'current'
}

export const AvatarDeco = defineDeco<AvatarModel>({
  flavour: 'template-avatar',
  nodeType: BlockNodeType.void,
  category: DecoCategory.Basic,
  label: '人员',
  icon: '',
  defaultProps: { role: 'current' },
  templateEdit: AvatarTemplateEditComponent,
  templateRender: AvatarTemplateRenderComponent,
})
```

- [ ] **Step 4: date render**

`decos/date/date.template-render.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { BaseBlockComponent } from '@ccc/blockcraft'
import { TEMPLATE_DATA } from '../../data/template-data'
import type { DateModel } from './date.deco'

@Component({
  selector: 'div.template-date-render-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="tpl-card" contenteditable="false">@if (text(); as t) { {{ t }} } @else { … }</span>`,
})
export class DateTemplateRenderComponent extends BaseBlockComponent<DateModel> {
  private readonly data = inject(TEMPLATE_DATA)
  private readonly destroyRef = inject(DestroyRef)
  protected readonly text = signal('')
  override ngOnInit(): void {
    super.ngOnInit()
    this.data.doc.date(this.props.field).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(d => this.text.set(d))
  }
}
```
> `this.props.field` 走 `BaseBlockComponent` 的 `props` getter(recon 确认 `get props(): Model['props'] & IBlockProps`),不要用 `this.model.props`。

- [ ] **Step 5: date edit**

`decos/date/date.template-edit.component.ts`:
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { BaseBlockComponent } from '@ccc/blockcraft'
import type { DateModel } from './date.deco'

@Component({
  selector: 'div.template-date-edit-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="tpl-card tpl-edit" contenteditable="false"><span class="ph">&#123;日期&#125;</span></span>`,
})
export class DateTemplateEditComponent extends BaseBlockComponent<DateModel> {}
```

- [ ] **Step 6: date deco**

`decos/date/date.deco.ts`:
```ts
import { NoEditableBlockNative, BlockNodeType } from '@ccc/blockcraft'
import { defineDeco } from '../../core/deco.types'
import { DecoCategory } from '../../core/deco.category'
import { DateTemplateEditComponent } from './date.template-edit.component'
import { DateTemplateRenderComponent } from './date.template-render.component'

export interface DateModel extends NoEditableBlockNative {
  flavour: 'template-date'
  nodeType: BlockNodeType.void
  props: { field: string }
}

export const DateDeco = defineDeco<DateModel>({
  flavour: 'template-date',
  nodeType: BlockNodeType.void,
  category: DecoCategory.Basic,
  label: '日期',
  icon: '',
  defaultProps: { field: 'createdAt' },
  templateEdit: DateTemplateEditComponent,
  templateRender: DateTemplateRenderComponent,
})
```

- [ ] **Step 7: flavours.ts 加 avatar/date**

把 `flavours.ts` 改为(在 weather 基础上追加):
```ts
import { BaseBlockComponent } from '@ccc/blockcraft'
import type { WeatherModel } from './decos/weather/weather.deco'
import type { AvatarModel } from './decos/avatar/avatar.deco'
import type { DateModel } from './decos/date/date.deco'

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'template-weather': BaseBlockComponent<WeatherModel>
      'template-avatar': BaseBlockComponent<AvatarModel>
      'template-date': BaseBlockComponent<DateModel>
    }
    interface IBlockCreateParameters {
      'template-weather': []
      'template-avatar': []
      'template-date': []
    }
  }
}
```

- [ ] **Step 8: 构建**

Run: `npx ng build playground --configuration development`
Expected: avatar/date 六文件 + flavours 无错(确认占位转义)。EXIT 0(或仅余 Task 2 旧引用错误)。

---

## Task 6: logo + background 两个静态 block 装饰（无 TEMPLATE_DATA）

证明"不订阅数据"的装饰变体:edit 给一个 URL 输入(写 props)、render 显图。

**Files:**
- Create: `decos/logo/logo.deco.ts`、`decos/logo/logo.template-edit.component.ts`、`decos/logo/logo.template-render.component.ts`
- Create: `decos/background/background.deco.ts`、`decos/background/background.template-edit.component.ts`、`decos/background/background.template-render.component.ts`
- Modify: `flavours.ts`(加 logo/background)

**Interfaces:**
- Produces: `LogoModel`/`LogoDeco`/`LogoTemplate{Edit,Render}Component`;`BackgroundModel`/`BackgroundDeco`/`BackgroundTemplate{Edit,Render}Component`。

- [ ] **Step 1: logo render**

`decos/logo/logo.template-render.component.ts`:
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { BaseBlockComponent } from '@ccc/blockcraft'
import type { LogoModel } from './logo.deco'

@Component({
  selector: 'div.template-logo-render-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="tpl-card" contenteditable="false">@if (props.url) { <img class="tpl-logo" [src]="props.url" alt="logo" /> } @else { [logo] }</span>`,
})
export class LogoTemplateRenderComponent extends BaseBlockComponent<LogoModel> {}
```

- [ ] **Step 2: logo edit(URL 输入写 props)**

`decos/logo/logo.template-edit.component.ts`:
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { BaseBlockComponent } from '@ccc/blockcraft'
import type { LogoModel } from './logo.deco'

@Component({
  selector: 'div.template-logo-edit-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // void 块内的原生 input 是"输入孤岛"，不抢编辑器热键；改动经 updateProps 写 Yjs。
  template: `<span class="tpl-card tpl-edit" contenteditable="false">
    <input class="tpl-url" [value]="props.url || ''" (input)="onUrl($event)" placeholder="logo 图片 URL" />
  </span>`,
})
export class LogoTemplateEditComponent extends BaseBlockComponent<LogoModel> {
  onUrl(e: Event): void {
    this.updateProps({ url: (e.target as HTMLInputElement).value })   // 生成 undo 历史，写进快照
  }
}
```

- [ ] **Step 3: logo deco**

`decos/logo/logo.deco.ts`:
```ts
import { NoEditableBlockNative, BlockNodeType } from '@ccc/blockcraft'
import { defineDeco } from '../../core/deco.types'
import { DecoCategory } from '../../core/deco.category'
import { LogoTemplateEditComponent } from './logo.template-edit.component'
import { LogoTemplateRenderComponent } from './logo.template-render.component'

export interface LogoModel extends NoEditableBlockNative {
  flavour: 'template-logo'
  nodeType: BlockNodeType.void
  props: { url: string }
}

export const LogoDeco = defineDeco<LogoModel>({
  flavour: 'template-logo',
  nodeType: BlockNodeType.void,
  category: DecoCategory.Basic,
  label: 'Logo',
  icon: '',
  defaultProps: { url: '' },
  templateEdit: LogoTemplateEditComponent,
  templateRender: LogoTemplateRenderComponent,
})
```

- [ ] **Step 4: background(照 logo 改 flavour/类名/样式类)**

`decos/background/background.template-render.component.ts`:
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { BaseBlockComponent } from '@ccc/blockcraft'
import type { BackgroundModel } from './background.deco'

@Component({
  selector: 'div.template-background-render-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="tpl-bg" contenteditable="false" [style.backgroundImage]="props.url ? 'url(' + props.url + ')' : null">@if (!props.url) { [背景图] }</div>`,
})
export class BackgroundTemplateRenderComponent extends BaseBlockComponent<BackgroundModel> {}
```
`decos/background/background.template-edit.component.ts`:
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { BaseBlockComponent } from '@ccc/blockcraft'
import type { BackgroundModel } from './background.deco'

@Component({
  selector: 'div.template-background-edit-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="tpl-card tpl-edit" contenteditable="false">
    <input class="tpl-url" [value]="props.url || ''" (input)="onUrl($event)" placeholder="背景图 URL" />
  </span>`,
})
export class BackgroundTemplateEditComponent extends BaseBlockComponent<BackgroundModel> {
  onUrl(e: Event): void { this.updateProps({ url: (e.target as HTMLInputElement).value }) }
}
```
`decos/background/background.deco.ts`:
```ts
import { NoEditableBlockNative, BlockNodeType } from '@ccc/blockcraft'
import { defineDeco } from '../../core/deco.types'
import { DecoCategory } from '../../core/deco.category'
import { BackgroundTemplateEditComponent } from './background.template-edit.component'
import { BackgroundTemplateRenderComponent } from './background.template-render.component'

export interface BackgroundModel extends NoEditableBlockNative {
  flavour: 'template-background'
  nodeType: BlockNodeType.void
  props: { url: string }
}

export const BackgroundDeco = defineDeco<BackgroundModel>({
  flavour: 'template-background',
  nodeType: BlockNodeType.void,
  category: DecoCategory.Basic,
  label: '背景图',
  icon: '',
  defaultProps: { url: '' },
  templateEdit: BackgroundTemplateEditComponent,
  templateRender: BackgroundTemplateRenderComponent,
})
```

- [ ] **Step 5: flavours.ts 加 logo/background**

最终 `flavours.ts`(五个装饰齐全):
```ts
import { BaseBlockComponent } from '@ccc/blockcraft'
import type { WeatherModel } from './decos/weather/weather.deco'
import type { AvatarModel } from './decos/avatar/avatar.deco'
import type { DateModel } from './decos/date/date.deco'
import type { LogoModel } from './decos/logo/logo.deco'
import type { BackgroundModel } from './decos/background/background.deco'

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      'template-weather': BaseBlockComponent<WeatherModel>
      'template-avatar': BaseBlockComponent<AvatarModel>
      'template-date': BaseBlockComponent<DateModel>
      'template-logo': BaseBlockComponent<LogoModel>
      'template-background': BaseBlockComponent<BackgroundModel>
    }
    interface IBlockCreateParameters {
      'template-weather': []
      'template-avatar': []
      'template-date': []
      'template-logo': []
      'template-background': []
    }
  }
}
```

- [ ] **Step 6: 构建**

Run: `npx ng build playground --configuration development`
Expected: EXIT 0(或仅余 Task 2 旧引用错误)。

---

## Task 7: 行内 embed —— date-inline

**Files:**
- Create: `apps/playground/src/app/template-deco/embeds/date-inline.embed.ts`

**Interfaces:**
- Consumes: `defineEmbed`(Task 3)、`DecoCategory`、`TemplateData.doc.date`。
- Produces: `DateInlineEmbed: EmbedRegistration`(name `template-date-inline`)。

- [ ] **Step 1: 写 `embeds/date-inline.embed.ts`**

```ts
import { defineEmbed } from '../core/define-embed'
import { DecoCategory } from '../core/deco.category'

// 行内日期：编辑态显占位 {日期}；渲染态订阅 data.doc.date 显真实值。裸 DOM，无 NG5002 限制。
export const DateInlineEmbed = defineEmbed<string>({
  name: 'template-date-inline',
  label: '日期(行内)',
  icon: '',
  category: DecoCategory.Basic,
  fetch: (data, attrs) => data.doc.date((attrs['field'] as string) ?? 'createdAt'),
  renderDom: (el, value) => { el.textContent = value; el.classList.add('tpl-inline') },
  editDom: (el) => { el.textContent = '{日期}'; el.classList.add('tpl-inline', 'tpl-edit') },
})
```

- [ ] **Step 2: 构建**

Run: `npx ng build playground --configuration development`
Expected: EXIT 0(或仅余 Task 2 旧引用错误)。

---

## Task 8: registry 聚合

**Files:**
- Create: `apps/playground/src/app/template-deco/core/registry.ts`

**Interfaces:**
- Consumes: 五个 `*Deco`、`DateInlineEmbed`、`./flavours`、`TemplateData`、`DecoCategory`。
- Produces: `DECOS`、`EMBEDS`、`TEMPLATE_EDIT_SCHEMAS`、`TEMPLATE_RENDER_SCHEMAS`、`TEMPLATE_EDIT_EMBEDS()`、`TEMPLATE_RENDER_EMBEDS(data)`、`Material`、`MATERIALS`。

- [ ] **Step 1: 写 `core/registry.ts`**

```ts
import './flavours'                                   // 顶部 import 触发 declare global 增强
import { IBlockSchemaOptions, EmbedConverter } from '@ccc/blockcraft'
import { DecoRegistration } from './deco.types'
import { EmbedRegistration } from './define-embed'
import { TemplateData } from '../data/template-data'
import { DecoCategory } from './deco.category'
import { WeatherDeco } from '../decos/weather/weather.deco'
import { AvatarDeco } from '../decos/avatar/avatar.deco'
import { DateDeco } from '../decos/date/date.deco'
import { LogoDeco } from '../decos/logo/logo.deco'
import { BackgroundDeco } from '../decos/background/background.deco'
import { DateInlineEmbed } from '../embeds/date-inline.embed'

/** 唯一清单：加装饰就往这两个数组加一行。 */
export const DECOS: DecoRegistration[] = [WeatherDeco, AvatarDeco, DateDeco, LogoDeco, BackgroundDeco]
export const EMBEDS: EmbedRegistration[] = [DateInlineEmbed]

/** block 两套 schema（喂给 surface 的 SchemaManager）。 */
export const TEMPLATE_EDIT_SCHEMAS: IBlockSchemaOptions[] = DECOS.map(d => d.templateEditSchema)
export const TEMPLATE_RENDER_SCHEMAS: IBlockSchemaOptions[] = DECOS.map(d => d.templateRenderSchema)

/** embed 两套 [name, converter][]（喂给 surface 的 embeds）。 */
export const TEMPLATE_EDIT_EMBEDS = (): [string, EmbedConverter][] => EMBEDS.map(e => e.templateEdit())
export const TEMPLATE_RENDER_EMBEDS = (data: TemplateData): [string, EmbedConverter][] => EMBEDS.map(e => e.templateRender(data))

/** 物料面板条目：kind 决定插入方式（block=拖、embed=点）。 */
export interface Material {
  kind: 'block' | 'embed'
  flavour?: string                                    // block 用
  name?: string                                       // embed 用
  label: string
  icon: string
  category: DecoCategory
}
export const MATERIALS: Material[] = [
  ...DECOS.map(d => ({ kind: 'block' as const, flavour: d.def.flavour, label: d.def.label, icon: d.def.icon, category: d.def.category })),
  ...EMBEDS.map(e => ({ kind: 'embed' as const, name: e.def.name, label: e.def.label, icon: e.def.icon, category: e.def.category })),
]
```

- [ ] **Step 2: 构建**

Run: `npx ng build playground --configuration development`
Expected: EXIT 0(或仅余 Task 2 旧引用错误)。registry 把所有装饰串起来,类型应全通。

---

## Task 9: 物料面板组件

**Files:**
- Create: `apps/playground/src/app/template-deco/palette/deco-palette.component.ts`

**Interfaces:**
- Consumes: `MATERIALS` / `Material`(Task 8)、`doc.dragController`、`doc.selection`。
- Produces: `DecoPaletteComponent`(`@Input() doc: BlockCraft.Doc`)。

- [ ] **Step 1: 写 `palette/deco-palette.component.ts`**

```ts
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { MATERIALS, Material } from '../core/registry'

@Component({
  selector: 'deco-palette',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="deco-palette">
      @for (m of materials; track m.label) {
        <div class="deco-item" [class.is-block]="m.kind === 'block'"
             (pointerdown)="onPointerDown($event, m)" (click)="onClick(m)">
          {{ m.label }}<small> · {{ m.kind === 'block' ? '拖' : '点' }}</small>
        </div>
      }
    </div>
  `,
  styles: [`
    .deco-item{touch-action:none;cursor:grab;padding:4px 10px;border:1px solid #e5e7eb;border-radius:6px;margin:4px 0;font-size:13px;background:#fff;user-select:none}
    .deco-item small{color:#9ca3af}
  `],
})
export class DecoPaletteComponent {
  @Input({ required: true }) doc!: BlockCraft.Doc        // 模板编辑 surface 的 doc
  protected readonly materials = MATERIALS

  // block：pointerdown 起拖，框架接管 ghost/dropLine/落点/插入。
  onPointerDown(evt: PointerEvent, m: Material): void {
    if (m.kind !== 'block') return
    if (evt.button !== 0 || this.doc.isReadonly) return
    this.doc.dragController.startDrag(evt, { kind: 'new-block', flavour: m.flavour! }, { ghostLabel: m.label })
  }

  // embed：点击在当前光标处插 embed delta。
  onClick(m: Material): void {
    if (m.kind !== 'embed') return
    const sel = this.doc.selection.value
    if (!sel || sel.start.type !== 'text') return        // 必须落在可编辑文本里
    sel.start.block.applyDeltaOperations([
      { retain: sel.start.offset },
      { insert: { [m.name!]: '' } },
    ])
  }
}
```
> `BlockCraft.Doc` 是全局命名空间类型,无需 import。block 项 `onClick` 早退、embed 项 `onPointerDown` 早退,互不干扰。

- [ ] **Step 2: 构建**

Run: `npx ng build playground --configuration development`
Expected: EXIT 0(或仅余 Task 2 旧引用错误)。

---

## Task 10: 两个 surface 组件

**Files:**
- Create: `apps/playground/src/app/template-deco/surfaces/template-edit.ts`(`TemplateEditSurfaceComponent`,内含物料面板)
- Create: `apps/playground/src/app/template-deco/surfaces/document.ts`(`DocumentSurfaceComponent`)

**Interfaces:**
- Consumes: `createDecoDoc` / `DECO_DOC_PROVIDERS`(Task 1)、registry 四套(Task 8)、`TEMPLATE_DATA`(Task 2)、`DecoPaletteComponent`(Task 9)。
- Produces: `TemplateEditSurfaceComponent`(暴露 `doc: BlockCraftDoc`)、`DocumentSurfaceComponent`(暴露 `doc: BlockCraftDoc`)。

- [ ] **Step 1: 写 `surfaces/template-edit.ts`**

```ts
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Injector, OnDestroy, ViewChild, inject } from '@angular/core'
import { BlockCraftDoc } from '@ccc/blockcraft'
import { createDecoDoc, DECO_DOC_PROVIDERS } from '../host/create-deco-doc'
import { TEMPLATE_EDIT_SCHEMAS, TEMPLATE_EDIT_EMBEDS } from '../core/registry'
import { DecoPaletteComponent } from '../palette/deco-palette.component'

@Component({
  selector: 'template-edit-surface',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DECO_DOC_PROVIDERS],                  // 本 surface 自带一套 DI service
  imports: [DecoPaletteComponent],
  template: `
    <div class="surface-host" #host></div>
    @if (doc) { <deco-palette [doc]="doc"></deco-palette> }
  `,
})
export class TemplateEditSurfaceComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>
  private readonly injector = inject(Injector)
  private readonly cdr = inject(ChangeDetectorRef)
  doc!: BlockCraftDoc

  ngAfterViewInit(): void {
    this.doc = createDecoDoc({
      injector: this.injector,
      container: this.host.nativeElement,
      extraSchemas: TEMPLATE_EDIT_SCHEMAS,          // 这本字典：flavour → templateEdit 组件
      extraEmbeds: TEMPLATE_EDIT_EMBEDS(),
    })
    this.cdr.markForCheck()                          // OnPush：doc 就绪后让 @if(doc) 重算挂出 palette
  }
  ngOnDestroy(): void { this.doc?.destroy?.() }
}
```

- [ ] **Step 2: 写 `surfaces/document.ts`**

```ts
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Injector, OnDestroy, ViewChild, inject } from '@angular/core'
import { BlockCraftDoc } from '@ccc/blockcraft'
import { createDecoDoc, DECO_DOC_PROVIDERS } from '../host/create-deco-doc'
import { TEMPLATE_RENDER_SCHEMAS, TEMPLATE_RENDER_EMBEDS } from '../core/registry'
import { TEMPLATE_DATA } from '../data/template-data'

@Component({
  selector: 'document-surface',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DECO_DOC_PROVIDERS],
  template: `<div class="surface-host" #host></div>`,
})
export class DocumentSurfaceComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>
  private readonly injector = inject(Injector)
  private readonly data = inject(TEMPLATE_DATA)      // 文档 surface 注入真实(mock)数据，闭包给 render embed
  doc!: BlockCraftDoc

  ngAfterViewInit(): void {
    this.doc = createDecoDoc({
      injector: this.injector,
      container: this.host.nativeElement,
      extraSchemas: TEMPLATE_RENDER_SCHEMAS,          // 这本字典：flavour → templateRender 组件
      extraEmbeds: TEMPLATE_RENDER_EMBEDS(this.data),
    })
  }
  ngOnDestroy(): void { this.doc?.destroy?.() }
}
```
> 两个 surface 都 `providers: [DECO_DOC_PROVIDERS]` → 各自独立解析 service;`TEMPLATE_DATA` 由 app 根 provider 提供(Task 11),两 surface 共享同一份 mock。

- [ ] **Step 3: 构建**

Run: `npx ng build playground --configuration development`
Expected: EXIT 0(或仅余 Task 2 旧引用错误)。

---

## Task 11: demo 组件装配 + 清理旧 MVP + 人工验收

收口:把两个 surface + apply 按钮组装成 demo,接进 playground;删掉所有旧 MVP 残留;`main.ts` 保 `TEMPLATE_DATA`、去 `TemplateModeService`;最后整体验收。

**Files:**
- Create: `apps/playground/src/app/template-deco/template-deco-demo.component.ts`
- Modify: `apps/playground/src/main.ts`(去 `TemplateModeService` provider,保 `TEMPLATE_DATA` → `MockTemplateData`)
- Modify: `apps/playground/src/app/app.component.ts`(删旧 palette/onDecoPick/toggleTemplateMode/mode 注入/registerTemplateDeco/Task1 临时探针;接入 `template-deco-demo`)
- Modify: `apps/playground/src/styles.scss`(补 demo 样式)
- Delete: `apps/playground/src/app/template-deco/deco-palette.component.ts`(旧)
- Delete: `apps/playground/src/app/template-deco/template-deco.schemas.ts`(旧)
- Delete: `apps/playground/src/app/template-deco/blocks/`(整目录:旧 weather-card/avatar-card/date-card)

**Interfaces:**
- Consumes: `TemplateEditSurfaceComponent` / `DocumentSurfaceComponent`(Task 10)、`BlockCraftDoc.exportSnapshot` / `doc.crud.insertBlocks`。
- Produces: `TemplateDecoDemoComponent`。

- [ ] **Step 1: 写 `template-deco-demo.component.ts`(组合两 surface + apply)**

```ts
import { ChangeDetectionStrategy, Component, ViewChild } from '@angular/core'
import { IBlockSnapshot } from '@ccc/blockcraft'
import { TemplateEditSurfaceComponent } from './surfaces/template-edit'
import { DocumentSurfaceComponent } from './surfaces/document'

@Component({
  selector: 'template-deco-demo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TemplateEditSurfaceComponent, DocumentSurfaceComponent],
  template: `
    <div class="deco-demo">
      <section class="pane">
        <h3>模板编辑（templateEdit）</h3>
        <template-edit-surface #edit></template-edit-surface>
      </section>
      <section class="pane">
        <h3>文档（templateRender）<button type="button" (click)="apply()">← 应用模板到文档</button></h3>
        <document-surface #docu></document-surface>
      </section>
    </div>
  `,
})
export class TemplateDecoDemoComponent {
  @ViewChild('edit') edit!: TemplateEditSurfaceComponent
  @ViewChild('docu') docu!: DocumentSurfaceComponent

  // 预演 copy 生命周期：导出模板编辑内容 → 插进文档 doc → 同一装饰由 templateEdit 变 templateRender。
  apply(): void {
    const snap: IBlockSnapshot | undefined = this.edit.doc?.exportSnapshot()
    if (!snap) return
    const doc = this.docu.doc
    doc.crud.insertBlocks(doc.rootId, doc.root.childrenLength, (snap.children as IBlockSnapshot[]))
  }
}
```

- [ ] **Step 2: `main.ts` —— 去 mode service,保 TEMPLATE_DATA**

把 `apps/playground/src/main.ts` 的 providers 改为(删 `TemplateModeService` 那行与其 import;`TEMPLATE_DATA` 导入路径已是合并后的 `template-data.ts`):
```ts
import { TEMPLATE_DATA, MockTemplateData } from './app/template-deco/data/template-data'
// …
providers: [
  provideAnimations(),
  provideHttpClient(),
  // 移植 cses-client 时只换这一行的 useClass
  { provide: TEMPLATE_DATA, useClass: MockTemplateData },
],
```
> 删除原 `import { TemplateModeService } from './app/template-deco/data/template-mode.service'` 与 providers 里的 `TemplateModeService`。`MockTemplateData` 现从 `template-data.ts` 导出(Task 2 已合并),原 `./data/mock-template-data` 路径作废。

- [ ] **Step 3: `app.component.ts` —— 删旧、接 demo**

删除(按 recon 行位,实际以当前文件为准):
- import:`DecoPaletteComponent`(原 line 27)、`TEMPLATE_DECO_SCHEMAS, registerTemplateDeco`(原 28)、`TemplateModeService`(原 29);Task 1 临时探针相关 import。
- `@Component.imports` 里的 `DecoPaletteComponent`(原 line 128)。
- 字段 `templateMode = inject(TemplateModeService)`(原 1180);Task 1 的 `decoProbe` ViewChild / `_probeInjector` / `mountDecoProbe`。
- 模板里右侧 `<aside class="deco-aside">…<deco-palette>…`(原 271-274)与 Task 1 临时探针块。
- 方法 `onDecoPick`(原 2369-2383)、`toggleTemplateMode`(原 2385-2388)。
- `ngAfterViewInit` 里 `registerTemplateDeco(this.editor.doc.schemas)`(原 1266-1268);若 Task 1 曾在 app.component 的 `@Component({ providers })` 临时加过 `DECO_DOC_PROVIDERS`,一并移除。

接入 demo(在 `@Component.imports` 加 `TemplateDecoDemoComponent`,模板里加一处):
```ts
import { TemplateDecoDemoComponent } from './template-deco/template-deco-demo.component';
// imports: [ …, TemplateDecoDemoComponent ]
```
模板加(放在合适的 demo 区域):
```html
<template-deco-demo></template-deco-demo>
```

- [ ] **Step 4: `styles.scss` 补 demo 样式(沿用旧 .tpl-card/.ph,补新类)**

在 `apps/playground/src/styles.scss` 的"模板装饰 demo styles"区追加:
```scss
.tpl-edit .ph{ color: var(--bc-text-secondary,#9ca3af); font-style: italic }
.tpl-inline{ padding: 0 2px }
.tpl-inline.tpl-edit{ color:#9ca3af; font-style:italic }
.tpl-avatar{ width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-right:4px }
.tpl-logo{ height:24px;vertical-align:middle }
.tpl-bg{ min-height:48px;border-radius:6px;background-size:cover;background-position:center;color:#9ca3af;font-size:12px;padding:4px }
.tpl-url{ border:1px solid #e5e7eb;border-radius:4px;padding:2px 6px;font-size:12px;width:180px }
.deco-demo{ display:flex;gap:16px;align-items:flex-start }
.deco-demo .pane{ flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px }
.surface-host{ min-height:160px;border:1px dashed #e5e7eb;border-radius:6px;padding:8px }
```

- [ ] **Step 5: 删旧文件**

```bash
rm apps/playground/src/app/template-deco/deco-palette.component.ts
rm apps/playground/src/app/template-deco/template-deco.schemas.ts
rm -rf apps/playground/src/app/template-deco/blocks
```

- [ ] **Step 6: 构建(这次必须全绿)**

Run: `npx ng build playground --configuration development`
Expected: EXIT 0,**无任何残留 import 报错**(旧 mode/schemas/blocks/palette 引用全部清干净)。若报"找不到模块" → 还有旧 import 未删,按报错清理。

- [ ] **Step 7: 人工/headless 运行时验收**

`npx ng serve playground` → 打开 `<template-deco-demo>` 区域,逐条核对(对应 spec §11):
1. 页面并排两块:左"模板编辑"(带物料面板)、右"文档"。两块各是独立编辑器(可分别点进去打字)。
2. 从物料面板**拖** "天气/人员/日期/Logo/背景图" 进左侧模板编辑区:拖动时有蓝色 drop line,松手落点插入。左侧装饰显**编辑态**(`{天气}`/`{人员}`/`{日期}` 占位、Logo/背景图显 URL 输入框)。
3. 在左侧文本里**点** "日期(行内)":光标处插入行内 `{日期}`。
4. 点"← 应用模板到文档":右侧文档区出现同一批装饰,但显**渲染态**——天气 `⛅ 26° 多云`、人员 头像+`张三`、日期 `2026-06-22`、行内日期 `2026-06-22`。**同一份快照,左编辑态、右渲染态,组件内无 mode 判断。**
5. 控制台无 DI / NoRoot / NG 报错。
> 可选 headless:用 puppeteer-core 连 `localhost:4200`,断言左侧占位文本 = `{天气}{人员}{日期}`、右侧渲染文本含 `⛅ 26° 多云`/`张三`/`2026-06-22`、`DI_OR_ROOT_ERRORS=[]`。

---

## 验收对照（spec §11）

- [ ] 两个自建 surface 并排,各持独立 SchemaManager + embeds(Task 10/11)。
- [ ] 物料面板可插 5 个 block 装饰 + 1 个行内 embed(Task 8/9/11)。
- [ ] block 拖拽落点插入,有 drop line(Task 9 + 框架 dragController)。
- [ ] embed 点击光标插入(Task 9)。
- [ ] 模板编辑 surface 显 templateEdit;文档 surface 显 templateRender;组件内无 `@if(mode)`(Task 4-6/10)。
- [ ] apply 预演 copy:exportSnapshot → insertBlocks,装饰两态切换(Task 11)。
- [ ] 数据全来自 MockTemplateData(Task 2)。
- [ ] 加新 block 装饰 = `decos/x/` 3 文件 + `DECOS` 加一行(Task 8 结构)。
- [ ] `ng build playground` 绿(每个 Task 的构建步)。

## 自检遗留 / 实现者注意

- **icon 留空**:5 个装饰 + embed 的 `icon: ''`,物料面板以文字呈现。若要图标,从 `packages/editor/assets/iconfont/` 选 glyph 填入,面板 `{{ m.label }}` 旁可加 `<i [class]="m.icon">`。非阻塞。
- **Task 1 探针**临时改的 app.component 片段,Task 11 Step 3 务必删净。
- **Task 2 删 mode service 后到 Task 11 之间**,`ng build` 可能因 app.component/旧卡片仍引用而暂红,属预期;Task 11 收口必须全绿。
- **logo/background 的 `<input>`**:依赖 void 块"输入孤岛"特性(L0 约定),正常可输入并经 `updateProps` 落 Yjs。
- **不在 worktree 改**:本计划在主仓库 `/Users/mac06/projects/blockcraft/blockcraft`(dev-test 工作区)执行;用户在 WebStorm 看的是主仓库,装饰文件在 `apps/playground/src/app/template-deco/`(非 gitignore,可见)。
