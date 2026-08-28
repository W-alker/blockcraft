import {
  BlockNodeType,
  DocAttachmentInfo,
  DocFileService,
  type IBlockSnapshot,
} from '../framework'
import {HtmlAdapter} from '../adapters/html-adapter'
import {MarkdownAdapter} from '../adapters/markdown-adapter'
import {
  DECOS,
  TEMPLATE_ADAPTER_REGISTRY,
  TEMPLATE_BLOCK_ADAPTERS,
  TEMPLATE_INLINE_EMBED_ADAPTERS,
} from '../../../apps/playground/src/app/template-deco/core/registry'

class TestFileService extends DocFileService {
  uploadImg(): Promise<string> { return Promise.resolve('') }
  uploadVideo(): Promise<DocAttachmentInfo> {
    return Promise.resolve({name: '', type: '', url: '', size: 0})
  }
  uploadAttachment(): Promise<DocAttachmentInfo> {
    return Promise.resolve({name: '', type: '', url: '', size: 0})
  }
  previewAttachment(): void {}
  previewImg(): void {}
  createObjectURL(): string { return '' }
  getFileByObjectURL(): File | undefined { return undefined }
  getFilePreviewURLByObjectURL(): string { return '' }
  removeObjectURL(): void {}
  isLocalObjectURL(): boolean { return false }
  isOverMaxSize(): boolean { return false }
}

const snapshot: IBlockSnapshot = {
  id: 'root',
  flavour: 'root',
  nodeType: BlockNodeType.root,
  props: {},
  meta: {},
  children: [{
    id: 'logo',
    flavour: 'logo',
    nodeType: BlockNodeType.void,
    props: {
      src: 'https://cdn.example.com/logo.png',
      wr: 18,
      ar: 2,
      position: {x: 12, y: 24},
    },
    meta: {},
    children: [],
  }, {
    id: 'weather',
    flavour: 'weather',
    nodeType: BlockNodeType.void,
    props: {date: 'live', align: 'right'},
    meta: {},
    children: [],
  }, {
    id: 'paragraph',
    flavour: 'paragraph',
    nodeType: BlockNodeType.editable,
    props: {},
    meta: {},
    children: [{insert: '正文'}],
  }],
} as IBlockSnapshot

describe('template-deco Adapter registry', () => {
  const fileService = new TestFileService()

  it('collects required adapter ownership from every domain registration', () => {
    expect(TEMPLATE_BLOCK_ADAPTERS).toEqual(DECOS.map(deco => deco.adapter))
    expect(TEMPLATE_INLINE_EMBED_ADAPTERS).toEqual([])
    expect(TEMPLATE_ADAPTER_REGISTRY.htmlMatchersForFlavour('logo'))
      .toEqual(DECOS.find(deco => deco.def.flavour === 'logo')!.adapter.html!)
    expect(TEMPLATE_ADAPTER_REGISTRY.htmlMatchersForFlavour('weather').length)
      .toBeGreaterThan(0)
  })

  it('round-trips canonical Blocks through HTML', async () => {
    const adapter = new HtmlAdapter(
      fileService,
      new Map(),
      TEMPLATE_ADAPTER_REGISTRY,
    )

    const html = await adapter.toHtml(snapshot)
    expect(html).toContain('data-bc-block="logo"')
    expect(html).toContain('data-bc-block="weather"')

    const imported = await adapter.toBlockSnapshot(html)
    expect((imported.children[0] as IBlockSnapshot).props['src'])
      .toBe('https://cdn.example.com/logo.png')
    expect((imported.children[1] as IBlockSnapshot).props['date']).toBe('live')
  })

  it('combines portable resources with custom semantic materials', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map(),
      TEMPLATE_ADAPTER_REGISTRY,
    )

    const markdown = await adapter.toMarkdown(snapshot)
    expect(markdown).toContain('Logo: https://cdn.example.com/logo.png')
    expect(markdown).toContain(':::bc-weather')
    expect(markdown).toContain(':::bc-weather\n\n---')
    expect(markdown).toContain('date: "live"')
    expect(markdown).toContain('正文')
    expect(markdown).not.toContain('template-weather')
    expect(markdown).not.toContain('template-logo')

    const imported = await adapter.toBlockSnapshot(markdown)
    const weather = imported.children[1] as IBlockSnapshot
    expect(weather.flavour).toBe('weather')
    expect(weather.props['date']).toBe('live')
  })
})
