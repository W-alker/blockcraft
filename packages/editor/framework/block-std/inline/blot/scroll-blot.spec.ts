import {ScrollBlot} from "./scroll-blot";
import {CursorBlot} from "./cursor-blot";
import {TextBlot} from "./text-blot";
import {BlotType} from "./blot";
import type {EmbedConverter} from "../index";
import {InlineModel} from "../../types";

describe('ScrollBlot offsetOf', () => {
  let container: HTMLElement;
  let converters: Map<string, EmbedConverter>;

  const testConverter: EmbedConverter = {
    toView: () => document.createElement('span'),
    toDelta: () => ({insert: {test: 'v'}}),
  };

  function createScroll(deltas: InlineModel): ScrollBlot {
    const scroll = new ScrollBlot(container, converters);
    scroll.build(deltas);
    return scroll;
  }

  beforeEach(() => {
    container = document.createElement('div');
    converters = new Map([['test', testConverter]]);
  });

  describe('Text/Embed leaves (existing semantics)', () => {
    it('returns cumulative offsets for text and embed leaves', () => {
      const scroll = createScroll([
        {insert: 'Hello '},
        {insert: {test: 'v'}},
        {insert: 'world'},
      ]);
      const leaves = scroll.leaves;

      expect(scroll.offsetOf(leaves[0])).toBe(0);
      expect(scroll.offsetOf(leaves[1])).toBe(6);
      expect(scroll.offsetOf(leaves[2])).toBe(7);
    });

    it('returns -1 for a blot that is not in the tree', () => {
      const scroll = createScroll([{insert: 'Hello'}]);
      const foreign = new TextBlot('detached');

      expect(scroll.offsetOf(foreign)).toBe(-1);
    });
  });

  describe('zero-length blots (CursorBlot)', () => {
    it('returns the insertion offset for a CursorBlot at a leaf boundary', () => {
      const scroll = createScroll([
        {insert: 'Hello'},
        {insert: ' world', attributes: {bold: true}},
      ]);
      const cursor = new CursorBlot();
      scroll.insertCursorBlot(5, cursor);

      expect(scroll.offsetOf(cursor)).toBe(5);
    });

    it('returns the insertion offset for a CursorBlot inside a TextBlot (split case)', () => {
      const scroll = createScroll([{insert: 'Hello'}]);
      const cursor = new CursorBlot();
      scroll.insertCursorBlot(2, cursor);

      expect(scroll.offsetOf(cursor)).toBe(2);
    });

    it('returns 0 for a CursorBlot at the start of content', () => {
      const scroll = createScroll([{insert: 'Hello'}]);
      const cursor = new CursorBlot();
      scroll.insertCursorBlot(0, cursor);

      expect(scroll.offsetOf(cursor)).toBe(0);
    });

    it('returns textLength for a CursorBlot at the end of content', () => {
      const scroll = createScroll([{insert: 'Hello'}]);
      const cursor = new CursorBlot();
      scroll.insertCursorBlot(5, cursor);

      expect(scroll.offsetOf(cursor)).toBe(5);
      expect(scroll.offsetOf(cursor)).toBe(scroll.textLength);
    });

    it('returns 0 for a CursorBlot in an empty container', () => {
      const scroll = createScroll([]);
      const cursor = new CursorBlot();
      scroll.insertCursorBlot(0, cursor);

      expect(scroll.offsetOf(cursor)).toBe(0);
    });

    it('returns the offset after an embed for a CursorBlot following it', () => {
      const scroll = createScroll([
        {insert: 'ab'},
        {insert: {test: 'v'}},
      ]);
      const cursor = new CursorBlot();
      scroll.insertCursorBlot(3, cursor);

      expect(scroll.offsetOf(cursor)).toBe(3);
    });

    it('does not shift leaf offsets after a CursorBlot is inserted', () => {
      const scroll = createScroll([
        {insert: 'Hello'},
        {insert: ' world', attributes: {bold: true}},
      ]);
      const cursor = new CursorBlot();
      scroll.insertCursorBlot(5, cursor);
      const leaves = scroll.leaves;

      expect(scroll.offsetOf(leaves[0])).toBe(0);
      expect(scroll.offsetOf(leaves[1])).toBe(5);
    });

    it('returns -1 for a CursorBlot that has been removed from the tree', () => {
      const scroll = createScroll([{insert: 'Hello'}]);
      const cursor = new CursorBlot();
      scroll.insertCursorBlot(2, cursor);
      scroll.removeCursorBlot(cursor);

      expect(scroll.offsetOf(cursor)).toBe(-1);
    });
  });

  describe('zero-length blots (BreakBlot)', () => {
    it('returns textLength for the trailing BreakBlot', () => {
      const scroll = createScroll([{insert: 'Hello'}]);
      const breakBlot = scroll.children.find(b => b.type === BlotType.Break)!;

      expect(scroll.offsetOf(breakBlot)).toBe(scroll.textLength);
    });
  });

  describe('detachAll', () => {
    it('removes retained DOM and destroys embeds exactly once', () => {
      const onDestroy = jasmine.createSpy('onDestroy');
      converters.set('test', {...testConverter, onDestroy});
      const scroll = createScroll([
        {insert: 'Hello'},
        {insert: {test: 'v'}},
      ]);

      scroll.detachAll();
      scroll.detachAll();

      expect(container.childNodes.length).toBe(0);
      expect(scroll.children.length).toBe(0);
      expect(scroll.textLength).toBe(0);
      expect(onDestroy).toHaveBeenCalledTimes(1);
    });
  });

  for (const lineContainerTag of [undefined, 'c-line'] as const) {
    describe(`spliceLeaves batch replacement (${lineContainerTag ?? 'flat'})`, () => {
      function createBatchScroll(model: InlineModel) {
        const scroll = new ScrollBlot(container, converters, {lineContainerTag});
        scroll.build(model);
        return scroll;
      }

      function expectDomOrder(scroll: ScrollBlot) {
        const expected = scroll.children.map(child => child.domNode);
        const owned = new Set(expected);
        const actual = Array.from(container.querySelectorAll('c-element')).filter(node => owned.has(node));
        expect(actual.length).toBe(expected.length);
        expect(actual.every((node, index) => node === expected[index])).toBeTrue();
        expect(scroll.hasCanonicalDomOrder()).toBeTrue();
      }

      it('keeps a cursor within the deleted leaf range before the original insertion anchor', () => {
        const onDestroy = jasmine.createSpy('onDestroy');
        converters.set('test', {...testConverter, onDestroy});
        const scroll = createBatchScroll([
          {insert: 'a'}, {insert: {test: 'v'}}, {insert: 'c'}, {insert: 'd'},
        ]);
        const original = scroll.leaves.slice();
        const end = scroll.children.at(-1)!;
        const cursor = new CursorBlot();
        scroll.insertCursorBlot(2, cursor);
        const replacement = [new TextBlot('X'), new TextBlot('Y')];

        scroll.spliceLeaves(1, 2, replacement);

        expect(scroll.children).toEqual([original[0], cursor, ...replacement, original[3], end]);
        expect(scroll.offsetOf(cursor)).toBe(1);
        expect(scroll.offsetOf(original[3])).toBe(3);
        expect(scroll.textLength).toBe(4);
        expect(original[1].parent).toBeNull();
        expect(original[2].parent).toBeNull();
        expect(onDestroy).toHaveBeenCalledTimes(1);
        expectDomOrder(scroll);
        scroll.detachAll();
      });

      it('replaces all leaves and then removes them while retaining the cursor and terminal break', () => {
        const scroll = createBatchScroll([{insert: 'a\nb\nc'}]);
        const end = scroll.children.at(-1)!;
        const cursor = new CursorBlot();
        scroll.insertCursorBlot(2, cursor);
        const replacement = [new TextBlot('new'), new TextBlot('\n'), new TextBlot('end')];

        scroll.spliceLeaves(0, scroll.leaves.length, replacement);

        expect(scroll.children).toEqual([cursor, ...replacement, end]);
        expect(scroll.offsetOf(cursor)).toBe(0);
        expect(scroll.offsetOf(end)).toBe(7);
        expectDomOrder(scroll);
        scroll.spliceLeaves(0, scroll.leaves.length, []);
        expect(scroll.children).toEqual([cursor, end]);
        expect(scroll.textLength).toBe(0);
        expectDomOrder(scroll);
        scroll.detachAll();
      });

      it('preserves prefix/suffix leaves and exact DOM order across a large multi-line replacement', () => {
        const model: InlineModel = [];
        for (let index = 0; index < 1024; index++) {
          model.push({insert: `old ${index}`}, {insert: '\n'});
        }
        const scroll = createBatchScroll(model);
        const original = scroll.leaves.slice();
        const prefix = original.slice(0, 200);
        const suffix = original.slice(1800);
        const replacement: TextBlot[] = [];
        for (let index = 0; index < 900; index++) {
          replacement.push(new TextBlot(`new ${index}`), new TextBlot('\n'));
        }

        scroll.spliceLeaves(200, 1600, replacement);

        const expected = [...prefix, ...replacement, ...suffix];
        expect(scroll.leaves.length).toBe(expected.length);
        expect(scroll.leaves.every((leaf, index) => leaf === expected[index])).toBeTrue();
        expect(scroll.textLength).toBe(expected.reduce((length, leaf) => length + leaf.length, 0));
        expectDomOrder(scroll);
        scroll.detachAll();
      });
    });
  }

  describe('reversible layout splits', () => {
    it('splits at a model offset without changing model length and rolls back exactly', () => {
      const scroll = createScroll([
        {insert: 'Hello world', attributes: {bold: true}},
      ]);
      const original = scroll.leaves[0] as TextBlot;

      const split = scroll.splitTextForLayout(5);

      expect(split).not.toBeNull();
      expect(scroll.textLength).toBe(11);
      expect(scroll.leaves.map(leaf => leaf instanceof TextBlot ? leaf.text : '')).toEqual([
        'Hello',
        ' world',
      ]);
      expect((scroll.leaves[0] as TextBlot).attrs).toEqual({bold: true});
      expect((scroll.leaves[1] as TextBlot).attrs).toEqual({bold: true});

      expect(scroll.mergeLayoutTextSplit(split!)).toBeTrue();
      expect(scroll.leaves).toEqual([original]);
      expect(original.text).toBe('Hello world');
      expect(scroll.textLength).toBe(11);
    });

    it('does not split at an existing text or embed boundary', () => {
      const scroll = createScroll([
        {insert: 'Hello'},
        {insert: {test: 'v'}},
        {insert: 'world'},
      ]);

      expect(scroll.splitTextForLayout(0)).toBeNull();
      expect(scroll.splitTextForLayout(5)).toBeNull();
      expect(scroll.splitTextForLayout(6)).toBeNull();
      expect(scroll.splitTextForLayout(scroll.textLength)).toBeNull();
      expect(scroll.textLength).toBe(11);
    });

    it('restores projected Blot nodes to canonical child order', () => {
      const scroll = createScroll([
        {insert: 'left'},
        {insert: {test: 'v'}},
        {insert: 'right'},
      ]);
      const layoutWrapper = document.createElement('span');
      container.insertBefore(layoutWrapper, scroll.children[0].domNode);
      for (const leaf of scroll.leaves) layoutWrapper.appendChild(leaf.domNode);

      scroll.restoreCanonicalDomOrder();

      const directBlotNodes = Array.from(container.children)
        .filter(element => element.localName === 'c-element');
      expect(directBlotNodes.length).toBe(scroll.children.length);
      directBlotNodes.forEach((node, index) => {
        expect(node).toBe(scroll.children[index].domNode as Element);
      });
      expect(layoutWrapper.childNodes.length).toBe(0);
    });

    it('reparents a detached trailing break before restoring canonical order', () => {
      const scroll = createScroll([
        {insert: 'left'},
        {insert: {test: 'v'}},
        {insert: 'right'},
      ]);
      const canonical = scroll.children.map(child => child.domNode);
      const breakBlot = scroll.children.find(child => child.type === 'break')!;
      // Build the lazy prefix index before simulating Firefox's native
      // contenteditable mutation, which may disconnect the trailing <br>.
      expect(scroll.textLength).toBe(10);
      breakBlot.domNode.parentNode?.removeChild(breakBlot.domNode);

      expect(() => scroll.restoreCanonicalDomOrder()).not.toThrow();

      const directCanonical = Array.from(container.childNodes)
        .filter(node => canonical.includes(node as HTMLElement));
      expect(directCanonical.length).toBe(canonical.length);
      directCanonical.forEach((node, index) => {
        expect(node).toBe(canonical[index] as ChildNode);
      });
      expect(canonical.every(node => node.parentNode === container)).toBeTrue();
      expect(scroll.textLength).toBe(10);
      expect(scroll.offsetOf(breakBlot)).toBe(10);
    });

    it('refuses to merge a stale or non-adjacent split record', () => {
      const scroll = createScroll([{insert: 'abcdef'}]);
      const first = scroll.splitTextForLayout(2)!;
      const second = scroll.splitTextForLayout(1)!;

      expect(scroll.mergeLayoutTextSplit(first)).toBeFalse();
      expect(scroll.textLength).toBe(6);
      expect(scroll.mergeLayoutTextSplit(second)).toBeTrue();
      expect(scroll.mergeLayoutTextSplit(first)).toBeTrue();
      expect(scroll.textLength).toBe(6);
    });
  });
});
