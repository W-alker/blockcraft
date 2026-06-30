import {normalizeRange, lazyGapPoint} from './normalize';
import {createBlockGapSpace, resolveBlockGapSide} from '../../utils/zero-gap';

/** Build a non-editable host with leading + trailing gap fillers, mirroring the
 *  real DOM that BaseBlockComponent.ngAfterViewInit mounts for void/container
 *  blocks. Each filler is a `<span data-block-zero-space><br></span>` (the new
 *  native-caret filler). Returns the two filler spans so tests can place a caret
 *  in each (caret at offset 0 = before the `<br>`). */
function makeGapHost(blockId: string): {host: HTMLElement; leading: HTMLElement; trailing: HTMLElement} {
  const host = document.createElement('div')
  host.setAttribute('data-block-id', blockId)

  const leading = createBlockGapSpace()
  const trailing = createBlockGapSpace()

  // content between the two gap fillers
  const content = document.createElement('div')

  host.appendChild(leading)
  host.appendChild(content)
  host.appendChild(trailing)

  return {host, leading, trailing}
}

describe('lazyGapPoint', () => {
  it('creates a gap point with lazy block reference', () => {
    const mockBlock = {id: 'void-1'} as any
    const point = lazyGapPoint('void-1', 'before', () => mockBlock)

    expect(point.blockId).toBe('void-1')
    expect(point.type).toBe('gap')
    expect(point.side).toBe('before')
    expect(point.block).toBe(mockBlock)
  })

  it('does not enumerate the lazy block reference', () => {
    const point = lazyGapPoint('void-1', 'after', () => ({} as any))
    expect(Object.keys(point)).not.toContain('block')
    expect(point.side).toBe('after')
  })
})

describe('resolveBlockGapSide', () => {
  it('returns "before" for the leading gap filler span', () => {
    const {leading} = makeGapHost('void-1')
    expect(resolveBlockGapSide(leading)).toBe('before')
  })

  it('returns "after" for the trailing gap filler span', () => {
    const {trailing} = makeGapHost('void-1')
    expect(resolveBlockGapSide(trailing)).toBe('after')
  })

  it('resolves the inner <br> of the filler (closest climbs to the gap span)', () => {
    const {leading, trailing} = makeGapHost('void-1')
    expect(resolveBlockGapSide(leading.firstChild!)).toBe('before')
    expect(resolveBlockGapSide(trailing.firstChild!)).toBe('after')
  })

  it('returns null for a node not in any gap span', () => {
    const regular = document.createElement('div')
    const textNode = document.createTextNode('text')
    regular.appendChild(textNode)
    expect(resolveBlockGapSide(textNode)).toBeNull()
  })

  it('still resolves the trailing gap when a non-gap sibling span is appended (e.g. FakeRange cursor)', () => {
    // Regression for the `:last-of-type` selector: a FakeRange appends a
    // `<span class="blockcraft-cursor">` (no data-block-zero-space) as the last
    // child of the host. The trailing gap span must still resolve to 'after'.
    const {host, leading, trailing} = makeGapHost('void-1')
    const cursor = document.createElement('span')
    cursor.className = 'blockcraft-cursor'
    host.appendChild(cursor)

    expect(resolveBlockGapSide(leading)).toBe('before')
    expect(resolveBlockGapSide(trailing)).toBe('after')
  })
})

describe('normalizeRange - gap detection', () => {
  it('resolves a collapsed caret in the leading gap span to gap-before', () => {
    const {host, leading} = makeGapHost('void-1')
    void host

    const range = new StaticRange({
      startContainer: leading,
      startOffset: 0,
      endContainer: leading,
      endOffset: 0,
    })

    const mockBlock = {id: 'void-1', nodeType: 'void'} as any
    const result = normalizeRange(range, () => mockBlock)

    expect(result.start.type).toBe('gap')
    expect((result.start as any).side).toBe('before')
    expect(result.end.type).toBe('gap')
    expect((result.end as any).side).toBe('before')
  })

  it('resolves a collapsed caret in the trailing gap span to gap-after', () => {
    const {host, trailing} = makeGapHost('image-1')
    void host

    const range = new StaticRange({
      startContainer: trailing,
      startOffset: 1,
      endContainer: trailing,
      endOffset: 1,
    })

    const mockBlock = {id: 'image-1', nodeType: 'block'} as any
    const result = normalizeRange(range, () => mockBlock)

    expect(result.start.type).toBe('gap')
    expect((result.start as any).side).toBe('after')
    expect(result.end.type).toBe('gap')
    expect((result.end as any).side).toBe('after')
  })

  it('does NOT treat a NON-collapsed leading->trailing range as a gap (whole-block selected)', () => {
    // Regression: selectBlock() builds a non-collapsed range from the leading gap
    // span to the trailing gap span. That whole-block selection must resolve to
    // `selected`, never `gap` — gap points are only ever produced for collapsed carets.
    const {host, leading, trailing} = makeGapHost('void-1')
    void host

    const range = new StaticRange({
      startContainer: leading,
      startOffset: 0,
      endContainer: trailing,
      endOffset: 1,
    })

    const mockBlock = {id: 'void-1', nodeType: 'block'} as any
    const result = normalizeRange(range, () => mockBlock)

    expect(result.start.type).toBe('selected')
    expect(result.end.type).toBe('selected')
  })

  it('does NOT treat a gap span on an editable block as a gap point', () => {
    // Guard: gap detection only applies to void/block nodeType.
    const {host, leading} = makeGapHost('editable-1')
    void host

    const range = new StaticRange({
      startContainer: leading,
      startOffset: 0,
      endContainer: leading,
      endOffset: 0,
    })

    // nodeType editable → not a gap; falls through to selected (mock is not an
    // EditableBlockComponent instance, so resolvePoint returns a 'selected' point)
    const mockBlock = {id: 'editable-1', nodeType: 'editable'} as any
    const result = normalizeRange(range, () => mockBlock)

    expect(result.start.type).not.toBe('gap')
  })
})
