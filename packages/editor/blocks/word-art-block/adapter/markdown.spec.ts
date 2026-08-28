import {
  BlockNodeType,
  DocAttachmentInfo,
  DocFileService,
  IBlockSnapshot,
} from '../../../framework'
import {WordArtBlockSchema} from '../../../blocks'
import {MarkdownAdapter} from '../../../adapters/markdown-adapter/markdown-adapter'
import {BUNDLED_ADAPTER_REGISTRY} from '../../../editor/bundled-adapter-registry'

class WordArtMarkdownFileService extends DocFileService {
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

describe('WordArt Markdown adapter', () => {
  const adapter = new MarkdownAdapter(
    new WordArtMarkdownFileService(),
    new Map(),
    BUNDLED_ADAPTER_REGISTRY,
  )

  it('round-trips text and bounded props in the default hybrid profile', async () => {
    const wordArt = WordArtBlockSchema.createSnapshot('年度总结', {
      width: 420,
      height: 128,
      rotation: 24,
      fontFamily: 'slab-serif',
      fontSize: 60,
      fillType: 'linear-gradient',
      gradientAngle: 120,
      gradientColors: ['#F97316', '#DB2777'],
      gradientStops: [0, 1],
      effect: 'wave',
      position: {x: 48, y: 156},
      placementLayer: 'under',
    })

    const markdown = await adapter.toMarkdown(rootSnapshot([wordArt]))

    expect(markdown).toContain(':::bc-word-art')
    expect(markdown).toContain(':::bc-word-art\n\n---')
    expect(markdown).toContain('width: 420')
    expect(markdown).not.toContain('props=')
    expect(markdown).toContain('年度总结')
    const importedRoot = await adapter.toBlockSnapshot(markdown)
    expect(importedRoot.children.length).toBe(1)
    const imported = importedRoot.children[0] as IBlockSnapshot
    expect(imported.flavour).toBe('word-art')
    expect(imported.children).toEqual([{insert: '年度总结'}])
    expect(imported.props).toEqual(wordArt.props)
  })
})
