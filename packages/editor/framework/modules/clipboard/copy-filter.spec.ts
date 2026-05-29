import {BlockNodeType, DeltaInsert, IBlockSnapshot} from "../../block-std";
import {applyCopyFilters, resolveCopyFilters} from "./copy-filter";
import {ClipboardCopyFilter, CopyFilterContext} from "./types";
import {ClipboardManager} from "./index";

const CTX: CopyFilterContext = {source: 'programmatic', readonly: false};

const editable = (id: string, children: DeltaInsert[], flavour = 'paragraph'): IBlockSnapshot => ({
  id, flavour: flavour as BlockCraft.BlockFlavour, nodeType: BlockNodeType.editable,
  props: {depth: 0}, meta: {}, children,
});
const block = (id: string, flavour: string, children: IBlockSnapshot[]): IBlockSnapshot => ({
  id, flavour: flavour as BlockCraft.BlockFlavour, nodeType: BlockNodeType.block,
  props: {depth: 0}, meta: {}, children,
});
const root = (children: IBlockSnapshot[]): IBlockSnapshot => ({
  id: 'root', flavour: 'root' as BlockCraft.BlockFlavour, nodeType: BlockNodeType.root,
  props: {}, meta: {}, children,
});

describe('applyCopyFilters', () => {
  it('returns the original tree unchanged when no filters', () => {
    const tree = root([editable('a', [{insert: 'hi'}])]);
    expect(applyCopyFilters(tree, [], CTX)).toBe(tree);
  });

  it('excludes blocks by flavour (with subtree)', () => {
    const tree = root([
      editable('keep', [{insert: 'keep'}]),
      block('drop', 'comment', [editable('child', [{insert: 'gone'}])]),
    ]);
    const out = applyCopyFilters(tree, [{excludeFlavours: ['comment'] as any}], CTX);
    expect(out.children.length).toBe(1);
    expect((out.children as IBlockSnapshot[])[0].id).toBe('keep');
  });

  it('excludes blocks by predicate', () => {
    const tree = root([
      editable('a', [{insert: 'a'}]),
      editable('b', [{insert: 'b'}]),
    ]);
    const out = applyCopyFilters(tree, [{excludeBlock: (s) => s.id === 'b'}], CTX);
    expect((out.children as IBlockSnapshot[]).map(c => c.id)).toEqual(['a']);
  });

  it('prunes nested excluded container subtrees', () => {
    const tree = root([
      block('col', 'column', [
        block('inner', 'comment', [editable('x', [{insert: 'x'}])]),
        editable('y', [{insert: 'y'}]),
      ]),
    ]);
    const out = applyCopyFilters(tree, [{excludeFlavours: ['comment'] as any}], CTX);
    const col = (out.children as IBlockSnapshot[])[0];
    expect((col.children as IBlockSnapshot[]).map(c => c.id)).toEqual(['y']);
  });

  it('strips inline attribute keys (array form) and drops empty attributes', () => {
    const tree = root([editable('a', [
      {insert: 'link', attributes: {'a:link': 'http://x', 'a:bold': true}},
    ])]);
    const out = applyCopyFilters(tree, [{stripAttributes: ['a:link']}], CTX);
    const op = (out.children as IBlockSnapshot[])[0].children as DeltaInsert[];
    expect(op[0].attributes).toEqual({'a:bold': true});
  });

  it('removes the attributes field entirely when all keys stripped', () => {
    const tree = root([editable('a', [
      {insert: 'x', attributes: {'s:color': 'red'}},
    ])]);
    const out = applyCopyFilters(tree, [{stripAttributes: ['s:color']}], CTX);
    const op = (out.children as IBlockSnapshot[])[0].children as DeltaInsert[];
    expect('attributes' in op[0]).toBe(false);
  });

  it('strips inline attributes by predicate', () => {
    const tree = root([editable('a', [
      {insert: 'x', attributes: {'s:color': 'red', 'a:bold': true}},
    ])]);
    const out = applyCopyFilters(tree, [{stripAttributes: (k) => k.startsWith('s:')}], CTX);
    const op = (out.children as IBlockSnapshot[])[0].children as DeltaInsert[];
    expect(op[0].attributes).toEqual({'a:bold': true});
  });

  it('keeps embed insert objects while stripping their attributes', () => {
    const tree = root([editable('a', [
      {insert: {mention: 'u1'}, attributes: {'s:color': 'red'}},
    ])]);
    const out = applyCopyFilters(tree, [{stripAttributes: ['s:color']}], CTX);
    const op = (out.children as IBlockSnapshot[])[0].children as DeltaInsert[];
    expect(op[0].insert).toEqual({mention: 'u1'});
    expect('attributes' in op[0]).toBe(false);
  });

  it('runs transform after declarative rules', () => {
    const tree = root([editable('a', [{insert: 'a'}]), editable('b', [{insert: 'b'}])]);
    const filter: ClipboardCopyFilter = {
      excludeBlock: (s) => s.id === 'a',
      transform: (r) => root([...(r.children as IBlockSnapshot[]), editable('c', [{insert: 'c'}])]),
    };
    const out = applyCopyFilters(tree, [filter], CTX);
    expect((out.children as IBlockSnapshot[]).map(c => c.id)).toEqual(['b', 'c']);
  });

  it('composes multiple filters in order', () => {
    const tree = root([
      editable('p', [{insert: 'p'}]),
      block('c1', 'comment', [editable('x', [{insert: 'x'}])]),
      block('c2', 'aside', [editable('y', [{insert: 'y'}])]),
    ]);
    const out = applyCopyFilters(tree, [
      {excludeFlavours: ['comment'] as any},
      {excludeFlavours: ['aside'] as any},
    ], CTX);
    expect((out.children as IBlockSnapshot[]).map(c => c.id)).toEqual(['p']);
  });

  it('feeds one filter output into the next (order sensitive)', () => {
    const tree = root([editable('p', [{insert: 'p'}])]);
    const adder: ClipboardCopyFilter = {
      transform: (r) => root([...(r.children as IBlockSnapshot[]), block('inj', 'comment', [])]),
    };
    const remover: ClipboardCopyFilter = {excludeFlavours: ['comment'] as any};
    // adder first → remover sees and removes the injected comment block
    expect((applyCopyFilters(tree, [adder, remover], CTX).children as IBlockSnapshot[]).map(c => c.id))
      .toEqual(['p']);
    // remover first → injected block survives (added after removal)
    expect((applyCopyFilters(tree, [remover, adder], CTX).children as IBlockSnapshot[]).map(c => c.id))
      .toEqual(['p', 'inj']);
  });

  it('isolates a throwing transform: warns, keeps declarative result, continues', () => {
    const logger = {warn: jasmine.createSpy('warn')};
    const tree = root([editable('a', [{insert: 'a'}]), editable('b', [{insert: 'b'}])]);
    const out = applyCopyFilters(tree, [
      {excludeBlock: (s) => s.id === 'a', transform: () => { throw new Error('boom'); }},
      {excludeBlock: (s) => s.id === 'b'},
    ], CTX, logger);
    expect(logger.warn).toHaveBeenCalled();
    // filter 1 declarative removed 'a'; filter 2 removed 'b' → empty
    expect((out.children as IBlockSnapshot[]).length).toBe(0);
  });

  it('does not mutate the input tree', () => {
    const tree = root([
      editable('a', [{insert: 'x', attributes: {'a:link': 'u'}}]),
      block('c', 'comment', []),
    ]);
    const snapshot = JSON.stringify(tree);
    applyCopyFilters(tree, [{excludeFlavours: ['comment'] as any, stripAttributes: ['a:link']}], CTX);
    expect(JSON.stringify(tree)).toBe(snapshot);
  });

  it('yields an empty root when all blocks excluded', () => {
    const tree = root([block('c', 'comment', [])]);
    const out = applyCopyFilters(tree, [{excludeFlavours: ['comment'] as any}], CTX);
    expect(out.children.length).toBe(0);
  });

  it('ignores a transform that returns nothing (keeps the prior tree)', () => {
    const logger = {warn: jasmine.createSpy('warn')};
    const tree = root([editable('a', [{insert: 'a'}]), editable('b', [{insert: 'b'}])]);
    const out = applyCopyFilters(tree, [
      {excludeBlock: (s) => s.id === 'a', transform: () => undefined as any},
      {excludeBlock: (s) => s.id === 'b'},
    ], CTX, logger);
    expect(logger.warn).toHaveBeenCalled();
    // filter 1 declarative removed 'a' (kept despite the no-op transform); filter 2 removed 'b'
    expect((out.children as IBlockSnapshot[]).length).toBe(0);
  });

  it('passes ctx through to excludeBlock and transform', () => {
    const seen: string[] = [];
    const ctx: CopyFilterContext = {source: 'selection', readonly: true};
    applyCopyFilters(root([editable('a', [{insert: 'a'}])]), [{
      excludeBlock: (_s, c) => { seen.push(`exclude:${c.source}:${c.readonly}`); return false; },
      transform: (r, c) => { seen.push(`transform:${c.source}:${c.readonly}`); return r; },
    }], ctx);
    expect(seen).toContain('exclude:selection:true');
    expect(seen).toContain('transform:selection:true');
  });

  it('strips attributes in deeply nested editable nodes', () => {
    const tree = root([
      block('outer', 'column', [
        block('inner', 'column', [
          editable('deep', [{insert: 'x', attributes: {'s:color': 'red', 'a:bold': true}}]),
        ]),
      ]),
    ]);
    const out = applyCopyFilters(tree, [{stripAttributes: ['s:color']}], CTX);
    const outer = (out.children as IBlockSnapshot[])[0];
    const inner = (outer.children as IBlockSnapshot[])[0];
    const op = (inner.children as IBlockSnapshot[])[0].children as DeltaInsert[];
    expect(op[0].attributes).toEqual({'a:bold': true});
  });
});

