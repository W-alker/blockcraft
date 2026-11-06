import {BLOCK_CREATOR_SERVICE_TOKEN, DOC_FILE_SERVICE_TOKEN} from '../../framework';
import {BlockTransformerPlugin} from './index';

describe('slash inline image upload', () => {
  const localUrl = '__blockcraft_local__:blob:pending-image';
  const remoteUrl = 'https://example.test/uploaded.png';

  function setup(source: unknown = localUrl) {
    const file = new File(['image'], 'image.png', {type: 'image/png'});
    const creator = {getParamsByScheme: jasmine.createSpy().and.resolveTo([source])};
    const files = {
      isLocalObjectURL: (url: string) => url.startsWith('__blockcraft_local__:'),
      getFileByObjectURL: jasmine.createSpy().and.returnValue(file),
      uploadImg: jasmine.createSpy().and.resolveTo(remoteUrl),
      removeObjectURL: jasmine.createSpy(),
    };
    const plugin = new BlockTransformerPlugin();
    (plugin as any).doc = {
      schemas: {get: () => ({flavour: 'image'})},
      injector: {get: (token: unknown) => {
        if (token === BLOCK_CREATOR_SERVICE_TOKEN) return creator;
        if (token === DOC_FILE_SERVICE_TOKEN) return files;
        throw new Error('Unexpected token');
      }},
    };
    const replace = jasmine.createSpy().and.returnValue(true);
    const run = () => (plugin as any).openInlineImagePicker({replace});
    return {file, files, creator, replace, run};
  }

  it('uploads a host local URL before inserting and releases the temporary resource', async () => {
    const h = setup();
    let finish!: (url: string) => void;
    h.files.uploadImg.and.returnValue(new Promise<string>(resolve => finish = resolve));
    const pending = h.run();
    await Promise.resolve();
    expect(h.files.uploadImg).toHaveBeenCalledOnceWith(h.file);
    expect(h.replace).not.toHaveBeenCalled();
    finish(remoteUrl);
    await pending;
    expect(h.replace).toHaveBeenCalledOnceWith([{insert: {image: remoteUrl}}]);
    expect(h.files.removeObjectURL).toHaveBeenCalledOnceWith(localUrl);
  });

  it('preserves dimensions from an object creator result', async () => {
    const h = setup({src: localUrl, width: 240, height: 160});
    await h.run();
    expect(h.replace).toHaveBeenCalledOnceWith([{
      insert: {image: remoteUrl}, attributes: {width: 240, height: 160},
    }]);
  });

  it('keeps network images on the direct insertion path', async () => {
    const h = setup(remoteUrl);
    await h.run();
    expect(h.replace).toHaveBeenCalledOnceWith([{insert: {image: remoteUrl}}]);
    expect(h.files.uploadImg).not.toHaveBeenCalled();
    expect(h.files.removeObjectURL).not.toHaveBeenCalled();
  });

  it('does not insert a broken image when uploading fails', async () => {
    const h = setup();
    h.files.uploadImg.and.rejectWith(new Error('upload failed'));
    await expectAsync(h.run()).toBeRejectedWithError('upload failed');
    expect(h.replace).not.toHaveBeenCalled();
    expect(h.files.removeObjectURL).toHaveBeenCalledOnceWith(localUrl);
  });

  it('rejects expired local files without inserting the temporary URL', async () => {
    const h = setup();
    h.files.getFileByObjectURL.and.returnValue(undefined);
    await expectAsync(h.run()).toBeRejected();
    expect(h.files.uploadImg).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
    expect(h.files.removeObjectURL).toHaveBeenCalledOnceWith(localUrl);
  });

  it('releases the local resource when the command range no longer accepts insertion', async () => {
    const h = setup();
    h.replace.and.returnValue(false);
    await h.run();
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.files.removeObjectURL).toHaveBeenCalledOnceWith(localUrl);
  });

  it('does nothing when the picker is cancelled', async () => {
    const h = setup();
    h.creator.getParamsByScheme.and.resolveTo(null);
    await h.run();
    expect(h.files.uploadImg).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
  });
});
