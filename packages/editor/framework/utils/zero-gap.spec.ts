import {
  createBlockGapSpace,
  getBlockGapAnchor,
  getBlockGapCaretSpan,
  isZeroSpace,
  resolveBlockGapSide,
  resolveGapSideFromRect,
  IGapRect,
} from './zero-gap'
import {STR_ZERO_WIDTH_SPACE} from '../block-std/inline'

/** Build a non-editable host with leading + trailing gap fillers, mirroring the
 *  DOM that BaseBlockComponent mounts for void/container blocks. */
function makeGapHost(): {host: HTMLElement; leading: HTMLElement; trailing: HTMLElement} {
  const host = document.createElement('div')
  host.setAttribute('data-block-id', 'b1')
  const leading = createBlockGapSpace('before')
  const trailing = createBlockGapSpace('after')
  const content = document.createElement('div')
  host.appendChild(leading)
  host.appendChild(content)
  host.appendChild(trailing)
  return {host, leading, trailing}
}

describe('createBlockGapSpace', () => {
  it('builds a contenteditable filler span containing only a zero-width text anchor', () => {
    const span = createBlockGapSpace('before')
    expect(span.tagName).toBe('SPAN')
    expect(span.getAttribute('data-zero-space')).toBe('true')
    expect(span.getAttribute('data-block-zero-space')).toBe('true')
    expect(span.getAttribute('data-block-gap-side')).toBe('before')
    expect(span.getAttribute('contenteditable')).toBe('true')
    expect(span.classList.contains('bc-block-gap')).toBe(true)
    expect(span.childNodes.length).toBe(1)
    expect(span.firstChild?.nodeType).toBe(Node.TEXT_NODE)
    expect(span.firstChild?.textContent).toBe(STR_ZERO_WIDTH_SPACE)
  })
})

describe('isZeroSpace', () => {
  it('returns null for a missing native selection node', () => {
    expect(isZeroSpace(null)).toBeNull()
    expect(isZeroSpace(undefined)).toBeNull()
  })
})

describe('getBlockGapAnchor', () => {
  it('returns the leading filler text node at offset 0', () => {
    const {host, leading} = makeGapHost()
    const a = getBlockGapAnchor(host, 'leading')
    expect(a).toEqual({node: leading.firstChild!, offset: 0})
  })

  it('returns the trailing filler text node at the text end', () => {
    const {host, trailing} = makeGapHost()
    const a = getBlockGapAnchor(host, 'trailing')
    expect(a).toEqual({node: trailing.firstChild!, offset: STR_ZERO_WIDTH_SPACE.length})
  })

  it('still returns the trailing filler when a non-gap sibling span is appended', () => {
    const {host, trailing} = makeGapHost()
    const cursor = document.createElement('span')
    cursor.className = 'blockcraft-cursor'
    host.appendChild(cursor)

    const a = getBlockGapAnchor(host, 'trailing')

    expect(a).toEqual({node: trailing.firstChild!, offset: STR_ZERO_WIDTH_SPACE.length})
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

  it('still returns the trailing filler when a non-gap sibling span is appended', () => {
    const {host, trailing} = makeGapHost()
    const cursor = document.createElement('span')
    cursor.className = 'blockcraft-cursor'
    host.appendChild(cursor)

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

  it('resolves the zero-width text node of the filler', () => {
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

describe('zero-gap cross-realm lookup', () => {
  it('recognizes gap spans created in an iframe document', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const ownerDocument = iframe.contentDocument!
    const host = ownerDocument.createElement('div')
    const makeGap = (side: 'before' | 'after') => {
      const span = ownerDocument.createElement('span')
      span.setAttribute('data-zero-space', 'true')
      span.setAttribute('data-block-zero-space', 'true')
      span.setAttribute('data-block-gap-side', side)
      span.appendChild(ownerDocument.createTextNode(STR_ZERO_WIDTH_SPACE))
      return span
    }
    const leading = makeGap('before')
    const trailing = makeGap('after')
    host.append(leading, ownerDocument.createElement('div'), trailing)
    ownerDocument.body.appendChild(host)

    try {
      expect(isZeroSpace(leading)).toBe(leading)
      expect(isZeroSpace(leading.firstChild!)).toBe(leading)
      expect(getBlockGapCaretSpan(host, 'before')).toBe(leading)
      expect(getBlockGapCaretSpan(host, 'after')).toBe(trailing)
      expect(getBlockGapAnchor(host, 'trailing')).toEqual({
        node: trailing.firstChild!,
        offset: STR_ZERO_WIDTH_SPACE.length,
      })
      expect(resolveBlockGapSide(leading.firstChild!)).toBe('before')
      expect(resolveBlockGapSide(trailing)).toBe('after')
    } finally {
      iframe.remove()
    }
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
