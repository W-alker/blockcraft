import {ObjectGroupBlockSchema} from './index'

describe('ObjectGroupBlockSchema', () => {
  it('normalizes fixed geometry and stays an internal absolute-only container', () => {
    const snapshot = ObjectGroupBlockSchema.createSnapshot({
      width: 420,
      height: 180,
    })

    expect(snapshot.props).toEqual({width: 420, height: 180})
    expect(snapshot.children).toEqual([])
    expect(ObjectGroupBlockSchema.metadata.hideInInsertMenu).toBeTrue()
    expect(ObjectGroupBlockSchema.metadata.placement?.modes).toEqual(['absolute'])
    expect(ObjectGroupBlockSchema.metadata.excludeChildren).toContain('object-group')
    expect(
      ObjectGroupBlockSchema.metadata.virtualization?.estimateHeight?.({
        props: snapshot.props,
      } as any),
    ).toBe(180)
  })
})
