import {
  BLOCKCRAFT_BUILTIN_AGENT_CAPABILITIES,
  BLOCKCRAFT_BUILTIN_INLINE_AGENT_CAPABILITIES,
} from './builtin-agent-capabilities'

describe('built-in Inline Embed Agent capabilities', () => {
  const insertableKeys = ['date', 'icon', 'image', 'latex']
  const understandingOnlyKeys = ['mention', 'shape', 'word-art']

  it('declares each of the seven built-in embed keys exactly once', () => {
    const capabilities = BLOCKCRAFT_BUILTIN_INLINE_AGENT_CAPABILITIES
    const keys = capabilities.map(capability => capability.embedKey)

    expect(capabilities.length).toBe(7)
    expect(new Set(keys).size).toBe(keys.length)
    expect([...keys].sort()).toEqual([
      ...insertableKeys,
      ...understandingOnlyKeys,
    ].sort())
    expect(capabilities.every(capability =>
      capability.kind === 'inline-embed',
    )).toBeTrue()
  })

  it('grants insertion only to image, icon, date, and LaTeX', () => {
    const insertable = BLOCKCRAFT_BUILTIN_INLINE_AGENT_CAPABILITIES
      .filter(capability => capability.insert !== undefined)
      .map(capability => capability.embedKey)
      .sort()
    const understandingOnly = BLOCKCRAFT_BUILTIN_INLINE_AGENT_CAPABILITIES
      .filter(capability => capability.insert === undefined)
      .map(capability => capability.embedKey)
      .sort()

    expect(insertable).toEqual(insertableKeys)
    expect(understandingOnly).toEqual(understandingOnlyKeys)
  })

  it('includes the same Inline Embed declarations in the combined registry', () => {
    for (const capability of BLOCKCRAFT_BUILTIN_INLINE_AGENT_CAPABILITIES) {
      expect(BLOCKCRAFT_BUILTIN_AGENT_CAPABILITIES).toContain(capability)
    }
  })
})
