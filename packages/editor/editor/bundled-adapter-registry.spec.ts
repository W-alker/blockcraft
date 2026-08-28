import {
  BlockNodeType,
  DocAttachmentInfo,
  DocFileService,
  type DeltaInsert,
  type IBlockSnapshot,
} from '../framework'
import {BUNDLED_EDITOR_SCHEMAS} from './bundled-capabilities'
import {createInlineWordArtDelta} from '../embeds'
import {
  BUNDLED_ADAPTER_REGISTRY,
  BUNDLED_BLOCK_ADAPTER_CONTRIBUTIONS,
  BUNDLED_INLINE_EMBED_ADAPTER_CONTRIBUTIONS,
} from './bundled-adapter-registry'
import {decodeAdapterProps, encodeAdapterProps} from '../adapters/generic'
import {HtmlAdapter} from '../adapters/html-adapter'
import {MarkdownAdapter} from '../adapters/markdown-adapter'
import {MARKDOWN_ADAPTER_PROFILE_CONFIG} from '../adapters/registry'
import {AdapterRegistry} from '../adapters/registry'

class TestFileService extends DocFileService {
  uploadImg(): Promise<string> {
    return Promise.resolve('')
  }

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

const root = (children: IBlockSnapshot[]): IBlockSnapshot => ({
  id: 'root',
  flavour: 'root',
  nodeType: BlockNodeType.root,
  props: {},
  meta: {},
  children,
})

describe('bundled Adapter registry', () => {
  const fileService = new TestFileService()

  it('covers all bundled schemas plus dormant and presentation-only schemas', () => {
    const flavours = new Set(
      BUNDLED_BLOCK_ADAPTER_CONTRIBUTIONS.flatMap(item => item.flavours),
    )
    expect(flavours.size).toBe(39)
    for (const schema of BUNDLED_EDITOR_SCHEMAS) {
      expect(flavourCovered(flavours, schema.flavour)).toBeTrue()
    }
    expect(flavours.has('frame')).toBeTrue()
    expect(flavours.has('embed')).toBeTrue()
    expect(flavours.has('demo-cover')).toBeTrue()
  })

  it('keeps sibling ownership separate while registering a shared matcher once', () => {
    const families = [
      ['paragraph', 'blockquote'],
      ['ordered', 'bullet', 'todo'],
      ['video', 'audio'],
    ] as const

    for (const ids of families) {
      const contributions = ids.map(id =>
        BUNDLED_BLOCK_ADAPTER_CONTRIBUTIONS.find(item => item.id === id)!,
      )
      const htmlMatcher = contributions[0].html![0]
      const markdownMatcher = contributions[0].markdown![0]

      contributions.forEach((contribution, index) => {
        expect(contribution.flavours).toEqual([ids[index]])
        expect(contribution.html![0]).toBe(htmlMatcher)
        expect(contribution.markdown![0]).toBe(markdownMatcher)
        expect(BUNDLED_ADAPTER_REGISTRY.htmlMatchersForFlavour(ids[index])[0])
          .toBe(htmlMatcher)
        expect(BUNDLED_ADAPTER_REGISTRY.markdownMatchersForFlavour(ids[index])[0])
          .toBe(markdownMatcher)
      })
      expect(BUNDLED_ADAPTER_REGISTRY.htmlBlockMatchers.filter(
        matcher => matcher === htmlMatcher,
      ).length).toBe(1)
      expect(BUNDLED_ADAPTER_REGISTRY.markdownBlockMatchers.filter(
        matcher => matcher === markdownMatcher,
      ).length).toBe(1)
    }
  })

  it('covers every bundled inline Embed exactly once', () => {
    expect(BUNDLED_INLINE_EMBED_ADAPTER_CONTRIBUTIONS.map(item => item.key))
      .toEqual(['icon', 'image', 'date', 'mention', 'latex', 'shape', 'word-art'])
    for (const contribution of BUNDLED_INLINE_EMBED_ADAPTER_CONTRIBUTIONS) {
      expect(contribution.html.deltaToAst.length).toBeGreaterThan(0)
      expect(contribution.html.astToDelta.length).toBeGreaterThan(0)
      expect(contribution.markdown.deltaToAst.length).toBeGreaterThan(0)
      expect(contribution.markdown.astToDelta.length).toBeGreaterThan(0)
    }
  })

  it('rejects duplicate Block and Embed ownership', () => {
    expect(() => new AdapterRegistry([
      BUNDLED_BLOCK_ADAPTER_CONTRIBUTIONS[0],
      BUNDLED_BLOCK_ADAPTER_CONTRIBUTIONS[0],
    ])).toThrowError(/Duplicate Block adapter contribution id/)
    expect(() => new AdapterRegistry([], [
      BUNDLED_INLINE_EMBED_ADAPTER_CONTRIBUTIONS[0],
      BUNDLED_INLINE_EMBED_ADAPTER_CONTRIBUTIONS[0],
    ])).toThrowError(/Duplicate Inline Embed adapter key/)
  })

  it('takes an immutable snapshot of contribution arrays', () => {
    const source = [BUNDLED_BLOCK_ADAPTER_CONTRIBUTIONS[0]]
    const registry = new AdapterRegistry(source)
    source.push(BUNDLED_BLOCK_ADAPTER_CONTRIBUTIONS[1])

    expect(registry.blocks.length).toBe(1)
    expect(Object.isFrozen(registry.blocks)).toBeTrue()
    expect(Object.isFrozen(registry.htmlBlockMatchers)).toBeTrue()
  })

  it('builds a profile-filtered Markdown manifest from active contributions', () => {
    const portable = BUNDLED_ADAPTER_REGISTRY.createMarkdownManifest('portable')
    const hybrid = BUNDLED_ADAPTER_REGISTRY.createMarkdownManifest('hybrid')

    expect(portable.standardFirst).toBeTrue()
    expect(portable.syntaxes.map(item => item.id)).toContain('block:mermaid')
    expect(portable.syntaxes.map(item => item.id)).toContain('inline:mention')
    expect(portable.syntaxes.map(item => item.id)).not.toContain('block:callout')
    expect(hybrid.syntaxes.map(item => item.id)).toContain('block:callout')
    expect(hybrid.syntaxes.map(item => item.id)).toContain('block:text-box')
    expect(hybrid.syntaxes.find(item => item.id === 'block:mermaid')?.example)
      .toContain('```mermaid')
    expect(hybrid.syntaxes.find(item => item.id === 'inline:mention')?.example)
      .toContain('urn:blockcraft:mention:user:user-123')
    expect(hybrid.syntaxes.slice(0, 3).every(item => item.id.startsWith('standard:')))
      .toBeTrue()
    const customIds = hybrid.syntaxes.slice(3).map(item => item.id)
    expect(customIds).toEqual([...customIds].sort())
    expect(Object.isFrozen(hybrid.syntaxes)).toBeTrue()
  })

  it('rejects duplicate Markdown syntax contributions', () => {
    const contribution = BUNDLED_BLOCK_ADAPTER_CONTRIBUTIONS[0]
    expect(() => new AdapterRegistry([
      {...contribution, id: 'syntax-a', markdownSyntax: [{
        id: 'duplicate',
        title: 'A',
        description: 'A',
        kind: 'standard',
        example: 'A',
      }]},
      {...BUNDLED_BLOCK_ADAPTER_CONTRIBUTIONS[1], id: 'syntax-b', markdownSyntax: [{
        id: 'duplicate',
        title: 'B',
        description: 'B',
        kind: 'standard',
        example: 'B',
      }]},
    ])).toThrowError(/Duplicate Markdown syntax id/)
  })

  it('filters active-content URLs in generic adapter metadata', () => {
    const encoded = encodeAdapterProps({
      name: 'safe',
      url: 'javascript:alert(1)',
      poster: 'data:text/html,<script>alert(1)</script>',
    })
    const decoded = decodeAdapterProps(encoded)

    expect(decoded['name']).toBe('safe')
    expect(decoded['url']).toBeUndefined()
    expect(decoded['poster']).toBeUndefined()
  })

  it('round-trips a custom callout directive in blockcraft Markdown', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map([[MARKDOWN_ADAPTER_PROFILE_CONFIG, 'blockcraft']]),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const snapshot = root([{
      id: 'callout',
      flavour: 'callout',
      nodeType: BlockNodeType.block,
      props: {prefix: '!', color: '#222', backColor: '#fff4cc'},
      meta: {},
      children: [{
        id: 'paragraph',
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {},
        meta: {},
        children: [{insert: '注意内容'}] as DeltaInsert[],
      }],
    }])

    const markdown = await adapter.toMarkdown(snapshot)
    expect(markdown).toMatch(/^:::bc-callout(?:\[|\{|$)/m)
    expect(markdown).toContain(':::bc-callout\n\n---')
    expect(markdown).toContain('prefix: "!"')
    expect(markdown).not.toContain('props=')
    expect(markdown).toContain('注意内容')
    expect(markdown.trimEnd()).toMatch(/注意内容\n\n:::$/)

    const imported = await adapter.toBlockSnapshot(markdown)
    const callout = imported.children[0] as IBlockSnapshot
    expect(callout.flavour).toBe('callout')
    expect(callout.props['prefix']).toBe('!')
    expect((callout.children[0] as IBlockSnapshot).flavour).toBe('paragraph')
  })

  it('round-trips mention as a standard URN link in the blockcraft profile', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map([[MARKDOWN_ADAPTER_PROFILE_CONFIG, 'blockcraft']]),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const snapshot = root([{
      id: 'paragraph',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {},
      meta: {},
      children: [{
        insert: {mention: '张三'},
        attributes: {mentionId: 'u-1', mentionType: 'user'},
      }] as DeltaInsert[],
    }])

    const markdown = await adapter.toMarkdown(snapshot)
    expect(markdown).toContain(
      '[@张三](urn:blockcraft:mention:user:u-1',
    )
    expect(markdown).not.toContain(':bc-mention[')
    const imported = await adapter.toBlockSnapshot(markdown)
    const paragraph = imported.children[0] as IBlockSnapshot
    expect((paragraph.children[0] as DeltaInsert).insert).toEqual({mention: '张三'})
    expect((paragraph.children[0] as DeltaInsert).attributes?.['mentionId']).toBe('u-1')
    expect((paragraph.children[0] as DeltaInsert).attributes?.['mentionType']).toBe('user')
  })

  it('continues to import the legacy mention directive', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map([[MARKDOWN_ADAPTER_PROFILE_CONFIG, 'blockcraft']]),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const imported = await adapter.toBlockSnapshot(
      ':bc-mention[张三]{payload="%7B%22value%22%3A%22%E5%BC%A0%E4%B8%89%22%2C%22attributes%22%3A%7B%22mentionId%22%3A%22u-1%22%2C%22mentionType%22%3A%22user%22%7D%7D"}',
    )
    const paragraph = imported.children[0] as IBlockSnapshot
    expect((paragraph.children[0] as DeltaInsert).insert).toEqual({mention: '张三'})
    expect((paragraph.children[0] as DeltaInsert).attributes?.['mentionId']).toBe('u-1')
  })

  it('round-trips word-art through its own inline contribution', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map([[MARKDOWN_ADAPTER_PROFILE_CONFIG, 'blockcraft']]),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const wordArt = createInlineWordArtDelta({}, [{insert: '标题'}])
    const snapshot = root([{
      id: 'paragraph',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {},
      meta: {},
      children: [wordArt],
    }])

    const markdown = await adapter.toMarkdown(snapshot)
    expect(markdown).toContain(':bc-word-art[标题]')
    const imported = await adapter.toBlockSnapshot(markdown)
    const paragraph = imported.children[0] as IBlockSnapshot
    expect((paragraph.children[0] as DeltaInsert).insert)
      .toEqual(wordArt.insert)
  })

