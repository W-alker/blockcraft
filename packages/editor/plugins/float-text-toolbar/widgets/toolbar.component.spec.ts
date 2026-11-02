import {TestBed} from '@angular/core/testing';
import {FloatTextToolbarComponent} from "./toolbar.component";

describe("FloatTextToolbarComponent selection replay", () => {
  const selectionJSON = {
    anchor: {blockId: "p1", type: "text", offset: 0},
    head: {blockId: "p1", type: "text", offset: 1},
    commonParent: "root",
  };

  it("does not replay a saved selection after destroy", () => {
    const component = new FloatTextToolbarComponent();
    const doc = {
      selection: {
        value: null,
        replay: jasmine.createSpy("replay"),
      },
    };
    component.doc = doc as any;
    component.ngOnDestroy();

    const result = (component as any).replaySelection(selectionJSON);

    expect(result).toBeNull();
    expect(doc.selection.replay).not.toHaveBeenCalled();
  });

  it("reports replay failure when the restored selection is cleared as stale", () => {
    const component = new FloatTextToolbarComponent();
    const doc = {
      selection: {
        value: null,
        replay: jasmine.createSpy("replay"),
      },
    };
    component.doc = doc as any;

    const result = (component as any).replaySelection(selectionJSON);

    expect(result).toBeNull();
    expect(doc.selection.replay).toHaveBeenCalledWith(selectionJSON);
  });

  it("returns the restored live selection after replay", () => {
    const component = new FloatTextToolbarComponent();
    const block = {id: "p1"};
    const selection = {
      anchor: {blockId: "p1", type: "text", offset: 0},
      head: {blockId: "p1", type: "text", offset: 1},
      start: {blockId: "p1", type: "text", offset: 0},
      end: {blockId: "p1", type: "text", offset: 1},
      commonParent: "p1",
      firstBlock: block,
      lastBlock: block,
    };
    const doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      selection: {
        value: selection,
        replay: jasmine.createSpy("replay"),
      },
    };
    component.doc = doc as any;

    const result = (component as any).replaySelection(selectionJSON);

    expect(result).toBe(selection as any);
    expect(doc.selection.replay).toHaveBeenCalledWith(selectionJSON);
  });

  it("returns null when replay restores a selection with missing blocks", () => {
    const component = new FloatTextToolbarComponent();
    const block = {id: "p1"};
    const selection = {
      anchor: {blockId: "p1", type: "text", offset: 0},
      head: {blockId: "p1", type: "text", offset: 1},
      start: {blockId: "p1", type: "text", offset: 0},
      end: {blockId: "p1", type: "text", offset: 1},
      commonParent: "p1",
      firstBlock: block,
      lastBlock: block,
    };
    const doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
      selection: {
        value: selection,
        replay: jasmine.createSpy("replay"),
      },
    };
    component.doc = doc as any;

    const result = (component as any).replaySelection(selectionJSON);

    expect(result).toBeNull();
    expect(doc.selection.replay).toHaveBeenCalledWith(selectionJSON);
  });

  it("formats picked colors without resampling the native selection", () => {
    const component = new FloatTextToolbarComponent();
    const recalculate = jasmine.createSpy("recalculate");
    const formatText = jasmine.createSpy("formatText");
    component.doc = {selection: {recalculate}} as any;
    component.utils = {formatText} as any;

    component.onColorPicked({type: "color", color: "#123456", group: {} as any});
    component.onColorPicked({type: "backColor", color: "transparent", group: {} as any});

    expect(formatText.calls.allArgs()).toEqual([
      [{"s:color": "#123456"}],
      [{"s:background": null}],
    ]);
    expect(recalculate).not.toHaveBeenCalled();
  });

  it("formats picked backgrounds without resampling the native selection", () => {
    const component = new FloatTextToolbarComponent();
    const recalculate = jasmine.createSpy("recalculate");
    const formatText = jasmine.createSpy("formatText");
    component.doc = {selection: {recalculate}} as any;
    component.utils = {formatText} as any;

    component.onBgGraphPicked("grid");

    expect(formatText).toHaveBeenCalledOnceWith({"a:bg": "grid"});
    expect(recalculate).not.toHaveBeenCalled();
  });
});


describe('FloatTextToolbarComponent readonly surface', () => {
  it('renders one labeled action with no format controls or divider and dispatches its click', async () => {
    await TestBed.configureTestingModule({imports: [FloatTextToolbarComponent]}).compileComponents();
    const fixture = TestBed.createComponent(FloatTextToolbarComponent);
    fixture.componentRef.setInput('doc', {selection: {value: null}});
    fixture.componentRef.setInput('utils', {});
    fixture.componentRef.setInput('readonly', true);
    fixture.componentRef.setInput('extraItems', [{name: 'comment', value: 'comment', label: '添加评论'}]);
    const clicked = jasmine.createSpy('clicked');
    fixture.componentInstance.onExtraItemClick.subscribe(clicked);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('bc-float-toolbar-item');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('添加评论');
    expect(fixture.nativeElement.querySelector('.bc-float-toolbar__divider')).toBeNull();
    const event = new MouseEvent('mousedown', {bubbles: true, cancelable: true});
    buttons[0].dispatchEvent(event);
    expect(event.defaultPrevented).toBeTrue();
    expect(clicked).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('rejects direct format commands when readonly', () => {
    const component = new FloatTextToolbarComponent();
    component.readonly = true;
    component.utils = {formatText: jasmine.createSpy(), updateBlockProps: jasmine.createSpy(), transformBlocks: jasmine.createSpy()} as any;
    component.onItemClicked({name: 'bold', value: true} as any);
    component.onColorPicked({type: 'color', color: '#123456', group: {} as any});
    component.setProps({heading: 1});
    component.transformList('bullet');
    component.onLink();
    component.onInlineFormula();
    expect(component.utils.formatText).not.toHaveBeenCalled();
    expect(component.utils.updateBlockProps).not.toHaveBeenCalled();
    expect(component.utils.transformBlocks).not.toHaveBeenCalled();
  });
});
