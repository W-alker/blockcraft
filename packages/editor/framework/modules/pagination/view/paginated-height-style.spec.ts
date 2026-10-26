import {BlockNodeType} from '../../../block-std/types/block.type';
import {PaginationConfig} from '../pagination.types';
import {PaginatedViewController} from './paginated-view.controller';

const CONFIG: PaginationConfig = {
  pageSize: {width: 400, height: 220},
  margins: {top: 10, right: 10, bottom: 10, left: 10},
};

describe('PaginatedViewController height cap styles', () => {
  it('caps a top-level code block through the inherited page-height variable', () => {
    const performanceLog = spyOn(console, 'log');
    const scrollContainer = document.createElement('div');
    const root = document.createElement('div');
    root.setAttribute('data-blockcraft-root', 'true');
    const codeHost = document.createElement('div');
    codeHost.className = 'code-block';
    codeHost.setAttribute('data-block-id', 'code-1');
    codeHost.setAttribute('data-node-type', BlockNodeType.editable);
    root.appendChild(codeHost);
    scrollContainer.appendChild(root);
    document.body.appendChild(scrollContainer);
    Object.defineProperty(codeHost, 'offsetHeight', {configurable: true, value: 1200});
    Object.defineProperty(codeHost, 'scrollHeight', {configurable: true, value: 1200});

    const block = {
      id: 'code-1',
      flavour: 'code',
      nodeType: BlockNodeType.editable,
      hostElement: codeHost,
    };
    const doc = {
      root: {childrenIds: ['code-1'], hostElement: root},
      getBlockById: (id: string) => id === 'code-1' ? block : null,
    } as unknown as BlockCraft.Doc;
    const controller = new PaginatedViewController(doc, CONFIG, scrollContainer);

    try {
      (controller as any)._enabled = true;
      (controller as any)._applyContainerStyles();
      (controller as any)._recompute();

      expect(root.style.getPropertyValue('--bc-page-content-height')).toBe('200px');
      expect(codeHost.classList.contains('bc-page-height-locked')).toBeTrue();
      expect(codeHost.style.maxHeight).toBe('');
      expect(codeHost.style.overflow).toBe('');
      expect(performanceLog.calls.allArgs().some(([message]) =>
        typeof message === 'string' && message.includes('[Sync] _recompute: pagination view recompute took')
      )).toBeTrue();
    } finally {
      controller.destroy();
      expect(codeHost.classList.contains('bc-page-height-locked')).toBeFalse();
      scrollContainer.remove();
    }
  });
});
