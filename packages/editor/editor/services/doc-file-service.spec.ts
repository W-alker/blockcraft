import {MyDocFileService} from './doc-file-service';

describe('default file service compatibility', () => {
  it('keeps the internal ObjectURL key distinct from the browser preview URL and revokes it once', () => {
    const service = new MyDocFileService();
    const file = new File(['image'], 'image.png', {type: 'image/png'});
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test-preview');
    const revoke = spyOn(URL, 'revokeObjectURL');
    const key = service.createObjectURL(file);
    expect(key).toBe('__blockcraft_local__:blob:test-preview');
    expect(service.isLocalObjectURL(key)).toBeTrue();
    expect(service.getFileByObjectURL(key)).toBe(file);
    expect(service.getFilePreviewURLByObjectURL(key)).toBe('blob:test-preview');
    expect(service.getFilePreviewURLByObjectURL('https://host/image.png')).toBe('https://host/image.png');
    service.removeObjectURL(key);
    service.removeObjectURL(key);
    expect(revoke).toHaveBeenCalledOnceWith('blob:test-preview');
    expect(service.getFileByObjectURL(key)).toBeUndefined();
  });

  it('inherits file selection with the same defaults and accept/multiple options', async () => {
    const service = new MyDocFileService();
    const inputs: HTMLInputElement[] = [];
    spyOn(HTMLInputElement.prototype, 'click').and.callFake(function (this: HTMLInputElement) {
      inputs.push(this);
    });
    for (const options of [undefined, {accept: 'image/*', multiple: true}]) {
      const selection = options ? service.inputFiles(options.accept, options.multiple) : service.inputFiles();
      const input = inputs[inputs.length - 1];
      expect(input.type).toBe('file');
      expect(input.accept).toBe(options?.accept ?? '');
      expect(input.multiple).toBe(options?.multiple ?? false);
      const transfer = new DataTransfer();
      transfer.items.add(new File(['image'], 'image.png'));
      input.files = transfer.files;
      const remove = spyOn(input, 'remove');
      input.dispatchEvent(new Event('change'));
      expect(await selection).toBe(transfer.files);
      expect(remove).toHaveBeenCalledTimes(1);
    }
  });
});
