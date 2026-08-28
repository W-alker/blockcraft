import {
  AudioBlockSchema,
  AttachmentBlockSchema,
  BookmarkBlockSchema,
  BlockquoteBlockSchema,
  BulletBlockSchema,
  CalloutBlockSchema,
  CaptionBlockSchema,
  CodeBlockSchema,
  ColumnBlockSchema,
  ColumnsBlockSchema,
  DividerBlockSchema,
  DateCardBlockSchema,
  FigmaEmbedBlockSchema,
  FormulaBlockSchema,
  ImageBlockSchema,
  PersonCardBlockSchema,
  JuejinEmbedBlockSchema,
  MermaidBlockSchema,
  MermaidTextareaBlockSchema,
  OrderedBlockSchema,
  ObjectGroupBlockSchema,
  PageDividerBlockSchema,
  ParagraphBlockSchema,
  PlacementLayoutBlockSchema,
  RenderUnitBlockSchema,
  RootBlockSchema,
  ShapeBlockSchema,
  ShapeTextBlockSchema,
  TextBoxBlockSchema,
  TableBlockSchema,
  TableCellBlockSchema,
  TableRowBlockSchema,
  TodoBlockSchema,
  VideoBlockSchema,
  WeatherBlockSchema,
  WordArtBlockSchema,
} from '../blocks'
import {
  AttachmentExtensionPlugin,
  BlockControllerPlugin,
  BlockControllerPluginOptions,
  BlockGapCreatorPlugin,
  BlockTransformerPlugin,
  BookmarkBlockExtensionPlugin,
  CalloutToolbarPlugin,
  CodeInlineEditorBinding,
  DateInlineExtensionPlugin,
  DividerExtensionPlugin,
  EmbedFrameExtensionPlugin,
  FindReplacePlugin,
  FloatTextToolbarPlugin,
  FormulaBlockExtensionPlugin,
  ImgToolbarPlugin,
  InlineLinkExtension,
  MentionPlugin,
  MentionPluginConfig,
  OrderedBlockPlugin,
  ObjectFormatToolbarPlugin,
  PaginationPlugin,
  PaginationPluginOptions,
  PasteFormatSelectorPlugin,
  PlaceholderPlugin,
  PlaceholderPluginOptions,
  RevisionReviewPlugin,
  TableBlockBinding,
  TextMarkerPlugin,
  TranslatePlugin,
  TranslatePluginOptions,
  createDefaultMentionPanel,
  mergeBlockControllerOptions,
} from '../plugins'
import {
  BlockNodeType,
  DocPlugin,
  EmbedConverter,
  IBlockSchemaOptions,
  SchemaManager,
} from '../framework'
import {
  INLINE_DATE_EMBED_KEY,
  INLINE_LATEX_EMBED_KEY,
  INLINE_MENTION_EMBED_KEY,
  INLINE_SHAPE_EMBED_KEY,
  INLINE_WORD_ART_EMBED_KEY,
} from '../embeds'
import type {
  AdapterRegistry,
  BlockAdapterContribution,
  InlineEmbedAdapterContribution,
} from '../adapters'
import {
  BUNDLED_INLINE_EMBED_ADAPTER_CONTRIBUTIONS,
  createBundledAdapterRegistry,
} from './bundled-adapter-registry'

/**
 * bundled `<block-craft-editor>` 的唯一 Block Schema 基线。
 *
 * 顺序保持原 editor.ts 注册顺序；历史上重复出现的 Callout 只保留第一次。
 * Schema 是无文档状态的静态定义，可以跨 Doc 共享。
 */
export const BUNDLED_EDITOR_SCHEMAS: readonly IBlockSchemaOptions[] = [
  ParagraphBlockSchema,
  OrderedBlockSchema,
  BulletBlockSchema,
  TodoBlockSchema,
  CalloutBlockSchema,
  CodeBlockSchema,
  DividerBlockSchema,
  PageDividerBlockSchema,
  ImageBlockSchema,
  TableBlockSchema,
  TableRowBlockSchema,
  TableCellBlockSchema,
  AttachmentBlockSchema,
  BookmarkBlockSchema,
  FigmaEmbedBlockSchema,
  JuejinEmbedBlockSchema,
  CaptionBlockSchema,
  RootBlockSchema,
  MermaidTextareaBlockSchema,
  MermaidBlockSchema,
  BlockquoteBlockSchema,
  ColumnsBlockSchema,
  ColumnBlockSchema,
  FormulaBlockSchema,
  VideoBlockSchema,
  AudioBlockSchema,
  ShapeBlockSchema,
  ShapeTextBlockSchema,
  TextBoxBlockSchema,
  WordArtBlockSchema,
  ObjectGroupBlockSchema,
  PlacementLayoutBlockSchema,
  RenderUnitBlockSchema,
  WeatherBlockSchema,
  DateCardBlockSchema,
  PersonCardBlockSchema,
]

export type BundledBlockMaterialGroupKey = 'base' | 'other' | 'embed'

