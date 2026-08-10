import {
  cloneInlinePaginationBreakPlan,
  createInlinePaginationBreakPlan,
  inlineBreakPointAtLayoutOffset,
  inlinePaginationBreakPlansEqual,
  visualDistanceToHostLayout,
} from './inline-break-plan'

describe('InlinePaginationBreakPlan', () => {
  it('validates, sorts and deduplicates measured points', () => {
    const plan = createInlinePaginationBreakPlan([
      {layoutOffset: 160, textOffset: 16},
      {layoutOffset: Number.NaN, textOffset: 9},
      {layoutOffset: 80, textOffset: 8},
      {layoutOffset: 80.2, textOffset: 10},
      {layoutOffset: 240, textOffset: 24},
      {layoutOffset: 320, textOffset: 32},
    ], 300)

    expect(plan?.points).toEqual([
      {layoutOffset: 80, textOffset: 8},
      {layoutOffset: 160, textOffset: 16},
      {layoutOffset: 240, textOffset: 24},
    ])
  })

  it('clones defensively and compares plans structurally', () => {
    const source = createInlinePaginationBreakPlan([
      {layoutOffset: 80, textOffset: 8},
    ])!
    const clone = cloneInlinePaginationBreakPlan(source)!

    expect(clone).not.toBe(source)
    expect(clone.points[0]).not.toBe(source.points[0])
    expect(inlinePaginationBreakPlansEqual(source, clone)).toBeTrue()
    expect(inlinePaginationBreakPlansEqual(source, undefined)).toBeFalse()
  })

  it('maps an engine float boundary back with subpixel tolerance', () => {
    const plan = createInlinePaginationBreakPlan([
      {layoutOffset: 80.25, textOffset: 12},
    ])!

    expect(inlineBreakPointAtLayoutOffset(plan, 80.6)?.textOffset).toBe(12)
    expect(inlineBreakPointAtLayoutOffset(plan, 81)).toBeUndefined()
  })

  it('converts visual BCR distance back to host layout pixels', () => {
    expect(visualDistanceToHostLayout(240, 600, 300)).toBe(120)
    expect(visualDistanceToHostLayout(120, 0, 300)).toBe(120)
  })
})
