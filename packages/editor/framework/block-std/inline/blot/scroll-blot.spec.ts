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
});
