import {
  BlockNodeType,
  DocAttachmentInfo,
  DocFileService,
  type DeltaInsertEmbed,
  type IBlockSnapshot,
} from '../../../framework'
import {MarkdownAdapter} from '../../../adapters'
import {MARKDOWN_ADAPTER_PROFILE_CONFIG} from '../../../adapters/registry'
import {BUNDLED_ADAPTER_REGISTRY} from '../../../editor/bundled-adapter-registry'

class InlineImageAdapterFileService extends DocFileService {
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

const rootSnapshot = (image: DeltaInsertEmbed): IBlockSnapshot => ({
  id: 'root',
  flavour: 'root',
  nodeType: BlockNodeType.root,
  props: {},
  meta: {},
  children: [{
    id: 'paragraph',
    flavour: 'paragraph',
    nodeType: BlockNodeType.editable,
    props: {},
    meta: {},
    children: [{insert: '前 '}, image, {insert: ' 后'}],
  }],
})

const sourceImage: DeltaInsertEmbed = {
  insert: {image: 'https://cdn.example.com/diagram.png'},
  attributes: {
    width: 176,
    height: 106,
    wrap: true,
    side: 'left',
    x: 0.24,
    gap: 12,
    alt: '架构示意图',
  },
}

describe('Inline image Markdown adapter', () => {
  const fileService = new InlineImageAdapterFileService()

  it('keeps portable Markdown as a standard image and drops layout attributes', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )

    const markdown = await adapter.toMarkdown(rootSnapshot(sourceImage))
    expect(markdown.trim()).toBe(
      '前 ![架构示意图](https://cdn.example.com/diagram.png) 后',
    )

    const importedRoot = await adapter.toBlockSnapshot(markdown)
    const paragraph = importedRoot.children[0] as IBlockSnapshot
    const imported = (paragraph.children as DeltaInsertEmbed[])
      .find(delta => typeof delta.insert === 'object')
    expect(imported).toEqual({
      insert: {image: 'https://cdn.example.com/diagram.png'},
    })
  })

  it('keeps BlockCraft-profile inline images as standard images with alt text', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map([[MARKDOWN_ADAPTER_PROFILE_CONFIG, 'blockcraft']]),
      BUNDLED_ADAPTER_REGISTRY,
    )

    const markdown = await adapter.toMarkdown(rootSnapshot(sourceImage))
    expect(markdown.trim()).toBe(
      '前 ![架构示意图](https://cdn.example.com/diagram.png) 后',
    )
    expect(markdown).not.toContain(':bc-image')
    expect(markdown).not.toContain('payload=')

    const importedRoot = await adapter.toBlockSnapshot(markdown)
    const paragraph = importedRoot.children[0] as IBlockSnapshot
    const imported = (paragraph.children as DeltaInsertEmbed[])
      .find(delta => typeof delta.insert === 'object')
    expect(imported).toEqual({
      insert: {image: 'https://cdn.example.com/diagram.png'},
    })
  })
})
