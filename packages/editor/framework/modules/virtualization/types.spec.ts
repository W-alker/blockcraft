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
    expect(first.idlePrefetch).toBeFalse()
    expect(first).not.toBe(DEFAULT_VIRTUALIZATION_CONFIG)
    expect(second).not.toBe(first)
    expect(second.estimatedHeights).not.toBe(first.estimatedHeights)
  })

  it('preserves enabled and fills omitted fields from defaults', () => {
    expect(resolveVirtualizationConfig({enabled: true})).toEqual({
      enabled: true,
      idlePrefetch: false,
      overscanViewports: 1,
      segmentMergeGap: 2,
      retainedViewLimit: 12,
      estimatedHeights: {},
      resolveViewRetention: undefined,
    })
  })

  it('preserves an explicit idle-prefetch opt-in', () => {
    expect(resolveVirtualizationConfig({idlePrefetch: true}).idlePrefetch)
      .toBeTrue()
  })

  it('normalizes numeric fields while preserving fractional viewport overscan', () => {
    const config = resolveVirtualizationConfig({
      enabled: true,
      overscanViewports: 1.5,
      segmentMergeGap: -3,
      retainedViewLimit: -4,
    })

    expect(config.overscanViewports).toBe(1.5)
    expect(config.segmentMergeGap).toBe(0)
    expect(config.retainedViewLimit).toBe(0)
  })

  it('clamps negative viewport overscan to zero', () => {
    expect(resolveVirtualizationConfig({overscanViewports: -1.8}).overscanViewports)
      .toBe(0)
  })

  it('falls back when numeric fields are not finite', () => {
    const config = resolveVirtualizationConfig({
      enabled: true,
      overscanViewports: Number.NaN,
      segmentMergeGap: Number.POSITIVE_INFINITY,
      retainedViewLimit: Number.NaN,
    })

    expect(config.overscanViewports).toBe(DEFAULT_VIRTUALIZATION_CONFIG.overscanViewports)
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
