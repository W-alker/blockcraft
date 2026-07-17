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
});
