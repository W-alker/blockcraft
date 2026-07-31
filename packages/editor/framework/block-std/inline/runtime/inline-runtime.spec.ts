import {createInlineImageDelta, withDefaultEmbedConverters} from '../image-embed'
import {InlineRuntime} from './inline-runtime'

describe('InlineRuntime inline float lifecycle', () => {
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
      {wrap: true, side: 'auto', x: .1, gap: 12},
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
})
