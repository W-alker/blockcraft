import {EDITOR_INTERACTION_PRESETS, resolveEditorInteraction as resolve} from './interaction-policy'
import {OBJECT_TOOLBAR_INTERACTION} from '../../plugins/object-format-toolbar/interaction-config'
import {IMAGE_TOOLBAR_INTERACTION} from '../../plugins/img-toolbar/interaction-config'
const resolveEditorInteraction = (config: Parameters<typeof resolve>[0]) => resolve(config, [OBJECT_TOOLBAR_INTERACTION, IMAGE_TOOLBAR_INTERACTION])

describe('editor interaction policy', () => {
  it('keeps the three existing presets and resolves plugin and native overrides independently', () => {
    expect(EDITOR_INTERACTION_PRESETS.mixed.native.hoverControls).toBeFalse()
    expect(EDITOR_INTERACTION_PRESETS.immersive.native.moveExistingBlocks).toBeFalse()
    expect(resolveEditorInteraction({preset: 'design'}).policy.plugins['objectToolbar']!['contentSelection']).toBeTrue()
    const resolved = resolveEditorInteraction({preset: 'mixed', overrides: {
      native: {moveExistingBlocks: false}, plugins: {objectToolbar: {contentSelection: true}},
    }})
    expect(resolved.policy.native.layoutControls).toBeTrue()
    expect(resolved.policy.native.moveExistingBlocks).toBeFalse()
    expect(resolved.policy.plugins['objectToolbar']!['contentSelection']).toBeTrue()
    expect(resolved.policy.plugins['imageToolbar']!['contentSelection']).toBeFalse()
    expect(EDITOR_INTERACTION_PRESETS.mixed.native.moveExistingBlocks).toBeTrue()
  })

  it('can hide object floating buttons independently of layout controls and movement', () => {
    const resolved = resolveEditorInteraction({overrides: {native: {objectFloatingHandles: false}}})
    expect(resolved.policy.native.objectFloatingHandles).toBeFalse()
    expect(resolved.policy.native.layoutControls).toBeTrue()
    expect(resolved.policy.native.moveExistingBlocks).toBeTrue()
    expect(EDITOR_INTERACTION_PRESETS.mixed.native.objectFloatingHandles).toBeTrue()
  })

  it('copies and freezes both the effective policy and overrides, without modifying caller input', () => {
    const overrides = {native: {hoverControls: true}}
    const resolved = resolveEditorInteraction({overrides})
    overrides.native.hoverControls = false
    expect(resolved.overrides.native!.hoverControls).toBeTrue()
    expect(Object.isFrozen(resolved.policy.plugins['objectToolbar'])).toBeTrue()
    expect(Object.isFrozen(resolved.overrides.native)).toBeTrue()
    expect(Object.isFrozen(overrides.native)).toBeFalse()
  })

  it('rejects misspelled fields and non-boolean values and normalizes empty groups', () => {
    for (const overrides of [{unknown: true}, {native: {hoverControl: true}},
      {native: {hoverControls: 'false'}}, {plugins: {groupToolbar: {contentSelection: true}}}]) {
      expect(() => resolveEditorInteraction({overrides} as any)).toThrowError(TypeError)
    }
    expect(() => resolveEditorInteraction({preset: '__proto__'} as any)).toThrowError(TypeError)
    expect(resolveEditorInteraction({overrides: {native: {}, plugins: {objectToolbar: {}}}}).overrides).toEqual({})
  })
})
