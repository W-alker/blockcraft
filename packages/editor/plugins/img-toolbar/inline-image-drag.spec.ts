import {BlockNodeType} from '../../framework';
import {
  resolveInlineImageDropTarget,
  resolveInlineImageOverlapTarget,
} from './inline-image-drag';

const setRect = (element: HTMLElement, rect: Partial<DOMRect>) => {
  element.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...rect,
  });
};

describe('inline image drop target resolution', () => {
  let root: HTMLElement;
  let caretRangeDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    root = document.createElement('div');
    root.dataset['blockcraftRoot'] = 'true';
    setRect(root, {
      left: 0,
      top: 0,
      right: 500,
      bottom: 500,
      width: 500,
      height: 500,
    });
    document.body.appendChild(root);
    caretRangeDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'caretRangeFromPoint',
    );
  });

  afterEach(() => {
    if (caretRangeDescriptor) {
      Object.defineProperty(document, 'caretRangeFromPoint', caretRangeDescriptor);
    } else {
      delete (document as any).caretRangeFromPoint;
    }
    root.remove();
  });

  it('snaps a gap/non-editable hit to the nearest compatible paragraph', () => {
    const blocks = new Map<string, any>();
    const addBlock = (
      id: string,
      top: number,
      bottom: number,
      nodeType: BlockNodeType,
      plainText = false,
    ) => {
      const host = document.createElement('div');
      host.dataset['blockId'] = id;
      host.appendChild(document.createTextNode(id));
      setRect(host, {
        left: 20,
        top,
        right: 480,
        bottom,
        width: 460,
        height: bottom - top,
      });
      root.appendChild(host);
      const block = {
        id,
        nodeType,
        hostElement: host,
        containerElement: host,
        textLength: id.length,
        plainText,
        runtime: {domPointToModel: () => 1},
      };
      blocks.set(id, block);
      return block;
    };
    addBlock('above', 20, 80, BlockNodeType.editable);
    const nonEditable = addBlock('image', 100, 160, BlockNodeType.block);
    addBlock('plain', 165, 185, BlockNodeType.editable, true);
    const below = addBlock('below', 190, 250, BlockNodeType.editable);
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: () => {
        const range = document.createRange();
        range.setStart(nonEditable.hostElement.firstChild!, 0);
        range.collapse(true);
        return range;
      },
    });
    const doc: any = {
      root: {hostElement: root},
      model: {
        exists: (id: string) => blocks.has(id),
        getPath: (id: string) => ['root', id],
      },
      vm: {isMounted: () => true},
      getBlockById: (id: string) => blocks.get(id),
      isEditable: (block: any) => block?.nodeType === BlockNodeType.editable,
      isPlainTextBlock: (id: string) => blocks.get(id)?.plainText ?? false,
      readonlyManager: {isReadonly: () => false},
    };

    const target = resolveInlineImageDropTarget(doc, 250, 170);

    expect(target?.block as any).toBe(below);
    expect(target?.offset).toBe(0);

    const overlapTarget = resolveInlineImageOverlapTarget(doc, 'image', {
      left: 100,
      top: 180,
      right: 420,
      bottom: 230,
      width: 320,
      height: 50,
    } as DOMRect);
    expect(overlapTarget?.block as any).toBe(below);

    const nearestButNotCovered = resolveInlineImageOverlapTarget(doc, 'image', {
      left: 100,
      top: 100,
      right: 420,
      bottom: 160,
      width: 320,
      height: 60,
    } as DOMRect);
    expect(nearestButNotCovered).toBeNull();

    doc.model.getPath = () => ['root', 'image', 'below'];
    expect(resolveInlineImageOverlapTarget(doc, 'image', {
      left: 100,
      top: 180,
      right: 420,
      bottom: 230,
      width: 320,
      height: 50,
    } as DOMRect)).toBeNull();
  });

  it('rejects a point outside the editor before querying caret geometry', () => {
    const caretSpy = jasmine.createSpy('caretRangeFromPoint');
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: caretSpy,
    });
    const doc: any = {root: {hostElement: root}};

    expect(resolveInlineImageDropTarget(doc, 600, 100)).toBeNull();
    expect(caretSpy).not.toHaveBeenCalled();
  });
});
