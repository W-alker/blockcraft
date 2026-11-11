import {fakeAsync, flushMicrotasks} from "@angular/core/testing";
import {Subject} from "rxjs";
import {createDefaultMentionPanel} from "./default-panel";
import type {MentionPanelFactory, MentionType} from "../types";

describe('默认 mention 面板的关键词与请求一致性', () => {
  function setup() {
    const tabChange = new Subject<MentionType>();
    const confirm = new Subject<any>();
    const setInput = jasmine.createSpy('setInput');
    let keyword = '';
    let attached = true;
    const request = jasmine.createSpy('request').and.callFake((kw: string, type: MentionType) =>
      Promise.resolve({list: [{id: type, name: kw}]}));
    const factory = createDefaultMentionPanel({request});
    const panel = factory({
      rect: new DOMRect(), getKeyword: () => keyword,
      doc: {overlayService: {createConnectedOverlay: (_config: unknown, close$: Subject<void>, onClose: () => void) => {
        close$.subscribe(() => { attached = false; onClose(); });
        return {
          componentRef: {setInput, instance: {
            confirm, tabChange, moveTab: () => tabChange.next('doc'),
            moveSelect: jasmine.createSpy('moveSelect'), onSure: jasmine.createSpy('onSure')
          }},
          overlayRef: {hasAttached: () => attached, updatePosition: jasmine.createSpy('updatePosition')}
        };
      }}}
    } as unknown as Parameters<MentionPanelFactory>[0]);
    tabChange.next('user');
    return {panel, request, tabChange, setInput, setKeyword: (kw: string) => { keyword = kw; }};
  }

  it('键盘切换合并同步关键词与 Tab 请求，只请求新 Tab 的最新关键词', fakeAsync(() => {
    const {panel, request, setKeyword} = setup();
    setKeyword('刚输入');
    panel.onKeywordChange('刚输入');
    panel.onKeydown(new KeyboardEvent('keydown', {key: 'Tab'}));
    flushMicrotasks();
    expect(request.calls.allArgs()).toEqual([['刚输入', 'doc']]);
    panel.dispose();
  }));

  it('鼠标切换直接读取模型关键词，不等待输入防抖回调', fakeAsync(() => {
    const {panel, request, tabChange, setKeyword} = setup();
    panel.onKeywordChange('');
    flushMicrotasks();
    request.calls.reset();
    setKeyword('鼠标切换前输入');
    tabChange.next('doc');
    flushMicrotasks();
    expect(request.calls.allArgs()).toEqual([['鼠标切换前输入', 'doc']]);
    // 框架的输入防抖随后完成，也不重复搜索相同关键词。
    panel.onKeywordChange('鼠标切换前输入');
    flushMicrotasks();
    expect(request).toHaveBeenCalledTimes(1);
    panel.dispose();
  }));

  it('慢请求和销毁后的响应均不覆盖当前结果', fakeAsync(() => {
    const {panel, request, setKeyword, setInput} = setup();
    let finishOld!: (value: any) => void;
    request.and.callFake(() => new Promise(resolve => { finishOld = resolve; }));
    panel.onKeywordChange('旧');
    flushMicrotasks();
    request.and.returnValue(Promise.resolve({list: [{id: 'new', name: '新'}]}));
    setKeyword('新');
    panel.onKeywordChange('新');
    flushMicrotasks();
    finishOld({list: [{id: 'old', name: '旧'}]});
    flushMicrotasks();
    expect(setInput.calls.mostRecent().args).toEqual(['list', [{id: 'new', name: '新'}]]);
    let finishClosed!: (value: any) => void;
    request.and.callFake(() => new Promise(resolve => { finishClosed = resolve; }));
    panel.onKeywordChange('关闭');
    flushMicrotasks();
    setInput.calls.reset();
    panel.dispose();
    finishClosed({list: [{id: 'closed', name: '关闭'}]});
    flushMicrotasks();
    expect(setInput).not.toHaveBeenCalled();
  }));

  it('同一轮销毁会取消尚未发出的请求', fakeAsync(() => {
    const {panel, request} = setup();
    panel.onKeywordChange('关闭前输入');
    panel.dispose();
    flushMicrotasks();
    expect(request).not.toHaveBeenCalled();
  }));
});