describe('resolveCopyFilters', () => {
  const f1: ClipboardCopyFilter = {excludeFlavours: ['comment'] as any};
  const f2: ClipboardCopyFilter = {excludeFlavours: ['aside'] as any};

  it('returns the registry when override is undefined', () => {
    expect(resolveCopyFilters([f1, f2], undefined)).toEqual([f1, f2]);
  });
  it('returns empty when override is false', () => {
    expect(resolveCopyFilters([f1], false)).toEqual([]);
  });
  it('replaces the pipeline when override is a filter', () => {
    expect(resolveCopyFilters([f1], f2)).toEqual([f2]);
  });
});

describe('ClipboardManager.registerCopyFilter', () => {
  const make = () => ({_copyFilters: [] as ClipboardCopyFilter[]});
  const register = ClipboardManager.prototype.registerCopyFilter;

  it('appends filters and removes only its own on dispose', () => {
    const h = make();
    const f1: ClipboardCopyFilter = {excludeFlavours: ['comment'] as any};
    const f2: ClipboardCopyFilter = {excludeFlavours: ['aside'] as any};
    const dispose1 = register.call(h, f1);
    register.call(h, f2);
    expect(h._copyFilters).toEqual([f1, f2]);
    dispose1();
    expect(h._copyFilters).toEqual([f2]);
  });

  it('dispose is idempotent', () => {
    const h = make();
    const f1: ClipboardCopyFilter = {excludeFlavours: ['comment'] as any};
    const dispose = register.call(h, f1);
    dispose();
    dispose();
    expect(h._copyFilters).toEqual([]);
  });
});
