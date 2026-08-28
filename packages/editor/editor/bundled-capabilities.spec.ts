import {
  BUNDLED_EDITOR_BLOCK_MATERIAL_GROUPS,
  BUNDLED_EDITOR_SCHEMAS,
  createBundledEditorCapabilities,
  projectBundledBlockMaterials,
} from './bundled-capabilities'
import {
  BlockNodeType,
  type EmbedConverter,
  type IBlockSchemaOptions,
  type IBlockSnapshot,
} from '../framework'
import {
  createGenericBlockAdapterContribution,
  createInlineDirectiveAdapterContribution,
} from '../adapters/generic'

const customSchema: IBlockSchemaOptions = {
  ...BUNDLED_EDITOR_SCHEMAS.find(schema => schema.flavour === 'divider')!,
  flavour: 'custom-card' as BlockCraft.BlockFlavour,
  nodeType: BlockNodeType.void,
  createSnapshot: () => ({
    id: 'custom-card',
    flavour: 'custom-card' as BlockCraft.BlockFlavour,
    nodeType: BlockNodeType.void,
    props: {},
    meta: {},
    children: [],
  }) as IBlockSnapshot,
}

const customEmbed: [string, EmbedConverter] = [
  'custom-chip',
  {
    toView: () => document.createElement('span'),
    toDelta: () => ({insert: {'custom-chip': ''}}),
  },
]

const customBlockAdapters = createGenericBlockAdapterContribution({
  flavour: 'custom-card',
  nodeType: BlockNodeType.void,
  portableText: () => 'Custom card',
})

const customInlineEmbedAdapters = createInlineDirectiveAdapterContribution({
  key: 'custom-chip',
  displayText: () => 'Custom chip',
})

