import { resolvePlaceholderText } from "./block-schema"
import type { BlockPlaceholderConfig } from "./block-schema"

describe('resolvePlaceholderText', () => {
  it('returns empty string when config is undefined', () => {
    expect(resolvePlaceholderText(undefined, undefined)).toBe('')
    expect(resolvePlaceholderText(undefined, 1)).toBe('')
  })

  it('returns the string when config is a plain string regardless of heading', () => {
    expect(resolvePlaceholderText('foo', undefined)).toBe('foo')
    expect(resolvePlaceholderText('foo', 1)).toBe('foo')
    expect(resolvePlaceholderText('foo', 3)).toBe('foo')
  })

  it('returns default when config has only default and no heading', () => {
    const config: BlockPlaceholderConfig = { default: 'A' }
    expect(resolvePlaceholderText(config, undefined)).toBe('A')
  })

  it('falls back to default when heading is set but no matching heading entry exists', () => {
    const config: BlockPlaceholderConfig = { default: 'A' }
    expect(resolvePlaceholderText(config, 1)).toBe('A')
    expect(resolvePlaceholderText(config, 2)).toBe('A')
  })

  it('uses heading-specific text when present', () => {
    const config: BlockPlaceholderConfig = {
      default: 'A',
      heading: { 1: 'H1', 2: 'H2' },
    }
    expect(resolvePlaceholderText(config, 1)).toBe('H1')
    expect(resolvePlaceholderText(config, 2)).toBe('H2')
  })

  it('falls back to default when heading level has no specific entry', () => {
    const config: BlockPlaceholderConfig = {
      default: 'A',
      heading: { 1: 'H1' },
    }
    expect(resolvePlaceholderText(config, 2)).toBe('A')
    expect(resolvePlaceholderText(config, 3)).toBe('A')
  })

  it('returns empty when only heading map is provided and heading does not match', () => {
    const config: BlockPlaceholderConfig = { heading: { 1: 'H1' } }
    expect(resolvePlaceholderText(config, undefined)).toBe('')
    expect(resolvePlaceholderText(config, 2)).toBe('')
  })

  it('returns heading-specific text even when default is absent', () => {
    const config: BlockPlaceholderConfig = { heading: { 1: 'H1' } }
    expect(resolvePlaceholderText(config, 1)).toBe('H1')
  })
})
