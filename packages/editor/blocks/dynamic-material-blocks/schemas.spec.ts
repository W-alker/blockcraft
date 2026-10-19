import {DateCardBlockSchema, PersonCardBlockSchema, WeatherBlockSchema} from './schemas'
import {DATE_CARD_TEMPLATE} from './date-card/date-card-render.component'
import {PERSON_CARD_TEMPLATE} from './person-card/person-card-render.component'
import {WEATHER_CHIP_TEMPLATE} from './weather/weather-render.component'

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

  it('declares the visible material surfaces as selectable block frames', () => {
    for (const schema of [WeatherBlockSchema, DateCardBlockSchema, PersonCardBlockSchema]) {
      expect(schema.metadata.selectionInteraction).toEqual({frame: 'selectable'})
    }

    for (const template of [WEATHER_CHIP_TEMPLATE, DATE_CARD_TEMPLATE, PERSON_CARD_TEMPLATE]) {
      expect(template).toContain('data-bc-selection-interaction-frame')
    }
  })
})