  it('combines portable Markdown with opted-in custom directives by default', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const snapshot = root([{
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
        children: [{insert: '可移植内容'}] as DeltaInsert[],
      }],
    }])

    const markdown = await adapter.toMarkdown(snapshot)
    expect(markdown).toContain(':::bc-callout')
    expect(markdown).toContain('可移植内容')

    const imported = await adapter.toBlockSnapshot(markdown)
    expect((imported.children[0] as IBlockSnapshot).flavour).toBe('callout')
  })

  it('keeps pure portable export available as an explicit profile', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map([[MARKDOWN_ADAPTER_PROFILE_CONFIG, 'portable']]),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const snapshot = root([{
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
        children: [{insert: '可移植内容'}] as DeltaInsert[],
      }],
    }])

    const markdown = await adapter.toMarkdown(snapshot)
    expect(markdown.trim()).toBe('可移植内容')
    expect(markdown).not.toContain('bc-callout')
  })

  it('round-trips nested columns with longer outer fences and scoped YAML', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const column = (
      id: string,
      width: number,
      text: string,
    ): IBlockSnapshot => ({
      id,
      flavour: 'column',
      nodeType: BlockNodeType.block,
      props: {width},
      meta: {},
      children: [{
        id: `${id}-paragraph`,
        flavour: 'paragraph',
        nodeType: BlockNodeType.editable,
        props: {},
        meta: {},
        children: [{insert: text}] as DeltaInsert[],
      }],
    })
    const snapshot = root([{
      id: 'columns',
      flavour: 'columns',
      nodeType: BlockNodeType.block,
      props: {gap: 24},
      meta: {},
      children: [
        column('left', 0.4, '左栏'),
        column('right', 0.6, '右栏'),
      ],
    }])

    const markdown = await adapter.toMarkdown(snapshot)
    expect(markdown).toMatch(/^::::bc-columns$/m)
    expect(markdown.match(/^:::bc-column$/gm)?.length).toBe(2)
    expect(markdown).toContain('::::bc-columns\n\n---')
    expect(markdown.match(/:::bc-column\n\n---/g)?.length).toBe(2)
    expect(markdown).toMatch(/左栏\n\n:::\n\n:::bc-column/)
    expect(markdown.trimEnd()).toMatch(/右栏\n\n:::\n\n::::$/)
    expect(markdown).toContain('gap: 24')
    expect(markdown).toContain('width: 0.4')
    expect(markdown).toContain('width: 0.6')

    const imported = await adapter.toBlockSnapshot(markdown)
    const columns = imported.children[0] as IBlockSnapshot
    const children = columns.children as IBlockSnapshot[]
    expect(columns.flavour).toBe('columns')
    expect(columns.props['gap']).toBe(24)
    expect(children.map(child => child.flavour)).toEqual(['column', 'column'])
    expect(children.map(child => child.props['width'])).toEqual([0.4, 0.6])
    expect((children[0].children[0] as IBlockSnapshot).flavour)
      .toBe('paragraph')
  })

  it('exports a presentation cover as readable Markdown instead of private metadata', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map([[MARKDOWN_ADAPTER_PROFILE_CONFIG, 'blockcraft']]),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const snapshot = root([{
      id: 'cover',
      flavour: 'demo-cover' as BlockCraft.BlockFlavour,
      nodeType: BlockNodeType.void,
      props: {
        title: '季度复盘',
        banner: {url: 'https://example.com/cover.png'},
        author: {name: '张三', info: '产品部'},
      },
      meta: {},
      children: [],
    }])

    const markdown = await adapter.toMarkdown(snapshot)
    expect(markdown.trim()).toBe('季度复盘 — 张三')
    expect(markdown).not.toContain('bc-demo-cover')
    const imported = await adapter.toBlockSnapshot(markdown)
    const cover = imported.children[0] as IBlockSnapshot
    expect(cover.flavour).toBe('paragraph')
    expect(cover.children).toEqual([{insert: '季度复盘 — 张三'}])
  })

  it('round-trips bookmark and iframe card fields through HTML envelopes', async () => {
    const adapter = new HtmlAdapter(fileService, new Map(), BUNDLED_ADAPTER_REGISTRY)
    const fixtures: IBlockSnapshot[] = [
      {
        id: 'bookmark',
        flavour: 'bookmark',
        nodeType: BlockNodeType.void,
        props: {
          url: 'https://example.com/article',
          title: '示例文章',
          description: '摘要',
          image: 'https://example.com/cover.png',
          icon: null,
        },
        meta: {},
        children: [],
      },
      {
        id: 'figma',
        flavour: 'figma-embed',
        nodeType: BlockNodeType.void,
        props: {
          url: 'https://www.figma.com/design/abcdefghijklmnopqrstuvwx/Test',
          width: 640,
          height: 480,
        },
        meta: {},
        children: [],
      },
      {
        id: 'juejin',
        flavour: 'juejin-embed',
        nodeType: BlockNodeType.void,
        props: {
          url: 'https://juejin.cn/post/7312345678901234567',
          width: 720,
          height: 540,
        },
        meta: {},
        children: [],
      },
    ]

    for (const fixture of fixtures) {
      const html = await adapter.toHtml(root([fixture]))
      expect(html).toContain(`data-bc-block="${fixture.flavour}"`)
      const imported = (await adapter.toBlockSnapshot(html))
        .children[0] as IBlockSnapshot
      expect(imported.flavour).toBe(fixture.flavour)
      expect(imported.props).toEqual(fixture.props)
    }
  })

  it('keeps bookmark and iframe cards as readable links in blockcraft Markdown', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map([[MARKDOWN_ADAPTER_PROFILE_CONFIG, 'blockcraft']]),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const fixtures: IBlockSnapshot[] = [
      {
        id: 'bookmark',
        flavour: 'bookmark',
        nodeType: BlockNodeType.void,
        props: {url: 'https://example.com', title: 'Example', image: null},
        meta: {},
        children: [],
      },
      {
        id: 'figma',
        flavour: 'figma-embed',
        nodeType: BlockNodeType.void,
        props: {url: 'https://www.figma.com/design/abcdefghijklmnopqrstuvwx/Test', width: 600, height: 400},
        meta: {},
        children: [],
      },
      {
        id: 'juejin',
        flavour: 'juejin-embed',
        nodeType: BlockNodeType.void,
        props: {url: 'https://juejin.cn/post/7312345678901234567', width: 680, height: 520},
        meta: {},
        children: [],
      },
    ]

    for (const fixture of fixtures) {
      const markdown = await adapter.toMarkdown(root([fixture]))
      expect(markdown).toContain(`"blockcraft:${fixture.flavour}"`)
      expect(markdown).not.toContain(`::bc-${fixture.flavour}`)
      const imported = (await adapter.toBlockSnapshot(markdown))
        .children[0] as IBlockSnapshot
      expect(imported.flavour).toBe(fixture.flavour)
      expect(imported.props['url']).toBe(fixture.props['url'])
    }
  })

  it('imports portable typed links as their owned card Blocks', async () => {
    const adapter = new MarkdownAdapter(
      fileService,
      new Map(),
      BUNDLED_ADAPTER_REGISTRY,
    )
    const cases = [
      {
        flavour: 'bookmark',
        markdown: '[文章](https://example.com/article "blockcraft:bookmark")',
        expected: {url: 'https://example.com/article', title: '文章'},
      },
      {
        flavour: 'figma-embed',
        markdown: '[Figma](https://www.figma.com/design/abcdefghijklmnopqrstuvwx/Test "blockcraft:figma-embed")',
        expected: {
          url: 'https://www.figma.com/design/abcdefghijklmnopqrstuvwx/Test',
          width: null,
          height: 424,
        },
      },
      {
        flavour: 'juejin-embed',
        markdown: '[掘金](https://juejin.cn/post/7312345678901234567 "blockcraft:juejin-embed")',
        expected: {
          url: 'https://juejin.cn/post/7312345678901234567',
          height: 424,
        },
      },
    ]

    for (const item of cases) {
      const imported = await adapter.toBlockSnapshot(item.markdown)
      const block = imported.children[0] as IBlockSnapshot
      expect(block.flavour).toBe(item.flavour)
      expect(block.props).toEqual(item.expected)
    }
  })

  it('uses a lossless HTML envelope for a formerly uncovered attachment', async () => {
    const adapter = new HtmlAdapter(fileService, new Map(), BUNDLED_ADAPTER_REGISTRY)
    const snapshot = root([{
      id: 'attachment',
      flavour: 'attachment',
      nodeType: BlockNodeType.void,
      props: {
        name: 'demo.pdf',
        url: 'https://example.com/demo.pdf',
        type: 'application/pdf',
        size: 42,
        icon: 'bc_icon bc_pdf',
      },
      meta: {},
      children: [],
    }])
    const html = await adapter.toHtml(snapshot)
    expect(html).toContain('data-bc-block="attachment"')
    expect(html).toContain('<a href="https://example.com/demo.pdf">demo.pdf</a>')
    const imported = await adapter.toBlockSnapshot(html)
    expect((imported.children[0] as IBlockSnapshot).props['name']).toBe('demo.pdf')
  })

  it('exports attachments as readable typed links in portable Markdown', async () => {
    const adapter = new MarkdownAdapter(fileService, new Map(), BUNDLED_ADAPTER_REGISTRY)
    const snapshot = root([{
      id: 'attachment',
      flavour: 'attachment',
      nodeType: BlockNodeType.void,
      props: {
        name: 'demo.pdf',
        url: 'https://example.com/demo.pdf',
        type: 'application/pdf',
        size: 42,
        icon: 'bc_icon bc_pdf',
      },
      meta: {},
      children: [],
    }])

    const markdown = await adapter.toMarkdown(snapshot)
    const imported = await adapter.toBlockSnapshot(markdown)
    const attachment = imported.children[0] as IBlockSnapshot

    expect(markdown.trim()).toBe(
      '[demo.pdf](https://example.com/demo.pdf "blockcraft:attachment")',
    )
    expect(markdown).not.toContain('::bc-attachment')
    expect(attachment.flavour).toBe('attachment')
    expect(attachment.props['name']).toBe('demo.pdf')
    expect(attachment.props['url']).toBe('https://example.com/demo.pdf')
    expect(attachment.props['size']).toBe(0)
  })
})

function flavourCovered(values: Set<string>, flavour: string): boolean {
  return values.has(flavour)
}
