import {BlockNodeType, DocAttachmentInfo, DocFileService, IBlockSnapshot} from '../../framework';
import {HtmlAdapter} from './html-adapter';

class TestDocFileService extends DocFileService {
  uploadImg(): Promise<string> {
    return Promise.resolve('');
  }

  uploadVideo(): Promise<DocAttachmentInfo> {
    return Promise.resolve({
      name: '',
      type: '',
      url: '',
      size: 0,
    });
  }

  uploadAttachment(): Promise<DocAttachmentInfo> {
    return Promise.resolve({
      name: '',
      type: '',
      url: '',
      size: 0,
    });
  }

  previewAttachment(): void {}

  previewImg(): void {}

  createObjectURL(): string {
    return '';
  }

  getFileByObjectURL(): File | undefined {
    return undefined;
  }

  getFilePreviewURLByObjectURL(): string {
    return '';
  }

  removeObjectURL(): void {}

  isLocalObjectURL(): boolean {
    return false;
  }

  isOverMaxSize(): boolean {
    return false;
  }
}

const createVoidSnapshot = (
  id: string,
  flavour: IBlockSnapshot['flavour'],
  props: IBlockSnapshot['props']
): IBlockSnapshot => ({
  id,
  flavour,
  nodeType: BlockNodeType.void,
  props,
  meta: {},
  children: [],
});

const createRootSnapshot = (children: IBlockSnapshot[]): IBlockSnapshot => ({
  id: 'root',
  flavour: 'root',
  nodeType: BlockNodeType.root,
  props: {},
  meta: {},
  children,
});

describe('HtmlAdapter', () => {
  const adapter = new HtmlAdapter(new TestDocFileService());

  it('exports html without blockcraft-json metadata on the root element', async () => {
    const html = await adapter.toHtml(createRootSnapshot([]));

    expect(html).not.toContain('blockcraft-json');
  });

  describe('media blocks', () => {
    it('exports video and audio blocks as native media tags', async () => {
      const snapshot = createRootSnapshot([
        createVoidSnapshot('video-1', 'video', {
          url: 'https://cdn.example.com/demo.mp4',
          name: 'Demo clip',
          sourceType: 'embed',
          width: 640,
          poster: 'https://cdn.example.com/poster.jpg',
          type: 'video/mp4',
        }),
        createVoidSnapshot('audio-1', 'audio', {
          url: 'https://cdn.example.com/theme.mp3',
          name: 'Theme song',
          sourceType: 'link',
          size: 2048,
        }),
      ]);

      const html = await adapter.toHtml(snapshot);

      expect(html).toMatch(/<video[^>]*src="https:\/\/cdn\.example\.com\/demo\.mp4"/);
      expect(html).toMatch(/<video[^>]*poster="https:\/\/cdn\.example\.com\/poster\.jpg"/);
      expect(html).toMatch(/<video[^>]*width="640"/);
      expect(html).toMatch(/<audio[^>]*src="https:\/\/cdn\.example\.com\/theme\.mp3"/);
      expect(html).toContain('data-source-type="embed"');
      expect(html).toContain('data-source-type="link"');
    });

    it('imports native media tags as media blocks', async () => {
      const html = [
        '<!doctype html>',
        '<html>',
        '<body>',
        '<figure><video src="https://cdn.example.com/demo.mp4" width="640" poster="https://cdn.example.com/poster.jpg" data-source-type="embed" data-type="video/mp4"></video></figure>',
        '<figure><audio src="https://cdn.example.com/theme.mp3" title="Theme song" data-size="2048"></audio></figure>',
        '</body>',
        '</html>',
      ].join('');

      const snapshot = await adapter.toBlockSnapshot(html);
      const children = snapshot.children as IBlockSnapshot[];

      expect(children[0]?.flavour).toBe('video');
      expect(children[0]?.props['url']).toBe('https://cdn.example.com/demo.mp4');
      expect(children[0]?.props['width']).toBe(640);
      expect(children[0]?.props['poster']).toBe('https://cdn.example.com/poster.jpg');
      expect(children[0]?.props['sourceType']).toBe('embed');
      expect(children[0]?.props['type']).toBe('video/mp4');

      expect(children[1]?.flavour).toBe('audio');
      expect(children[1]?.props['url']).toBe('https://cdn.example.com/theme.mp3');
      expect(children[1]?.props['name']).toBe('Theme song');
      expect(children[1]?.props['size']).toBe(2048);
    });

    it('round-trips responsive video wr/ar while keeping legacy width support', async () => {
      const snapshot = createRootSnapshot([
        createVoidSnapshot('video-responsive', 'video', {
          url: 'https://cdn.example.com/responsive.mp4',
          sourceType: 'link',
          wr: 62.5,
          ar: 16 / 9,
        }),
      ]);

      const html = await adapter.toHtml(snapshot);
      expect(html).toContain('data-bc-wr="62.5"');
      expect(html).toContain(`data-bc-ar="${16 / 9}"`);
      expect(html).toContain('width: 62.5%');

      const imported = await adapter.toBlockSnapshot(html);
      const video = (imported.children as IBlockSnapshot[])[0];
      expect(video.props['wr']).toBe(62.5);
      expect(video.props['ar']).toBeCloseTo(16 / 9);
      expect(video.props['width']).toBeUndefined();
    });

    it('exports responsive image sizing without legacy pixel attributes', async () => {
      const image: IBlockSnapshot = {
        id: 'image-responsive',
        flavour: 'image',
        nodeType: BlockNodeType.block,
        props: {
          src: 'https://cdn.example.com/image.png',
          wr: 45,
          ar: 3 / 2,
        },
        meta: {},
        children: [],
      };

      const html = await adapter.toHtml(createRootSnapshot([image]));
      expect(html).toContain('data-bc-wr="45"');
      expect(html).toContain('data-bc-ar="1.5"');
      expect(html).toContain('width: 45%');
      expect(html).not.toMatch(/<img[^>]*width="45"/);
    });
  });
});
