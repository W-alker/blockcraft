import {
  DEFAULT_INLINE_DATE_FORMAT,
  INLINE_DATE_CLASS,
  INLINE_DATE_EMBED_KEY,
  closestInlineDateElement,
  createInlineDateDelta,
  findInlineDateElement,
  formatInlineDateValue,
  createInlineDateEmbedConverter,
  parseInlineDateValue,
  readInlineDateDelta,
  toInlineDateValue,
} from './date-embed'

// 2026-08-14 15:54 是星期五。
const VALUE = '2026-08-14T15:54'

describe('inline date value', () => {
  it('serializes a Date as a local wall-clock stamp, not a UTC instant', () => {
    expect(toInlineDateValue(new Date(2026, 7, 14, 15, 54))).toBe(VALUE)
  })

  it('round-trips through parse', () => {
    const parsed = parseInlineDateValue(VALUE)!
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(7)
    expect(parsed.getDate()).toBe(14)
    expect(parsed.getHours()).toBe(15)
    expect(parsed.getMinutes()).toBe(54)
  })

  it('accepts a date-only stamp and defaults the time to midnight', () => {
    const parsed = parseInlineDateValue('2026-08-14')!
    expect(parsed.getHours()).toBe(0)
    expect(parsed.getMinutes()).toBe(0)
  })

  it('rejects out-of-range fields instead of letting Date roll them over', () => {
    expect(parseInlineDateValue('2026-13-01T00:00')).toBeNull()
    expect(parseInlineDateValue('2026-08-14T24:00')).toBeNull()
    expect(parseInlineDateValue('not a date')).toBeNull()
  })
})

describe('formatInlineDateValue', () => {
  it('renders every selectable format', () => {
    expect(formatInlineDateValue(VALUE, 'YYYY-MM-DD HH:mm'))
      .toBe('2026-08-14 15:54')
    expect(formatInlineDateValue(VALUE, 'YYYY-MM-DD')).toBe('2026-08-14')
    expect(formatInlineDateValue(VALUE, 'YYYY年M月D日 HH:mm'))
      .toBe('2026年8月14日 15:54')
    expect(formatInlineDateValue(VALUE, 'YYYY年M月D日')).toBe('2026年8月14日')
    expect(formatInlineDateValue(VALUE, 'YYYY年M月D日 dddd'))
      .toBe('2026年8月14日 星期五')
    expect(formatInlineDateValue(VALUE, 'YYYY-MM-DD dddd HH:mm'))
      .toBe('2026-08-14 星期五 15:54')
    expect(formatInlineDateValue(VALUE, 'M月D日')).toBe('8月14日')
    expect(formatInlineDateValue(VALUE, 'HH:mm')).toBe('15:54')
    expect(formatInlineDateValue(VALUE, 'YYYY/MM/DD HH:mm'))
      .toBe('2026/08/14 15:54')
    expect(formatInlineDateValue(VALUE, 'YYYY/MM/DD')).toBe('2026/08/14')
    expect(formatInlineDateValue(VALUE, 'MMM D, YYYY')).toBe('Aug 14, 2026')
  })

  it('never re-matches its own output as a token', () => {
    // `D` → `8` 之类的产物若被二次扫描，`MMM D` 会渲染成乱码。
    expect(formatInlineDateValue('2026-03-05T09:07', 'MMM D, YYYY'))
      .toBe('Mar 5, 2026')
    expect(formatInlineDateValue('2026-03-05T09:07', 'M月D日 H时'))
      .toBe('3月5日 9时')
  })

  it('echoes unparsable values so bad data stays visible', () => {
    expect(formatInlineDateValue('garbage', 'YYYY-MM-DD')).toBe('garbage')
  })
})

describe('createInlineDateDelta', () => {
  it('splits the frozen value from the display format', () => {
    expect(createInlineDateDelta(new Date(2026, 7, 14, 15, 54), 'YYYY/MM/DD'))
      .toEqual({
        insert: {[INLINE_DATE_EMBED_KEY]: VALUE},
        attributes: {format: 'YYYY/MM/DD'},
      })
  })

  it('falls back to the default for an unknown format', () => {
    expect(createInlineDateDelta(VALUE, 'no-such-format')?.attributes)
      .toEqual({format: DEFAULT_INLINE_DATE_FORMAT})
    expect(createInlineDateDelta(VALUE)?.attributes)
      .toEqual({format: DEFAULT_INLINE_DATE_FORMAT})
  })

  it('normalizes a space-separated stamp and rejects an empty one', () => {
    expect(createInlineDateDelta('2026-08-14 15:54')?.insert)
      .toEqual({[INLINE_DATE_EMBED_KEY]: VALUE})
    expect(createInlineDateDelta('  ')).toBeNull()
  })

  it('preserves an unparsable value rather than erasing it', () => {
    expect(createInlineDateDelta('garbage')?.insert)
      .toEqual({[INLINE_DATE_EMBED_KEY]: 'garbage'})
  })
})

