import {installBlockTransformerKeyboardCapture} from './keyboard-routing';

describe('BlockTransformer keyboard capture IME ownership', () => {
  for (const state of ['document', 'native', 'terminal'] as const) {
    it(`leaves ${state} composition keys to the input method`, () => {
      const ownerDocument = document.implementation.createHTMLDocument('keyboard capture');
      const input = ownerDocument.createElement('input');
      ownerDocument.body.append(input);
      const onKey = jasmine.createSpy('onKey');
      let composing = state === 'document';
      const capture = installBlockTransformerKeyboardCapture({
        ownerDocument, elements: [input], accepts: () => true,
        isComposing: () => composing, onKey,
      });
      try {
        for (const type of ['keydown', 'keypress', 'keyup']) {
          for (const key of ['Enter', 'ArrowDown', 'Escape', 'Tab']) {
            const event = new KeyboardEvent(type, {
              key, isComposing: state === 'native', keyCode: state === 'terminal' ? 229 : 0,
              bubbles: true, cancelable: true,
            });
            input.dispatchEvent(event);
            expect(event.defaultPrevented).withContext(`${type} ${key}`).toBeFalse();
          }
        }
        expect(onKey).not.toHaveBeenCalled();
        composing = false;
        const enter = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});
        input.dispatchEvent(enter);
        expect(enter.defaultPrevented).toBeTrue();
        expect(onKey).toHaveBeenCalledOnceWith('Enter', enter);
        capture.close();
        // The ordinary Enter that closes a picker still owns its physical tail.
        const tail = new KeyboardEvent('keyup', {key: 'Enter', bubbles: true, cancelable: true});
        input.dispatchEvent(tail);
        expect(tail.defaultPrevented).toBeTrue();
        const next = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});
        input.dispatchEvent(next);
        expect(next.defaultPrevented).toBeFalse();
      } finally {
        capture.dispose();
        input.remove();
      }
    });
  }

  it('does not swallow composing beforeinput in a native picker search', () => {
    const ownerDocument = document.implementation.createHTMLDocument('keyboard capture');
    const input = ownerDocument.createElement('input');
    ownerDocument.body.append(input);
    const capture = installBlockTransformerKeyboardCapture({
      ownerDocument, elements: [input], accepts: () => true,
      isComposing: () => false, onKey: () => {},
    });
    try {
      const event = new InputEvent('beforeinput', {
        inputType: 'insertParagraph', isComposing: true, bubbles: true, cancelable: true,
      });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBeFalse();
    } finally {
      capture.dispose();
      input.remove();
    }
  });
});
