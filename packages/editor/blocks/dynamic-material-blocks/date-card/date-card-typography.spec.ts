import {dateCardFonts, storeDateCardFont} from './date-card-typography'
import {readDateCardLook} from './date-card-look.util'
import {projectDraftProps} from '../draft-props'
import {DATE_CARD_WATCHED_PROPS} from './date-card-render.component'

describe('日期卡片字体与分样式字号', () => {
  it('默认值保持原设计，异常尺寸逐项回退', () => {
    expect(dateCardFonts('calendar', {}).map(f => f.size)).toEqual([48, 16, 13.8])
    expect(dateCardFonts('calendar', {fsCalendar: '- Infinity -2'}).map(f => f.size)).toEqual([48, 16, 13.8])
    expect(dateCardFonts('missing', {}).map(f => f.size)).toEqual([48, 16, 13.8])
    expect(dateCardFonts('toString', {}).map(f => f.size)).toEqual([48, 16, 13.8])
  })
  it('只写当前样式的非默认字号，恢复不影响其他样式', () => {
    expect(storeDateCardFont('calendar', {}, 'primary', 18.1234)).toEqual({fsCalendar: '- 18.12'})
    expect(storeDateCardFont('calendar', {fsCalendar: '30'}, 'day', 48)).toEqual({fsCalendar: null})
    expect(dateCardFonts('square', {fsCalendar: '30'}).map(f => f.size)).toEqual([47.6, 15.4, 15.4])
    expect(storeDateCardFont('calendar', {}, 'day', NaN)).toEqual({})
    expect(storeDateCardFont('calendar', {}, 'day', -1)).toEqual({})
    expect(storeDateCardFont('calendar', {}, 'day', 512 / 0.5)).toEqual({fsCalendar: '1024'})
    expect(dateCardFonts('calendar', {fsCalendar: '1024'})[0].size * 0.5).toBe(512)
  })
  it('格式切换仅隐藏对应控件，不丢字号', () => {
    expect(dateCardFonts('calendar', {}, 'min').map(f => f.visible)).toEqual([true, true, false])
    expect(dateCardFonts('banner', {}, 'noWeek').map(f => f.visible)).toEqual([true, true, true])
    expect(dateCardFonts('flip', {fsFlip: '- - 15'}, 'noWeek')[2]).toEqual(jasmine.objectContaining({size: 15, visible: false}))
    expect(dateCardFonts('flip', {fsFlip: '- - 15'}, 'full')[2]).toEqual(jasmine.objectContaining({size: 15, visible: true}))
  })
  it('模板 draft 与正式 props 使用相同的字体和字号投影', () => {
    const props = projectDraftProps({style: 'calendar', ff: 'sans'}, {'draft:ff': 'serif', 'draft:fsCalendar': '36'}, DATE_CARD_WATCHED_PROPS)
    expect(readDateCardLook(props)).toEqual(jasmine.objectContaining({fontSizes: {day: 36, primary: 16, secondary: 13.8}}))
    expect(readDateCardLook(props).fontFamily).toContain('Songti SC')
    expect(readDateCardLook({}).fontFamily).toBeNull()
  })
})
