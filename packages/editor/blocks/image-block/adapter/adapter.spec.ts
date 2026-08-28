import {
  BlockNodeType,
  DocAttachmentInfo,
  DocFileService,
  type IBlockSnapshot,
} from '../../../framework'
import {HtmlAdapter, MarkdownAdapter} from '../../../adapters'
import {MARKDOWN_ADAPTER_PROFILE_CONFIG} from '../../../adapters/registry'
import {BUNDLED_ADAPTER_REGISTRY} from '../../../editor/bundled-adapter-registry'
import {FetchUtils} from '../../../global'

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ' +
  'AAAADElEQVR42mNk+M/wHwAF/gL+3R04WQAAAABJRU5ErkJggg=='

class ImageAdapterFileService extends DocFileService {
  uploadImg(): Promise<string> { return Promise.resolve('uploaded-image') }
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

const imageSnapshot = (src: string): IBlockSnapshot => ({
  id: 'image',
  flavour: 'image',
  nodeType: BlockNodeType.block,
  props: {
    src,
    wr: 62.5,
    ar: 16 / 9,
    align: 'right',
    position: {x: 24, y: 36},
    placementLayer: 'under',
  },
  meta: {},
  children: [{
    id: 'caption',
    flavour: 'caption',
    nodeType: BlockNodeType.editable,
    props: {textAlign: 'center'},
    meta: {},
    children: [{insert: '图片说明', attributes: {'a:bold': true}}],
  }],
})

describe('Image Block adapters', () => {
  const fileService = new ImageAdapterFileService()

  it('imports an ordinary Markdown image from its original URL without resource ingestion', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const src = 'https://cdn.example.com/markdown-cover.png'
    const fetchSpy = spyOn(FetchUtils, 'fetchImage').and.callFake(async () => {
      throw new Error('adapter must not fetch imported images')
    })
    const uploadSpy = spyOn(fileService, 'uploadImg')
      .and.resolveTo('unexpected-upload.png')

    const importedRoot = await adapter.toBlockSnapshot(
      `![Cover](${src} "Cover")\n`,
    )
    const imported = importedRoot.children[0] as IBlockSnapshot

    expect(importedRoot.children.length).toBe(1)
    expect(imported.flavour).toBe('image')
    expect(imported.props).toEqual(jasmine.objectContaining({
      src,
      wr: 100,
    }))
    expect(imported.children).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(uploadSpy).not.toHaveBeenCalled()
  })

  it('preserves safe relative image URLs in ordinary Markdown and HTML', async () => {
    const markdownAdapter = new MarkdownAdapter(
      fileService,
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const htmlAdapter = new HtmlAdapter(
      fileService,
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const fetchSpy = spyOn(FetchUtils, 'fetchImage').and.callFake(async () => {
      throw new Error('adapter must not fetch imported images')
    })
    const uploadSpy = spyOn(fileService, 'uploadImg')
      .and.resolveTo('unexpected-upload.png')

    const markdownRoot = await markdownAdapter.toBlockSnapshot(
      '![Relative](assets/relative-cover.png)\n',
    )
    const htmlRoot = await htmlAdapter.toBlockSnapshot(
      '<img src="../assets/relative-cover.png">',
    )

    expect((markdownRoot.children[0] as IBlockSnapshot).props['src'])
      .toBe('assets/relative-cover.png')
    expect((htmlRoot.children[0] as IBlockSnapshot).props['src'])
      .toBe('../assets/relative-cover.png')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(uploadSpy).not.toHaveBeenCalled()
  })

  it('rejects active-content image sources in ordinary Markdown and HTML', async () => {
    const markdownAdapter = new MarkdownAdapter(
      fileService,
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const htmlAdapter = new HtmlAdapter(
      fileService,
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const fetchSpy = spyOn(FetchUtils, 'fetchImage').and.callFake(async () => {
      throw new Error('adapter must not fetch imported images')
    })
    const uploadSpy = spyOn(fileService, 'uploadImg')
      .and.resolveTo('unexpected-upload.png')
    const unsafeSources = [
      'javascript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    ]

    for (const src of unsafeSources) {
      const markdownRoot = await markdownAdapter.toBlockSnapshot(
        `![Unsafe](<${src}>)\n`,
      )
      const htmlRoot = await htmlAdapter.toBlockSnapshot(
        `<img src="${src}">`,
      )

      expect((markdownRoot.children as IBlockSnapshot[])
        .some(block => block.flavour === 'image'))
        .withContext(`Markdown source: ${src}`)
        .toBeFalse()
      expect((htmlRoot.children as IBlockSnapshot[])
        .some(block => block.flavour === 'image'))
        .withContext(`HTML source: ${src}`)
        .toBeFalse()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(uploadSpy).not.toHaveBeenCalled()
  })

  it('keeps BlockCraft-profile images readable and standard', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map([[MARKDOWN_ADAPTER_PROFILE_CONFIG, 'blockcraft']]),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const source = imageSnapshot('https://cdn.example.com/cover.png')

    const markdown = await adapter.toMarkdown(rootSnapshot([source]))
    expect(markdown).toContain(
      '![](https://cdn.example.com/cover.png "https://cdn.example.com/cover.png")',
    )
    expect(markdown).not.toContain('bc-image')
    expect(markdown).toContain('图片说明')

    const importedRoot = await adapter.toBlockSnapshot(markdown)
    const imported = importedRoot.children as IBlockSnapshot[]
    expect(imported.map(block => block.flavour)).toEqual([
      'image',
      'paragraph',
    ])
    expect(imported[0]?.props['src']).toBe('https://cdn.example.com/cover.png')
    expect(imported[0]?.props['position']).toBeUndefined()
    expect(imported[1]?.children).toEqual([
      {insert: '图片说明', attributes: {'a:bold': true}},
    ])
  })

  it('keeps portable Markdown standard and explicitly degrades its caption to a sibling paragraph', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )

    const markdown = await adapter.toMarkdown(
      rootSnapshot([imageSnapshot(TINY_PNG)]),
    )
    expect(markdown).toContain(`![](${TINY_PNG}`)
    expect(markdown).not.toContain('bc-image')
    expect(markdown).toContain('图片说明')

    const importedRoot = await adapter.toBlockSnapshot(markdown)
    const imported = importedRoot.children as IBlockSnapshot[]
    expect(imported.map(block => block.flavour)).toEqual([
      'image',
      'paragraph',
    ])
    expect(imported[0]?.children).toEqual([])
    expect(imported[1]?.children).toEqual([
      {insert: '图片说明', attributes: {'a:bold': true}},
    ])
  })

  it('keeps figcaption nested under its image across HTML round-trip', async () => {
    const adapter = new HtmlAdapter(
      fileService,
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const html = await adapter.toHtml(
      rootSnapshot([imageSnapshot(TINY_PNG)]),
    )
    const document = new DOMParser().parseFromString(html, 'text/html')
    const figure = document.querySelector('figure[data-bc-block="image"]')
    expect(figure?.querySelector(':scope > img')).not.toBeNull()
    expect(figure?.querySelector(':scope > figcaption')?.textContent)
      .toBe('图片说明')
    expect(document.body.querySelector(':scope > figcaption')).toBeNull()

    const importedRoot = await adapter.toBlockSnapshot(html)
    const imported = importedRoot.children as IBlockSnapshot[]
    expect(imported.length).toBe(1)
    expect(imported[0]?.flavour).toBe('image')
    expect((imported[0]?.children[0] as IBlockSnapshot).flavour)
      .toBe('caption')
    expect((imported[0]?.children[0] as IBlockSnapshot).children).toEqual([
      {insert: '图片说明', attributes: {'a:bold': true}},
    ])

    const plainRoot = await adapter.toBlockSnapshot(
      `<figure><img src="${TINY_PNG}"><figcaption>普通图注</figcaption></figure>`,
    )
    const plainImage = plainRoot.children[0] as IBlockSnapshot
    expect(plainImage.flavour).toBe('image')
    expect((plainImage.children[0] as IBlockSnapshot).flavour).toBe('caption')
    expect((plainImage.children[0] as IBlockSnapshot).children)
      .toEqual([jasmine.objectContaining({insert: '普通图注'})])
  })

  it('imports a remote HTML image without resource ingestion and preserves responsive size, caption, and placement', async () => {
    const adapter = new HtmlAdapter(
      fileService,
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const src = 'https://cdn.example.com/placed-cover.png'
    const fetchSpy = spyOn(FetchUtils, 'fetchImage').and.callFake(async () => {
      throw new Error('adapter must not fetch imported images')
    })
    const uploadSpy = spyOn(fileService, 'uploadImg')
      .and.resolveTo('unexpected-upload.png')
    const html = [
      '<figure data-bc-block="image"',
      ' data-image-placement-mode="absolute"',
      ' data-image-placement-x="24"',
      ' data-image-placement-y="36"',
      ' data-image-placement-layer="under">',
      `<img src="${src}" data-bc-wr="62.5" data-bc-ar="1.7777777778">`,
      '<figcaption>远程图片说明</figcaption>',
      '</figure>',
    ].join('')

    const importedRoot = await adapter.toBlockSnapshot(html)
    const imported = importedRoot.children[0] as IBlockSnapshot
    const caption = imported.children[0] as IBlockSnapshot

    expect(importedRoot.children.length).toBe(1)
    expect(imported.flavour).toBe('image')
    expect(imported.props).toEqual(jasmine.objectContaining({
      src,
      wr: 62.5,
      ar: 1.7777777778,
      position: {x: 24, y: 36},
      placementLayer: 'under',
    }))
    expect(caption.flavour).toBe('caption')
    expect(caption.children).toEqual([
      jasmine.objectContaining({insert: '远程图片说明'}),
    ])
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(uploadSpy).not.toHaveBeenCalled()
  })

  it('preserves legacy HTML image width and height without resource ingestion', async () => {
    const adapter = new HtmlAdapter(
      fileService,
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const src = 'https://cdn.example.com/legacy-cover.png'
    const fetchSpy = spyOn(FetchUtils, 'fetchImage').and.callFake(async () => {
      throw new Error('adapter must not fetch imported images')
    })
    const uploadSpy = spyOn(fileService, 'uploadImg')
      .and.resolveTo('unexpected-upload.png')

    const importedRoot = await adapter.toBlockSnapshot(
      `<img src="${src}" width="640" height="360">`,
    )
    const imported = importedRoot.children[0] as IBlockSnapshot

    expect(imported.flavour).toBe('image')
    expect(imported.props).toEqual(jasmine.objectContaining({
      src,
      width: 640,
      height: 360,
    }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(uploadSpy).not.toHaveBeenCalled()
  })
})
