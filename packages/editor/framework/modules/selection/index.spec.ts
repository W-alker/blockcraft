import {Subject} from 'rxjs';
import {BlockNodeType} from '../../block-std';
import {SelectionManager} from './index';

describe('SelectionManager DOM selection normalization', () => {
  function createManager() {
    const rootHost = document.createElement('div');
    rootHost.setAttribute('data-block-id', 'root');
    rootHost.setAttribute('data-node-type', BlockNodeType.root);
    rootHost.setAttribute('contenteditable', 'true');

    const blockHost = document.createElement('div');
    blockHost.setAttribute('data-block-id', 'block-1');
    blockHost.setAttribute('data-node-type', BlockNodeType.block);
    rootHost.appendChild(blockHost);
    document.body.appendChild(rootHost);

    const rootBlock = {
      id: 'root',
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenLength: 1,
    };
    const block = {
      id: 'block-1',
      nodeType: BlockNodeType.block,
      hostElement: blockHost,
      parentId: 'root',
      parentBlock: rootBlock,
    };

    const doc = {
      root: rootBlock,
      event: {
        add() {},
        bindHotkey() {},
      },
      afterInit() {},
      onDestroy$: new Subject<void>(),
      getBlockById: (id: string) => id === 'root' ? rootBlock : block,
      compareBlockPosition: () => 0,
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy('warn')},
    };

    const manager = new SelectionManager(doc as any);
    return {manager, rootHost, blockHost};
  }

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    document.querySelectorAll('[data-block-id="root"]').forEach(el => el.remove());
  });

  it('ignores a collapsed native range on a non-editable block host', () => {
    const {manager, blockHost} = createManager();
    const range = document.createRange();
    range.setStart(blockHost, 0);
    range.collapse(true);

    const domSelection = document.getSelection()!;
    domSelection.removeAllRanges();
    domSelection.addRange(range);

    const result = manager.recalculate();

    expect(result.value).toBeNull();
    expect(manager.value).toBeNull();
    expect(blockHost.classList.contains('selected')).toBeFalse();
  });
});
