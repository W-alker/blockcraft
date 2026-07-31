import * as Y from 'yjs'
import { Injector } from '@angular/core'
import {
  ConsoleLogger, IBlockSchemaOptions, BlockCraftDoc, EmbedConverter, generateId,
  BLOCK_CREATOR_SERVICE_TOKEN, DOC_FILE_SERVICE_TOKEN, DOC_MESSAGE_SERVICE_TOKEN,
  DOC_ADAPTER_SERVICE_TOKEN, DOC_LINK_PREVIEWER_SERVICE_TOKEN, DocLinkPreviewerService,
  createBundledEditorCapabilities, PaginationPlugin,
  BlockLockKind, BlockMutationPolicy, BlockUnlockContext,
} from '@ccc/blockcraft'
// bundled 编辑器的 service 实现走 deep import（playground 已用 @ccc/blockcraft/editor/* 形态）
import { MyBlockCreatorService } from '@ccc/blockcraft/editor/services/block-creator.service'
import { MyDocFileService } from '@ccc/blockcraft/editor/services/doc-file-service'
import { MyDocMessageService } from '@ccc/blockcraft/editor/services/doc-message.service'
import { AdapterService } from '@ccc/blockcraft/editor/services/adapter.service'
import { MyCommentService } from '@ccc/blockcraft/editor/services/comment.service'
import { MyDocTranslationService } from '@ccc/blockcraft/editor/services/doc-translation.service'

/**
 * 模板装饰编辑器的共享宿主接线。普通编辑能力由
 * `createBundledEditorCapabilities()` 提供，模板域只追加双态动态 Schema/Embed。
 */

/**
 * playground 没有登录态，用两个稳定身份演示“创建人可解冻、普通使用者不可解冻”。
 * 移植到真实宿主时必须由会话用户 ID 替换，不能沿用这些演示值。
 */
export const TEMPLATE_CREATOR_USER_ID = 'template-creator'
export const TEMPLATE_CONSUMER_USER_ID = 'template-consumer'

/** 一个模板 surface 的编辑器运行时。分页插件属于视图状态，由宿主持有引用并启停。 */
export interface DecoDocRuntime {
  doc: BlockCraftDoc
  pagination: PaginationPlugin
}

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
 * 内部固定：新 `Y.Doc(gc:false)` + `ConsoleLogger` + bundled plugins + `readonly:false`，
 * 再用 `root([空段落])` 初始化。
 * docId 只在内部用（yDoc guid + root 块 id 复用），调用方不需要；embeds 由调用方传入（含各自 docRef 懒引用）。
 * currentUserId 是块锁所有权身份：模板编辑页传创建人，使用页传当前普通使用者。
 * 返回 doc 与本次 bundled capabilities 创建的分页插件，禁止跨 surface 复用。
 */
export function createDecoDoc(opts: {
  additionalSchemas: readonly IBlockSchemaOptions[]
  additionalEmbeds: readonly [string, EmbedConverter][]
  injector: Injector
  hostEl: HTMLElement
  currentUserId: string
  defaultBlockLockKind?: BlockLockKind
  canUnlockBlock?: (context: BlockUnlockContext) => boolean
  blockMutationPolicy?: BlockMutationPolicy
}): DecoDocRuntime {
  const docId = generateId()
  const capabilities = createBundledEditorCapabilities({
    additionalSchemas: opts.additionalSchemas,
    additionalEmbeds: opts.additionalEmbeds,
    placeholder: {
      overrides: {paragraph: '输入「/」唤起命令'},
    },
    translate: {
      sourceLang: 'auto',
      defaultTargetLang: 'chinese_simplified',
      targetLangWhenSourceIsChinese: 'chinese_simplified',
      service: new MyDocTranslationService(),
    },
    pagination: {
      enabled: false,
      pageSize: 'A4',
      printShortcut: true,
    },
  })
  const doc = new BlockCraftDoc({
    yDoc: new Y.Doc({ guid: docId, gc: false }),
    docId,
    schemas: capabilities.schemas,
    logger: new ConsoleLogger(),
    injector: opts.injector,
    embeds: [...capabilities.embeds],
    plugins: [...capabilities.plugins],
    readonly: false,
    currentUserId: opts.currentUserId,
    defaultBlockLockKind: opts.defaultBlockLockKind,
    canUnlockBlock: opts.canUnlockBlock,
    blockMutationPolicy: opts.blockMutationPolicy,
    // 模板 surface 的滚动层与文档挂载层是两个元素。显式传递外层，
    // 避免分页页框被插进中间的连续文档列。
    ...(opts.hostEl.parentElement
      ? {scrollContainer: opts.hostEl.parentElement}
      : {}),
    // 模板排版依赖完整 DOM 几何和稳定的 BlockComponent 引用。
    // 在 placement 改造为 model-first + view lease 之前显式关闭根虚拟化。
    virtualization: { enabled: false },
  })
  // root.flavour 必为 'root'；root 块 id 复用 docId；初始一个空段落
  doc.initBySnapshot(
    doc.schemas.createSnapshot('root', [docId, [doc.schemas.createSnapshot('paragraph', [])]]),
    opts.hostEl,
  )
  return {
    doc,
    pagination: capabilities.paginationPlugin,
  }
}

/**
 * 两个 surface 共用的样式（灰底滚动区 + 顶部 fixed-toolbar + 居中白文档列）。原先 edit/use 各写一份逐字节相同的
 * styles 数组，现收成一处——改版式只改这里。用法：`styles: [EDITOR_SURFACE_STYLES]`。
 */
export const EDITOR_SURFACE_STYLES = `
    :host{ display:flex; flex-direction:column; height:100%; min-height:0; background:var(--bc-bg-secondary,#f5f5f5) }
    /* 顶部工具条：满宽白底栏 + 内容居中（镜像 cses .editor-fixed-toolbar）；用 CSS 变量抹掉 toolbar 自带的浮卡边框/投影，压平成一条 */
    .editor-fixed-toolbar{ flex:none; display:flex; justify-content:center; align-items:center; height:40px; background:#fff; border-bottom:1px solid var(--bc-border-color-light,#eee); --bc-fixed-toolbar-border:none; --bc-fixed-toolbar-shadow:none }
    .editor-scroll{ position:relative; flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; padding:16px 0 }
    /* 居中白文档列：自己掌控的 div（必为 block），width+margin auto 稳定居中；cses 尺寸 + 8px 圆角、无投影。整页背景图铺这层（longhand 必须在 background 简写之后） */
    .editor-container{ position:relative; isolation:isolate; display:block; box-sizing:border-box; width:calc(min(908px, calc(100% - 32px)) * var(--tpl-editor-scale, 1)); min-height:100%; margin:0 auto; background:#fff; background-size:cover; background-position:center; background-repeat:no-repeat; border-radius:8px; padding:32px 70px 64px; color:var(--bc-color); cursor:text }   /* position:relative = 自由定位物料的参照父；isolation:isolate = 把 under(0)/正文(1)/over(2) 层叠限制在本页内 */
    /* PaginationPlugin 把显式 scrollContainer 标成 bc-paginated-scroll。
       模板多包了一层连续文档列；分页时用 display:contents 只移除这层视觉盒，
       让 root 直接参与分页 flex 布局，页框和正文共享同一中线。 */
    .editor-scroll.bc-paginated-scroll{ display:flex; flex-direction:column; align-items:center; padding:24px 0 !important; background:var(--bc-pagination-backdrop-bg) !important }
    .editor-scroll.bc-paginated-scroll > .editor-container{ display:contents }
  `
