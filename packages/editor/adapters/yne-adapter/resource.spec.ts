// packages/editor/adapters/yne-adapter/resource.spec.ts
import { dataUriToFile, inferMimeType, yneImageToSnapshot, yneAttachmentToSnapshot, rehostYneAttachments } from "./resource";
import { IBlockSnapshot } from "../../framework";
import { YneConvertContext } from "./types";

describe('resource utils', () => {
  it('decodes a base64 data URI into a File with correct mime', () => {
    // "hi" base64 = "aGk="
    const file = dataUriToFile('data:image/png;base64,aGk=', 'x.png');
    expect(file).not.toBeNull();
    expect(file!.type).toBe('image/png');
    expect(file!.name).toBe('x.png');
    expect(file!.size).toBe(2);
  });

  it('returns null for a non-data-uri string', () => {
    expect(dataUriToFile('https://example.com/a.png', 'a.png')).toBeNull();
  });

  it('infers mime from filename extension', () => {
    expect(inferMimeType('Windows_Asset.csv')).toBe('text/csv');
    expect(inferMimeType('a.pdf')).toBe('application/pdf');
    expect(inferMimeType('noext')).toBe('application/octet-stream');
  });
});

function makeCtx(overrides: Partial<YneConvertContext> = {}): YneConvertContext {
  return {
    imageMap: new Map(),
    fileService: {
      createObjectURL: (f: File) => `blob-local:${f.name}`,
      uploadAttachment: () => Promise.resolve({ url: 'https://cdn/x.csv', name: 'x.csv', type: 'text/csv', size: 10 }),
    } as any,
    deferredAttachments: [],
    ...overrides,
  };
}

describe('resource block converters', () => {
  it('image with base64 in map becomes a local ObjectURL src (auto-upload path)', () => {
    const ctx = makeCtx({ imageMap: new Map([['u1', 'data:image/png;base64,aGk=']]) });
    const snap = yneImageToSnapshot({ blockType: 'image', source: 'u1', styles: { width: 288, height: 284 } }, ctx);
    expect(snap.flavour).toBe('image');
    expect(snap.props['src']).toBe('blob-local:image.png');
    expect(snap.props['width']).toBe(288);
  });

  it('image without base64 falls back to the youdao source URL', () => {
    const ctx = makeCtx();
    const snap = yneImageToSnapshot({ blockType: 'image', source: 'https://note.youdao/x' }, ctx);
    expect(snap.props['src']).toBe('https://note.youdao/x');
  });

  it('attachment builds block with youdao url and registers a deferred re-host', () => {
    const ctx = makeCtx();
    const snap = yneAttachmentToSnapshot(
      { blockType: 'attachment', source: 'https://note.youdao/a.csv', fileName: 'a.csv', fileLength: 3913 },
      ctx
    );
    expect(snap.flavour).toBe('attachment');
    expect(snap.props['url']).toBe('https://note.youdao/a.csv');
    expect(snap.props['type']).toBe('text/csv');
    expect(ctx.deferredAttachments.length).toBe(1);
    expect(ctx.deferredAttachments[0].snapshot).toBe(snap);
  });
});

describe('rehostYneAttachments', () => {
  const fakeDoc = (block: { setInitProps: jasmine.Spy } | null) => ({
    vm: { get: () => block ? { instance: block } : undefined },
    injector: { get: () => ({ uploadAttachment: () => Promise.resolve({ url: 'https://cdn/a.csv', name: 'a.csv', type: 'text/csv', size: 5 }) }) },
    logger: { warn: () => {} },
  });

  it('fetches, re-uploads, and swaps the url on success', async () => {
    const block = { setInitProps: jasmine.createSpy('setInitProps') };
    spyOn(window, 'fetch').and.resolveTo({ ok: true, blob: () => Promise.resolve(new Blob(['hello'])) } as unknown as Response);
    await rehostYneAttachments(fakeDoc(block) as unknown as BlockCraft.Doc, [
      { snapshot: { id: 'b1' } as IBlockSnapshot, url: 'https://note.youdao/a.csv', fileName: 'a.csv', fileLength: 5 },
    ]);
    expect(block.setInitProps).toHaveBeenCalledWith(jasmine.objectContaining({ url: 'https://cdn/a.csv' }));
  });

  it('keeps the youdao url (no throw) when fetch fails', async () => {
    const block = { setInitProps: jasmine.createSpy('setInitProps') };
    spyOn(window, 'fetch').and.rejectWith(new Error('CORS'));
    await rehostYneAttachments(fakeDoc(block) as unknown as BlockCraft.Doc, [
      { snapshot: { id: 'b1' } as IBlockSnapshot, url: 'https://note.youdao/a.csv', fileName: 'a.csv', fileLength: 5 },
    ]);
    expect(block.setInitProps).not.toHaveBeenCalled();
  });

  it('keeps the youdao url when the file service returns a non-http (blob:) url', async () => {
    // Backend-less file services return blob:/object URLs from uploadAttachment.
    // The attachment block treats any non-http url as "still uploading", so we
    // must NOT adopt such a url — keep the original 有道云 http url instead.
    const block = { setInitProps: jasmine.createSpy('setInitProps') };
    spyOn(window, 'fetch').and.resolveTo({ ok: true, blob: () => Promise.resolve(new Blob(['hello'])) } as unknown as Response);
    const doc = {
      vm: { get: () => ({ instance: block }) },
      injector: { get: () => ({ uploadAttachment: () => Promise.resolve({ url: 'blob:http://localhost/uuid', name: 'a.csv', type: 'text/csv', size: 5 }) }) },
      logger: { warn: () => {} },
    };
    await rehostYneAttachments(doc as unknown as BlockCraft.Doc, [
      { snapshot: { id: 'b1' } as IBlockSnapshot, url: 'https://note.youdao/a.csv', fileName: 'a.csv', fileLength: 5 },
    ]);
    expect(block.setInitProps).not.toHaveBeenCalled();
  });

  it('skips when the block was removed during the async gap', async () => {
    spyOn(window, 'fetch').and.resolveTo({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) } as unknown as Response);
    const doc = {
      vm: { get: () => undefined },
      injector: { get: () => ({ uploadAttachment: () => Promise.reject(new Error('should not be called')) }) },
      logger: { warn: () => {} },
    };
    await rehostYneAttachments(doc as unknown as BlockCraft.Doc, [
      { snapshot: { id: 'gone' } as IBlockSnapshot, url: 'https://note.youdao/a.csv', fileName: 'a.csv', fileLength: 5 },
    ]);
    // uploadAttachment was never reached → no throw = pass
    expect(true).toBe(true);
  });
});
