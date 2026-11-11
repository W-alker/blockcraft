import {TestBed} from '@angular/core/testing'
import {
  BlockNodeType,
  ClipboardDataType,
  DOC_FILE_SERVICE_TOKEN,
  DocAttachmentInfo,
  DocFileService,
  IBlockSnapshot,
  measureIncomingContentBytes,
} from '../../framework'
import {createGenericBlockAdapterContribution} from '../../adapters/generic'
import {
  BUNDLED_ADAPTER_REGISTRY,
  createBundledAdapterRegistry,
} from '../bundled-adapter-registry'
import {
  AdapterService,
  EDITOR_ADAPTER_REGISTRY_TOKEN,
} from './adapter.service'
import {BUNDLED_CLIPBOARD_SOURCE_ADAPTERS} from '../clipboard-source-adapters'

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

describe('AdapterService registry composition', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('uses the bundled registry and exposes real MIME adapters only', () => {
    TestBed.configureTestingModule({
      providers: [
        AdapterService,
        {provide: DOC_FILE_SERVICE_TOKEN, useClass: TestFileService},
      ],
    })

    const service = TestBed.inject(AdapterService)

    expect(service.registry).toBe(BUNDLED_ADAPTER_REGISTRY)
    expect(service.clipboardSourceAdapters).toBe(BUNDLED_CLIPBOARD_SOURCE_ADAPTERS)
    expect(service.getSupportedTypes()).toEqual([
      ClipboardDataType.HTML,
      ClipboardDataType.MARKDOWN,
    ])
    expect(service.getAdapter(ClipboardDataType.RTF)).toBeUndefined()
  })

  it('imports Mermaid through the registered Markdown MIME adapter', async () => {
    TestBed.configureTestingModule({
      providers: [
        AdapterService,
        {provide: DOC_FILE_SERVICE_TOKEN, useClass: TestFileService},
      ],
    })

    const service = TestBed.inject(AdapterService)
    const adapter = service.getAdapter(ClipboardDataType.MARKDOWN)
    const snapshot = await adapter!.toSnapshot(
      '```mermaid\ngraph TD\n  A --> B\n```\n',
    )
    const mermaid = snapshot.children[0] as IBlockSnapshot

    expect(mermaid.flavour).toBe('mermaid')
    expect((mermaid.children[0] as IBlockSnapshot).flavour)
      .toBe('mermaid-textarea')
  })

  it('imports BlockCraft container directives through the default Markdown MIME adapter', async () => {
    TestBed.configureTestingModule({
      providers: [
        AdapterService,
        {provide: DOC_FILE_SERVICE_TOKEN, useClass: TestFileService},
      ],
    })

    const service = TestBed.inject(AdapterService)
    const adapter = service.getAdapter(ClipboardDataType.MARKDOWN)
    const snapshot = await adapter!.toSnapshot([
      ':::bc-callout',
      'BlockCraft content',
      ':::',
      '',
    ].join('\n'))
    const callout = snapshot.children[0] as IBlockSnapshot

    expect(callout.flavour).toBe('callout')
    expect((callout.children[0] as IBlockSnapshot).flavour).toBe('paragraph')
  })

  it('exports portable Markdown plus opted-in custom directives by default', async () => {
    TestBed.configureTestingModule({
      providers: [
        AdapterService,
        {provide: DOC_FILE_SERVICE_TOKEN, useClass: TestFileService},
      ],
    })

    const service = TestBed.inject(AdapterService)
    const adapter = service.getAdapter(ClipboardDataType.MARKDOWN)
    const markdown = await adapter!.fromSnapshot({
      id: 'root',
      flavour: 'root',
      nodeType: BlockNodeType.root,
      props: {},
      meta: {},
      children: [{
        id: 'callout',
        flavour: 'callout',
        nodeType: BlockNodeType.block,
        props: {prefix: '!'},
        meta: {},
        children: [{
          id: 'paragraph',
          flavour: 'paragraph',
          nodeType: BlockNodeType.editable,
          props: {},
          meta: {},
          children: [{insert: '注意'}],
        }],
      }],
    } as IBlockSnapshot)

    expect(markdown).toContain(':::bc-callout')
    expect(markdown).toContain('注意')
  })

  it('uses a host registry override for custom Block adapters', () => {
    const custom = createGenericBlockAdapterContribution({
      flavour: 'custom-service-card',
      nodeType: BlockNodeType.void,
      portableText: () => 'Custom service card',
    })
    const registry = createBundledAdapterRegistry({
      additionalBlocks: [custom],
    })
    TestBed.configureTestingModule({
      providers: [
        AdapterService,
        {provide: DOC_FILE_SERVICE_TOKEN, useClass: TestFileService},
        {provide: EDITOR_ADAPTER_REGISTRY_TOKEN, useValue: registry},
      ],
    })

    const service = TestBed.inject(AdapterService)

    expect(service.registry).toBe(registry)
    expect(service.registry.htmlMatchersForFlavour('custom-service-card'))
      .toEqual(custom.html!)
    expect(service.getAdapter(ClipboardDataType.MARKDOWN)!.exceedsIncomingContentLimit!('中'.repeat(1000), 100)).toBeFalse()
    expect(service.getAdapter(ClipboardDataType.HTML)!.exceedsIncomingContentLimit!('<p>' + '中'.repeat(1000) + '</p>', 100)).toBeFalse()
  })

  it('preflights literal prose and simple HTML without treating markup bytes as content', async () => {
    TestBed.configureTestingModule({providers: [AdapterService, {provide: DOC_FILE_SERVICE_TOKEN, useClass: TestFileService}]})
    const service = TestBed.inject(AdapterService)
    const md = service.getAdapter(ClipboardDataType.MARKDOWN)!
    const html = service.getAdapter(ClipboardDataType.HTML)!
    for (const [adapter, source] of [
      [md, '中'.repeat(200)],
      [html, '<p>' + '中'.repeat(200) + '</p>'],
      [html, '<h2>' + 'a'.repeat(250) + '</h2><p>' + '中'.repeat(100) + '</p>'],
    ] as const) {
      expect(adapter.exceedsIncomingContentLimit!(source, 500)).toBeTrue()
      const snapshot = await adapter.toSnapshot(source)
      const size = measureIncomingContentBytes({snapshots: snapshot.children as IBlockSnapshot[]})
      expect(size).toBeGreaterThan(500)
      expect(adapter.exceedsIncomingContentLimit!(source, size)).toBeFalse()
    }
    expect(md.exceedsIncomingContentLimit!(' '.repeat(10000), 500)).toBeFalse()
    expect(md.exceedsIncomingContentLimit!('<!--' + 'x'.repeat(10000) + '-->', 500)).toBeFalse()
    expect(md.exceedsIncomingContentLimit!('[unused]: https://test/' + 'x'.repeat(10000), 500)).toBeFalse()
    for (const source of [
      '<!--' + 'x'.repeat(10000) + '--><p>ok</p>',
      '<p hidden>' + 'x'.repeat(10000) + '</p>',
      '<p>' + '&amp;'.repeat(200) + '</p>',
      '<p>ok</p><script>' + 'x'.repeat(10000) + '</script>',
      '<p>' + ' '.repeat(10000) + '</p>',
    ]) expect(html.exceedsIncomingContentLimit!(source, 500)).toBeFalse()
  })
})
