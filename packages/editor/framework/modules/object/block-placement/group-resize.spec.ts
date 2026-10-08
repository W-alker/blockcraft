import {scaleObjectGroupMembers, type ObjectGroupResizeMember} from './group-resize'

describe('Native group resize geometry', () => {
  const member: ObjectGroupResizeMember = {
    id: 'member', flavour: 'shape', props: {},
    x: 20, y: 30, width: 100, height: 60, rotation: 45,
    format: {kind: 'shape', features: {geometry: true}} as any,
  }

  it('preserves rotation while projecting a nonuniform scale onto local axes', () => {
    const scaled = scaleObjectGroupMembers([member], 2, 1)![0]
    const localScale = Math.sqrt(2.5)
    expect(scaled.rotation).toBe(45)
    expect(scaled.width).toBeCloseTo(100 * localScale, 6)
    expect(scaled.height).toBeCloseTo(60 * localScale, 6)
    expect(scaled.x + scaled.width / 2).toBeCloseTo(140, 6)
    expect(scaled.y + scaled.height / 2).toBeCloseTo(60, 6)
  })

  it('rejects an entire group when any native frame falls below its minimum', () => {
    expect(scaleObjectGroupMembers([member, {...member, width: 48, height: 32}], .9, .9)).toBeNull()
    expect(scaleObjectGroupMembers([member], .6, .6)).not.toBeNull()
  })

  it('enforces the existing text-box maximum without capping other shapes', () => {
    const large = {...member, width: 1800, height: 1600, rotation: 0}
    expect(scaleObjectGroupMembers([large], 1.2, 1.2)).not.toBeNull()
    expect(scaleObjectGroupMembers([{...large,
      format: {kind: 'text-box', features: {geometry: true}} as any,
    }], 1.2, 1.2)).toBeNull()
  })
})
