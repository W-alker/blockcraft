import {DateCardBlockSchema, PersonCardBlockSchema, WeatherBlockSchema} from './schemas'

describe('canonical dynamic material schemas', () => {
  it('registers one real flavour per block type', () => {
    expect([
      WeatherBlockSchema.flavour,
      DateCardBlockSchema.flavour,
      PersonCardBlockSchema.flavour,
    ]).toEqual(['weather', 'date-card', 'person-card'])
  })

  it('creates geometry-only snapshots without template configuration in props', () => {
    for (const schema of [WeatherBlockSchema, DateCardBlockSchema, PersonCardBlockSchema]) {
      const snapshot = schema.createSnapshot()
      expect(snapshot.flavour).toBe(schema.flavour)
      expect(snapshot.props['width']).toBeGreaterThan(0)
      expect(snapshot.props['height']).toBeGreaterThan(0)
      expect(snapshot.props['style']).toBeUndefined()
      expect(snapshot.props['date']).toBeUndefined()
      expect(snapshot.meta).toEqual({})
    }
  })
})
