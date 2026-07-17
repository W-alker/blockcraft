import {
  BlockNodeType,
  DocAttachmentInfo,
  DocFileService,
  IBlockSnapshot,
} from '../../framework';
import {MarkdownAdapter} from './markdown-adapter';

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
  const adapter = new MarkdownAdapter(new InlineImageTestFileService());

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
});
