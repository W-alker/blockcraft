import '../flavours'                                  // 顶部 import 触发 declare global 增强（flavours.ts 在上一级）
import {
  type BlockAdapterContribution,
  createInlineDateDelta,
  createBundledAdapterRegistry,
  DeltaInsertEmbed,
  EmbedConverter,
  IBlockSchemaOptions,
  type InlineEmbedAdapterContribution,
  INLINE_DATE_EMBED_KEY,
  INLINE_ICON_EMBED_KEY,
  draftPropMetaKey,
} from '@ccc/blockcraft'
import { DecoRegistration } from './deco.types'
import { MaterialKind } from './deco.category'
import { LogoDeco } from '../decos/logo/logo.deco'

/** Playground 自有 void 装饰；weather/date-card/person-card 直接复用 bundled canonical schema。 */
export const DECOS: DecoRegistration[] = [LogoDeco]

/** 只有 Playground 自有装饰需要 surface-specific schema。 */
export const TEMPLATE_EDIT_SCHEMAS: IBlockSchemaOptions[] = DECOS.map(d => d.templateEditSchema)
export const TEMPLATE_RENDER_SCHEMAS: IBlockSchemaOptions[] = DECOS.map(d => d.templateRenderSchema)

/** Schema/Converter/Adapter 从同一领域注册记录收集，避免能力清单分叉。 */
export const TEMPLATE_BLOCK_ADAPTERS: readonly BlockAdapterContribution[] =
  DECOS.map(deco => deco.adapter)
export const TEMPLATE_INLINE_EMBED_ADAPTERS:
  readonly InlineEmbedAdapterContribution[] = []

/** 注入两个模板 surface 的 editor-level AdapterService。 */
export const TEMPLATE_ADAPTER_REGISTRY = createBundledAdapterRegistry({
  additionalBlocks: TEMPLATE_BLOCK_ADAPTERS,
  additionalInlineEmbeds: TEMPLATE_INLINE_EMBED_ADAPTERS,
})

/** 人员已统一为 person-card；模板域不再注册私有人员 Inline Embed。 */
export const TEMPLATE_EDIT_EMBEDS = (): [string, EmbedConverter][] => []
export const TEMPLATE_RENDER_EMBEDS = (): [string, EmbedConverter][] => []

/**
 * 物料面板条目：kind 决定插入方式（block=拖、embed=点击插行内、page-bg=点击设整页背景）。图标 svgIcon 下沉到各装饰定义。
 * 用**可辨识联合**而非「一个 kind + 两个可选字段」：flavour/name 按 kind 互斥（block 才有 flavour、embed 才有 name、
 * page-bg 两者皆无），联合让非法组合（同时有 / 同时无）在类型层就表达不出来，下游按 kind 收窄后直接读取、免 `!` 断言。
 * label/svgIcon 三态共有（面板统一 `<use #svgIcon>` 渲染，无分支）。
 */
export type Material =
  | { kind: MaterialKind.PageBg; label: string; svgIcon: string }
  | {
      kind: MaterialKind.Block
      flavour: string
      label: string
      svgIcon: string
      initMeta?: Record<string, unknown>
    }
  | {
      kind: MaterialKind.Embed
      name: string
      label: string
      svgIcon: string
      createDelta: () => DeltaInsertEmbed
    }

const EDITOR_EMBED_MATERIALS: Material[] = [
  {
    kind: MaterialKind.Embed,
    name: INLINE_DATE_EMBED_KEY,
    label: '日期(行内)',
    svgIcon: 'bc_shijianzhou-color',
    createDelta: () => createInlineDateDelta(new Date())!,
  },
  {
    kind: MaterialKind.Embed,
    name: INLINE_ICON_EMBED_KEY,
    label: '图标',
    svgIcon: 'bc_tixing-color',
    createDelta: () => ({
      insert: {[INLINE_ICON_EMBED_KEY]: 'bc_icon bc_shoucang'},
    }),
  },
]

const CANONICAL_DYNAMIC_BLOCK_MATERIALS: Material[] = [
  {
    kind: MaterialKind.Block,
    flavour: 'weather',
    label: '天气',
    svgIcon: 'tpl-weather',
    initMeta: {[draftPropMetaKey('date')]: 'createdTime'},
  },
  {
    kind: MaterialKind.Block,
    flavour: 'date-card',
    label: '日期卡片',
    svgIcon: 'bc_rili',
    initMeta: {[draftPropMetaKey('date')]: 'createdTime'},
  },
  {
    kind: MaterialKind.Block,
    flavour: 'person-card',
    label: '人员卡片',
    svgIcon: 'bc_renwukapian',
    initMeta: {[draftPropMetaKey('source')]: 'creator'},
  },
]

export const MATERIALS: Material[] = [
  // 整页：背景图（点击=选图设为整页背景，不是块）。后续「边框」等也归入此组。
  { kind: MaterialKind.PageBg, label: '背景图', svgIcon: 'bc_moban-color' },
  ...CANONICAL_DYNAMIC_BLOCK_MATERIALS,
  // Playground 自有 block/embed 的 kind 直接取注册项自带的 kind。
  ...DECOS.map(d => ({ kind: d.kind, flavour: d.def.flavour, label: d.def.label, svgIcon: d.def.svgIcon })),
  ...EDITOR_EMBED_MATERIALS,
]
