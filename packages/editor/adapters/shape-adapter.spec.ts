import {
  BlockNodeType,
  DocAttachmentInfo,
  DocFileService,
  IBlockSnapshot,
} from '../framework'
import {
  ImageBlockSchema,
  PlacementLayoutBlockSchema,
  ShapeBlockSchema,
  createDefaultEditableShapeGeometry,
  serializeCustomShapeGeometry,
} from '../blocks'
import {HtmlAdapter} from './html-adapter/html-adapter'
import {MarkdownAdapter} from './markdown-adapter/markdown-adapter'

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
  const htmlAdapter = new HtmlAdapter(fileService)
  const markdownAdapter = new MarkdownAdapter(fileService)

  it('round-trips shape geometry, style, placement and rich text through HTML', async () => {
    const shape = ShapeBlockSchema.createSnapshot('flow-decision', [
      {insert: '下一步', attributes: {'a:bold': true}},
    ])
    shape.props = {
      ...shape.props,
      width: 260,
      height: 120,
      rotation: 37.5,
      fillColor: '#A7F3D0',
      fillOpacity: 0.7,
      strokeColor: '#047857',
      strokeWidth: 4,
      strokeStyle: 'dashed',
      textColor: '#111827',
      shapeTextAlign: 'right',
      verticalAlign: 'bottom',
      position: {x: 25, y: 120},
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
    expect(element?.getAttribute('data-shape-type')).toBe('flow-decision')
    expect(element?.getAttribute('data-shape-rotation')).toBe('37.5')
    expect(element?.getAttribute('data-shape-placement-layer')).toBe('under')
    expect(element?.getAttribute('data-shape-adjustments')).toContain('bend')
    expect(element?.getAttribute('data-shape-geometry')).toContain('paths')
    expect(element?.querySelector('[data-bc-shape-text]')?.textContent)
      .toBe('下一步')

    const importedRoot = await htmlAdapter.toBlockSnapshot(html)
    const imported = importedRoot.children[0] as IBlockSnapshot
    expect(imported.flavour).toBe('shape')
    expect(imported.props).toEqual(jasmine.objectContaining({
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
      position: {x: 25, y: 120},
      placementLayer: 'under',
      adjustments: {bend: 420},
      customGeometry: jasmine.stringMatching('"version":1'),
    }))
    expect((imported.children[0] as IBlockSnapshot).children)
      .toEqual([{insert: '下一步', attributes: {'a:bold': true}}])
  })

  it('flattens the placement layout while preserving image placement in HTML', async () => {
    const image = ImageBlockSchema.createSnapshot(
      'https://example.com/image.png',
      320,
      180,
    )
    image.props = {
      ...image.props,
      position: {x: 12.5, y: 240},
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
        data-shape-type="script"
        data-shape-width="-20"
        data-shape-fill="url(javascript:bad)">
        <div data-bc-shape-text>安全文字</div>
      </figure>
    `)
    const imported = importedRoot.children[0] as IBlockSnapshot

    expect(imported.props).toEqual(jasmine.objectContaining({
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
    const markdown = await markdownAdapter.toMarkdown(rootSnapshot([shape]))

    expect(markdown.trim()).toBe('讨论结论')
    const imported = await markdownAdapter.toBlockSnapshot(markdown)
    expect((imported.children[0] as IBlockSnapshot).flavour).toBe('paragraph')
  })
})
