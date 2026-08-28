import {
  BlockNodeType,
  DocAttachmentInfo,
  DocFileService,
  IBlockSnapshot,
} from '../../../framework'
import {
  ShapeBlockSchema,
  ShapeTextBlockSchema,
} from '../../../blocks'
import {MarkdownAdapter} from '../../../adapters/markdown-adapter/markdown-adapter'
import {BUNDLED_ADAPTER_REGISTRY} from '../../../editor/bundled-adapter-registry'

class ShapeMarkdownFileService extends DocFileService {
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

describe('Shape Markdown adapter', () => {
  const adapter = new MarkdownAdapter(
    new ShapeMarkdownFileService(),
    new Map(),
    BUNDLED_ADAPTER_REGISTRY,
  )

  it('round-trips one shape envelope in the default hybrid profile', async () => {
    const shape = ShapeBlockSchema.createSnapshot('right-arrow', [
      {insert: '审批通过', attributes: {'a:bold': true}},
    ])
    shape.props = {
      ...shape.props,
      width: 280,
      height: 96,
      rotation: 18,
      position: {x: 32, y: 144},
      placementLayer: 'under',
      adjustments: {headWidth: 0.42},
    }

    const markdown = await adapter.toMarkdown(rootSnapshot([shape]))

    expect(markdown).toContain(':::bc-shape')
    expect(markdown).toContain(':::bc-shape\n\n---')
    expect(markdown).toContain('width: 280')
    expect(markdown).not.toContain('props=')
    expect(markdown).not.toContain(':::bc-shape-text')
    expect(markdown).toContain('**审批通过**')

    const importedRoot = await adapter.toBlockSnapshot(markdown)
    expect(importedRoot.children.length).toBe(1)
    const imported = importedRoot.children[0] as IBlockSnapshot
    expect(imported.flavour).toBe('shape')
    expect(imported.props).toEqual(jasmine.objectContaining({
      shape: 'right-arrow',
      width: 280,
      height: 96,
      rotation: 18,
      position: {x: 32, y: 144},
      placementLayer: 'under',
      adjustments: {headWidth: 0.42},
    }))
    expect(imported.children.length).toBe(1)
    const text = imported.children[0] as IBlockSnapshot
    expect(text.flavour).toBe('shape-text')
    expect(text.children).toEqual([
      {insert: '审批通过', attributes: {'a:bold': true}},
    ])
  })

  it('recovers a standalone shape-text through its explicit directive', async () => {
    const markdown = await adapter.toMarkdown(rootSnapshot([
      ShapeTextBlockSchema.createSnapshot('孤立形状文字'),
    ]))

    expect(markdown).toContain(':::bc-shape-text')
    const importedRoot = await adapter.toBlockSnapshot(markdown)
    expect(importedRoot.children.length).toBe(1)
    const imported = importedRoot.children[0] as IBlockSnapshot
    expect(imported.flavour).toBe('shape-text')
    expect(imported.children).toEqual([{insert: '孤立形状文字'}])
  })
})
