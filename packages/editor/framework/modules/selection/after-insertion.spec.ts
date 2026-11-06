import {focusAfterImageInsertion} from './after-insertion';

describe('explicit image insertion selection', () => {
  it('places the caret after the image through the model selection API', () => {
    const setGapCursor = jasmine.createSpy('setGapCursor');
    const stopCapturing = jasmine.createSpy('stopCapturing');
    const doc = {selection: {setGapCursor}, crud: {undoManager: {stopCapturing}}};
    expect(focusAfterImageInsertion(doc as any, {id: 'image', flavour: 'image'})).toBeTrue();
    expect(setGapCursor).toHaveBeenCalledOnceWith('image', 'after', true);
    expect(stopCapturing).toHaveBeenCalled();
  });

  it('leaves other block insertion policies to their callers', () => {
    const setGapCursor = jasmine.createSpy('setGapCursor');
    const doc = {selection: {setGapCursor}};
    expect(focusAfterImageInsertion(doc as any, {id: 'video', flavour: 'video'})).toBeFalse();
    expect(setGapCursor).not.toHaveBeenCalled();
  });
});
