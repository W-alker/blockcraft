import {dateCardFonts, storeDateCardFont} from './date-card-typography'
import {readDateCardLook} from './date-card-look.util'
import {projectDraftProps} from '../draft-props'
import {DATE_CARD_WATCHED_PROPS} from './date-card-render.component'
import {DATE_CARD_STYLES} from './date-card.styles'
import {TestBed} from '@angular/core/testing'

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
  it('新增五档使用独立字号键，并保留仍可见的辅助标签控件', () => {
    const ids = ['masthead', 'bookmark', 'split', 'pill', 'rail']
    expect(DATE_CARD_STYLES.all.slice(-5).map(style => style.id)).toEqual(ids)
    expect(DATE_CARD_STYLES.resolve().id).toBe('calendar')
    for (const style of ids) {
      const fonts = dateCardFonts(style, {})
      const key = fonts[0].key
      expect(key).not.toBe('fsCalendar')
      expect(DATE_CARD_WATCHED_PROPS).toContain(key)
      const patch = storeDateCardFont(style, {}, 'day', 24)
      expect(dateCardFonts(style, patch)[0].size).toBe(24)
      expect(storeDateCardFont(style, patch, 'day', fonts[0].fallback)).toEqual({[key]: null})
      expect(dateCardFonts('calendar', patch)[0].size).toBe(48)
    }
    for (const style of ['masthead', 'split']) expect(dateCardFonts(style, {}, 'min')[2].visible).toBeTrue()
    for (const style of ['bookmark', 'pill', 'rail']) expect(dateCardFonts(style, {}, 'min')[2].visible).toBeFalse()
    expect(dateCardFonts('rail', {}, 'noWeek')[2].visible).toBeTrue()
  })
  it('新增缩略图无输入也能渲染，微缩轮廓与目录尺寸一致', () => {
    for (const style of DATE_CARD_STYLES.all.slice(-5)) {
      TestBed.configureTestingModule({imports: [style.component]})
      const fixture = TestBed.createComponent(style.component)
      fixture.nativeElement.style.setProperty('--u', '.2px')
      fixture.detectChanges()
      const card = fixture.nativeElement.querySelector('.card') as HTMLElement
      const rect = card.getBoundingClientRect()
      expect(rect.width).toBeCloseTo(style.defaultWidth * .2, 1)
      expect(rect.height).toBeCloseTo(style.defaultWidth / style.defaultAr * .2, 1)
      expect(card.querySelector('.card__day')?.textContent?.trim()).toMatch(/^\d{2}$/)
      expect(card.querySelector('.card__week')?.textContent).toContain('星期')
      fixture.destroy()
      TestBed.resetTestingModule()
    }
  })
})
