import {fakeAsync, flushMicrotasks, tick} from "@angular/core/testing";
import {BehaviorSubject, Subject} from "rxjs";
import * as Y from "yjs";
import {MentionPlugin} from "./index";
import type {MentionPanelFactory} from "./types";

describe("MentionPlugin 最新关键词交接", () => {
  function createSession() {
    const yDoc = new Y.Doc();
    const yText = yDoc.getText('body');
    const textChanges = new Subject<void>();
    const selectionChanges = new BehaviorSubject<any>(null);
    const destroy$ = new Subject<void>();
    const bindings = new Map<string, (ctx: any) => unknown>();
    const order: string[] = [];
    const panel = {
      onKeywordChange: jasmine.createSpy('onKeywordChange').and.callFake((keyword: string) => order.push(`keyword:${keyword}`)),
      onKeydown: jasmine.createSpy('onKeydown').and.callFake(() => { order.push('Tab'); return true; }),
      onConfirm: new Subject<any>(),
      updatePosition: jasmine.createSpy('updatePosition'),
      dispose: jasmine.createSpy('dispose')
    };
    let context!: Parameters<MentionPanelFactory>[0];
    const plugin = new MentionPlugin({panel: ctx => { context = ctx; return panel; }});
    const block = {
      id: 'paragraph', plainTextOnly: false, yText,
      get textLength() { return yText.length; },
      onTextChange: textChanges,
      applyDeltaOperations: (delta: any[]) => { yText.applyDelta(delta); textChanges.next(); }
    };
    const select = (offset: number) => {
      const point = {blockId: block.id, type: 'text', offset};
      selection.value = {anchor: point, head: point, start: point, end: point,
        commonParent: block.id, firstBlock: block, lastBlock: block, collapsed: true};
      selectionChanges.next(selection.value);
    };
    const selection = {
      value: null as any,
      selectionChange$: selectionChanges,
      setSelection: ({index}: {index: number}) => select(index),
      setCursorAt: (_block: unknown, index: number) => select(index)
    };
    const status = {isComposing: false};
    (plugin as any).doc = {
      yDoc, selection, isReadonly: false,
      model: {exists: () => true}, vm: {get: () => block},
      getBlockById: () => block, isEditable: () => true,
      event: {status, bindHotkey: ({key}: {key: string}, callback: (ctx: any) => unknown) => {
        bindings.set(key, callback);
        return () => bindings.delete(key);
      }},
      readonlySwitch$: new BehaviorSubject(false), onDestroy$: destroy$
    };
    spyOn<any>(plugin, '_getCharRect').and.returnValue(new DOMRect(10, 10, 8, 16));
    expect(plugin.openAt(block as any, 0)).toBeTrue();
    const replaceKeyword = (keyword: string) => {
      if (yText.length > 1) yText.delete(1, yText.length - 1);
      yText.insert(1, keyword);
      // Model text observers run before the input pipeline publishes the caret.
      textChanges.next();
      select(yText.length);
    };
    const tab = () => bindings.get('Tab')!({
      preventDefault: jasmine.createSpy('preventDefault'),
      getDefaultEvent: () => new KeyboardEvent('keydown', {key: 'Tab'})
    });
    return {plugin, panel, context, replaceKeyword, tab, order, status, yText, textChanges,
      close: () => { destroy$.next(); yDoc.destroy(); }};
  }

  it('刚输入就按 Tab，先通知最新关键词再把按键交给自定义面板', fakeAsync(() => {
    const session = createSession();
    session.replaceKeyword('最新输入');
    expect(session.panel.onKeywordChange.calls.allArgs()).toEqual([['']]);
    session.tab();
    expect(session.order).toEqual(['keyword:', 'keyword:最新输入', 'Tab']);
    tick(300);
    expect(session.panel.onKeywordChange.calls.allArgs()).toEqual([[''], ['最新输入']]);
    session.close();
  }));

  it('普通连续输入保持 300ms 防抖，读取最新关键词不触发搜索', fakeAsync(() => {
    const session = createSession();
    session.replaceKeyword('a');
    tick(100);
    session.replaceKeyword('ab');
    const getKeyword = (session.context as typeof session.context & {getKeyword?: () => string | null}).getKeyword;
    expect(getKeyword).toEqual(jasmine.any(Function));
    expect(getKeyword?.()).toBe('ab');
    tick(299);
    expect(session.panel.onKeywordChange.calls.allArgs()).toEqual([['']]);
    tick(1);
    expect(session.panel.onKeywordChange.calls.allArgs()).toEqual([[''], ['ab']]);
    session.close();
  }));

  it('IME 组词期间不转交 Tab，提交后可立即使用最终关键词', fakeAsync(() => {
    const session = createSession();
    session.status.isComposing = true;
    session.replaceKeyword('中文');
    session.tab();
    expect(session.panel.onKeydown).not.toHaveBeenCalled();
    expect(session.panel.onKeywordChange.calls.allArgs()).toEqual([['']]);
    session.status.isComposing = false;
    session.tab();
    expect(session.order).toEqual(['keyword:', 'keyword:中文', 'Tab']);
    session.close();
  }));

  it('退格后立即切换使用缩短的关键词，空关键词仍有效', fakeAsync(() => {
    const session = createSession();
    session.replaceKeyword('abc');
    tick(300);
    session.replaceKeyword('a');
    session.tab();
    expect(session.panel.onKeywordChange).toHaveBeenCalledWith('a');
    session.replaceKeyword('');
    session.tab();
    expect(session.panel.onKeywordChange.calls.mostRecent().args).toEqual(['']);
    session.close();
  }));

  it('触发符失效时关闭面板，销毁后不执行待处理关键词通知', fakeAsync(() => {
    const session = createSession();
    session.replaceKeyword('invalid');
    session.yText.delete(0, 1);
    session.tab();
    expect(session.panel.dispose).toHaveBeenCalledTimes(1);
    expect(session.panel.onKeydown).not.toHaveBeenCalled();
    tick(300);
    expect(session.panel.onKeywordChange.calls.allArgs()).toEqual([['']]);
    session.close();
    flushMicrotasks();
  }));
});
