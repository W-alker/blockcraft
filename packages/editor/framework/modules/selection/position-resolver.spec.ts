import {
  SelectionPositionResolver,
  SelectionTreeReader,
} from './position-resolver';

interface TreeNode {
  parentId: string | null;
  childrenIds: readonly string[] | null;
}

describe('SelectionPositionResolver', () => {
  function createResolver(nodes: Record<string, TreeNode>) {
    const reader: SelectionTreeReader = {
      getParentId: blockId => Object.prototype.hasOwnProperty.call(nodes, blockId)
        ? nodes[blockId].parentId
        : undefined,
      getChildrenIds: blockId => nodes[blockId]?.childrenIds ?? null,
    };
    return new SelectionPositionResolver(reader);
  }

  function createColumnsTree() {
    return createResolver({
      root: {parentId: null, childrenIds: ['columns', 'tail']},
      columns: {parentId: 'root', childrenIds: ['left-column', 'right-column']},
      'left-column': {parentId: 'columns', childrenIds: ['left-text']},
      'left-text': {parentId: 'left-column', childrenIds: []},
      'right-column': {parentId: 'columns', childrenIds: ['right-text']},
      'right-text': {parentId: 'right-column', childrenIds: []},
      tail: {parentId: 'root', childrenIds: []},
    });
  }

  it('orders siblings in both directions', () => {
    const resolver = createColumnsTree();

    expect(resolver.resolve('left-column', 'right-column')).toEqual({
      order: -1,
      commonAncestor: 'columns',
    });
    expect(resolver.resolve('right-column', 'left-column')).toEqual({
      order: 1,
      commonAncestor: 'columns',
    });
    expect(resolver.resolve('left-column', 'left-column')).toEqual({
      order: 0,
      commonAncestor: 'left-column',
    });
  });

  it('orders an ancestor before its descendant', () => {
    const resolver = createColumnsTree();

    expect(resolver.resolve('columns', 'left-text')).toEqual({
      order: -1,
      commonAncestor: 'columns',
    });
    expect(resolver.resolve('left-text', 'columns')).toEqual({
      order: 1,
      commonAncestor: 'columns',
    });
  });

  it('orders descendants across columns through their model paths', () => {
    const resolver = createColumnsTree();

    expect(resolver.resolve('left-text', 'right-text')).toEqual({
      order: -1,
      commonAncestor: 'columns',
    });
    expect(resolver.resolve('right-text', 'tail')).toEqual({
      order: -1,
      commonAncestor: 'root',
    });
    expect(resolver.resolve('left-text', 'left-column')).toEqual({
      order: 1,
      commonAncestor: 'left-column',
    });
  });

  it('returns null for stale or disconnected block ids', () => {
    const resolver = createResolver({
      root: {parentId: null, childrenIds: ['a']},
      a: {parentId: 'root', childrenIds: []},
      otherRoot: {parentId: null, childrenIds: ['b']},
      b: {parentId: 'otherRoot', childrenIds: []},
    });

    expect(resolver.resolve('missing', 'a')).toBeNull();
    expect(resolver.resolve('a', 'missing')).toBeNull();
    expect(resolver.resolve('a', 'b')).toBeNull();
  });

  it('returns null when a parent is missing', () => {
    const resolver = createResolver({
      root: {parentId: null, childrenIds: []},
      orphan: {parentId: 'missing-parent', childrenIds: []},
    });

    expect(resolver.resolve('orphan', 'root')).toBeNull();
  });

  it('returns null when the parent does not contain its child', () => {
    const resolver = createResolver({
      root: {parentId: null, childrenIds: ['valid']},
      valid: {parentId: 'root', childrenIds: []},
      detached: {parentId: 'root', childrenIds: []},
    });

    expect(resolver.resolve('detached', 'valid')).toBeNull();
  });

  it('returns null for cyclic ancestry and unavailable child lists', () => {
    const cyclic = createResolver({
      a: {parentId: 'b', childrenIds: ['b']},
      b: {parentId: 'a', childrenIds: ['a']},
    });
    const unavailable = createResolver({
      root: {parentId: null, childrenIds: null},
      child: {parentId: 'root', childrenIds: []},
    });

    expect(cyclic.resolve('a', 'b')).toBeNull();
    expect(unavailable.resolve('root', 'child')).toBeNull();
  });

  it('reads each parent path once and only one sibling list', () => {
    const nodes: Record<string, TreeNode> = {
      root: {parentId: null, childrenIds: ['columns']},
      columns: {parentId: 'root', childrenIds: ['left-column', 'right-column']},
      'left-column': {parentId: 'columns', childrenIds: ['left-text']},
      'left-text': {parentId: 'left-column', childrenIds: []},
      'right-column': {parentId: 'columns', childrenIds: ['right-text']},
      'right-text': {parentId: 'right-column', childrenIds: []},
    };
    const getParentId = jasmine.createSpy('getParentId').and.callFake(
      (blockId: string) => Object.prototype.hasOwnProperty.call(nodes, blockId)
        ? nodes[blockId].parentId
        : undefined,
    );
    const getChildrenIds = jasmine.createSpy('getChildrenIds').and.callFake(
      (blockId: string) => nodes[blockId]?.childrenIds ?? null,
    );
    const resolver = new SelectionPositionResolver({getParentId, getChildrenIds});

    expect(resolver.resolve('left-text', 'right-text')).toEqual({
      order: -1,
      commonAncestor: 'columns',
    });
    expect(getParentId).toHaveBeenCalledTimes(8);
    expect(getChildrenIds).toHaveBeenCalledOnceWith('columns');
  });
});
