import {MARKDOWN_ADAPTER_PROFILE_CONFIG} from '../../../adapters/registry'
import {
  BlockNodeType,
  DocAttachmentInfo,
  DocFileService,
  IBlockSnapshot,
  storeObjectTextFrame,
  storeObjectTextStyle,
} from '../../../framework'
import {
  normalizeWordArtProps,
  PlacementLayoutBlockSchema,
  WordArtBlockSchema,
  type WordArtBlockProps,
} from '../../../blocks'
import {HtmlAdapter} from '../../../adapters/html-adapter/html-adapter'
import {MarkdownAdapter} from '../../../adapters/markdown-adapter/markdown-adapter'
import {BUNDLED_ADAPTER_REGISTRY} from '../../../editor/bundled-adapter-registry'

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
  const htmlAdapter = new HtmlAdapter(fileService, new Map(), BUNDLED_ADAPTER_REGISTRY)
  const markdownAdapter = new MarkdownAdapter(fileService, new Map(), BUNDLED_ADAPTER_REGISTRY)

  it('round-trips text, presentation and placement through HTML', async () => {
    const defaults = normalizeWordArtProps(
      WordArtBlockSchema.createSnapshot().props,
    )
    const wordArt = WordArtBlockSchema.createSnapshot('新品发布', {
      width: 360,
      height: 110,
      rotation: 25,
      ...storeObjectTextFrame(defaults.textFrame),
      ...storeObjectTextStyle({
        ...defaults.textStyle,
        fontFamily: 'slab-serif',
        fontSize: 56,
        letterSpacingEm: 0.08,
        fill: {
          type: 'linear-gradient',
          opacity: 1,
          angle: 90,
          stops: [
            {color: '#00FFFF', offset: 0, opacity: 1},
            {color: '#0000FF', offset: 1, opacity: 1},
          ],
        },
        outline: {type: 'line', color: '#111111', width: 2.8},
        effects: {
          ...defaults.textStyle.effects,
          shadow: {
            ...defaults.textStyle.effects.shadow,
            enabled: false,
          },
        },
        transform: 'perspective-up',
      }),
      position: "22.5 140",
      placementLayer: 'under',
    })
    const html = await htmlAdapter.toHtml(rootSnapshot([
      PlacementLayoutBlockSchema.createSnapshot([wordArt]),
    ]))
    const figure = new DOMParser().parseFromString(html, 'text/html')
      .querySelector('figure[data-bc-block="word-art"]')

    expect(figure?.getAttribute('data-bc-object-rotation')).toBe('25')
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
      textFont: jasmine.any(String),
      textShadow: "none",
      position: "22.5 140",
      placementLayer: 'under',
    }))
    expect(normalizeWordArtProps(
      imported.props as Partial<WordArtBlockProps>,
    )).toEqual(jasmine.objectContaining({
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
      position: "22.5 140",
      placementLayer: 'under',
    }))
    expect((imported.props as Record<string, unknown>)['fontFamily'])
      .toBeUndefined()
    expect((imported.props as Record<string, unknown>)['fillType'])
      .toBeUndefined()
  })

  it('filters malformed HTML style values and rich inline content', async () => {
    const importedRoot = await htmlAdapter.toBlockSnapshot(`
      <figure
        data-bc-block="word-art"
        data-bc-object-width="-10"
        data-bc-object-text-family="url(javascript:bad)"
        data-bc-object-text-transform="rotate(999deg)"
        data-bc-object-text-fill='linear-gradient(180deg, red 0%, #0af 100%)'>
        <div data-bc-word-art-text><strong>安全</strong><img src="x"></div>
      </figure>
    `)
    const imported = importedRoot.children[0] as IBlockSnapshot

    expect(normalizeWordArtProps(
      imported.props as Partial<WordArtBlockProps>,
    )).toEqual(jasmine.objectContaining({
      width: 48,
      fontFamily: 'display-sans',
      gradientColors: ['#FDE047', '#00AAFF'],
      effect: 'none',
    }))
    expect((imported.props as Record<string, unknown>)['fontFamily'])
      .toBeUndefined()
    expect((imported.props as Record<string, unknown>)['gradientColors'])
      .toBeUndefined()
    expect(imported.children).toEqual([
      jasmine.objectContaining({insert: '安全'}),
    ])
  })

  it('degrades to readable Markdown and imports as a paragraph', async () => {
    const wordArt = WordArtBlockSchema.createSnapshot('年度总结')
    markdownAdapter.adapterConfigs.set(MARKDOWN_ADAPTER_PROFILE_CONFIG, 'portable')
    const markdown = await markdownAdapter.toMarkdown(rootSnapshot([wordArt]))

    expect(markdown.trim()).toBe('年度总结')
    const imported = await markdownAdapter.toBlockSnapshot(markdown)
    expect((imported.children[0] as IBlockSnapshot).flavour).toBe('paragraph')
  })

  it('round-trips compact groups in the blockcraft Markdown profile', async () => {
    markdownAdapter.adapterConfigs.set(MARKDOWN_ADAPTER_PROFILE_CONFIG, 'blockcraft')
    const snapshot = WordArtBlockSchema.createSnapshot('格式往返')
    snapshot.props = {...snapshot.props, textFont: '24px 700 italic', textShadow: 'none', textPadding: '18 22'}
    const markdown = await markdownAdapter.toMarkdown(rootSnapshot([snapshot]))
    const imported = (await markdownAdapter.toBlockSnapshot(markdown)).children[0] as IBlockSnapshot
    expect(imported.props['textFont']).toBe('24px 700 italic')
    expect(imported.props['textPadding']).toBe('18 22')
    expect(imported.props['textStyle']).toBeUndefined()
    expect(imported.props['textFrame']).toBeUndefined()
  })

})
