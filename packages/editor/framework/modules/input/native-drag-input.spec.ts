import {InputTransformer} from './index';

describe('InputTransformer native drag input isolation', () => {
  it('fails closed for native drag input types without writing the model', () => {
    const transact = jasmine.createSpy('transact');
    const applyTextDelta = jasmine.createSpy('applyTextDelta');
    const blur = jasmine.createSpy('blur');
    const doc = {
      event: {
        add() {},
        bindHotkey() {},
        status: {isComposing: false},
      },
      selection: {value: null, blur},
      crud: {transact, applyTextDelta},
    };
    const transformer = new InputTransformer(doc as any) as any;
    spyOn(transformer.compositionSession, 'updateAnchorFromInputEvent');

    for (const inputType of ['deleteByDrag', 'insertFromDrop']) {
      const preventDefault = jasmine.createSpy(`${inputType}.preventDefault`);
      const event = {
        target: null,
        inputType,
        data: null,
        isComposing: false,
        defaultPrevented: false,
        preventDefault,
      };

      transformer['_handleBeforeInput']({
        get: () => ({event}),
      } as any);

      expect(preventDefault).toHaveBeenCalledTimes(1);
    }

    expect(transact).not.toHaveBeenCalled();
    expect(applyTextDelta).not.toHaveBeenCalled();
    expect(blur).not.toHaveBeenCalled();
  });
});