export interface BundledBlockMaterial {
  flavour: BlockCraft.BlockFlavour
  nodeType: BlockNodeType
  label: string
  description?: string
  icon?: string
  svgIcon?: string
}

export interface BundledBlockMaterialGroup {
  key: BundledBlockMaterialGroupKey
  label: string
  items: readonly BundledBlockMaterial[]
}

const BUNDLED_BLOCK_GROUP_LABELS:
Record<BundledBlockMaterialGroupKey, string> = {
  base: '基础内容',
  other: '布局与媒体',
  embed: '第三方嵌入',
}

/**
 * 投影 BlockController 同款的三组可创建块。内部依附块和基础设施块只注册，
 * 不暴露为用户物料；paragraph 在右侧面板中保留，方便显式插入普通正文。
 */
export function projectBundledBlockMaterials(
  schemas: readonly IBlockSchemaOptions[] = BUNDLED_EDITOR_SCHEMAS,
): readonly BundledBlockMaterialGroup[] {
  const groups = new Map<BundledBlockMaterialGroupKey, BundledBlockMaterial[]>([
    ['base', []],
    ['other', []],
    ['embed', []],
  ])

  for (const schema of schemas) {
    if (
      schema.flavour === 'root' ||
      schema.metadata.isLeaf ||
      schema.metadata.hideInInsertMenu
    ) {
      continue
    }
    const key: BundledBlockMaterialGroupKey =
      schema.flavour.endsWith('-embed')
        ? 'embed'
        : schema.nodeType === BlockNodeType.editable
          ? 'base'
          : 'other'
    groups.get(key)!.push({
      flavour: schema.flavour,
      nodeType: schema.nodeType,
      label: schema.metadata.label,
      ...(schema.metadata.description
        ? {description: schema.metadata.description}
        : {}),
      ...(schema.metadata.icon ? {icon: schema.metadata.icon} : {}),
      ...(schema.metadata.svgIcon
        ? {svgIcon: schema.metadata.svgIcon}
        : {}),
    })
  }

  return [...groups].map(([key, items]) => ({
    key,
    label: BUNDLED_BLOCK_GROUP_LABELS[key],
    items,
  }))
}

export const BUNDLED_EDITOR_BLOCK_MATERIAL_GROUPS =
  projectBundledBlockMaterials()

export interface BundledEditorCapabilityOptions {
  additionalSchemas?: readonly IBlockSchemaOptions[]
  additionalEmbeds?: readonly [string, EmbedConverter][]
  /** Adapter ownership paired with `additionalSchemas`. */
  additionalBlockAdapters?: readonly BlockAdapterContribution[]
  /** Adapter ownership paired with `additionalEmbeds`. */
  additionalInlineEmbedAdapters?: readonly InlineEmbedAdapterContribution[]
  mention?: MentionPluginConfig
  translate?: TranslatePluginOptions
  blockController?: BlockControllerPluginOptions
  placeholder?: PlaceholderPluginOptions
  pagination?: PaginationPluginOptions
  openLink?: (link: string) => void
}

export interface BundledEditorCapabilities {
  schemas: SchemaManager
  schemaDefinitions: readonly IBlockSchemaOptions[]
  embeds: readonly [string, EmbedConverter][]
  adapterRegistry: AdapterRegistry
  plugins: readonly DocPlugin[]
  blockMaterials: readonly BundledBlockMaterialGroup[]
  paginationPlugin: PaginationPlugin
  revisionReviewPlugin: RevisionReviewPlugin
  translatePlugin: TranslatePlugin
}

function assertUnique(
  kind: 'Block flavour' | 'Embed name' | 'Plugin name',
  names: readonly string[],
): void {
  const seen = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) {
      throw new Error(`Duplicate ${kind}: ${name}`)
    }
    seen.add(name)
  }
}

export function validateBundledEditorCapabilities(input: {
  schemas: readonly IBlockSchemaOptions[]
  embeds: readonly [string, EmbedConverter][]
  plugins: readonly DocPlugin[]
  adapterRegistry?: AdapterRegistry
}): void {
  assertUnique('Block flavour', input.schemas.map(schema => schema.flavour))
  assertUnique('Embed name', input.embeds.map(([name]) => name))
  assertUnique('Plugin name', input.plugins.map(plugin => plugin.name))

  if (!input.adapterRegistry) return
  const blockFlavours = new Set(
    input.adapterRegistry.blocks.flatMap(contribution => contribution.flavours),
  )
  const inlineEmbedKeys = new Set(
    input.adapterRegistry.inlineEmbeds.map(contribution => contribution.key),
  )
  const missingBlocks = input.schemas
    .map(schema => schema.flavour)
    .filter(flavour => !blockFlavours.has(flavour))
  const missingEmbeds = input.embeds
    .map(([name]) => name)
    .filter(name => !inlineEmbedKeys.has(name))

  if (missingBlocks.length) {
    throw new Error(
      `Missing Block adapter contribution: ${missingBlocks.join(', ')}`,
    )
  }
  if (missingEmbeds.length) {
    throw new Error(
      `Missing Inline Embed adapter contribution: ${missingEmbeds.join(', ')}`,
    )
  }
}

