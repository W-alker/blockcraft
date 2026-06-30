import {
  createBlockGapSpace,
  getBlockGapAnchor,
  getBlockGapCaretSpan,
  resolveBlockGapSide,
  resolveGapSideFromRect,
  IGapRect,
} from './zero-gap'

/** Build a non-editable host with leading + trailing gap fillers, mirroring the
 *  DOM that BaseBlockComponent mounts for void/container blocks. */
function makeGapHost(): {host: HTMLElement; leading: HTMLElement; trailing: HTMLElement} {
  const host = document.createElement('div')
  host.setAttribute('data-block-id', 'b1')
  const leading = createBlockGapSpace()
  const trailing = createBlockGapSpace()
  const content = document.createElement('div')
  host.appendChild(leading)
  host.appendChild(content)
  host.appendChild(trailing)
  return {host, leading, trailing}
}

describe('createBlockGapSpace', () => {
  it('builds a contenteditable filler span containing a real <br>', () => {
    const span = createBlockGapSpace()
    expect(span.tagName).toBe('SPAN')
    expect(span.getAttribute('data-zero-space')).toBe('true')
    expect(span.getAttribute('data-block-zero-space')).toBe('true')
    expect(span.getAttribute('contenteditable')).toBe('true')
    expect(span.classList.contains('bc-block-gap')).toBe(true)
    expect(span.firstChild).toBeInstanceOf(HTMLBRElement)
    // No zero-width-space text node — the caret-able line box comes from <br>.
    expect(span.textContent).toBe('')
  })
})

describe('getBlockGapAnchor', () => {
  it('returns the leading filler span at offset 0', () => {
    const {host, leading} = makeGapHost()
    const a = getBlockGapAnchor(host, 'leading')
    expect(a).toEqual({node: leading, offset: 0})
  })

  it('returns the trailing filler span at offset 1 (past the <br>)', () => {
    const {host, trailing} = makeGapHost()
    const a = getBlockGapAnchor(host, 'trailing')
    expect(a).toEqual({node: trailing, offset: 1})
  })

  it('returns null when no gap filler is mounted', () => {
    const host = document.createElement('div')
    expect(getBlockGapAnchor(host, 'leading')).toBeNull()
    expect(getBlockGapAnchor(host, 'trailing')).toBeNull()
  })
})

describe('getBlockGapCaretSpan', () => {
  it("returns the leading filler span for side 'before'", () => {
    const {host, leading} = makeGapHost()
    expect(getBlockGapCaretSpan(host, 'before')).toBe(leading)
  })

  it("returns the trailing filler span for side 'after'", () => {
    const {host, trailing} = makeGapHost()
    expect(getBlockGapCaretSpan(host, 'after')).toBe(trailing)
  })

  it('returns null when no gap filler is mounted', () => {
    const host = document.createElement('div')
    expect(getBlockGapCaretSpan(host, 'before')).toBeNull()
    expect(getBlockGapCaretSpan(host, 'after')).toBeNull()
  })
})

describe('resolveBlockGapSide', () => {
  it('resolves the filler span itself', () => {
    const {leading, trailing} = makeGapHost()
    expect(resolveBlockGapSide(leading)).toBe('before')
    expect(resolveBlockGapSide(trailing)).toBe('after')
  })

  it('resolves the inner <br> of the filler via .closest', () => {
    const {leading, trailing} = makeGapHost()
    expect(resolveBlockGapSide(leading.firstChild!)).toBe('before')
    expect(resolveBlockGapSide(trailing.firstChild!)).toBe('after')
  })

  it('returns null for a node outside any gap filler', () => {
    const div = document.createElement('div')
    div.appendChild(document.createTextNode('x'))
    expect(resolveBlockGapSide(div.firstChild!)).toBeNull()
  })

  it('still resolves the trailing filler when a non-gap sibling span is appended', () => {
    const {host, leading, trailing} = makeGapHost()
    const cursor = document.createElement('span')
    cursor.className = 'blockcraft-cursor'
    host.appendChild(cursor)
    expect(resolveBlockGapSide(leading)).toBe('before')
    expect(resolveBlockGapSide(trailing)).toBe('after')
  })
})

describe('resolveGapSideFromRect', () => {
  // Content box spanning x:[100,300], y:[100,200].
  const rect: IGapRect = {top: 100, bottom: 200, left: 100, right: 300}

  it("returns 'before' when the click is above the top edge", () => {
    expect(resolveGapSideFromRect(rect, 200, 80)).toBe('before')
  })

  it("returns 'before' when the click is left of the left edge", () => {
    expect(resolveGapSideFromRect(rect, 60, 150)).toBe('before')
  })

  it("returns 'after' when the click is below the bottom edge", () => {
    expect(resolveGapSideFromRect(rect, 200, 250)).toBe('after')
  })

  it("returns 'after' when the click is right of the right edge", () => {
    expect(resolveGapSideFromRect(rect, 340, 150)).toBe('after')
  })

  it('returns null when the click falls inside the content box', () => {
    expect(resolveGapSideFromRect(rect, 200, 150)).toBeNull()
  })

  it("treats the top-right corner as 'before' (above takes precedence over right)", () => {
    // x > right AND y < top → the 'before' branch wins.
    expect(resolveGapSideFromRect(rect, 340, 80)).toBe('before')
  })

  it('treats clicks exactly on the edges as inside (strict inequalities)', () => {
    expect(resolveGapSideFromRect(rect, 100, 100)).toBeNull() // top-left corner, on the edges
    expect(resolveGapSideFromRect(rect, 300, 200)).toBeNull() // bottom-right corner, on the edges
  })
})
