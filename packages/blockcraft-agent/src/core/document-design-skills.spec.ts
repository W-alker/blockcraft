import {BLOCKCRAFT_BUILTIN_AGENT_EXTENSION} from './builtin-block-capabilities'
import {DocumentAgentExtensionRegistry} from './host-extension'
import {BLOCKCRAFT_DOCUMENT_DESIGN_SKILLS} from './document-design-skills.generated'

const entryId = 'blockcraft.skill.document-design'
const scope = {registeredBlockFlavours: ['paragraph'], registeredInlineEmbedKeys: []}

describe('内置文档设计技能', () => {
  it('小能力宿主可发现轻量技能摘要，不把指南正文塞进每次上下文', () => {
    const registry = new DocumentAgentExtensionRegistry([BLOCKCRAFT_BUILTIN_AGENT_EXTENSION])
    const manifest = registry.createRuntimeManifest(undefined, scope)
    const skills = manifest.capabilityDirectory.filter(item => item.kind === 'skill')
    expect(skills.length).toBe(5)
    expect(new Set(skills.map(item => item.id)).size).toBe(5)
    expect(skills.every(item => item.effects.length === 0)).toBeTrue()
    expect(skills.every(item => !('instructions' in item) && !('capabilityIds' in item))).toBeTrue()
    expect(JSON.stringify(skills).length).toBeLessThan(2500)
    const entry = registry.getCapability(entryId, scope)
    expect(entry?.kind).toBe('skill')
    if (entry?.kind !== 'skill') throw new Error('missing skill')
    expect(entry.instructions).toBeTruthy()
    expect(entry.capabilityIds?.length).toBe(4)
    for (const id of entry.capabilityIds ?? []) {
      const guide = registry.getCapability(id, scope)
      expect(guide?.kind).toBe('skill')
      if (guide?.kind !== 'skill') throw new Error('missing guide')
      expect(guide.instructions).toBeTruthy()
    }
  })

  it('阅读技能不开放未注册的对象或行内能力，不成为可执行写工具', () => {
    const registry = new DocumentAgentExtensionRegistry([BLOCKCRAFT_BUILTIN_AGENT_EXTENSION])
    for (const skill of BLOCKCRAFT_DOCUMENT_DESIGN_SKILLS) {
      expect(registry.getCapability(skill.id, scope)).toBe(skill)
      expect(registry.hasTool(skill.id)).toBeFalse()
    }
    expect(registry.getCapability('blockcraft.block.text-box', scope)).toBeNull()
    expect(registry.getCapability('blockcraft.inline-embed.date', scope)).toBeNull()
    expect(registry.getCapability('blockcraft.block.paragraph', scope)?.kind).toBe('block')
  })

  it('宿主自有技能与内置技能并存，卸载仅移除对应扩展', () => {
    const registry = new DocumentAgentExtensionRegistry()
    const unregister = registry.register(BLOCKCRAFT_BUILTIN_AGENT_EXTENSION)
    registry.register({id: 'host.notes', version: '1', description: 'host notes', capabilities: [
      {id: 'host.notes.design', kind: 'skill', title: '业务模板', description: '业务约束', instructions: '保留业务字段。'},
    ]})
    expect(registry.getCapabilityDirectory(scope).filter(item => item.kind === 'skill').length).toBe(6)
    unregister()
    expect(registry.getCapability(entryId)).toBeNull()
    expect(registry.getCapability('host.notes.design')?.kind).toBe('skill')
  })
})
