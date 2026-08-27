import '../flavours'                                  // 顶部 import 触发 declare global 增强（flavours.ts 在上一级）
import {
  createInlineDateDelta,
  DeltaInsertEmbed,
  EmbedConverter,
  IBlockSchemaOptions,
  INLINE_DATE_EMBED_KEY,
  INLINE_ICON_EMBED_KEY,
} from '@ccc/blockcraft'
import { DecoRegistration } from './deco.types'
import { TemplateData } from '../data/template-data'
import { MaterialKind } from './deco.category'
import { WeatherDeco } from '../decos/weather/weather.deco'
import { LogoDeco } from '../decos/logo/logo.deco'
import {
  AvatarInlineEmbed,
  type EmbedRegistration,
} from '../embeds'

/** void 装饰清单（占位 vs 渲染双组件，走 defineDeco）：加一个就往这数组加一行。 */
export const DECOS: DecoRegistration[] = [WeatherDeco, LogoDeco]
/** 模板域自有的 Inline Embed；日期、图标直接复用 editor 的内置 converter。 */
export const EMBEDS: EmbedRegistration[] = [AvatarInlineEmbed]

/** 动态 Block 的两套 Schema；标准 placement-layout 已由 bundled 清单注册。 */
export const TEMPLATE_EDIT_SCHEMAS: IBlockSchemaOptions[] = DECOS.map(d => d.templateEditSchema)
export const TEMPLATE_RENDER_SCHEMAS: IBlockSchemaOptions[] = DECOS.map(d => d.templateRenderSchema)

/** 只有模板域自有 Embed 需要追加到 bundled editor。 */
export const TEMPLATE_EDIT_EMBEDS = (): [string, EmbedConverter][] => EMBEDS.map(e => e.templateEdit())
export const TEMPLATE_RENDER_EMBEDS = (data: TemplateData): [string, EmbedConverter][] => EMBEDS.map(e => e.templateRender(data))

/**
 * 物料面板条目：kind 决定插入方式（block=拖、embed=点击插行内、page-bg=点击设整页背景）。图标 svgIcon 下沉到各装饰定义。
 * 用**可辨识联合**而非「一个 kind + 两个可选字段」：flavour/name 按 kind 互斥（block 才有 flavour、embed 才有 name、
 * page-bg 两者皆无），联合让非法组合（同时有 / 同时无）在类型层就表达不出来，下游按 kind 收窄后直接读取、免 `!` 断言。
 * label/svgIcon 三态共有（面板统一 `<use #svgIcon>` 渲染，无分支）。
 */
export type Material =
  | { kind: MaterialKind.PageBg; label: string; svgIcon: string }
  | { kind: MaterialKind.Block; flavour: string; label: string; svgIcon: string }
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

export const MATERIALS: Material[] = [
  // 整页：背景图（点击=选图设为整页背景，不是块）。后续「边框」等也归入此组。
  { kind: MaterialKind.PageBg, label: '背景图', svgIcon: 'bc_moban-color' },
  // block/embed 的 kind 直接取注册项自带的 kind（DecoRegistration→Block、EmbedRegistration→Embed），不再硬编码
  ...DECOS.map(d => ({ kind: d.kind, flavour: d.def.flavour, label: d.def.label, svgIcon: d.def.svgIcon })),
  ...EMBEDS.map(e => ({
    kind: e.kind,
    name: e.def.name,
    label: e.def.label,
    svgIcon: e.def.svgIcon,
    createDelta: (): DeltaInsertEmbed => ({insert: {[e.def.name]: ''}}),
  })),
  ...EDITOR_EMBED_MATERIALS,
]
