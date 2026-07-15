import {BlockNodeType, EditableBlockComponent, INLINE_END_BREAK_CLASS} from '../../block-std';
import {normalizeRange, lazyGapPoint} from './normalize';
import {createBlockGapSpace, resolveBlockGapSide} from '../../utils/zero-gap';

/** Build a non-editable host with leading + trailing gap fillers, mirroring the
 *  real DOM that BaseBlockComponent.ngAfterViewInit mounts for void/container
 *  blocks. Each filler is a `<span data-block-zero-space>` with a zero-width
 *  text anchor. Returns the two filler spans so tests can place a caret in each. */
function makeGapHost(blockId: string): {host: HTMLElement; leading: HTMLElement; trailing: HTMLElement} {
  const host = document.createElement('div')
  host.setAttribute('data-block-id', blockId)

  const leading = createBlockGapSpace('before')
  const trailing = createBlockGapSpace('after')

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

  it('resolves the zero-width text node of the filler', () => {
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
  it('resolves a collapsed caret in the leading gap text anchor to gap-before', () => {
    const {host, leading} = makeGapHost('void-1')
    void host

    const range = new StaticRange({
      startContainer: leading.firstChild!,
      startOffset: 0,
      endContainer: leading.firstChild!,
      endOffset: 0,
    })

    const mockBlock = {id: 'void-1', nodeType: 'void'} as any
    const result = normalizeRange(range, () => mockBlock)

    expect(result.start.type).toBe('gap')
    expect((result.start as any).side).toBe('before')
    expect(result.end.type).toBe('gap')
    expect((result.end as any).side).toBe('before')
  })

  it('resolves a collapsed caret in the trailing gap text anchor to gap-after', () => {
    const {host, trailing} = makeGapHost('image-1')
    void host

    const range = new StaticRange({
      startContainer: trailing.firstChild!,
      startOffset: 0,
      endContainer: trailing.firstChild!,
      endOffset: 0,
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
      startContainer: leading.firstChild!,
      startOffset: 0,
      endContainer: trailing.firstChild!,
      endOffset: trailing.firstChild?.textContent?.length ?? 0,
    })

    const mockBlock = {id: 'void-1', nodeType: 'block'} as any
    const result = normalizeRange(range, () => mockBlock)

    expect(result.start.type).toBe('selected')
    expect(result.end.type).toBe('selected')
  })

  it('maps non-collapsed cross-block gap anchors back to parent boundary points', () => {
    const rootHost = document.createElement('div')
    rootHost.setAttribute('data-block-id', 'root')
    rootHost.setAttribute('data-node-type', BlockNodeType.root)

    const first = makeGapHost('block-1')
    const second = makeGapHost('block-2')
    rootHost.append(first.host, second.host)

    const root = {
      id: 'root',
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ['block-1', 'block-2'],
      childrenLength: 2,
    } as any
    const firstBlock = {
      id: 'block-1',
      nodeType: BlockNodeType.block,
      hostElement: first.host,
      parentId: 'root',
      parentBlock: root,
      childrenIds: [],
      childrenLength: 0,
      getIndexOfParent: () => 0,
    } as any
    const secondBlock = {
      id: 'block-2',
      nodeType: BlockNodeType.block,
      hostElement: second.host,
      parentId: 'root',
      parentBlock: root,
      childrenIds: [],
      childrenLength: 0,
      getIndexOfParent: () => 1,
    } as any
    const blocks: Record<string, any> = {root, 'block-1': firstBlock, 'block-2': secondBlock}

    const range = new StaticRange({
      startContainer: first.leading.firstChild!,
      startOffset: 0,
      endContainer: second.trailing.firstChild!,
      endOffset: second.trailing.firstChild?.textContent?.length ?? 0,
    })

    const result = normalizeRange(range, id => blocks[id])

    expect(result.start.type).toBe('boundary')
    expect(result.start.blockId).toBe('root')
    expect((result.start as any).index).toBe(0)
    expect(result.end.type).toBe('boundary')
    expect(result.end.blockId).toBe('root')
    expect((result.end as any).index).toBe(2)
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

describe('normalizeRange - editable shell endpoints', () => {
  function makeEditableShellBlock(id: string, textLength = 8) {
    const host = document.createElement('div')
    host.setAttribute('data-block-id', id)
    host.setAttribute('data-node-type', BlockNodeType.editable)

    const head = document.createElement('div')
    head.className = 'code-block__head'
    const wrapper = document.createElement('div')
    wrapper.className = 'edit-container-wrapper'
    const container = document.createElement('pre')
    container.className = 'edit-container'
    const resize = document.createElement('div')
    resize.className = 'resize-bar-btm'

    wrapper.appendChild(container)
    host.append(head, wrapper, resize)

    const domPointToModelPoint = jasmine.createSpy('domPointToModelPoint').and.returnValue(3)
    const block = Object.create(EditableBlockComponent.prototype)
    Object.defineProperties(block, {
      id: {value: id},
      nodeType: {value: BlockNodeType.editable},
      hostElement: {value: host},
      containerElement: {value: container},
      textLength: {value: textLength},
      runtime: {value: {mapper: {domPointToModelPoint}}},
    })

    return {block: block as EditableBlockComponent, host, head, wrapper, container, resize, mapper: domPointToModelPoint}
  }

  it('maps an endpoint on editable chrome before the inline container to text offset 0', () => {
    const {block, head, mapper} = makeEditableShellBlock('code-1')
    const range = new StaticRange({
      startContainer: head,
      startOffset: 0,
      endContainer: head,
      endOffset: 0,
    })

    const result = normalizeRange(range, id => {
      expect(id).toBe('code-1')
      return block as any
    })

    expect(result.start.type).toBe('text')
    expect((result.start as any).offset).toBe(0)
    expect(result.end.type).toBe('text')
    expect((result.end as any).offset).toBe(0)
    expect(mapper).not.toHaveBeenCalled()
  })

  it('maps host child offsets around a nested inline container to text boundaries', () => {
    const {block, host, mapper} = makeEditableShellBlock('code-1', 12)
    const range = new StaticRange({
      startContainer: host,
      startOffset: 1,
      endContainer: host,
      endOffset: 2,
    })

    const result = normalizeRange(range, () => block as any)

    expect(result.start.type).toBe('text')
    expect((result.start as any).offset).toBe(0)
    expect(result.end.type).toBe('text')
    expect((result.end as any).offset).toBe(12)
    expect(mapper).not.toHaveBeenCalled()
  })

  it('maps an endpoint on editable chrome after the inline container to textLength', () => {
    const {block, resize, mapper} = makeEditableShellBlock('code-1', 12)
    const range = new StaticRange({
      startContainer: resize,
      startOffset: 0,
      endContainer: resize,
      endOffset: 0,
    })

    const result = normalizeRange(range, () => block as any)

    expect(result.start.type).toBe('text')
    expect((result.start as any).offset).toBe(12)
    expect(result.end.type).toBe('text')
    expect((result.end as any).offset).toBe(12)
    expect(mapper).not.toHaveBeenCalled()
  })

  it('maps text nodes in editable chrome before the inline container to text offset 0', () => {
    const {block, head, mapper} = makeEditableShellBlock('code-1')
    const label = document.createTextNode('typescript')
    head.appendChild(label)
    const range = new StaticRange({
      startContainer: label,
      startOffset: 4,
      endContainer: label,
      endOffset: 4,
    })

    const result = normalizeRange(range, () => block as any)

    expect(result.start.type).toBe('text')
    expect((result.start as any).offset).toBe(0)
    expect(result.end.type).toBe('text')
    expect((result.end as any).offset).toBe(0)
    expect(mapper).not.toHaveBeenCalled()
  })

  it('maps inline end-break endpoints to textLength without consulting the mapper', () => {
    const {block, container, mapper} = makeEditableShellBlock('code-1', 12)
    const endBreak = document.createElement('span')
    endBreak.className = INLINE_END_BREAK_CLASS
    container.appendChild(endBreak)
    const range = new StaticRange({
      startContainer: endBreak,
      startOffset: 0,
      endContainer: endBreak,
      endOffset: 0,
    })

    const result = normalizeRange(range, () => block as any)

    expect(result.start.type).toBe('text')
    expect((result.start as any).offset).toBe(12)
    expect(result.end.type).toBe('text')
    expect((result.end as any).offset).toBe(12)
    expect(mapper).not.toHaveBeenCalled()
  })

  it('continues to delegate real inline container points to the inline mapper', () => {
    const {block, container, mapper} = makeEditableShellBlock('code-1')
    const range = new StaticRange({
      startContainer: container,
      startOffset: 0,
      endContainer: container,
      endOffset: 0,
    })

    const result = normalizeRange(range, () => block as any)

    expect(result.start.type).toBe('text')
    expect((result.start as any).offset).toBe(3)
    expect(mapper).toHaveBeenCalledOnceWith(container, container, 0, undefined)
  })
})

describe('normalizeRange - selected fallback endpoints', () => {
  function makeBlockChrome(id: string, nodeType: BlockNodeType.void | BlockNodeType.block) {
    const host = document.createElement('div')
    host.setAttribute('data-block-id', id)
    host.setAttribute('data-node-type', nodeType)
    const chrome = document.createElement('div')
    chrome.className = 'bc-block-content'
    host.appendChild(chrome)
    const block = {
      id,
      nodeType,
      hostElement: host,
      childrenIds: [],
      childrenLength: 0,
    } as any
    return {block, host, chrome}
  }

  it('maps a collapsed non-gap void block chrome endpoint to selected', () => {
    const {block, chrome} = makeBlockChrome('image-1', BlockNodeType.void)
    const range = new StaticRange({
      startContainer: chrome,
      startOffset: 0,
      endContainer: chrome,
      endOffset: 0,
    })

    const result = normalizeRange(range, () => block)

    expect(result.start.type).toBe('selected')
    expect(result.start.blockId).toBe('image-1')
    expect(result.end.type).toBe('selected')
    expect(result.end.blockId).toBe('image-1')
  })

  it('maps a non-collapsed block chrome range without children container to selected', () => {
    const {block, chrome} = makeBlockChrome('divider-1', BlockNodeType.block)
    const range = new StaticRange({
      startContainer: chrome,
      startOffset: 0,
      endContainer: chrome,
      endOffset: 1,
    })

    const result = normalizeRange(range, () => block)

    expect(result.start.type).toBe('selected')
    expect(result.start.blockId).toBe('divider-1')
    expect(result.end.type).toBe('selected')
    expect(result.end.blockId).toBe('divider-1')
  })

  it('maps non-collapsed cross-block void chrome endpoints to parent boundary points', () => {
    const rootHost = document.createElement('div')
    rootHost.setAttribute('data-block-id', 'root')
    rootHost.setAttribute('data-node-type', BlockNodeType.root)

    const first = makeBlockChrome('image-1', BlockNodeType.void)
    const second = makeBlockChrome('divider-1', BlockNodeType.void)
    rootHost.append(first.host, second.host)

    const root = {
      id: 'root',
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ['image-1', 'divider-1'],
      childrenLength: 2,
    } as any
    const firstBlock = {
      ...first.block,
      parentId: 'root',
      parentBlock: root,
      getIndexOfParent: () => 0,
    }
    const secondBlock = {
      ...second.block,
      parentId: 'root',
      parentBlock: root,
      getIndexOfParent: () => 1,
    }
    const blocks: Record<string, any> = {root, 'image-1': firstBlock, 'divider-1': secondBlock}

    const range = new StaticRange({
      startContainer: first.chrome,
      startOffset: 0,
      endContainer: second.chrome,
      endOffset: 0,
    })

    const result = normalizeRange(range, id => blocks[id])

    expect(result.start.type).toBe('boundary')
    expect(result.start.blockId).toBe('root')
    expect((result.start as any).index).toBe(0)
    expect(result.end.type).toBe('boundary')
    expect(result.end.blockId).toBe('root')
    expect((result.end as any).index).toBe(2)
  })
})

describe('normalizeRange - container boundary endpoints', () => {
  function makeEditableBlock(id: string, textLength: number, parentId: string) {
    const host = document.createElement('p')
    host.setAttribute('data-block-id', id)
    host.setAttribute('data-node-type', BlockNodeType.editable)
    const block = Object.create(EditableBlockComponent.prototype)
    Object.defineProperties(block, {
      id: {value: id},
      nodeType: {value: BlockNodeType.editable},
      hostElement: {value: host},
      textLength: {value: textLength},
      parentId: {value: parentId},
    })
    return block as EditableBlockComponent
  }

  it('maps non-collapsed children-container offsets to boundary endpoints', () => {
    const calloutHost = document.createElement('div')
    calloutHost.setAttribute('data-block-id', 'callout-1')
    calloutHost.setAttribute('data-node-type', BlockNodeType.block)
    const content = document.createElement('div')
    content.className = 'children-render-container'
    calloutHost.appendChild(content)

    const p1 = makeEditableBlock('p1', 5, 'callout-1')
    const p2 = makeEditableBlock('p2', 7, 'callout-1')
    content.append(p1.hostElement, p2.hostElement)

    const callout = {
      id: 'callout-1',
      nodeType: BlockNodeType.block,
      hostElement: calloutHost,
      childrenIds: ['p1', 'p2'],
      childrenLength: 2,
      parentId: 'root',
    } as any
    const blocks: Record<string, any> = {callout: callout, 'callout-1': callout, p1, p2}

    const range = new StaticRange({
      startContainer: content,
      startOffset: 0,
      endContainer: content,
      endOffset: 2,
    })

    const result = normalizeRange(range, id => blocks[id])

    expect(result.start.type).toBe('boundary')
    expect(result.start.blockId).toBe('callout-1')
    expect((result.start as any).index).toBe(0)
    expect(result.end.type).toBe('boundary')
    expect(result.end.blockId).toBe('callout-1')
    expect((result.end as any).index).toBe(2)
  })

  it('maps non-collapsed wrapper endpoints around a children-container to boundary endpoints', () => {
    const calloutHost = document.createElement('div')
    calloutHost.setAttribute('data-block-id', 'callout-1')
    calloutHost.setAttribute('data-node-type', BlockNodeType.block)
    const wrapper = document.createElement('div')
    wrapper.className = 'bc-block-content'
    const content = document.createElement('div')
    content.className = 'children-render-container'
    calloutHost.appendChild(wrapper)
    wrapper.appendChild(content)

    const p1 = makeEditableBlock('p1', 5, 'callout-1')
    const p2 = makeEditableBlock('p2', 7, 'callout-1')
    content.append(p1.hostElement, p2.hostElement)

    const callout = {
      id: 'callout-1',
      nodeType: BlockNodeType.block,
      hostElement: calloutHost,
      childrenIds: ['p1', 'p2'],
      childrenLength: 2,
      parentId: 'root',
    } as any
    const blocks: Record<string, any> = {callout: callout, 'callout-1': callout, p1, p2}

    const range = new StaticRange({
      startContainer: wrapper,
      startOffset: 0,
      endContainer: wrapper,
      endOffset: 1,
    })

    const result = normalizeRange(range, id => blocks[id])

    expect(result.start.type).toBe('boundary')
    expect(result.start.blockId).toBe('callout-1')
    expect((result.start as any).index).toBe(0)
    expect(result.end.type).toBe('boundary')
    expect(result.end.blockId).toBe('callout-1')
    expect((result.end as any).index).toBe(2)
  })
})
