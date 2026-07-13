import {Subject} from 'rxjs';
import {ClipboardControl} from './control/clipboard';

describe('ClipboardControl', () => {
  let rootHost: HTMLElement;
  let onDestroy$: Subject<void>;
  let dispatcher: any;
  let control: ClipboardControl;

  const liveSelection = () => ({
    start: {blockId: 'p1', type: 'text', offset: 0},
    end: {blockId: 'p1', type: 'text', offset: 0},
    anchor: {blockId: 'p1', type: 'text', offset: 0},
    head: {blockId: 'p1', type: 'text', offset: 0},
    commonParent: 'p1',
    collapsed: true,
    isInSameBlock: true,
  });

  const staleSelection = () => ({
    start: {blockId: 'p1', type: 'text', offset: 0},
    end: {blockId: 'p1', type: 'text', offset: 0},
    anchor: {blockId: 'p1', type: 'text', offset: 0},
    head: {blockId: 'p1', type: 'text', offset: 0},
    commonParent: 'p1',
    collapsed: true,
    isInSameBlock: true,
    get firstBlock() {
      throw new Error('Block not found');
    },
  });

  const dispatchDocumentClipboardEvent = (type: 'copy' | 'cut' | 'paste') => {
    const event = new Event(type, {bubbles: true, cancelable: true}) as ClipboardEvent;
    document.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    rootHost = document.createElement('div');
    rootHost.setAttribute('contenteditable', 'true');
    rootHost.tabIndex = 0;
    document.body.appendChild(rootHost);

    onDestroy$ = new Subject<void>();
    dispatcher = {
      status: {isReadOnly: false},
      currentSelection: liveSelection(),
      run: jasmine.createSpy('run'),
      doc: {
        selection: {
          blur: jasmine.createSpy('blur'),
        },
      },
    };
    control = new ClipboardControl(dispatcher);
    control.listen({
      hostElement: rootHost,
      onDestroy$,
    } as any);
  });

  afterEach(() => {
    onDestroy$.next();
    onDestroy$.complete();
    rootHost.remove();
    document.getSelection()?.removeAllRanges();
  });

  it('dispatches document-level paste when the editor host is focused without a native range', () => {
    rootHost.focus();
    document.getSelection()?.removeAllRanges();

    const event = dispatchDocumentClipboardEvent('paste');

    expect(dispatcher.run).toHaveBeenCalledTimes(1);
    const [eventName, context] = dispatcher.run.calls.mostRecent().args;
    expect(eventName).toBe('paste');
    expect(context.getDefaultEvent()).toBe(event);
    expect(context.get('clipboardState').selection).toBe(dispatcher.currentSelection);
  });

  it('ignores document-level paste when focus is outside the editor', () => {
    const outside = document.createElement('div');
    outside.tabIndex = 0;
    document.body.appendChild(outside);
    outside.focus();

    dispatchDocumentClipboardEvent('paste');

    expect(dispatcher.run).not.toHaveBeenCalled();
    outside.remove();
  });

  (['copy', 'cut', 'paste'] as const).forEach(type => {
    it(`ignores document-level ${type} while a native input island is focused`, () => {
      const input = document.createElement('input');
      rootHost.appendChild(input);
      input.focus();

      dispatchDocumentClipboardEvent(type);

      expect(dispatcher.run).not.toHaveBeenCalled();
    });
  });

  it('dispatches document-level copy and cut while the editor host is focused', () => {
    rootHost.focus();
    document.getSelection()?.removeAllRanges();

    dispatchDocumentClipboardEvent('copy');
    dispatchDocumentClipboardEvent('cut');

    expect(dispatcher.run.calls.allArgs().map((args: unknown[]) => args[0])).toEqual(['copy', 'cut']);
  });

  it('prevents readonly document-level cut while the editor host is focused', () => {
    dispatcher.status.isReadOnly = true;
    rootHost.focus();
    document.getSelection()?.removeAllRanges();

    const event = dispatchDocumentClipboardEvent('cut');

    expect(event.defaultPrevented).toBeTrue();
    expect(dispatcher.run).not.toHaveBeenCalled();
  });

  it('prevents readonly document-level paste while the editor host is focused', () => {
    dispatcher.status.isReadOnly = true;
    rootHost.focus();
    document.getSelection()?.removeAllRanges();

    const event = dispatchDocumentClipboardEvent('paste');

    expect(event.defaultPrevented).toBeTrue();
    expect(dispatcher.run).not.toHaveBeenCalled();
  });

  it('does not prevent readonly clipboard events inside a native input island', () => {
    dispatcher.status.isReadOnly = true;
    const input = document.createElement('input');
    rootHost.appendChild(input);
    input.focus();

    const cutEvent = dispatchDocumentClipboardEvent('cut');
    const pasteEvent = dispatchDocumentClipboardEvent('paste');

    expect(dispatcher.run).not.toHaveBeenCalled();
    expect(cutEvent.defaultPrevented).toBeFalse();
    expect(pasteEvent.defaultPrevented).toBeFalse();
  });

  it('lets native copy continue when the editor is focused without a model selection', () => {
    dispatcher.currentSelection = null;
    rootHost.focus();
    document.getSelection()?.removeAllRanges();

    const event = dispatchDocumentClipboardEvent('copy');

    expect(event.defaultPrevented).toBeFalse();
    expect(dispatcher.run).not.toHaveBeenCalled();
  });

  it('prevents cut and paste when the editor is focused without a model selection', () => {
    dispatcher.currentSelection = null;
    rootHost.focus();
    document.getSelection()?.removeAllRanges();

    const cutEvent = dispatchDocumentClipboardEvent('cut');
    const pasteEvent = dispatchDocumentClipboardEvent('paste');

    expect(cutEvent.defaultPrevented).toBeTrue();
    expect(pasteEvent.defaultPrevented).toBeTrue();
    expect(dispatcher.run).not.toHaveBeenCalled();
  });

  it('lets native copy continue and blurs when the model selection is stale', () => {
    dispatcher.currentSelection = staleSelection();
    rootHost.focus();
    document.getSelection()?.removeAllRanges();

    const event = dispatchDocumentClipboardEvent('copy');

    expect(event.defaultPrevented).toBeFalse();
    expect(dispatcher.doc.selection.blur).toHaveBeenCalled();
    expect(dispatcher.run).not.toHaveBeenCalled();
  });

  it('prevents cut and paste when the model selection is stale', () => {
    dispatcher.currentSelection = staleSelection();
    rootHost.focus();
    document.getSelection()?.removeAllRanges();

    const cutEvent = dispatchDocumentClipboardEvent('cut');
    const pasteEvent = dispatchDocumentClipboardEvent('paste');

    expect(cutEvent.defaultPrevented).toBeTrue();
    expect(pasteEvent.defaultPrevented).toBeTrue();
    expect(dispatcher.doc.selection.blur).toHaveBeenCalled();
    expect(dispatcher.run).not.toHaveBeenCalled();
  });
});
