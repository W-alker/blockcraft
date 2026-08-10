import {HeightLockApplier} from './height-lock-applier';

describe('HeightLockApplier', () => {
  it('only mutates hosts whose lock state changed', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    const blocks = new Map([
      ['first', {hostElement: first}],
      ['second', {hostElement: second}],
    ]);
    const doc = {
      getBlockById: (id: string) => blocks.get(id) ?? null,
    } as unknown as BlockCraft.Doc;
    const applier = new HeightLockApplier(doc);

    applier.apply(new Set(['first']));
    expect(first.classList.contains('bc-page-height-locked')).toBeTrue();
    expect(second.classList.contains('bc-page-height-locked')).toBeFalse();

    const firstAdd = spyOn(first.classList, 'add').and.callThrough();
    const firstRemove = spyOn(first.classList, 'remove').and.callThrough();
    applier.apply(new Set(['first']));
    expect(firstAdd).not.toHaveBeenCalled();
    expect(firstRemove).not.toHaveBeenCalled();

    applier.apply(new Set(['second']));
    expect(first.classList.contains('bc-page-height-locked')).toBeFalse();
    expect(second.classList.contains('bc-page-height-locked')).toBeTrue();

    applier.destroy();
    expect(second.classList.contains('bc-page-height-locked')).toBeFalse();
  });

  it('moves the lock class when Angular replaces the host for the same block id', () => {
    const oldHost = document.createElement('div');
    const newHost = document.createElement('div');
    let block = {hostElement: oldHost};
    const doc = {
      getBlockById: () => block,
    } as unknown as BlockCraft.Doc;
    const applier = new HeightLockApplier(doc);

    applier.apply(new Set(['image-1']));
    block = {hostElement: newHost};
    applier.apply(new Set(['image-1']));

    expect(oldHost.classList.contains('bc-page-height-locked')).toBeFalse();
    expect(newHost.classList.contains('bc-page-height-locked')).toBeTrue();
  });

  it('applies and clears an exact media fit scale without clipping ownership leaks', () => {
    const host = document.createElement('div');
    const surface = document.createElement('div');
    surface.className = 'img-wrapper';
    host.appendChild(surface);
    Object.defineProperties(surface, {
      offsetWidth: {configurable: true, value: 800},
      scrollWidth: {configurable: true, value: 800},
      offsetHeight: {configurable: true, value: 640},
      scrollHeight: {configurable: true, value: 640},
    });
    const doc = {
      getBlockById: () => ({hostElement: host}),
    } as unknown as BlockCraft.Doc;
    const applier = new HeightLockApplier(doc);

    applier.apply(new Set(['image-1']), new Map([['image-1', 0.625]]));

    expect(host.classList.contains('bc-page-height-locked')).toBeFalse();
    expect(surface.hasAttribute('data-bc-page-media-fitted')).toBeTrue();
    expect(surface.style.maxWidth).toBe('500px');
    expect(surface.style.maxHeight).toBe('400px');
    expect(host.style.zoom).toBe('');

    const setProperty = spyOn(surface.style, 'setProperty').and.callThrough();
    const removeProperty = spyOn(surface.style, 'removeProperty').and.callThrough();
    applier.apply(new Set(['image-1']), new Map([['image-1', 0.625]]));
    applier.syncMounted(['image-1']);

    expect(setProperty).not.toHaveBeenCalled();
    expect(removeProperty).not.toHaveBeenCalled();

    applier.apply(new Set());

    expect(surface.hasAttribute('data-bc-page-media-fitted')).toBeFalse();
    expect(surface.style.maxWidth).toBe('');
    expect(surface.style.maxHeight).toBe('');
  });

  it('never fits an absolute media block or a shape host', () => {
    const absoluteImage = document.createElement('div');
    absoluteImage.setAttribute('data-bc-placement', 'absolute');
    const imageSurface = document.createElement('div');
    imageSurface.className = 'img-wrapper';
    absoluteImage.appendChild(imageSurface);
    Object.defineProperties(imageSurface, {
      offsetWidth: {configurable: true, value: 800},
      scrollWidth: {configurable: true, value: 800},
      offsetHeight: {configurable: true, value: 640},
      scrollHeight: {configurable: true, value: 640},
    });
    const shape = document.createElement('div');
    const blocks = new Map([
      ['image-1', {hostElement: absoluteImage}],
      ['shape-1', {hostElement: shape}],
    ]);
    const applier = new HeightLockApplier({
      getBlockById: (id: string) => blocks.get(id) ?? null,
    } as unknown as BlockCraft.Doc);

    applier.apply(
      new Set(['image-1', 'shape-1']),
      new Map([['image-1', 0.5], ['shape-1', 0.5]]),
    );

    expect(absoluteImage.classList.contains('bc-page-height-locked')).toBeTrue();
    expect(imageSurface.hasAttribute('data-bc-page-media-fitted')).toBeFalse();
    expect(imageSurface.style.maxWidth).toBe('');
    expect(shape.classList.contains('bc-page-height-locked')).toBeTrue();
    expect(shape.style.zoom).toBe('');
  });

  it('constrains a flow video wrapper with the same media-only contract', () => {
    const host = document.createElement('div');
    const surface = document.createElement('div');
    surface.className = 'video-block__wrapper';
    host.appendChild(surface);
    Object.defineProperties(surface, {
      offsetWidth: {configurable: true, value: 640},
      scrollWidth: {configurable: true, value: 640},
      offsetHeight: {configurable: true, value: 360},
      scrollHeight: {configurable: true, value: 360},
    });
    const applier = new HeightLockApplier({
      getBlockById: () => ({hostElement: host}),
    } as unknown as BlockCraft.Doc);

    applier.apply(new Set(), new Map([['video-1', 0.5]]));

    expect(surface.hasAttribute('data-bc-page-media-fitted')).toBeTrue();
    expect(surface.style.maxWidth).toBe('320px');
    expect(surface.style.maxHeight).toBe('180px');
    expect(host.style.zoom).toBe('');
  });

  it('clears an unmounted host and replays the desired lock on remount', () => {
    const oldHost = document.createElement('div');
    const newHost = document.createElement('div');
    let block = {hostElement: oldHost};
    const getBlockById = jasmine.createSpy('getBlockById').and.callFake(() => block);
    const applier = new HeightLockApplier({getBlockById} as unknown as BlockCraft.Doc);

    applier.syncMounted(['image-1']);
    applier.apply(new Set(['image-1']));
    expect(oldHost.classList.contains('bc-page-height-locked')).toBeTrue();

    applier.syncMounted([]);
    expect(oldHost.classList.contains('bc-page-height-locked')).toBeFalse();
    getBlockById.calls.reset();
    applier.apply(new Set(['image-1']));
    expect(getBlockById).not.toHaveBeenCalled();

    block = {hostElement: newHost};
    applier.syncMounted(['image-1']);
    expect(newHost.classList.contains('bc-page-height-locked')).toBeTrue();
  });
});
