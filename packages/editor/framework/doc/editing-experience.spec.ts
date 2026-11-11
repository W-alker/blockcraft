import {EDITOR_EXPERIENCES} from './editing-experience'
import {EditorInteractionRegistry} from './interaction-policy'
import {defineInteractionConfig} from './interaction-schema'
import {BLOCK_CONTROLLER_INTERACTION} from '../../plugins/block-controller/interaction-config'
import {TEXT_TOOLBAR_INTERACTION} from '../../plugins/float-text-toolbar/interaction-config'
import {ATTACHMENT_TOOLBAR_INTERACTION} from '../../plugins/attachment-extension/interaction-config'
import {TABLE_TOOLBAR_INTERACTION} from '../../blocks/table-block/interaction-config'
import {GROUP_TOOLBAR_INTERACTION} from '../../plugins/object-format-toolbar/interaction-config'
import {DIVIDER_TOOLBAR_INTERACTION} from '../../plugins/divider-toolbar/interaction-config'

const definitions = [BLOCK_CONTROLLER_INTERACTION, TEXT_TOOLBAR_INTERACTION,
  ATTACHMENT_TOOLBAR_INTERACTION, TABLE_TOOLBAR_INTERACTION, GROUP_TOOLBAR_INTERACTION, DIVIDER_TOOLBAR_INTERACTION]

describe('official editing experiences', () => {
  it('preserves the five existing combinations using installed declarations', () => {
    const registry = new EditorInteractionRegistry(definitions)
    expect(EDITOR_EXPERIENCES.map(item => item.id)).toEqual(['focus', 'light', 'mixed', 'layout', 'design'])
    for (const [i, item] of EDITOR_EXPERIENCES.entries()) {
      const result = registry.resolve({experience: item.id})
      const {native, plugins} = result.policy
      expect(result.experience).toBe(item.id)
      expect(result.preset).toBe(item.preset)
      expect(result.overrides).toEqual({})
      expect(native.layoutControls).toBe(i > 0)
      expect(native.objectFloatingHandles).toBe(i !== 1)
      expect(native.moveExistingBlocks).toBe(i >= 2)
      expect(native.groupOutline).toBe(i >= 2)
      expect(native.hoverControls).toBe(i === 0 || i === 4)
      expect(native.contentResizeHandles).toBe(i >= 3)
      expect(plugins['blockController']!['enabled']).toBe(i > 0)
      expect(plugins['blockController']!['hoverMenu']).toBe(i !== 1)
      expect(plugins['textToolbar']!['enabled']).toBe(i > 0)
      expect(plugins['textToolbar']!['openDelay']).toBe(i === 1 ? 650 : 350)
      expect(plugins['attachmentToolbar']!['hoverOpen']).toBeTrue()
      expect(plugins['attachmentToolbar']!['selectionOpen']).toBe(i >= 2)
      expect(plugins['tableToolbar']!['enabled']).toBe(i > 0)
      expect(plugins['tableToolbar']!['textFocus']).toBe(i !== 1)
      expect(plugins['groupToolbar']!['enabled']).toBe(i >= 2)
      expect(plugins['dividerToolbar']!['enabled']).toBe(i >= 2)
    }
  })

  it('needs no optional plugin and retains strict validation of explicit overrides', () => {
    const registry = new EditorInteractionRegistry()
    for (const item of EDITOR_EXPERIENCES) {
      expect(registry.resolve({experience: item.id}).policy.plugins).toEqual({})
    }
    expect(() => registry.resolve({experience: 'light', overrides: {plugins: {missing: {enabled: false}}}})).toThrowError(/Unregistered/)
    expect(() => registry.resolve({experience: 'typo'} as any)).toThrowError(/experience/)
    expect(() => registry.resolve({experience: 'light', preset: 'design'})).toThrowError(/conflict/)
  })

  it('allows an explicit divider toolbar override in focus and light modes', () => {
    const registry = new EditorInteractionRegistry(definitions)
    for (const experience of ['focus', 'light'] as const) {
      expect(registry.resolve({experience, overrides: {
        plugins: {dividerToolbar: {enabled: true}},
      }}).policy.plugins['dividerToolbar']!['enabled']).toBeTrue()
    }
  })

  it('applies host overrides last and keeps legacy presets independent of experience defaults', () => {
    const registry = new EditorInteractionRegistry(definitions)
    const result = registry.resolve({experience: 'light', overrides: {
      native: {moveExistingBlocks: true}, plugins: {textToolbar: {openDelay: 100}},
    }})
    expect(result.policy.native.moveExistingBlocks).toBeTrue()
    expect(result.policy.plugins['textToolbar']!['openDelay']).toBe(100)
    expect(result.policy.plugins['tableToolbar']!['textFocus']).toBeFalse()
    expect(registry.resolve({preset: 'mixed'}).policy.plugins['textToolbar']!['openDelay']).toBe(350)
    expect(registry.resolve(result)).toEqual(result)
  })

  it('lets a new plugin declare its experience without editing the catalog', () => {
    const source = {namespace: 'future', label: '新插件', fields: {delay: {
      type: 'number' as const, label: '延迟', default: 1, min: 0, presets: {mixed: 2}, experiences: {light: 3},
    }}}
    const definition = defineInteractionConfig(source)
    source.fields.delay.experiences.light = 4
    expect(Object.isFrozen(source.fields.delay.experiences)).toBeFalse()
    expect(Object.isFrozen(definition.fields.delay.experiences)).toBeTrue()
    const registry = new EditorInteractionRegistry([definition])
    expect(registry.resolve({experience: 'light'}).policy.plugins['future']!['delay']).toBe(3)
    expect(registry.resolve({experience: 'mixed'}).policy.plugins['future']!['delay']).toBe(2)
    for (const experiences of [{unknown: 3}, {light: -1}, {light: '3'}, []]) {
      expect(() => defineInteractionConfig({...source, fields: {delay: {...source.fields.delay, experiences}}} as any)).toThrowError(TypeError)
    }
  })
})
