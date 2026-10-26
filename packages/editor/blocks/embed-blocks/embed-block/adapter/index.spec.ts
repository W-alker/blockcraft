import {BlockNodeType, type IBlockSnapshot} from '../../../../framework'
import {HtmlAdapter} from '../../../../adapters/html-adapter'
import {MarkdownAdapter} from '../../../../adapters/markdown-adapter'
import {BUNDLED_ADAPTER_REGISTRY} from '../../../../editor/bundled-adapter-registry'

const root = (props: Record<string, any>): IBlockSnapshot => ({
  id: 'root', flavour: 'root', nodeType: BlockNodeType.root, props: {}, meta: {},
  children: [{id: 'embed', flavour: 'embed', nodeType: BlockNodeType.void, props: {width: null, height: 424, ...props}, meta: {}, children: []}],
})

describe('unified embed adapters', () => {
  const htmlAdapter = new HtmlAdapter({} as any, new Map(), BUNDLED_ADAPTER_REGISTRY)
  const markdownAdapter = new MarkdownAdapter({} as any, new Map(), BUNDLED_ADAPTER_REGISTRY)
  it('round-trips HTML file URLs and sizes through the HTML envelope', async () => {
    const value = root({url: 'https://example.com/report.html?version=2#details', width: 640, height: 560})
    const exported = await htmlAdapter.toHtml(value)
    const parsed = new DOMParser().parseFromString(exported, 'text/html')
    expect(parsed.querySelector('iframe')).toBeNull()
    expect(parsed.querySelector('a')?.href).toBe('https://example.com/report.html?version=2#details')
    const imported = await htmlAdapter.toBlockSnapshot(exported)
    expect((imported.children[0] as IBlockSnapshot).props).toEqual((value.children[0] as IBlockSnapshot).props)
  })
  it('keeps URL embeds typed and ordinary links/html code passive', async () => {
    const exported = await markdownAdapter.toMarkdown(root({url: 'https://example.com/page'}))
    expect(exported).toContain('"blockcraft:embed"')
    const imported = await markdownAdapter.toBlockSnapshot(exported)
    expect((imported.children[0] as IBlockSnapshot).flavour).toBe('embed')
    expect((imported.children[0] as IBlockSnapshot).props['url']).toBe('https://example.com/page')
    expect((imported.children[0] as IBlockSnapshot).props).toEqual(jasmine.objectContaining({wr: 100, ar: 16 / 9}))
    const plain = await markdownAdapter.toBlockSnapshot('[普通链接](https://example.com)\n\n```html\n<h1>示例</h1>\n```')
    expect(plain.children.map(child => (child as IBlockSnapshot).flavour)).not.toContain('embed')
  })

  it('round-trips responsive sizes without injecting legacy pixel defaults', async () => {
    for (const flavour of ['embed', 'figma-embed', 'juejin-embed'] as const) {
      const value = root({url: 'https://example.com/report.html'})
      const block = value.children[0] as IBlockSnapshot
      block.flavour = flavour
      block.props = {url: 'https://example.com/report.html', wr: 63.7816, ar: 1.928572}
      const imported = await htmlAdapter.toBlockSnapshot(await htmlAdapter.toHtml(value))
      expect((imported.children[0] as IBlockSnapshot).props).toEqual(block.props)
    }
  })
})
