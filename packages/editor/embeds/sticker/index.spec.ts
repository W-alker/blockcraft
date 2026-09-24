import {BlockNodeType} from '../../framework'
import {StickerBlockSchema} from '../../blocks/sticker-block'
import {
  inlineObjectSnapshotToBlockSnapshots,
  objectBlockSnapshotToInlineParagraph,
} from '../../plugins/object-layout/inline-object-conversion'
import {createInlineStickerDelta, inlineStickerEmbedConverter, readInlineStickerDelta} from '.'

describe('inline sticker embed', () => {
  it('keeps only preset reference and color overrides through DOM and block conversion', () => {
    const block = StickerBlockSchema.createSnapshot('leaf-label', {leaf: '#123456'})
    block.props = {...block.props, width: 192, height: 128, rotation: 15}
    const paragraph = objectBlockSnapshotToInlineParagraph(block)!
    expect(paragraph.nodeType).toBe(BlockNodeType.editable)
    const delta = paragraph.children[0] as ReturnType<typeof createInlineStickerDelta>
    expect(JSON.stringify(delta)).not.toContain('<svg')
    const data = readInlineStickerDelta(delta)
    expect(data).toEqual(jasmine.objectContaining({width: 192, height: 128}))
    expect(data.props).toEqual(jasmine.objectContaining({
      presetId: 'leaf-label', colors: {leaf: '#123456'}, rotation: 15,
    }))

    const view = inlineStickerEmbedConverter.toView(delta)
    expect(view.querySelector('img')?.getAttribute('src')).toContain('data:image/svg+xml')
    const roundTrip = inlineStickerEmbedConverter.toDelta(view)
    expect(readInlineStickerDelta(roundTrip).props).toEqual(data.props)
    const restored = inlineObjectSnapshotToBlockSnapshots(paragraph, 0, 'sticker')
    expect(restored?.object.flavour).toBe('sticker')
    expect(restored?.object.props).toEqual(data.props)
  })

  it('preserves two-decimal geometry across inline serialization and block conversion', () => {
    const block = StickerBlockSchema.createSnapshot('sunburst')
    block.props = {...block.props, width: 123.45678, height: 78.901234, rotation: 12.345678}
    const paragraph = objectBlockSnapshotToInlineParagraph(block)!
    const delta = paragraph.children[0] as ReturnType<typeof createInlineStickerDelta>
    expect(delta.attributes?.['width']).toBe(123.46)
    expect(delta.attributes?.['height']).toBe(78.9)
    expect(readInlineStickerDelta(delta).props.rotation).toBe(12.35)
    const roundTrip = inlineStickerEmbedConverter.toDelta(inlineStickerEmbedConverter.toView(delta))
    expect(roundTrip).toEqual(delta)
    expect(inlineObjectSnapshotToBlockSnapshots(paragraph, 0, 'sticker')?.object.props)
      .toEqual(jasmine.objectContaining({width: 123.46, height: 78.9, rotation: 12.35}))
  })

  it('round trips wrap layout without persisting the rendered SVG', () => {
    const delta = createInlineStickerDelta(
      StickerBlockSchema.createSnapshot('sunburst').props,
      {width: 120, height: 120},
      {wrap: true, x: 0.3, gap: 8},
    )
    const roundTrip = inlineStickerEmbedConverter.toDelta(inlineStickerEmbedConverter.toView(delta))
    expect(readInlineStickerDelta(roundTrip)).toEqual(jasmine.objectContaining({
      width: 120, height: 120, wrap: true, x: 0.3, gap: 8,
    }))
    expect(JSON.stringify(roundTrip)).not.toContain('<svg')
  })

  it('normalizes invalid dimensions and colors without storing defaults or geometry in the payload', () => {
    const delta = createInlineStickerDelta({
      presetId: 'sunburst', presetVersion: 1, rotation: 360,
      colors: {sun: '#f9cd46', ink: '#abcdef', unknown: '#123456'},
    }, {width: NaN, height: -1})
    const payload = JSON.parse(String(delta.insert['sticker']))
    expect(payload).toEqual({props: {
      presetId: 'sunburst', presetVersion: 1, colors: {ink: '#ABCDEF'},
    }})
    const data = readInlineStickerDelta(delta)
    expect(data.width).toBeGreaterThan(0)
    expect(data.height).toBe(data.width)
    expect(readInlineStickerDelta({insert: {sticker: 'invalid-json'}}).props.presetId).toBe('sunburst')
    expect(readInlineStickerDelta(createInlineStickerDelta({presetVersion: NaN})).props.presetVersion).toBe(1)
  })

})