function createBundledInlineEmbeds(): [string, EmbedConverter][] {
  const orderedKeys = [
    INLINE_SHAPE_EMBED_KEY,
    INLINE_WORD_ART_EMBED_KEY,
    INLINE_DATE_EMBED_KEY,
    INLINE_MENTION_EMBED_KEY,
    INLINE_LATEX_EMBED_KEY,
  ]
  return orderedKeys.map(key => {
    const contribution = BUNDLED_INLINE_EMBED_ADAPTER_CONTRIBUTIONS.find(
      item => item.key === key,
    )
    if (!contribution?.createDomConverter) {
      throw new Error(`Missing bundled Inline Embed converter factory: ${key}`)
    }
    return [key, contribution.createDomConverter()]
  })
}

function createFallbackMentionConfig(): MentionPluginConfig {
  return {
    panel: createDefaultMentionPanel({
      request: async () => ({list: []}),
    }),
  }
}

/**
 * 为一个 Doc 创建完整 bundled 能力。Plugin 与 converter 每次调用都重新创建，
 * 禁止在多个 Doc/surface 之间复用带状态实例。
 */
export function createBundledEditorCapabilities(
  options: BundledEditorCapabilityOptions = {},
): BundledEditorCapabilities {
  const translatePlugin = new TranslatePlugin(options.translate)
  const paginationPlugin = new PaginationPlugin(options.pagination)
  const revisionReviewPlugin = new RevisionReviewPlugin()
  const blockControllerPlugin = new BlockControllerPlugin(
    mergeBlockControllerOptions(
      options.blockController,
      translatePlugin.createBlockControllerOptions(),
    ),
  )
  const schemaDefinitions = [
    ...BUNDLED_EDITOR_SCHEMAS,
    ...(options.additionalSchemas ?? []),
  ]
  const explicitAdditionalEmbeds = options.additionalEmbeds ?? []
  const explicitAdditionalEmbedKeys = new Set(
    explicitAdditionalEmbeds.map(([key]) => key),
  )
  const missingAdditionalEmbedConverters = (
    options.additionalInlineEmbedAdapters ?? []
  ).filter(contribution => (
    !contribution.createDomConverter
    && !explicitAdditionalEmbedKeys.has(contribution.key)
  ))
  if (missingAdditionalEmbedConverters.length) {
    throw new Error(
      `Missing Inline Embed converter: ${missingAdditionalEmbedConverters
        .map(contribution => contribution.key)
        .join(', ')}`,
    )
  }
  const derivedAdditionalEmbeds = (
    options.additionalInlineEmbedAdapters ?? []
  ).flatMap(contribution => {
    if (
      explicitAdditionalEmbedKeys.has(contribution.key)
      || !contribution.createDomConverter
    ) {
      return []
    }
    return [[
      contribution.key,
      contribution.createDomConverter(),
    ] satisfies [string, EmbedConverter]]
  })
  const embeds = [
    ...createBundledInlineEmbeds(),
    ...explicitAdditionalEmbeds,
    ...derivedAdditionalEmbeds,
  ] as [string, EmbedConverter][]
  const adapterRegistry = createBundledAdapterRegistry({
    additionalBlocks: options.additionalBlockAdapters,
    additionalInlineEmbeds: options.additionalInlineEmbedAdapters,
  })
  const plugins: DocPlugin[] = [
    new OrderedBlockPlugin(),
    new CodeInlineEditorBinding(),
    new FloatTextToolbarPlugin(),
    new BlockTransformerPlugin(),
    blockControllerPlugin,
    new TableBlockBinding(),
    new PasteFormatSelectorPlugin(),
    new PlaceholderPlugin(options.placeholder),
    revisionReviewPlugin,
    new ObjectFormatToolbarPlugin(),
    new ImgToolbarPlugin(),
    new CalloutToolbarPlugin(),
    new AttachmentExtensionPlugin(),
    new EmbedFrameExtensionPlugin(),
    new BookmarkBlockExtensionPlugin(),
    new FormulaBlockExtensionPlugin(),
    new DateInlineExtensionPlugin(),
    new InlineLinkExtension(options.openLink),
    new MentionPlugin(options.mention ?? createFallbackMentionConfig()),
    new DividerExtensionPlugin(),
    new FindReplacePlugin(),
    translatePlugin,
    new BlockGapCreatorPlugin(),
    paginationPlugin,
    new TextMarkerPlugin([], ['code', 'mermaid-textarea']),
  ]

  validateBundledEditorCapabilities({
    schemas: schemaDefinitions,
    embeds,
    plugins,
    adapterRegistry,
  })

  return {
    schemas: new SchemaManager(schemaDefinitions),
    schemaDefinitions,
    embeds,
    adapterRegistry,
    plugins,
    blockMaterials: BUNDLED_EDITOR_BLOCK_MATERIAL_GROUPS,
    paginationPlugin,
    revisionReviewPlugin,
    translatePlugin,
  }
}
