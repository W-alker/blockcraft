import {StickerBlockSchema} from './index'
import {resolveStickerDimensions, normalizeStickerRotation} from './sticker-size'
import {
  getStickerPreset,
  normalizeStickerColors,
  renderStickerDataUrl,
  setStickerColor,
} from './presets'

describe('built-in sticker data', () => {
  const preset = getStickerPreset('sunburst', 1)!

  it('stores only changed known colors and removes restored defaults', () => {
    const source = {sun: '#f9cd46', ink: '#123456', unknown: '#ABCDEF', center: 'url(javascript:alert(1))'}
    expect(normalizeStickerColors(preset, source)).toEqual({ink: '#123456'})
    expect(setStickerColor(preset, source, 'ink', '#3c5a6e')).toEqual({})
    expect(setStickerColor(preset, source, 'ink', '#aabbcc')).toEqual({ink: '#AABBCC'})
    expect(setStickerColor(preset, source, 'toString', '#AABBCC')).toEqual({ink: '#123456'})
  })

  it('keeps the SVG out of the snapshot and encodes the selected palette as an image', () => {
    const snapshot = StickerBlockSchema.createSnapshot('sunburst', {sun: '#123456'})
    expect(snapshot.props).toEqual({
      presetId: 'sunburst', presetVersion: 1, width: 160, height: 160, colors: {sun: '#123456'},
    })
    const url = renderStickerDataUrl('sunburst', 1, snapshot.props.colors)!
    expect(decodeURIComponent(url)).toContain('fill="#123456"')
    expect(JSON.stringify(snapshot)).not.toContain('<svg')
    expect(renderStickerDataUrl('sunburst', 1, snapshot.props.colors)).toBe(url)
  })

  it('does not render an unknown version or inject arbitrary SVG from document data', () => {
    expect(StickerBlockSchema.createSnapshot('sunburst', undefined, 2).props.presetVersion).toBe(2)
    expect(renderStickerDataUrl('sunburst', 2, {})).toBeNull()
    const url = decodeURIComponent(renderStickerDataUrl('sunburst', 1, {
      sun: 'red"/><script>alert(1)</script>',
    })!)
    expect(url).not.toContain('<script>')
    expect(url).toContain('fill="#F9CD46"')
  })
})


describe('fixed sticker geometry', () => {
  it('uses preset dimensions without relative object sizing', () => {
    const props = StickerBlockSchema.createSnapshot('leaf-label').props
    expect(resolveStickerDimensions(props)).toEqual({width: 180, height: 120})
    expect(StickerBlockSchema.metadata.objectSizing).toBeUndefined()
  })

  it('quantizes fixed dimensions and rotation to two decimals', () => {
    expect(resolveStickerDimensions({width: 123.456789, height: 78.901234}))
      .toEqual({width: 123.46, height: 78.9})
    expect(normalizeStickerRotation(12.345678)).toBe(12.35)
    expect(normalizeStickerRotation(-12.345678)).toBe(347.65)
    expect(normalizeStickerRotation(359.999)).toBe(0)
    expect(normalizeStickerRotation(NaN)).toBe(0)
  })

  it('ignores unsupported ratio fields and uses preset sizes for missing or invalid dimensions', () => {
    const props = {presetId: 'leaf-label', presetVersion: 1, wr: 20, ar: 2}
    expect(resolveStickerDimensions(props)).toEqual({width: 180, height: 120})
    expect(resolveStickerDimensions({...props, width: 240, height: 100}))
      .toEqual({width: 240, height: 100})
    expect(resolveStickerDimensions({...props, width: NaN, height: -1}))
      .toEqual({width: 180, height: 120})
  })
})
