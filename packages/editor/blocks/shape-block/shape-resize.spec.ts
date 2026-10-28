import {calculateFormattedObjectResize} from './shape-resize'
import {calculateShapeResize, preserveResizeAspectRatio} from './shape-resizer.component'
import {calculateWordArtResize} from '../word-art-block/word-art-resize'
import {calculatePersonCardResize} from '../dynamic-material-blocks/person-card/person-card-layout'

describe('formatted object resize limits', () => {
  const start = {width: 100, height: 60, offsetX: 0, offsetY: 0}

  it('stops at 8px while keeping the opposite corner fixed', () => {
    expect(calculateFormattedObjectResize('north-west', start, 200, 200))
      .toEqual({width: 8, height: 8, offsetX: 92, offsetY: 52})
    expect(calculateFormattedObjectResize('east', start, -80, 0).width).toBe(20)
  })

  it('bounds both axes at 20000 and still respects a flow column', () => {
    expect(calculateFormattedObjectResize('south-east', start, 30000, 30000))
      .toEqual({width: 20000, height: 20000, offsetX: 0, offsetY: 0})
    expect(calculateFormattedObjectResize('east', start, 1000, 0, 120).width).toBe(120)
  })

  it('keeps WordArt corner ratios and fixed anchors at both limits', () => {
    const minimum = calculateWordArtResize('north-west', start, 200, 200)
    expect(minimum.height).toBe(8)
    expect(minimum.width / minimum.height).toBeCloseTo(100 / 60, 10)
    expect(minimum.offsetX + minimum.width).toBe(100)
    const maximum = calculateWordArtResize('south-east', start, 30000, 30000)
    expect(maximum.width).toBe(20000)
    expect(maximum.width / maximum.height).toBeCloseTo(100 / 60, 10)
  })

  it('preserves a locked ratio rather than clamping its two sides independently', () => {
    const minimum = preserveResizeAspectRatio({...start, width: 8, handle: 'west'}, 100, 60)
    expect(minimum.height).toBe(8)
    expect(minimum.width / minimum.height).toBeCloseTo(100 / 60, 10)
    expect(minimum.offsetX + minimum.width).toBe(100)
    const maximum = preserveResizeAspectRatio({...start, height: 20000, handle: 'south'}, 100, 60)
    expect(maximum.width).toBe(20000)
    expect(maximum.width / maximum.height).toBeCloseTo(100 / 60, 10)
  })

  it('retains the shared resizer and personnel card limits', () => {
    for (const calculate of [calculateShapeResize, calculatePersonCardResize]) {
      expect(calculate('west', start, 200, 0).width).toBe(48)
      expect(calculate('north', start, 0, 200).height).toBe(32)
    }
  })
})
