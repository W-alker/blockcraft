import '../flavours'                                  // 顶部 import 触发 declare global 增强（flavours.ts 在上一级）
import { IBlockSchemaOptions, EmbedConverter } from '@ccc/blockcraft'
import { DecoRegistration } from './deco.types'
import { EmbedRegistration, DocRef } from './define-embed'
import { TemplateData } from '../data/template-data'
import { MaterialKind } from './deco.category'
import { WeatherDeco } from '../decos/weather/weather.deco'
import { LogoDeco } from '../decos/logo/logo.deco'
import { createTemplateLayoutSchema } from './layout.block'
import { DateInlineEmbed } from '../embeds/date-inline.embed'
import { AvatarInlineEmbed } from '../embeds/avatar-inline.embed'
import { IconInlineEmbed } from '../embeds/icon-inline.embed'
import { ImageInlineEmbed } from '../embeds/image-inline.embed'

/** void 装饰清单（占位 vs 渲染双组件，走 defineDeco）：加一个就往这数组加一行。 */
export const DECOS: DecoRegistration[] = [WeatherDeco, LogoDeco]
/** 行内 embed 清单（随文）：人员、行内日期、图标（可设大小）、随文图片。 */
export const EMBEDS: EmbedRegistration[] = [AvatarInlineEmbed, DateInlineEmbed, IconInlineEmbed, ImageInlineEmbed]

/** layout 容器 schema：白名单自动跟随 DECOS 注册表（加物料零手改，见 layout.block.ts 工厂注释）。 */
const TEMPLATE_LAYOUT_SCHEMA = createTemplateLayoutSchema(DECOS.map(d => d.def.flavour))

/** block 两套 schema（SchemaManager）注册信息。
 *  layout 悬浮层容器编辑/使用两套共用同一 schema（只装子物料、不分编辑/渲染态）。 */
export const TEMPLATE_EDIT_SCHEMAS: IBlockSchemaOptions[] = [...DECOS.map(d => d.templateEditSchema), TEMPLATE_LAYOUT_SCHEMA]
export const TEMPLATE_RENDER_SCHEMAS: IBlockSchemaOptions[] = [...DECOS.map(d => d.templateRenderSchema), TEMPLATE_LAYOUT_SCHEMA]

/** embed 两套 [name, converter][]（喂给 surface 的 embeds）。docRef 懒取本 surface 的 doc，供 icon embed 改大小写回 Y.Text。 */
export const TEMPLATE_EDIT_EMBEDS = (docRef: DocRef): [string, EmbedConverter][] => EMBEDS.map(e => e.templateEdit(docRef))
export const TEMPLATE_RENDER_EMBEDS = (data: TemplateData, docRef: DocRef): [string, EmbedConverter][] => EMBEDS.map(e => e.templateRender(data, docRef))

/**
 * 物料面板条目：kind 决定插入方式（block=拖、embed=点击插行内、page-bg=点击设整页背景）。图标 svgIcon 下沉到各装饰定义。
 * 用**可辨识联合**而非「一个 kind + 两个可选字段」：flavour/name 按 kind 互斥（block 才有 flavour、embed 才有 name、
 * page-bg 两者皆无），联合让非法组合（同时有 / 同时无）在类型层就表达不出来，下游按 kind 收窄后直接读取、免 `!` 断言。
 * label/svgIcon 三态共有（面板统一 `<use #svgIcon>` 渲染，无分支）。
 */
export type Material =
  | { kind: MaterialKind.PageBg; label: string; svgIcon: string }
  | { kind: MaterialKind.Block; flavour: string; label: string; svgIcon: string }
  | { kind: MaterialKind.Embed; name: string; label: string; svgIcon: string }
export const MATERIALS: Material[] = [
  // 整页：背景图（点击=选图设为整页背景，不是块）。后续「边框」等也归入此组。
  { kind: MaterialKind.PageBg, label: '背景图', svgIcon: 'bc_moban-color' },
  // block/embed 的 kind 直接取注册项自带的 kind（DecoRegistration→Block、EmbedRegistration→Embed），不再硬编码
  ...DECOS.map(d => ({ kind: d.kind, flavour: d.def.flavour, label: d.def.label, svgIcon: d.def.svgIcon })),
  ...EMBEDS.map(e => ({ kind: e.kind, name: e.def.name, label: e.def.label, svgIcon: e.def.svgIcon })),
]
