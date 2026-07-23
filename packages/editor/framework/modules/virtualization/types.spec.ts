import {
  DEFAULT_VIRTUALIZATION_CONFIG,
  resolveVirtualizationConfig,
} from './types'

describe('resolveVirtualizationConfig', () => {
  it('returns a fresh disabled config when no options are provided', () => {
    const first = resolveVirtualizationConfig(undefined)
    const second = resolveVirtualizationConfig(undefined)

    expect(first).toEqual(DEFAULT_VIRTUALIZATION_CONFIG)
    expect(first.enabled).toBeFalse()
    expect(first).not.toBe(DEFAULT_VIRTUALIZATION_CONFIG)
    expect(second).not.toBe(first)
    expect(second.estimatedHeights).not.toBe(first.estimatedHeights)
  })

  it('preserves enabled and fills omitted fields from defaults', () => {
    expect(resolveVirtualizationConfig({enabled: true})).toEqual({
      enabled: true,
      overscan: 5,
      segmentMergeGap: 2,
      retainedViewLimit: 12,
      estimatedHeights: {},
      resolveViewRetention: undefined,
    })
  })

  it('clamps numeric fields to safe integer minimums', () => {
    const config = resolveVirtualizationConfig({
      enabled: true,
      overscan: 1.8,
      segmentMergeGap: -3,
      retainedViewLimit: -4,
    })

    expect(config.overscan).toBe(2)
    expect(config.segmentMergeGap).toBe(0)
    expect(config.retainedViewLimit).toBe(0)
  })

  it('falls back when numeric fields are not finite', () => {
    const config = resolveVirtualizationConfig({
      enabled: true,
      overscan: Number.NaN,
      segmentMergeGap: Number.POSITIVE_INFINITY,
      retainedViewLimit: Number.NaN,
    })

    expect(config.overscan).toBe(DEFAULT_VIRTUALIZATION_CONFIG.overscan)
    expect(config.segmentMergeGap).toBe(DEFAULT_VIRTUALIZATION_CONFIG.segmentMergeGap)
    expect(config.retainedViewLimit).toBe(DEFAULT_VIRTUALIZATION_CONFIG.retainedViewLimit)
  })

  it('copies height overrides so host mutation cannot alter resolved config', () => {
    const estimatedHeights = {paragraph: 48}
    const config = resolveVirtualizationConfig({
      enabled: true,
      estimatedHeights,
    })

    estimatedHeights.paragraph = 12

    expect(config.estimatedHeights['paragraph']).toBe(48)
  })

  it('preserves the host view-retention resolver by identity', () => {
    const resolveViewRetention = jasmine.createSpy('resolveViewRetention')
    const config = resolveVirtualizationConfig({resolveViewRetention})

    expect(config.resolveViewRetention).toBe(resolveViewRetention)
  })
})
