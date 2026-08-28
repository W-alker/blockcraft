import {
  BlockNodeType,
  DocAttachmentInfo,
  DocFileService,
  IBlockSnapshot,
} from '../framework';
import {MarkdownAdapter} from '../adapters/markdown-adapter';
import {
  createInlineDateDelta,
  createInlineShapeDelta,
  createInlineWordArtDelta,
} from '../embeds';
import {BUNDLED_ADAPTER_REGISTRY} from './bundled-adapter-registry';

class InlineImageTestFileService extends DocFileService {
  uploadImg(): Promise<string> { return Promise.resolve('uploaded-image'); }
  uploadVideo(): Promise<DocAttachmentInfo> {
    return Promise.resolve({name: '', type: '', url: '', size: 0});
  }
  uploadAttachment(): Promise<DocAttachmentInfo> {
    return Promise.resolve({name: '', type: '', url: '', size: 0});
  }
  previewAttachment(): void {}
  previewImg(): void {}
  createObjectURL(): string { return ''; }
  getFileByObjectURL(): File | undefined { return undefined; }
  getFilePreviewURLByObjectURL(): string { return ''; }
  removeObjectURL(): void {}
  isLocalObjectURL(): boolean { return false; }
  isOverMaxSize(): boolean { return false; }
}

const rootSnapshot = (children: IBlockSnapshot[]): IBlockSnapshot => ({
  id: 'root',
  flavour: 'root',
  nodeType: BlockNodeType.root,
  props: {},
  meta: {},
  children,
});

describe('MarkdownAdapter inline images', () => {
  const adapter = new MarkdownAdapter(
    new InlineImageTestFileService(),
    new Map(),
    BUNDLED_ADAPTER_REGISTRY,
  );

  it('round-trips an inline image mixed with text', async () => {
    const snapshot = rootSnapshot([{
      id: 'p1',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: [
        {insert: 'before '},
        {insert: {image: 'https://cdn.example.com/a.png'}},
        {insert: ' after'},
      ],
    }]);

    const markdown = await adapter.toMarkdown(snapshot);
    expect(markdown.trim()).toBe('before ![](https://cdn.example.com/a.png) after');

    const imported = await adapter.toBlockSnapshot(markdown);
    const children = imported.children as IBlockSnapshot[];
    expect(children.length).toBe(1);
    expect(children[0].flavour).toBe('paragraph');
    expect(children[0].children).toContain(jasmine.objectContaining({
      insert: {image: 'https://cdn.example.com/a.png'},
    }));
  });

  it('keeps a standalone markdown image as an image block', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+3R04WQAAAABJRU5ErkJggg==';
    const imported = await adapter.toBlockSnapshot(`![](${dataUrl})`);

    expect((imported.children as IBlockSnapshot[])[0].flavour).toBe('image');
  });

  it('intentionally drops square-wrap metadata during Markdown round-trip', async () => {
    const snapshot = rootSnapshot([{
      id: 'p-wrap',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: [
        {insert: 'before '},
        {
          insert: {image: 'https://cdn.example.com/wrapped.png'},
          attributes: {
            width: 176,
            height: 106,
            wrap: true,
            side: 'left',
            x: 0.24,
            gap: 12,
          },
        },
        {insert: ' after'},
      ],
    }]);

    const markdown = await adapter.toMarkdown(snapshot);
    const imported = await adapter.toBlockSnapshot(markdown);
    const paragraph = (imported.children as IBlockSnapshot[])[0];
    const image = (paragraph.children as any[])
      .find(delta => typeof delta.insert === 'object');

    expect(image).toEqual({
      insert: {image: 'https://cdn.example.com/wrapped.png'},
    });
  });

  it('degrades inline shapes and WordArt to readable text', async () => {
    const markdown = await adapter.toMarkdown(rootSnapshot([{
      id: 'inline-objects',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: [
        {insert: '流程：'},
        createInlineShapeDelta({shapeType: 'diamond'}, [{insert: '判断'}]),
        {insert: ' '},
        createInlineWordArtDelta({}, [{insert: '完成'}]),
      ],
    }]))

    expect(markdown.trim()).toBe('流程：判断 完成')
  });

  it('exports mentions as readable URN links and dates as readable text', async () => {
    const date = createInlineDateDelta('2026-08-28T09:30', 'YYYY-MM-DD')!
    const markdown = await adapter.toMarkdown(rootSnapshot([{
      id: 'inline-semantics',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {},
      meta: {},
      children: [
        {insert: '成员：'},
        {
          insert: {mention: '张三'},
          attributes: {mentionId: 'u-1', mentionType: 'user'},
        },
        {insert: '，日期：'},
        date,
      ],
    }]))

    expect(markdown).toContain(
      '成员：[@张三](urn:blockcraft:mention:user:u-1',
    )
    expect(markdown).toContain('日期：2026-08-28')
    expect(markdown).not.toContain(':bc-mention[')
    expect(markdown).not.toContain('blockcraft:date')

    const imported = await adapter.toBlockSnapshot(markdown)
    const paragraph = imported.children[0] as IBlockSnapshot
    expect(paragraph.children[1]).toEqual(jasmine.objectContaining({
      insert: {mention: '张三'},
      attributes: jasmine.objectContaining({
        mentionId: 'u-1',
        mentionType: 'user',
      }),
    }))
  })

  it('imports an authored mention URN without requiring the title hint', async () => {
    const imported = await adapter.toBlockSnapshot(
      '成员：[@设计组](urn:blockcraft:mention:team:team%3Adesign)',
    )
    const paragraph = imported.children[0] as IBlockSnapshot
    expect(paragraph.children[1]).toEqual(jasmine.objectContaining({
      insert: {mention: '设计组'},
      attributes: jasmine.objectContaining({
        mentionId: 'team:design',
        mentionType: 'team',
      }),
    }))
  })

  it('keeps malformed mention URNs as readable text instead of fabricating an Embed', async () => {
    const imported = await adapter.toBlockSnapshot(
      '成员：[@张三](urn:blockcraft:mention:user:)',
    )
    const paragraph = imported.children[0] as IBlockSnapshot
    expect((paragraph.children as any[]).some(
      delta => typeof delta.insert === 'object' && 'mention' in delta.insert,
    )).toBeFalse()
  });

  it('keeps a Mention without an identity as readable text', async () => {
    const markdown = await adapter.toMarkdown(rootSnapshot([{
      id: 'mention-without-id',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {},
      meta: {},
      children: [{insert: {mention: '临时成员'}}],
    }]))

    expect(markdown.trim()).toBe('@临时成员')
    expect(markdown).not.toContain('urn:blockcraft:mention')
  })

  it('degrades an unregistered Inline Embed to visible text', async () => {
    const markdown = await adapter.toMarkdown(rootSnapshot([{
      id: 'unknown-inline',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {},
      meta: {},
      children: [
        {insert: 'before '},
        {insert: {'host-only-chip': ''}},
        {insert: ' after'},
      ],
    }]))

    expect(markdown).toContain('host-only-chip')
    expect(markdown).toContain('before')
    expect(markdown).toContain('after')
  })
});
