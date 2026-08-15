import {
  deriveObjectSizeFromPixels,
  BlockObjectSizingManager,
  normalizeObjectSize,
  resolveObjectDimensions,
} from './block-object-sizing.manager'

const imageCapability = {
  defaultWr: 100,
  defaultAr: 4 / 3,
}

describe('block object sizing', () => {
  it('resolves wr/ar against the current root content width', () => {
    const result = resolveObjectDimensions(
      {wr: 50, ar: 2},
      800,
      imageCapability,
    )

    expect(result).toEqual(jasmine.objectContaining({
      source: 'ratio',
      exact: true,
      wr: 50,
      ar: 2,
      width: 400,
      height: 200,
    }))
  })

  it('keeps legacy pixel dimensions until an explicit resize migrates them', () => {
    const result = resolveObjectDimensions(
      {width: 640, height: 360},
      1000,
      imageCapability,
    )

    expect(result).toEqual(jasmine.objectContaining({
      source: 'legacy',
      exact: true,
      width: 640,
      height: 360,
      ar: 640 / 360,
    }))
  })

  it('uses schema defaults for a new object before intrinsic metadata arrives', () => {
    expect(normalizeObjectSize({wr: 100}, imageCapability)).toEqual({
      source: 'ratio',
      exact: false,
      wr: 100,
      ar: 4 / 3,
    })
  })

  it('clamps width ratio and rounds migrated values', () => {
    expect(deriveObjectSizeFromPixels(240, 120, 800)).toEqual({
      wr: 30,
      ar: 2,
    })
    expect(deriveObjectSizeFromPixels(1200, 600, 800)).toEqual({
      wr: 100,
      ar: 2,
    })
  })

  it('does not resolve responsive dimensions before root width is measurable', () => {
    expect(
      resolveObjectDimensions({wr: 80, ar: 2}, 0, imageCapability),
    ).toBeNull()
  })

  it('resolves grouped ratio objects against the fixed group width', () => {
    const doc = {
      schemas: {
        get: () => ({metadata: {objectSizing: imageCapability}}),
      },
      model: {
        getParentId: (id: string) => id === 'image' ? 'group' : null,
        getProps: (id: string) => id === 'group' ? {width: 376} : {},
      },
      placement: {
        isObjectGroup: (id: string) => id === 'group',
      },
    }
    const manager = new BlockObjectSizingManager(doc as any)

    expect(manager.getReferenceWidth('image')).toBe(360)
    expect(manager.resolveForBlock('image', 'image', {wr: 50, ar: 2}))
      .toEqual(jasmine.objectContaining({width: 180, height: 90}))
  })
})
