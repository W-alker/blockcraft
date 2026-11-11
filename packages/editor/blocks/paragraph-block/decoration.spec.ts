import {normalizeParagraphDecoration, applyParagraphDecoration} from './decoration'
import {normalizeRegionBorders, applyRegionBorders} from '../render-unit-block/borders'
import {resolveDividerPresentation} from '../divider-block/divider-presentation'

describe('paragraph decoration and region borders', () => {
  it('rejects disabled/unknown decorations and bounds widths and percentages', () => {
    expect(normalizeParagraphDecoration({position: 'unknown'})).toBeNull()
    const d = normalizeParagraphDecoration({position: 'both', before: '900%', after: '40px', width: -2, gap: Infinity})!
    expect(d.before).toBe('100%')
    expect(d.after).toBe('40px')
    expect(d.width).toBe(.5)
    expect(d.gap).toBe(12)
  })
  it('projects and clears decoration without mutating rich text or adding text nodes', () => {
    const p = document.createElement('p')
    p.innerHTML = '<span>感悟 <b>成长</b></span>'
    const content = p.firstChild
    applyParagraphDecoration(p, {position: 'after', color: '#D4C2A7'})
    expect(p.getAttribute('data-bc-deco-position')).toBe('after')
    expect(p.textContent).toBe('感悟 成长')
    expect(p.firstChild).toBe(content)
    applyParagraphDecoration(p, null)
    expect(p.hasAttribute('data-bc-deco-position')).toBeFalse()
    expect(p.style.getPropertyValue('--bc-deco-color')).toBe('')
  })
  it('preserves independent edges and rejects invalid border values', () => {
    expect(normalizeRegionBorders({top: '2px solid #9A7654', left: 'none', right: '99px solid red', bottom: 'url(x)'}))
      .toEqual({top: '2px solid #9A7654', left: 'none'})
    const e = document.createElement('div')
    applyRegionBorders(e, {top: '2px solid #9A7654'})
    expect(e.style.getPropertyValue('--bc-region-border-right')).toBe('none')
    applyRegionBorders(e, null)
    expect(e.hasAttribute('data-bc-region-borders')).toBeFalse()
  })
  it('ignores all old divider text even with label styling or tape', () => {
    for (const style of ['solid', 'tape-dot-black']) {
      const v = resolveDividerPresentation({style, text: '旧标题', fontSize: 32, color: 'red', align: 'left'})
      expect('text' in v).toBeFalse()
      expect('label' in v).toBeFalse()
      expect(v.style).toBe(style)
      expect(v.length).toBe('full')
    }
  })
})
