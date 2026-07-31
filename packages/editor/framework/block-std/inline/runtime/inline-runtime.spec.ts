import {
  createInlineImageDelta,
  withDefaultEmbedConverters,
} from '../image-embed'
import {InlineRuntime} from './inline-runtime'

describe('InlineRuntime inline float lifecycle', () => {
  afterEach(() => {
    document.body
      .querySelectorAll('[data-inline-runtime-test-host]')
      .forEach(element => element.remove())
  })

  it('syncs owner state after full and incremental renders', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600,
    })
    const runtime = new InlineRuntime(
      container,
      new Map(withDefaultEmbedConverters()),
    )
    const wrapped = createInlineImageDelta(
      'https://cdn.example.com/a.png',
      180,
      108,
      {wrap: true, side: 'auto', x: 0.1, gap: 12},
    )!

    runtime.render([wrapped])
    expect(container.hasAttribute('data-bc-inline-float-owner')).toBeTrue()
    expect(container.querySelector('[data-bc-inline-float]')).not.toBeNull()

    runtime.applyDelta([
      {retain: 1, attributes: {wrap: null, side: null, x: null, gap: null}},
    ])
    expect(container.hasAttribute('data-bc-inline-float-owner')).toBeFalse()

    runtime.destroy()
    expect(container.hasAttribute('data-bc-inline-float-owner')).toBeFalse()
  })

  it('does not mark an owner for ordinary inline images', () => {
    const container = document.createElement('div')
    const runtime = new InlineRuntime(
      container,
      new Map(withDefaultEmbedConverters()),
    )

    runtime.render([
      createInlineImageDelta('https://cdn.example.com/a.png', 120, 60)!,
    ])

    expect(container.hasAttribute('data-bc-inline-float-owner')).toBeFalse()
    runtime.destroy()
  })

  it('projects eligible auto wrapping into real left and right text fragments', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    host.dataset['inlineRuntimeTestHost'] = 'true'
    host.style.width = '600px'
    container.className = 'edit-container'
    container.style.width = '600px'
    container.style.font = '16px/20px Arial'
    container.style.whiteSpace = 'break-spaces'
    container.style.wordBreak = 'break-all'
    host.appendChild(container)
    document.body.appendChild(host)
    const runtime = new InlineRuntime(
      container,
      new Map(withDefaultEmbedConverters()),
    )

    const before = '前置文本用于确认锚点行与左侧片段。'
    const after =
      '后置文本继续进入右侧以及后续多行片段，且必须保留真实文本节点。'.repeat(3)
    runtime.render([
      {insert: before},
      createInlineImageDelta('https://cdn.example.com/center.png', 180, 80, {
        wrap: true,
        side: 'auto',
        x: 0.35,
        gap: 12,
      })!,
      {insert: after},
    ])
    ;(runtime as any)._inlineFloatLayout.refresh()

    const group = container.querySelector('[data-bc-inline-fragment-group]')
    const left = group?.querySelector('[data-bc-inline-fragment-side="left"]')
    const right = group?.querySelector('[data-bc-inline-fragment-side="right"]')
    expect(group).not.toBeNull()
    expect(left?.querySelector('c-text')).not.toBeNull()
    expect(right?.querySelector('c-text')).not.toBeNull()
    const leftRect = left!.getBoundingClientRect()
    const rightRect = right!.getBoundingClientRect()
    const frameRect = group!
      .querySelector<HTMLElement>('.bc-inline-image-frame')!
      .getBoundingClientRect()
    expect(Math.abs(leftRect.top - rightRect.top)).toBeLessThanOrEqual(0.75)
    expect(leftRect.right).toBeLessThanOrEqual(frameRect.left - 12 + 0.75)
    expect(rightRect.left).toBeGreaterThanOrEqual(frameRect.right + 12 - 0.75)
    expect(runtime.textLength).toBeGreaterThan(100)

    runtime.applyDelta([
      {retain: before.length + 1 + after.length},
      {insert: '增量'},
    ])
    ;(runtime as any)._inlineFloatLayout.refresh()
    expect(runtime.textLength).toBe(before.length + 1 + after.length + 2)
    expect(
      container.querySelector('[data-bc-inline-fragment-group]'),
    ).not.toBeNull()

    runtime.destroy()
    expect(
      container.querySelector('[data-bc-inline-fragment-group]'),
    ).toBeNull()
  })

  it('defers a dirty refresh while a layout freeze lease is held', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 500,
    })
    const runtime = new InlineRuntime(
      container,
      new Map(withDefaultEmbedConverters()),
    )
    runtime.render([
      createInlineImageDelta('https://cdn.example.com/freeze.png', 120, 60, {
        wrap: true,
        side: 'right',
        x: 0.1,
        gap: 12,
      })!,
    ])
    const shell = container.querySelector<HTMLElement>(
      '[data-bc-inline-float]',
    )!
    const originalWidth = shell.style.width
    const release = runtime.acquireFloatLayoutFreeze()
    shell.dataset['bcInlineImageWrapX'] = '.5'
    ;(runtime as any)._inlineFloatLayout.refresh()
    expect(shell.style.width).toBe(originalWidth)

    release()
    ;(runtime as any)._inlineFloatLayout.refresh()
    expect(shell.style.width).not.toBe(originalWidth)
    runtime.destroy()
  })

  it('keeps multiple dual anchors in Delta order and pushes the later band down', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    host.dataset['inlineRuntimeTestHost'] = 'true'
    host.style.width = '600px'
    container.className = 'edit-container'
    container.style.cssText = [
      'width:600px',
      'font:16px/20px Arial',
      'white-space:break-spaces',
      'word-break:break-all',
    ].join(';')
    host.appendChild(container)
    document.body.appendChild(host)
    const runtime = new InlineRuntime(
      container,
      new Map(withDefaultEmbedConverters()),
    )

    runtime.render([
      {insert: '第一锚点前文本'},
      createInlineImageDelta('https://cdn.example.com/first.png', 140, 60, {
        wrap: true,
        side: 'auto',
        x: 0.38,
        gap: 12,
      })!,
      {insert: '两个锚点之间的文本'},
      createInlineImageDelta('https://cdn.example.com/second.png', 140, 60, {
        wrap: true,
        side: 'auto',
        x: 0.38,
        gap: 12,
      })!,
      {insert: '第二锚点后的文本继续排版。'.repeat(8)},
    ])
    ;(runtime as any)._inlineFloatLayout.refresh()

    const groups = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-bc-inline-fragment-group]',
      ),
    )
    expect(groups.length).toBe(2)
    expect(
      groups[0].compareDocumentPosition(groups[1]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(Number.parseFloat(groups[0].style.minHeight)).toBeGreaterThanOrEqual(
      72,
    )
    expect(groups[1].offsetTop).toBeGreaterThanOrEqual(
      groups[0].offsetTop + groups[0].offsetHeight,
    )

    runtime.destroy()
  })

  it('starts long-paragraph wrapping near the anchor and ends with the image band', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    host.dataset['inlineRuntimeTestHost'] = 'true'
    host.style.width = '800px'
    container.className = 'edit-container'
    container.style.cssText = [
      'width:800px',
      'font:24px/48px monospace',
      'white-space:pre-wrap',
      'word-break:break-all',
    ].join(';')
    host.appendChild(container)
    document.body.appendChild(host)
    const runtime = new InlineRuntime(
      container,
      new Map(withDefaultEmbedConverters()),
    )
    const before = 'a'.repeat(3000)
    const after = 'b'.repeat(1000)

    runtime.render([
      {insert: before},
      createInlineImageDelta(
        'https://cdn.example.com/long-anchor.png',
        260,
        173,
        {wrap: true, side: 'auto', x: 0.36, gap: 12},
      )!,
      {insert: after},
    ])
    ;(runtime as any)._inlineFloatLayout.refresh()

    const group = container.querySelector<HTMLElement>(
      '[data-bc-inline-fragment-group]',
    )!
    const rows = group.querySelectorAll('[data-bc-inline-fragment-row]')
    let textBeforeGroup = ''
    for (const child of Array.from(container.children)) {
      if (child === group) break
      textBeforeGroup += child.textContent ?? ''
    }

    expect(group).not.toBeNull()
    expect(textBeforeGroup.length).toBeGreaterThan(2900)
    expect(rows.length).toBe(4)
    expect(Number.parseFloat(group.style.minHeight)).toBe(192)
    expect(group.nextElementSibling?.matches('c-element')).toBeTrue()
    expect(group.nextElementSibling?.textContent).toContain('b')

    runtime.destroy()
  })
})
