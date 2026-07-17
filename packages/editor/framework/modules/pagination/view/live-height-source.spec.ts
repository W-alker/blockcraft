import {BlockNodeType} from '../../../block-std/types/block.type'
import {LiveHeightSource} from './live-height-source'

describe('LiveHeightSource atomic block measurement', () => {
  let source: LiveHeightSource
  let host: HTMLElement

  function createSource(
    offsetHeight: number,
    scrollHeight: number,
    flavour = 'figma-embed',
    nodeType = BlockNodeType.void,
  ): LiveHeightSource {
    host = document.createElement('div')
    host.style.marginBottom = '8px'
    document.body.appendChild(host)
    Object.defineProperty(host, 'offsetHeight', {configurable: true, value: offsetHeight})
    Object.defineProperty(host, 'scrollHeight', {configurable: true, value: scrollHeight})
    const block = {
      hostElement: host,
      nodeType,
      flavour,
    }
    const doc = {
      root: {childrenIds: ['embed-1']},
      getBlockById: (id: string) => id === 'embed-1' ? block : null,
    } as unknown as BlockCraft.Doc
    return new LiveHeightSource(doc)
  }

  afterEach(() => {
    source?.destroy()
    host?.remove()
  })

  it('uses visible overflow height for an atomic block below one page', () => {
    source = createSource(55, 464)

    const [meta] = source.measure({contentHeight: 900, widowOrphanLines: 2})

    expect(meta?.height).toBe(472)
    expect(meta?.lockHeight).toBeUndefined()
  })

  it('keeps the existing full-page height lock for an oversized atomic block', () => {
    source = createSource(55, 1200)

    const [meta] = source.measure({contentHeight: 900, widowOrphanLines: 2})

    expect(meta?.height).toBe(900)
    expect(meta?.lockHeight).toBe(900)
  })

  it('locks an oversized image even though its caption makes it a container block', () => {
    source = createSource(55, 1200, 'image', BlockNodeType.block)

    const [meta] = source.measure({contentHeight: 900, widowOrphanLines: 2})

    expect(meta?.height).toBe(900)
    expect(meta?.lockHeight).toBe(900)
  })

  it('keeps a code block locked when the lock layout collapses its measured scroll height', () => {
    source = createSource(1013, 1011, 'code', BlockNodeType.editable)

    const [beforeLock] = source.measure({contentHeight: 900, widowOrphanLines: 2})
    expect(beforeLock?.lockHeight).toBe(900)

    host.classList.add('bc-page-height-locked')
    Object.defineProperty(host, 'offsetHeight', {configurable: true, value: 900})
    Object.defineProperty(host, 'scrollHeight', {configurable: true, value: 898})

    const [whileLocked] = source.measure({contentHeight: 900, widowOrphanLines: 2})
    expect(whileLocked?.height).toBe(900)
    expect(whileLocked?.lockHeight).toBe(900)

    Object.defineProperty(host, 'offsetHeight', {configurable: true, value: 534})
    Object.defineProperty(host, 'scrollHeight', {configurable: true, value: 532})

    const [afterRealShrink] = source.measure({contentHeight: 900, widowOrphanLines: 2})
    expect(afterRealShrink?.height).toBe(542)
    expect(afterRealShrink?.lockHeight).toBeUndefined()
  })
})
