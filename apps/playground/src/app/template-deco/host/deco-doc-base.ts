import * as Y from 'yjs'
import { Injector } from '@angular/core'
import {
  SchemaManager, DocPlugin, ConsoleLogger, IBlockSchemaOptions, BlockCraftDoc, EmbedConverter, generateId,
  BLOCK_CREATOR_SERVICE_TOKEN, DOC_FILE_SERVICE_TOKEN, DOC_MESSAGE_SERVICE_TOKEN,
  DOC_ADAPTER_SERVICE_TOKEN, DOC_LINK_PREVIEWER_SERVICE_TOKEN, DocLinkPreviewerService,
  RootBlockSchema, ParagraphBlockSchema, OrderedBlockSchema, BulletBlockSchema, TodoBlockSchema,
  DividerBlockSchema, ImageBlockSchema, CodeBlockSchema, BlockquoteBlockSchema, CalloutBlockSchema,
  TableBlockSchema, TableRowBlockSchema, TableCellBlockSchema, ColumnsBlockSchema,
} from '@ccc/blockcraft'
import { ColumnBlockSchema } from '@ccc/blockcraft/blocks/columns-block'
import { FloatTextToolbarPlugin, TableBlockBinding } from '@ccc/blockcraft/plugins'
import { OrderedBlockPlugin } from '@ccc/blockcraft/plugins/ordered-extension'
import { BlockControllerPlugin } from '@ccc/blockcraft/plugins/block-controller'
import { BlockTransformerPlugin } from '@ccc/blockcraft/plugins/block-transformer'
import { PasteFormatSelectorPlugin } from '@ccc/blockcraft/plugins/paste-format-selector'
import { PlaceholderPlugin } from '@ccc/blockcraft/plugins/placeholder'
import { ImgToolbarPlugin } from '@ccc/blockcraft/plugins/img-toolbar'
import { CalloutToolbarPlugin } from '@ccc/blockcraft/plugins/callout-toolbar'
import { DividerExtensionPlugin } from '@ccc/blockcraft/plugins/divider-toolbar'
import { BlockGapCreatorPlugin } from '@ccc/blockcraft/plugins/block-gap-creator'
// bundled 编辑器的 service 实现走 deep import（playground 已用 @ccc/blockcraft/editor/* 形态）
import { MyBlockCreatorService } from '@ccc/blockcraft/editor/services/block-creator.service'
import { MyDocFileService } from '@ccc/blockcraft/editor/services/doc-file-service'
import { MyDocMessageService } from '@ccc/blockcraft/editor/services/doc-message.service'
import { AdapterService } from '@ccc/blockcraft/editor/services/adapter.service'
import { MyCommentService } from '@ccc/blockcraft/editor/services/comment.service'
import { TEMPLATE_EDIT_SCHEMAS, TEMPLATE_RENDER_SCHEMAS } from '../core/registry'

/**
 * 模板装饰编辑器的共享常量——对标 cses-client `docs/editor/const.ts` 的 `SchemaStore` / `DEFAULT_PLUGINS` 写法。
 * 各 surface 直接 `new BlockCraftDoc({ schemas: ..._STORE, plugins: createDecoPlugins(), ... })`，不再包 factory。
 */

/** 标准块集（含 table/columns，fixed-toolbar 的「插入表格 / 分栏」要用；缺了会抛 "Schema not found"）。 */
const BASE_SCHEMAS: IBlockSchemaOptions[] = [
  RootBlockSchema, ParagraphBlockSchema, OrderedBlockSchema, BulletBlockSchema, TodoBlockSchema,
  DividerBlockSchema, ImageBlockSchema, CodeBlockSchema, BlockquoteBlockSchema, CalloutBlockSchema,
  TableBlockSchema, TableRowBlockSchema, TableCellBlockSchema, ColumnsBlockSchema, ColumnBlockSchema,
]

// SchemaManager 无 per-doc 状态（只是 flavour→schema 的 Map），可模块级建一次、所有 doc 共享——同 cses 的 SchemaStore。
/** 设计页字典：标准块 + 装饰的「编辑」组件（带齿轮 / 缩放）。 */
export const TEMPLATE_EDIT_SCHEMA_STORE = new SchemaManager([...BASE_SCHEMAS, ...TEMPLATE_EDIT_SCHEMAS])
/** 使用页字典：标准块 + 装饰的「渲染」组件（显真实值）。 */
export const TEMPLATE_USE_SCHEMA_STORE = new SchemaManager([...BASE_SCHEMAS, ...TEMPLATE_RENDER_SCHEMAS])

/**
 * 一套标准编辑插件（设计页 / 使用页同款）。用**工厂**而非常量数组：插件是有状态实例、绑定单个 doc，
 * 每个 surface 必须拿全新实例（doc 销毁会 `plugin.destroy()`，复用同一实例会用到已销毁的）——同 cses 的 `createDefaultPlugins()`。
 */
