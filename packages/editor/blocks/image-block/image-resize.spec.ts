import {calculateImageResize} from './image-resize'

describe('image eight-way resize', () => {
  const start = {width: 200, height: 100, offsetX: 0, offsetY: 0}

  it('keeps the opposite anchor stationary as a rotated box changes its center', () => {
    for (const handle of ['east', 'west', 'north', 'south', 'north-west', 'north-east', 'south-west', 'south-east'] as const) {
      const rotation = 37, theta = rotation * Math.PI / 180
      const box = calculateImageResize(handle, start, 40, 20, 800, rotation)
      const globalX = box.offsetX * Math.cos(theta) - box.offsetY * Math.sin(theta)
      const globalY = box.offsetX * Math.sin(theta) + box.offsetY * Math.cos(theta)
      const fx = handle.includes('west') ? 1 : handle.includes('east') ? 0 : 0.5
      const fy = handle.includes('north') ? 1 : handle.includes('south') ? 0 : 0.5
      const anchor = (w: number, h: number) => ({
        x: w / 2 + (fx - .5) * w * Math.cos(theta) - (fy - .5) * h * Math.sin(theta),
        y: h / 2 + (fx - .5) * w * Math.sin(theta) + (fy - .5) * h * Math.cos(theta),
      })
      const before = anchor(start.width, start.height), after = anchor(box.width, box.height)
      expect(after.x + globalX).toBeCloseTo(before.x, 6)
      expect(after.y + globalY).toBeCloseTo(before.y, 6)
    }
  })

  it('changes only the requested axis from a side handle', () => {
    expect(calculateImageResize('north', start, 0, -20)).toEqual({
      width: 200, height: 120, offsetX: 0, offsetY: -20,
    })
    expect(calculateImageResize('west', start, -40, 0)).toEqual({
      width: 240, height: 100, offsetX: -40, offsetY: 0,
    })
  })

  it('keeps the aspect ratio at both width limits including narrow parents', () => {
    expect(calculateImageResize('south-east', start, 1000, 0, 250)).toEqual({
      width: 250, height: 125, offsetX: 0, offsetY: 0,
    })
    expect(calculateImageResize('north-west', start, 1000, 1000).width).toBe(30)
    const narrow = calculateImageResize('south-east', {...start, width: 20, height: 10}, 0, -100, 20)
    expect(narrow.width).toBe(20)
    expect(narrow.height).toBe(10)
  })

  it('starts from the visible box when a nested parent has capped the inline width', () => {
    expect(calculateImageResize('east', {...start, height: 50}, -20, 0, 100)).toEqual({
      width: 80, height: 50, offsetX: 0, offsetY: 0,
    })
  })
})
