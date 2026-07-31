import {
  BlockNodeType,
  DocAttachmentInfo,
  DocFileService,
  IBlockSnapshot,
} from '../../framework';
import {HtmlAdapter} from './html-adapter';

class InlineImageTestFileService extends DocFileService {
  uploadImg(): Promise<string> { return Promise.resolve(''); }
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

describe('HtmlAdapter inline images', () => {
  const adapter = new HtmlAdapter(new InlineImageTestFileService());

  it('round-trips an inline image inside a mixed paragraph', async () => {
    const snapshot = rootSnapshot([{
      id: 'p1',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: [
        {insert: 'before '},
        {
          insert: {image: 'https://cdn.example.com/a.png'},
          attributes: {width: 120, height: 80},
        },
        {insert: ' after'},
      ],
    }]);

    const html = await adapter.toHtml(snapshot);
    const exportedImage = new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector('p img.bc-inline-image');

    expect(exportedImage?.getAttribute('src')).toBe('https://cdn.example.com/a.png');
    expect(exportedImage?.getAttribute('width')).toBe('120');
    expect(exportedImage?.getAttribute('height')).toBe('80');

    const imported = await adapter.toBlockSnapshot(
      '<p>before <img src="https://cdn.example.com/a.png" width="120" height="80"> after</p>',
    );
    const children = imported.children as IBlockSnapshot[];

    expect(children.length).toBe(1);
    expect(children[0].flavour).toBe('paragraph');
    expect(children[0].children).toContain(jasmine.objectContaining({
      insert: {image: 'https://cdn.example.com/a.png'},
      attributes: {width: 120, height: 80},
    }));
    expect(children.some(child => child.flavour === 'image')).toBeFalse();
  });

  it('imports an image-only paragraph as an inline image paragraph', async () => {
    const imported = await adapter.toBlockSnapshot(
      '<p><img src="https://cdn.example.com/a.png"></p>',
    );
    const children = imported.children as IBlockSnapshot[];

    expect(children.length).toBe(1);
    expect(children[0].flavour).toBe('paragraph');
    expect(children[0].children).toEqual([
      {insert: {image: 'https://cdn.example.com/a.png'}},
    ]);
  });

  it('preserves normalized square-wrap metadata in HTML', async () => {
    const snapshot = rootSnapshot([{
      id: 'p-wrap',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      meta: {},
      children: [{
        insert: {image: 'https://cdn.example.com/wrapped.png'},
        attributes: {
          width: 176,
          height: 106,
          wrap: true,
          side: 'auto',
          x: 0.24,
          gap: 12,
        },
      }],
    }]);

    const html = await adapter.toHtml(snapshot);
    const exported = new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector('img.bc-inline-image')!;
    expect(exported.getAttribute('data-bc-wrap')).toBe('square');
    expect(exported.getAttribute('data-bc-wrap-side')).toBe('auto');
    expect(exported.getAttribute('data-bc-wrap-x')).toBe('0.24');
    expect(exported.getAttribute('data-bc-wrap-gap')).toBe('12');

    const imported = await adapter.toBlockSnapshot(html);
    const paragraph = (imported.children as IBlockSnapshot[])[0];
    expect(paragraph.children).toEqual([{
      insert: {image: 'https://cdn.example.com/wrapped.png'},
      attributes: {
        width: 176,
        height: 106,
        wrap: true,
        side: 'auto',
        x: 0.24,
        gap: 12,
      },
    }]);
  });

  it('normalizes invalid HTML wrap metadata without throwing', async () => {
    const imported = await adapter.toBlockSnapshot(
      '<p><img src="a.png" data-bc-wrap="square" ' +
      'data-bc-wrap-side="diagonal" data-bc-wrap-x="2" ' +
      'data-bc-wrap-gap="-4"></p>',
    );
    const paragraph = (imported.children as IBlockSnapshot[])[0];

    expect(paragraph.children).toEqual([{
      insert: {image: 'a.png'},
      attributes: {
        wrap: true,
        side: 'auto',
        x: 1,
      },
    }]);
  });

  it('continues to export image blocks with figure semantics', async () => {
    const html = await adapter.toHtml(rootSnapshot([{
      id: 'image-1',
      flavour: 'image',
      nodeType: BlockNodeType.block,
      props: {src: 'https://cdn.example.com/block.png', width: 320, height: 180},
      meta: {},
      children: [],
    }]));

    expect(new DOMParser().parseFromString(html, 'text/html')
      .querySelector('figure > img')?.getAttribute('src'))
      .toBe('https://cdn.example.com/block.png');
  });
});
