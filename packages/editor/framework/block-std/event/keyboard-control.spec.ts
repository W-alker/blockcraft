import {Subject} from 'rxjs';
import {KeyboardControl} from './control/keyboard';

describe('KeyboardControl stale selection guard', () => {
  let host: HTMLElement;
  let onDestroy$: Subject<void>;
  let dispatcher: any;
  let control: KeyboardControl;

  const staleSelection = () => ({
    start: {type: 'text', offset: 0},
    end: {type: 'text', offset: 0},
    collapsed: true,
    isInSameBlock: true,
    get firstBlock() {
      throw new Error('Block not found');
    },
  });

  const liveSelection = () => {
    const block = {
      id: 'p1',
      flavour: 'paragraph',
      textContent: () => 'abc',
    };
    return {
      start: {type: 'text', offset: 1},
      end: {type: 'text', offset: 1},
      collapsed: true,
      isInSameBlock: true,
      firstBlock: block,
      lastBlock: block,
    };
  };

  const dispatchKeyDown = (key: string) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    host.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    host = document.createElement('div');
    host.tabIndex = 0;
    document.body.appendChild(host);
    onDestroy$ = new Subject<void>();
    dispatcher = {
      currentSelection: staleSelection(),
      run: jasmine.createSpy('run'),
      doc: {
        selection: {
          blur: jasmine.createSpy('blur'),
        },
      },
    };
    control = new KeyboardControl(dispatcher);
    control.listen({
      hostElement: host,
      onDestroy$,
    } as any);
  });

  afterEach(() => {
    onDestroy$.next();
    onDestroy$.complete();
    host.remove();
  });

  it('prevents printable keydown and blurs when the model selection is stale', () => {
    const event = dispatchKeyDown('a');

    expect(event.defaultPrevented).toBeTrue();
    expect(dispatcher.doc.selection.blur).toHaveBeenCalled();
    expect(dispatcher.run).not.toHaveBeenCalled();
  });

  it('blurs stale arrow keydown without preventing default navigation', () => {
    const event = dispatchKeyDown('ArrowDown');

    expect(event.defaultPrevented).toBeFalse();
    expect(dispatcher.doc.selection.blur).toHaveBeenCalled();
    expect(dispatcher.run).not.toHaveBeenCalled();
  });

  it('prevents printable keydown when no model selection is available', () => {
    dispatcher.currentSelection = null;

    const event = dispatchKeyDown('a');

    expect(event.defaultPrevented).toBeTrue();
    expect(dispatcher.doc.selection.blur).toHaveBeenCalled();
    expect(dispatcher.run).not.toHaveBeenCalled();
  });

  it('dispatches keyboard state for a live model selection', () => {
    dispatcher.currentSelection = liveSelection();

    const event = dispatchKeyDown('ArrowRight');

    expect(event.defaultPrevented).toBeFalse();
    expect(dispatcher.doc.selection.blur).not.toHaveBeenCalled();
    expect(dispatcher.run).toHaveBeenCalledTimes(1);
    const [name, context] = dispatcher.run.calls.mostRecent().args;
    expect(name).toBe('keyDown');
    expect(context.get('keyboardState').selection).toBe(dispatcher.currentSelection);
  });
});
