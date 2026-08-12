import {
  BlockNodeType,
  DocAttachmentInfo,
  DocFileService,
  IBlockSnapshot,
} from '../framework'
import {
  PlacementLayoutBlockSchema,
  WordArtBlockSchema,
} from '../blocks'
import {HtmlAdapter} from './html-adapter/html-adapter'
import {MarkdownAdapter} from './markdown-adapter/markdown-adapter'

class WordArtAdapterFileService extends DocFileService {
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

const rootSnapshot = (children: IBlockSnapshot[]): IBlockSnapshot => ({
  id: 'root',
  flavour: 'root',
  nodeType: BlockNodeType.root,
  props: {},
  meta: {},
  children,
})

describe('Word art adapters', () => {
  const fileService = new WordArtAdapterFileService()
  const htmlAdapter = new HtmlAdapter(fileService)
  const markdownAdapter = new MarkdownAdapter(fileService)

  it('round-trips text, presentation and placement through HTML', async () => {
    const wordArt = WordArtBlockSchema.createSnapshot('新品发布', {
      width: 360,
      height: 110,
      rotation: 25,
      fontFamily: 'slab-serif',
      fontSize: 56,
      letterSpacingEm: 0.08,
      fillType: 'linear-gradient',
      gradientAngle: 90,
      gradientColors: ['#00FFFF', '#0000FF'],
      gradientStops: [0, 1],
      outlineColor: '#111111',
      outlineWidthEm: 0.05,
      shadowEnabled: false,
      effect: 'perspective-up',
      placement: {mode: 'absolute', x: 22.5, y: 140, layer: 'under'},
    })
    const html = await htmlAdapter.toHtml(rootSnapshot([
      PlacementLayoutBlockSchema.createSnapshot([wordArt]),
    ]))
    const figure = new DOMParser().parseFromString(html, 'text/html')
      .querySelector('figure[data-bc-block="word-art"]')

    expect(figure?.getAttribute('data-word-art-rotation')).toBe('25')
    expect(figure?.getAttribute('data-word-art-placement-layer')).toBe('under')
    expect(figure?.querySelector('[data-bc-word-art-text]')?.textContent)
      .toBe('新品发布')
    expect(figure?.querySelector<HTMLElement>(
      '[data-bc-word-art-text]',
    )?.style.backgroundImage).toContain('linear-gradient')
    expect(figure?.querySelector<HTMLElement>(
      '[data-bc-word-art-text]',
    )?.style.webkitTextFillColor).toBe('transparent')

    const importedRoot = await htmlAdapter.toBlockSnapshot(html)
    const imported = importedRoot.children[0] as IBlockSnapshot
    expect(imported.flavour).toBe('word-art')
    expect(imported.nodeType).toBe(BlockNodeType.editable)
    expect(imported.children).toEqual([{insert: '新品发布'}])
    expect(imported.props).toEqual(jasmine.objectContaining({
      width: 360,
      height: 110,
      rotation: 25,
      fontFamily: 'slab-serif',
      fontSize: 56,
      letterSpacingEm: 0.08,
      fillType: 'linear-gradient',
      gradientColors: ['#00FFFF', '#0000FF'],
      gradientStops: [0, 1],
      shadowEnabled: false,
      effect: 'perspective-up',
      placement: {mode: 'absolute', x: 22.5, y: 140, layer: 'under'},
    }))
  })

  it('filters malformed HTML style values and rich inline content', async () => {
    const importedRoot = await htmlAdapter.toBlockSnapshot(`
      <figure
        data-bc-block="word-art"
        data-word-art-width="-10"
        data-word-art-font-family="url(javascript:bad)"
        data-word-art-gradient-colors='["red","#0af"]'
        data-word-art-effect="rotate(999deg)">
        <div data-bc-word-art-text><strong>安全</strong><img src="x"></div>
      </figure>
    `)
    const imported = importedRoot.children[0] as IBlockSnapshot

    expect(imported.props).toEqual(jasmine.objectContaining({
      width: 48,
      fontFamily: 'display-sans',
      gradientColors: ['#FDE047', '#00AAFF'],
      effect: 'none',
    }))
    expect(imported.children).toEqual([
      jasmine.objectContaining({insert: '安全'}),
    ])
  })

  it('degrades to readable Markdown and imports as a paragraph', async () => {
    const wordArt = WordArtBlockSchema.createSnapshot('年度总结')
    const markdown = await markdownAdapter.toMarkdown(rootSnapshot([wordArt]))

    expect(markdown.trim()).toBe('年度总结')
    const imported = await markdownAdapter.toBlockSnapshot(markdown)
    expect((imported.children[0] as IBlockSnapshot).flavour).toBe('paragraph')
  })
})
