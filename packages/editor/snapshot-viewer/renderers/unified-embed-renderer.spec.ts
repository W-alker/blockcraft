import {BlockNodeType, type IBlockSnapshot} from '../../framework'
import {createSnapshotRenderer} from '../create-snapshot-renderer'
const value = (props: Record<string, any>): IBlockSnapshot => ({
  id: 'embed', flavour: 'embed', nodeType: BlockNodeType.void,
  props: {width: null, height: 424, ...props}, meta: {}, children: [],
})
const flush = async () => { await Promise.resolve(); await Promise.resolve() }

describe('unified embed snapshot rendering', () => {
  it('omits branding and links even when resources are off', async () => {
    const host = document.createElement('div')
    const renderer = createSnapshotRenderer({resourcePolicy: 'off'})
    renderer.render(host, value({url: 'https://example.com/report.html'}))
    await flush()
    expect(host.querySelector('iframe')).toBeNull()
    expect(host.querySelector('.iframe-brand, .iframe-link, a')).toBeNull()
    expect(host.textContent?.trim()).toBe('')
    renderer.destroy()
  })
  it('converts platform links and retains iframe state across size changes', async () => {
    const host = document.createElement('div')
    const renderer = createSnapshotRenderer({resourcePolicy: 'eager'})
    const first = value({url: 'https://youtu.be/M7lc1UVf-VE'})
    renderer.render(host, first)
    await flush()
    const iframe = host.querySelector('iframe')!
    expect(iframe.src).toBe('https://www.youtube-nocookie.com/embed/M7lc1UVf-VE')
    expect(iframe.sandbox.value).toContain('allow-same-origin')
    expect(host.querySelector('.iframe-brand, .iframe-link, a')).toBeNull()
    renderer.update({...first, props: {...first.props, height: 600}})
    await flush()
    expect(host.querySelector('iframe')).toBe(iframe)
    expect(host.querySelector<HTMLElement>('embed-frame-card')!.style.height).toBe('600px')
    renderer.update({...first, props: {url: first.props['url'], wr: 65, ar: 1.6}})
    await flush()
    expect(host.querySelector('iframe')).toBe(iframe)
    const card = host.querySelector<HTMLElement>('embed-frame-card')!
    expect(card.style.width).toBe('65%')
    expect(card.style.height).toBe('auto')
    expect(card.style.aspectRatio).toBe('1.6 / 1')
    renderer.update(value({url: window.location.origin + '/report.html'}))
    await flush()
    const localFrame = host.querySelector('iframe')!
    expect(localFrame).not.toBe(iframe)
    expect(localFrame.src).toBe(window.location.origin + '/report.html')
    expect(localFrame.sandbox.value).not.toContain('allow-same-origin')
    expect(localFrame.srcdoc).toBe('')
    renderer.update(value({url: 'javascript:alert(1)'}))
    await flush()
    expect(host.querySelector('iframe')).toBeNull()
    renderer.destroy()
  })

  it('also omits branding and source addresses from legacy embeds', async () => {
    const host = document.createElement('div')
    const renderer = createSnapshotRenderer({resourcePolicy: 'off'})
    for (const flavour of ['figma-embed', 'juejin-embed']) {
      renderer.render(host, {...value({url: 'https://example.com/legacy'}), flavour} as IBlockSnapshot)
      await flush()
      expect(host.querySelector('embed-frame-card')).not.toBeNull()
      expect(host.querySelector('.iframe-brand, .iframe-link, a')).toBeNull()
      expect(host.textContent?.trim()).toBe('')
      renderer.update({...value({url: 'https://example.com/legacy', wr: 70, ar: 2}), flavour} as IBlockSnapshot)
      await flush()
      const card = host.querySelector<HTMLElement>('embed-frame-card')!
      expect(card.style.width).toBe('70%')
      expect(card.style.height).toBe('auto')
      expect(card.style.aspectRatio).toBe('2 / 1')
    }
    renderer.destroy()
  })

  it('preserves legacy iframe instances across ratio sizing patches', async () => {
    const host = document.createElement('div')
    const renderer = createSnapshotRenderer({resourcePolicy: 'eager'})
    for (const flavour of ['figma-embed', 'juejin-embed']) {
      const first = {...value({url: 'https://example.com/legacy'}), flavour} as IBlockSnapshot
      renderer.render(host, first)
      await flush()
      const iframe = host.querySelector('iframe')!
      expect(iframe).not.toBeNull()
      renderer.update({...first, props: {url: first.props['url'], wr: 60, ar: 1.5}})
      await flush()
      expect(host.querySelector('iframe')).toBe(iframe)
      expect(host.querySelector<HTMLElement>('embed-frame-card')!.style.height).toBe('auto')
      renderer.update({...first, props: {...first.props, url: 'https://example.com/changed'}})
      await flush()
      expect(host.querySelector('iframe')).not.toBe(iframe)
    }
    renderer.destroy()
  })

  it('keeps pending iframe enhancement when sizing changes before activation', async () => {
    const host = document.createElement('div')
    const renderer = createSnapshotRenderer({resourcePolicy: 'eager'})
    for (const flavour of ['embed', 'figma-embed', 'juejin-embed']) {
      const first = {...value({url: 'https://example.com/pending'}), flavour} as IBlockSnapshot
      renderer.render(host, first)
      renderer.update({...first, props: {url: first.props['url'], wr: 80, ar: 2}})
      await flush()
      expect(host.querySelector('iframe')).not.toBeNull()
    }
    renderer.destroy()
  })
})