describe('bundled editor capabilities', () => {
  const bundledEmbedOrder = [
    'shape',
    'word-art',
    'date',
    'mention',
    'latex',
  ]

  it('keeps schema and plugin identities unique', () => {
    const capabilities = createBundledEditorCapabilities()
    const flavours = capabilities.schemaDefinitions.map(schema => schema.flavour)
    const pluginNames = capabilities.plugins.map(plugin => plugin.name)

    expect(new Set(flavours).size).toBe(flavours.length)
    expect(flavours.filter(flavour => flavour === 'callout').length).toBe(1)
    expect(new Set(pluginNames).size).toBe(pluginNames.length)
    expect(pluginNames).toContain('EmbedFrameExtensionPlugin')
    expect(pluginNames).toContain('bookmark-block-extension')
    expect(pluginNames).toContain('object-format-toolbar')
    expect(pluginNames).toContain('revision-review')
    expect(pluginNames).not.toContain('word-art-toolbar')
    expect(pluginNames).not.toContain('text-box-toolbar')
    expect(pluginNames).not.toContain('object-group-toolbar')
    expect(capabilities.embeds.map(([name]) => name))
      .toEqual(bundledEmbedOrder)
    expect(new Set(capabilities.embeds.map(([, converter]) => converter)).size)
      .toBe(capabilities.embeds.length)
  })

  it('creates fresh stateful instances for every document', () => {
    const first = createBundledEditorCapabilities()
    const second = createBundledEditorCapabilities()

    expect(first.plugins.map(plugin => plugin.name))
      .toEqual(second.plugins.map(plugin => plugin.name))
    expect(first.plugins.every((plugin, index) =>
      plugin !== second.plugins[index],
    )).toBeTrue()
    expect(first.embeds.map(([name]) => name)).toEqual(bundledEmbedOrder)
    expect(second.embeds.map(([name]) => name)).toEqual(bundledEmbedOrder)
    expect(first.embeds.every(([, converter], index) =>
      converter !== second.embeds[index][1],
    )).toBeTrue()
    expect(first.revisionReviewPlugin).not.toBe(second.revisionReviewPlugin)
    expect(first.plugins).toContain(first.revisionReviewPlugin)
  })

  it('projects only user-creatable blocks into the palette', () => {
    const materials = BUNDLED_EDITOR_BLOCK_MATERIAL_GROUPS
      .flatMap(group => group.items)
    const flavours = materials.map(material => material.flavour)

    expect(flavours).toContain('paragraph')
    expect(flavours).toContain('image')
    expect(flavours).toContain('shape')
    expect(flavours).toContain('word-art')
    expect(flavours).toContain('text-box')
    expect(flavours).not.toContain('root')
    expect(flavours).not.toContain('placement-layout')
    expect(flavours).not.toContain('object-group')
    expect(flavours).not.toContain('table-row')
    expect(flavours).not.toContain('table-cell')
    expect(flavours).not.toContain('shape-text')
    expect(projectBundledBlockMaterials()).toEqual(
      BUNDLED_EDITOR_BLOCK_MATERIAL_GROUPS,
    )
  })

  it('rejects duplicate host additions before document initialization', () => {
    expect(() => createBundledEditorCapabilities({
      additionalSchemas: [BUNDLED_EDITOR_SCHEMAS[0]],
    })).toThrowError(/Duplicate Block flavour: paragraph/)
    expect(() => createBundledEditorCapabilities({
      additionalEmbeds: [[
        'mention',
        {
          toView: () => document.createElement('span'),
          toDelta: () => ({insert: {mention: ''}}),
        },
      ]],
    })).toThrowError(/Duplicate Embed name: mention/)
  })

  it('rejects custom schemas and Embeds without matching adapter ownership', () => {
    expect(() => createBundledEditorCapabilities({
      additionalSchemas: [customSchema],
    })).toThrowError(/Missing Block adapter contribution: custom-card/)

    expect(() => createBundledEditorCapabilities({
      additionalEmbeds: [customEmbed],
    })).toThrowError(/Missing Inline Embed adapter contribution: custom-chip/)
  })

  it('composes custom schemas, Embeds, and their adapters into one registry', () => {
    const capabilities = createBundledEditorCapabilities({
      additionalSchemas: [customSchema],
      additionalEmbeds: [customEmbed],
      additionalBlockAdapters: [customBlockAdapters],
      additionalInlineEmbedAdapters: [customInlineEmbedAdapters],
    })

    expect(capabilities.schemaDefinitions).toContain(customSchema)
    expect(capabilities.embeds).toContain(customEmbed)
    expect(capabilities.adapterRegistry.blocks).toContain(customBlockAdapters)
    expect(capabilities.adapterRegistry.inlineEmbeds)
      .toContain(customInlineEmbedAdapters)
    expect(capabilities.adapterRegistry.htmlMatchersForFlavour('custom-card'))
      .toEqual(customBlockAdapters.html!)
  })

  it('derives an Embed converter from its adapter contribution factory', () => {
    const converter: EmbedConverter = {
      toView: () => document.createElement('span'),
      toDelta: () => ({insert: {'derived-chip': ''}}),
    }
    const createDomConverter = jasmine.createSpy('createDomConverter')
      .and.returnValue(converter)
    const adapters = createInlineDirectiveAdapterContribution({
      key: 'derived-chip',
      createDomConverter,
      displayText: () => 'Derived chip',
    })

    const capabilities = createBundledEditorCapabilities({
      additionalInlineEmbedAdapters: [adapters],
    })

    expect(createDomConverter).toHaveBeenCalledTimes(1)
    expect(capabilities.embeds.find(([key]) => key === 'derived-chip'))
      .toEqual(['derived-chip', converter])
    expect(capabilities.adapterRegistry.inlineEmbeds).toContain(adapters)
  })

  it('rejects adapter-only Embeds without a converter factory', () => {
    expect(() => createBundledEditorCapabilities({
      additionalInlineEmbedAdapters: [customInlineEmbedAdapters],
    })).toThrowError(/Missing Inline Embed converter: custom-chip/)
  })
})
