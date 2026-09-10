import {OrderedBlockSchema} from './index'

describe('OrderedBlockSchema', () => {
  it('inherits a valid marker style without inheriting counter state', () => {
    const snapshot = OrderedBlockSchema.createSnapshot('item', {
      depth: 1,
      ms: 'r2',
      order: 12,
      start: 13,
      continuePrevious: true,
    })

    expect(snapshot.props).toEqual(jasmine.objectContaining({
      depth: 1,
      order: 0,
      ms: 'r2',
    }))
    expect(snapshot.props['start']).toBeUndefined()
    expect(snapshot.props['continuePrevious']).toBeUndefined()
  })

  it('drops unknown marker style ids', () => {
    const snapshot = OrderedBlockSchema.createSnapshot('', {
      ms: 'future-style',
    })
    expect(snapshot.props['ms']).toBeUndefined()
  })
})
