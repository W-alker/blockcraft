import {
  BUNDLED_EDITOR_BLOCK_MATERIAL_GROUPS,
  BUNDLED_EDITOR_SCHEMAS,
  createBundledEditorCapabilities,
  projectBundledBlockMaterials,
} from './bundled-capabilities'

describe('bundled editor capabilities', () => {
  it('keeps schema and plugin identities unique', () => {
    const capabilities = createBundledEditorCapabilities()
    const flavours = capabilities.schemaDefinitions.map(schema => schema.flavour)
    const pluginNames = capabilities.plugins.map(plugin => plugin.name)

    expect(new Set(flavours).size).toBe(flavours.length)
    expect(flavours.filter(flavour => flavour === 'callout').length).toBe(1)
    expect(new Set(pluginNames).size).toBe(pluginNames.length)
    expect(pluginNames).toContain('EmbedFrameExtensionPlugin')
    expect(pluginNames).toContain('bookmark-block-extension')
    expect(pluginNames).toContain('word-art-toolbar')
  })

  it('creates fresh stateful instances for every document', () => {
    const first = createBundledEditorCapabilities()
    const second = createBundledEditorCapabilities()

    expect(first.plugins.map(plugin => plugin.name))
      .toEqual(second.plugins.map(plugin => plugin.name))
    expect(first.plugins.every((plugin, index) =>
      plugin !== second.plugins[index],
    )).toBeTrue()
    expect(first.embeds.map(([name]) => name))
      .toEqual(second.embeds.map(([name]) => name))
    expect(first.embeds.every(([, converter], index) =>
      converter !== second.embeds[index][1],
    )).toBeTrue()
  })

  it('projects only user-creatable blocks into the palette', () => {
    const materials = BUNDLED_EDITOR_BLOCK_MATERIAL_GROUPS
      .flatMap(group => group.items)
    const flavours = materials.map(material => material.flavour)

    expect(flavours).toContain('paragraph')
    expect(flavours).toContain('image')
    expect(flavours).toContain('shape')
    expect(flavours).toContain('word-art')
    expect(flavours).not.toContain('root')
    expect(flavours).not.toContain('placement-layout')
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
})
