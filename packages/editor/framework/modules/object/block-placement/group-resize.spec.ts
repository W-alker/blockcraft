import {createObjectGroupFontScale, createObjectGroupScaleConstraint, scaleObjectGroupMembers, type ObjectGroupResizeMember} from './group-resize'
import {WORD_ART_OBJECT_FORMAT_CAPABILITY} from '../../../../blocks/word-art-block/word-art.types'

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

  it('scales only WordArt fonts, retaining stored font style and the existing 4–512px limits', () => {
    const art = {...member, flavour: 'word-art', format: WORD_ART_OBJECT_FORMAT_CAPABILITY}
    const scale = createObjectGroupFontScale([
      {...art, id: 'default'},
      {...art, id: 'styled', props: {textFont: '24px 700 italic'}},
      {...member, id: 'text', props: {textFont: '24px 700 italic'}},
    ])
    expect(scale(1.5, 1.5).get('default')!.fontSize).toBe(72)
    expect(scale(1.5, 1.5).get('styled')!.textFont).toBe('36px 700 italic')
    expect(scale(1.5, 1.5).has('text')).toBeFalse()
    expect(scale(.01, .01).get('styled')!.fontSize).toBe(4)
    expect(scale(100, 100).get('styled')!.fontSize).toBe(512)
    for (const [sx, sy] of [[1, 1], [1.5, 1], [1, .5], [1.00001, 1], [1.5, 2]]) {
      expect(scale(sx, sy).size).toBe(0)
    }
  })

  it('rejects an entire group when any native frame falls below its minimum', () => {
    expect(scaleObjectGroupMembers([member, {...member, width: 8, height: 8}], .9, .9)).toBeNull()
    expect(scaleObjectGroupMembers([member], .6, .6)).not.toBeNull()
  })

  it('enforces the persisted maximum for all native frames', () => {
    const large = {...member, width: 18000, height: 16000, rotation: 0}
    expect(scaleObjectGroupMembers([large], 1.2, 1.2)).toBeNull()
    expect(scaleObjectGroupMembers([large], .2, .2)).not.toBeNull()
    expect(scaleObjectGroupMembers([{...large,
      format: {kind: 'text-box', features: {geometry: true}} as any,
    }], 1.2, 1.2)).toBeNull()
  })

  it('clamps a single large pointer step exactly to the first member boundary', () => {
    const objects = [{...member, rotation: 0}, {...member, width: 200, height: 100, rotation: 0}]
    const constrain = createObjectGroupScaleConstraint(objects)
    const horizontal = constrain(.01, 1)
    expect(horizontal.sx).toBeCloseTo(.08, 10)
    expect(horizontal.sy).toBe(1)
    expect(horizontal.limit).toBe('min')
    const corner = constrain(.01, .01)
    expect(corner.sx).toBeCloseTo(8 / 60, 10)
    expect(corner.sy).toBeCloseTo(corner.sx, 10)
    expect(scaleObjectGroupMembers(objects, corner.sx, corner.sy)![0].height).toBeCloseTo(8, 10)
    // Moving back into the valid interval must not remain stuck at the boundary.
    expect(constrain(.8, .8)).toEqual({sx: .8, sy: .8, limit: null})
  })

  it('uses rotated local axes when constraining side handles', () => {
    const objects = [{...member, width: 10, height: 10}]
    const result = createObjectGroupScaleConstraint(objects)(.01, 1)
    expect(result.sx).toBeCloseTo(Math.sqrt(2 * (.8 ** 2) - 1), 10)
    expect(result.sy).toBe(1)
    const scaled = scaleObjectGroupMembers(objects, result.sx, result.sy)![0]
    expect(scaled.width).toBeCloseTo(8, 10)
    expect(scaled.rotation).toBe(45)
  })

  it('clamps text-box enlargement and allows reverse movement at a minimum', () => {
    const text = {...member, width: 18000, height: 100, rotation: 0,
      format: {kind: 'text-box', features: {geometry: true}} as any}
    const maximum = createObjectGroupScaleConstraint([text])(4, 1)
    expect(maximum.limit).toBe('max')
    expect(scaleObjectGroupMembers([text], maximum.sx, maximum.sy)![0].width).toBeCloseTo(20000, 8)
    const constrain = createObjectGroupScaleConstraint([{...member, width: 8, height: 8, rotation: 0}])
    expect(constrain(.5, .5)).toEqual({sx: 1, sy: 1, limit: 'min'})
    expect(constrain(2, 2)).toEqual({sx: 2, sy: 2, limit: null})
  })

  it('leaves unconstrained members and valid native resizing unchanged', () => {
    const objects = [{...member, flavour: 'image', format: null}]
    expect(createObjectGroupScaleConstraint(objects)(.1, 8)).toEqual({sx: .1, sy: 8, limit: null})
    expect(createObjectGroupScaleConstraint([member])(1.2, 1.2))
      .toEqual({sx: 1.2, sy: 1.2, limit: null})
  })

  for (const flavour of ['date-card', 'weather'] as const) {
    it(`preserves ${flavour} proportions and scales its center during axis stretching`, () => {
      const card = {...member, flavour, format: null, rotation: 0}
      for (const [sx, sy] of [[2, 1], [1, 2], [.5, 1], [1, .5], [1.5, 1.5]]) {
        const scaled = scaleObjectGroupMembers([card], sx, sy)![0]
        expect(scaled.width / scaled.height).toBeCloseTo(card.width / card.height, 6)
        expect(scaled.width / card.width).toBeCloseTo(Math.min(sx, sy), 6)
        expect(scaled.x + scaled.width / 2).toBeCloseTo((card.x + card.width / 2) * sx, 6)
        expect(scaled.y + scaled.height / 2).toBeCloseTo((card.y + card.height / 2) * sy, 6)
      }
    })
  }
})