describe('inline date DOM lookup', () => {
  const converter = createInlineDateEmbedConverter()

  /** 一行文字 + 一个日期 embed，就是段落里最普通的样子。 */
  const buildParagraph = () => {
    const paragraph = document.createElement('p')
    const text = document.createElement('span')
    text.textContent = '今天是'
    const embed = converter.toView(createInlineDateDelta(VALUE)!)
    paragraph.append(text, embed)
    return {paragraph, text, embed}
  }

  describe('closestInlineDateElement — 点击命中判定，只许向上找', () => {
    it('命中 embed 自身', () => {
      const {embed} = buildParagraph()
      expect(closestInlineDateElement(embed)).toBe(embed)
    })

    it('命中 embed 内部的节点', () => {
      const {embed} = buildParagraph()
      const inner = document.createElement('b')
      embed.appendChild(inner)
      expect(closestInlineDateElement(inner)).toBe(embed)
    })

    it('点同一行的兄弟节点不算命中', () => {
      const {text} = buildParagraph()
      expect(closestInlineDateElement(text)).toBeNull()
    })

    // 回归：曾经用 querySelector 向下兜底，于是点段落空白处也被判成点中了
    // 日期，插件吞掉 mousedown，光标落不下去。
    it('点包含 embed 的祖先元素不算命中', () => {
      const {paragraph} = buildParagraph()
      expect(closestInlineDateElement(paragraph)).toBeNull()
    })
  })

  describe('findInlineDateElement — DOM 重建，可以向下找', () => {
    it('从祖先元素里翻出 embed', () => {
      const {paragraph, embed} = buildParagraph()
      expect(findInlineDateElement(paragraph)).toBe(embed)
    })

    it('embed 自身仍然直接命中', () => {
      const {embed} = buildParagraph()
      expect(findInlineDateElement(embed)).toBe(embed)
    })
  })
})

describe('createInlineDateEmbedConverter', () => {
  const converter = createInlineDateEmbedConverter()

  it('renders the formatted text and mirrors the value onto data-*', () => {
    const view = converter.toView({
      insert: {[INLINE_DATE_EMBED_KEY]: VALUE},
      attributes: {format: 'YYYY年M月D日 dddd'},
    })

    expect(view.className).toBe(INLINE_DATE_CLASS)
    expect(view.textContent).toBe('2026年8月14日 星期五')
    expect(view.querySelector('i')?.className)
      .toBe('csicon csicon-date-time')
    expect(view.querySelector('i')?.getAttribute('aria-hidden')).toBe('true')
    expect(view.querySelector('.bc-inline-date__value')?.textContent)
      .toBe('2026年8月14日 星期五')
    expect(view.dataset['bcDateValue']).toBe(VALUE)
    expect(view.dataset['bcDateFormat']).toBe('YYYY年M月D日 dddd')
  })

  it('round-trips through toDelta', () => {
    const delta = {
      insert: {[INLINE_DATE_EMBED_KEY]: VALUE},
      attributes: {format: 'M月D日'},
    }

    expect(converter.toDelta(
      converter.toView(delta),
    )).toEqual(delta)
  })

  it('rebuilds from a nested node, as pasted HTML hands it over', () => {
    const wrapper = document.createElement('span')
    wrapper.appendChild(converter.toView(
      createInlineDateDelta(VALUE, 'YYYY/MM/DD')!,
    ))

    expect(converter.toDelta(wrapper)).toEqual({
      insert: {[INLINE_DATE_EMBED_KEY]: VALUE},
      attributes: {format: 'YYYY/MM/DD'},
    })
  })

  it('defaults the format when the delta carries none', () => {
    expect(readInlineDateDelta({insert: {[INLINE_DATE_EMBED_KEY]: VALUE}}))
      .toEqual({value: VALUE, format: DEFAULT_INLINE_DATE_FORMAT})
  })
})
