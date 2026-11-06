import {BORDER_LOOKS, defineBorderConfigs, splitBorder} from './kernel/material-border.util'
import {DEFAULT_MATERIAL_COLOR, defineColorConfig, onColorFor} from './kernel/material-color.util'
import {DATE_FORMATS, showsWeek, showsYear} from './date-card/date-card-format.util'
import {DATE_CARD_STYLES} from './date-card/date-card.styles'
import {
  AVATAR_SHAPES,
  AVATAR_SIZES,
  DEPT_DISPLAY,
  avatarRadiusOf,
  avatarScaleOf,
  showsDept,
  viewOf,
} from './person-card/person-card-view.util'
import {PERSON_CARD_STYLES} from './person-card/person-card.styles'
import {LIVE_ANCHOR, readFrozenWeather} from './weather/weather-anchor.const'
import {DocWeatherService, type DocWeatherQuery} from '../../framework'

describe('dynamic material presentation primitives', () => {
  it('keeps style registries as the source of their config options and default size', () => {
    for (const styles of [DATE_CARD_STYLES, PERSON_CARD_STYLES]) {
      expect(styles.config.options.map(option => option.value)).toEqual(styles.all.map(style => style.id))
      expect(styles.defaultSize.width).toBeGreaterThan(0)
      expect(styles.defaultSize.height).toBeGreaterThan(0)
      expect(styles.resolve('removed-style').id).toBe(styles.config.default)
    }
  })

  it('normalizes date-card content variants', () => {
    expect(showsWeek(DATE_FORMATS.Full)).toBeTrue()
    expect(showsWeek(DATE_FORMATS.NoWeek)).toBeFalse()
    expect(showsYear(DATE_FORMATS.Min)).toBeFalse()
    expect(showsWeek('removed-format')).toBeTrue()
  })

  it('provides stable color and border configuration contracts', () => {
    expect(defineColorConfig().default).toBe(DEFAULT_MATERIAL_COLOR)
    expect(defineBorderConfigs().map(config => config.key)).toEqual(['bw', 'bc'])
    expect(splitBorder(BORDER_LOOKS.Dashed)).toEqual({bw: '2px', bs: 'dashed'})
    expect(onColorFor('#ffffff')).toBe('#1f2329')
    expect(onColorFor('#000000')).toBe('#fff')
  })

  it('projects neutral person display data without knowing host identities', () => {
    expect(avatarRadiusOf(AVATAR_SHAPES.Rounded)).toBe('22%')
    expect(avatarScaleOf(AVATAR_SIZES.Large)).toBe('1.25')
    expect(showsDept(DEPT_DISPLAY.On)).toBeTrue()
    const resolved = viewOf({name: '张明', pinyin: 'ZHANG MING', description: '研发部'}, true)
    expect(resolved.name).toBe('张明')
    expect(resolved.pinyin).toBe('ZHANG MING')
    expect(resolved.desc).toBe('研发部')
    expect(resolved.placeholder).toBeFalse()
    const placeholder = viewOf(null, false)
    expect(placeholder.name).toBe('文档创建人')
    expect(placeholder.placeholder).toBeTrue()
  })

  it('validates frozen weather and falls back unknown tone safely', () => {
    expect(readFrozenWeather({tone: 'unknown', temp: 30, condition: '晴'})).toEqual({
      tone: 'sunny', temp: 30, condition: '晴', location: '', high: 30, low: 30,
    })
    expect(readFrozenWeather({temp: '30', condition: '晴'})).toBeNull()
  })

  it('keeps live and fixed weather queries explicit at the host service boundary', async () => {
    class WeatherService extends DocWeatherService {
      override query = async (request?: DocWeatherQuery) => ({
        tone: 'sunny' as const,
        temp: 20,
        condition: request?.date ?? 'live',
        location: 'Hangzhou',
        high: 24,
        low: 16,
      })
    }
    const service = new WeatherService()
    await expectAsync(service.query({date: '2026-08-28'})).toBeResolvedTo(
      jasmine.objectContaining({condition: '2026-08-28'})
    )
    expect(LIVE_ANCHOR).toBe('live')
  })
})
