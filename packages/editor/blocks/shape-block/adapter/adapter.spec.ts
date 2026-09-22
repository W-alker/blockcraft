import {MARKDOWN_ADAPTER_PROFILE_CONFIG} from '../../../adapters/registry'
import {
  BlockNodeType,
  DocAttachmentInfo,
  DocFileService,
  IBlockSnapshot,
  storeObjectLine,
  storeObjectPaint,
  storeObjectFormatSection,
  storeObjectTextFrame,
  storeObjectTextStyle,
} from '../../../framework'
import {
  ImageBlockSchema,
  PlacementLayoutBlockSchema,
  ShapeBlockSchema,
  createDefaultEditableShapeGeometry,
  normalizeShapeProps,
  serializeCustomShapeGeometry,
  type ShapeBlockProps,
  type ShapeKind,
} from '../../../blocks'
import {HtmlAdapter} from '../../../adapters/html-adapter/html-adapter'
import {MarkdownAdapter} from '../../../adapters/markdown-adapter/markdown-adapter'
import {BUNDLED_ADAPTER_REGISTRY} from '../../../editor/bundled-adapter-registry'

class ShapeAdapterFileService extends DocFileService {
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

describe('Shape adapters', () => {
  const fileService = new ShapeAdapterFileService()
  const htmlAdapter = new HtmlAdapter(fileService, new Map(), BUNDLED_ADAPTER_REGISTRY)
  const markdownAdapter = new MarkdownAdapter(fileService, new Map(), BUNDLED_ADAPTER_REGISTRY)

  it('preserves new decoration kinds and editable text through HTML and BlockCraft Markdown', async () => {
    const kinds: ShapeKind[] = [
      'ribbon-notched', 'ribbon-notched-left', 'ribbon-notched-right',
      'bookmark', 'ticket', 'arch', 'flower-6', 'scalloped-seal',
    ]
    markdownAdapter.adapterConfigs.set(MARKDOWN_ADAPTER_PROFILE_CONFIG, 'blockcraft')
    for (const kind of kinds) {
      const snapshot = rootSnapshot([ShapeBlockSchema.createSnapshot(kind, '每日感悟')])
      const html = await htmlAdapter.toHtml(snapshot)
      const markdown = await markdownAdapter.toMarkdown(snapshot)
      for (const restored of [
        await htmlAdapter.toBlockSnapshot(html),
        await markdownAdapter.toBlockSnapshot(markdown),
      ]) {
        const shape = restored.children[0] as IBlockSnapshot
        expect(normalizeShapeProps(shape.props).shapeType).withContext(kind).toBe(kind)
        expect((shape.children[0] as IBlockSnapshot).children).withContext(kind)
          .toEqual([jasmine.objectContaining({insert: '每日感悟'})])
      }
    }
  })

  it('round-trips shape geometry, style, placement and rich text through HTML', async () => {
    const shape = ShapeBlockSchema.createSnapshot('flow-decision', [
      {insert: '下一步', attributes: {'a:bold': true}},
    ])
    const defaults = normalizeShapeProps(shape.props)
    shape.props = {
      ...shape.props,
      width: 260,
      height: 120,
      rotation: 37.5,
      ...storeObjectFormatSection('shapeFill', {
        type: 'solid',
        color: '#A7F3D0',
        opacity: 0.7,
      }),
      ...storeObjectLine({
        ...defaults.shapeOutline,
        color: '#047857',
        width: 4,
        dash: 'dash',
      }),
      ...storeObjectTextFrame({
        ...defaults.textFrame,
        horizontalAlign: 'right',
        verticalAlign: 'bottom',
      }),
      ...storeObjectTextStyle({
        ...defaults.textStyle,
        fill: {
          type: 'solid',
          color: '#111827',
          opacity: 1,
        },
      }),
      position: "25 120",
      placementLayer: 'under',
      adjustments: {bend: 420},
      customGeometry: serializeCustomShapeGeometry(
        createDefaultEditableShapeGeometry('curved-connector'),
      ),
    }

    const html = await htmlAdapter.toHtml(rootSnapshot([
      PlacementLayoutBlockSchema.createSnapshot([shape]),
    ]))
    const element = new DOMParser().parseFromString(html, 'text/html')
      .querySelector('figure[data-bc-block="shape"]')
    expect(element?.getAttribute('data-bc-object-shape')).toBe('flow-decision')
    expect(element?.getAttribute('data-bc-object-rotation')).toBe('37.5')
    expect(element?.getAttribute('data-shape-placement-layer')).toBe('under')
    expect(element?.getAttribute('data-shape-adjustments')).toContain('bend')
    expect(element?.getAttribute('data-shape-geometry')).toContain('v1|')
    expect(element?.querySelector('[data-bc-shape-text]')?.textContent)
      .toBe('下一步')

    const importedRoot = await htmlAdapter.toBlockSnapshot(html)
    const imported = importedRoot.children[0] as IBlockSnapshot
    expect(imported.flavour).toBe('shape')
    expect(imported.props).toEqual(jasmine.objectContaining({
      shape: 'flow-decision',
      position: "25 120",
      placementLayer: 'under',
      adjustments: {bend: 420},
      customGeometry: jasmine.stringMatching('^v1\\|'),
    }))
    expect(normalizeShapeProps(imported.props as Partial<ShapeBlockProps>))
      .toEqual(jasmine.objectContaining({
        shapeType: 'flow-decision',
        width: 260,
        height: 120,
        rotation: 37.5,
        fillColor: '#A7F3D0',
        fillOpacity: 0.7,
        strokeColor: '#047857',
        strokeWidth: 4,
        strokeStyle: 'dashed',
        shapeTextAlign: 'right',
        verticalAlign: 'bottom',
        textColor: '#111827',
      }))
    expect((imported.children[0] as IBlockSnapshot).children)
      .toEqual([{insert: '下一步', attributes: {'a:bold': true}}])
  })

  it('round-trips a linear-gradient fill through HTML', async () => {
    const shape = ShapeBlockSchema.createSnapshot('rectangle')
    shape.props = {
      ...shape.props,
      ...storeObjectFormatSection('shapeFill', {
        type: 'linear-gradient',
        opacity: 1,
        angle: 160,
        stops: [
          {color: '#26405E', offset: 0, opacity: 1},
          {color: '#58402E', offset: 1, opacity: 1},
        ],
      }),
    }

    const html = await htmlAdapter.toHtml(rootSnapshot([shape]))
    const element = new DOMParser().parseFromString(html, 'text/html')
      .querySelector('figure[data-bc-block="shape"]')
    expect(element?.getAttribute('data-bc-object-fill'))
      .toBe('linear-gradient(160deg, #26405E 0%, #58402E 100%)')

    const importedRoot = await htmlAdapter.toBlockSnapshot(html)
    const imported = importedRoot.children[0] as IBlockSnapshot
    expect(normalizeShapeProps(imported.props as Partial<ShapeBlockProps>))
      .toEqual(jasmine.objectContaining({
        fillType: 'linear-gradient',
        gradientAngle: 160,
        gradientColors: ['#26405E', '#58402E'],
        gradientStops: [0, 1],
      }))
  })

  it('flattens the placement layout while preserving image placement in HTML', async () => {
    const image = ImageBlockSchema.createSnapshot(
      'https://example.com/image.png',
      320,
      180,
    )
    image.props = {
      ...image.props,
      position: "12.5 240",
      placementLayer: 'under',
    }

    const html = await htmlAdapter.toHtml(rootSnapshot([
      PlacementLayoutBlockSchema.createSnapshot([image]),
    ]))
    const document = new DOMParser().parseFromString(html, 'text/html')
    const figure = document.querySelector('figure[data-bc-block="image"]')

    expect(figure?.getAttribute('data-image-placement-mode')).toBe('absolute')
    expect(figure?.getAttribute('data-image-placement-x')).toBe('12.5')
    expect(figure?.getAttribute('data-image-placement-y')).toBe('240')
    expect(figure?.getAttribute('data-image-placement-layer')).toBe('under')
    expect(figure?.querySelector('img')).not.toBeNull()
  })

  it('filters malformed HTML attributes through shape defaults', async () => {
    const importedRoot = await htmlAdapter.toBlockSnapshot(`
      <figure
        data-bc-block="shape"
        data-bc-object-shape="script"
        data-bc-object-width="-20"
        data-bc-object-fill='{"t":"script","c":"url(javascript:bad)"}'>
        <div data-bc-shape-text>安全文字</div>
      </figure>
    `)
    const imported = importedRoot.children[0] as IBlockSnapshot

    expect(normalizeShapeProps(imported.props as Partial<ShapeBlockProps>))
      .toEqual(jasmine.objectContaining({
        shapeType: 'rectangle',
        width: 48,
        fillColor: '#93C5FD',
      }))
    expect((imported.children[0] as IBlockSnapshot).children)
      .toEqual([jasmine.objectContaining({insert: '安全文字'})])
  })

  it('round-trips an empty shape without creating a shape-text block', async () => {
    const shape = ShapeBlockSchema.createSnapshot('ellipse')
    const html = await htmlAdapter.toHtml(rootSnapshot([shape]))
    const element = new DOMParser().parseFromString(html, 'text/html')
      .querySelector('figure[data-bc-block="shape"]')

    expect(element?.querySelector('[data-bc-shape-text]')).toBeNull()

    const importedRoot = await htmlAdapter.toBlockSnapshot(html)
    const imported = importedRoot.children[0] as IBlockSnapshot
    expect(imported.flavour).toBe('shape')
    expect(imported.children).toEqual([])
  })

  it('degrades a shape to readable Markdown text', async () => {
    const shape = ShapeBlockSchema.createSnapshot('speech-bubble', '讨论结论')
    markdownAdapter.adapterConfigs.set(MARKDOWN_ADAPTER_PROFILE_CONFIG, 'portable')
    const markdown = await markdownAdapter.toMarkdown(rootSnapshot([shape]))

    expect(markdown.trim()).toBe('讨论结论')
    const imported = await markdownAdapter.toBlockSnapshot(markdown)
    expect((imported.children[0] as IBlockSnapshot).flavour).toBe('paragraph')
  })

  it('round-trips compact groups in the blockcraft Markdown profile', async () => {
    markdownAdapter.adapterConfigs.set(MARKDOWN_ADAPTER_PROFILE_CONFIG, 'blockcraft')
    const snapshot = ShapeBlockSchema.createSnapshot('rectangle', '格式往返')
    snapshot.props = {...snapshot.props, textFont: '24px 700 italic', textShadow: 'none', textPadding: '18 22'}
    const markdown = await markdownAdapter.toMarkdown(rootSnapshot([snapshot]))
    const imported = (await markdownAdapter.toBlockSnapshot(markdown)).children[0] as IBlockSnapshot
    expect(imported.props['textFont']).toBe('24px 700 italic')
    expect(imported.props['textPadding']).toBe('18 22')
    expect(imported.props['textStyle']).toBeUndefined()
    expect(imported.props['textFrame']).toBeUndefined()
  })

})