export const createDecoPlugins = (): DocPlugin[] => [
  new OrderedBlockPlugin(),
  new FloatTextToolbarPlugin(),
  new BlockTransformerPlugin(),
  new BlockControllerPlugin(),
  new TableBlockBinding(),                                          // 表格单元格编辑 / 列宽等交互
  new PasteFormatSelectorPlugin(),
  new PlaceholderPlugin({ overrides: { paragraph: '输入「/」唤起命令' } }),   // 空行输入 / 唤起命令菜单
  new ImgToolbarPlugin(),
  new CalloutToolbarPlugin(),
  new DividerExtensionPlugin(),
  new BlockGapCreatorPlugin(),
]

/**
 * 自建 doc 需要的 DI token 实现，镜像 editor.ts（block-craft-editor）的 providers，挂在各 surface 组件的 `providers` 上。
 * ConsoleLogger / MyCommentService 一并补齐，使编辑插件（fixed-toolbar、block-controller 等）注入到一致的服务集合。
 */
export const DECO_DOC_PROVIDERS = [
  { provide: DOC_FILE_SERVICE_TOKEN, useClass: MyDocFileService },
  { provide: DOC_MESSAGE_SERVICE_TOKEN, useClass: MyDocMessageService },
  { provide: BLOCK_CREATOR_SERVICE_TOKEN, useClass: MyBlockCreatorService },
  { provide: DOC_LINK_PREVIEWER_SERVICE_TOKEN, useClass: DocLinkPreviewerService },
  { provide: DOC_ADAPTER_SERVICE_TOKEN, useClass: AdapterService },
  ConsoleLogger,
  MyCommentService,
]

/**
 * 建一个装饰 surface 的 doc——编辑 / 使用两页共用的初始化流程，只把差异项（字典 schemas、embeds）参数化。
 * 内部固定：新 `Y.Doc(gc:false)` + `ConsoleLogger` + `createDecoPlugins()` + `readonly:false`，再用 `root([空段落])` 初始化。
 * docId 只在内部用（yDoc guid + root 块 id 复用），调用方不需要；embeds 由调用方传入（含各自 docRef 懒引用）。
 */
export function createDecoDoc(opts: {
  schemas: SchemaManager
  embeds: [string, EmbedConverter][]
  injector: Injector
  hostEl: HTMLElement
}): BlockCraftDoc {
  const docId = generateId()
  const doc = new BlockCraftDoc({
    yDoc: new Y.Doc({ guid: docId, gc: false }),
    docId,
    schemas: opts.schemas,
    logger: new ConsoleLogger(),
    injector: opts.injector,
    embeds: opts.embeds,
    plugins: createDecoPlugins(),
    readonly: false,
  })
  // root.flavour 必为 'root'；root 块 id 复用 docId；初始一个空段落
  doc.initBySnapshot(
    doc.schemas.createSnapshot('root', [docId, [doc.schemas.createSnapshot('paragraph', [])]]),
    opts.hostEl,
  )
  return doc
}

/**
 * 两个 surface 共用的样式（灰底滚动区 + 顶部 fixed-toolbar + 居中白文档列）。原先 edit/use 各写一份逐字节相同的
 * styles 数组，现收成一处——改版式只改这里。用法：`styles: [EDITOR_SURFACE_STYLES]`。
 */
export const EDITOR_SURFACE_STYLES = `
    :host{ display:flex; flex-direction:column; height:100%; min-height:0; background:var(--bc-bg-secondary,#f5f5f5) }
    /* 顶部工具条：满宽白底栏 + 内容居中（镜像 cses .editor-fixed-toolbar）；用 CSS 变量抹掉 toolbar 自带的浮卡边框/投影，压平成一条 */
    .editor-fixed-toolbar{ flex:none; display:flex; justify-content:center; align-items:center; height:40px; background:#fff; border-bottom:1px solid var(--bc-border-color-light,#eee); --bc-fixed-toolbar-border:none; --bc-fixed-toolbar-shadow:none }
    .editor-scroll{ flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; padding:16px 0 }
    /* 居中白文档列：自己掌控的 div（必为 block），width+margin auto 稳定居中；cses 尺寸 + 8px 圆角、无投影。整页背景图铺这层（longhand 必须在 background 简写之后） */
    .editor-container{ position:relative; isolation:isolate; display:block; box-sizing:border-box; width:calc(min(908px, calc(100% - 32px)) * var(--tpl-editor-scale, 1)); min-height:100%; margin:0 auto; background:#fff; background-size:cover; background-position:center; background-repeat:no-repeat; border-radius:8px; padding:32px 70px 64px; color:var(--bc-color); cursor:text }   /* position:relative = 自由定位物料的参照父；isolation:isolate = 让装饰的负 z-index(水印)沉在正文文字下、但仍在本页背景之上（把 z 层叠限制在本页内） */
  `
