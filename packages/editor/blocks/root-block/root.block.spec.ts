import {TestBed} from "@angular/core/testing";
import {BlockNodeType} from "../../framework";
import {RootBlockComponent} from "./root.block";

describe("RootBlockComponent selection entry", () => {
  function createComponent() {
    const fixture = TestBed.configureTestingModule({
      imports: [RootBlockComponent],
    }).createComponent(RootBlockComponent);
    return {
      fixture,
      component: fixture.componentInstance as any,
    };
  }

  function makeContext(target: EventTarget) {
    return {
      get: (key: string) => key === "selectState" ? {trigger: "mouse"} : null,
      getDefaultEvent: () => ({target}),
    } as any;
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("does not start the block-level selecting chain from editable text", () => {
    const {fixture, component} = createComponent();
    const paragraphHost = document.createElement("p");
    paragraphHost.setAttribute("data-block-id", "p1");
    const root = {id: "root", nodeType: BlockNodeType.root, parentBlock: null};
    const paragraph = {
      id: "p1",
      nodeType: BlockNodeType.editable,
      flavour: "paragraph",
      hostElement: paragraphHost,
      parentBlock: root,
    };
    const selectBlock = jasmine.createSpy("selectBlock");
    component.doc = {
      getBlockById: () => paragraph,
      selection: {selectBlock},
    };

    component.onSelectstart(makeContext(paragraphHost));

    expect(component.selecting$.value).toBe("end");
    expect(selectBlock).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it("does not start the block-level selecting chain from table content", () => {
    const {fixture, component} = createComponent();
    const cellHost = document.createElement("div");
    cellHost.setAttribute("data-block-id", "cell-1");
    const root = {id: "root", nodeType: BlockNodeType.root, parentBlock: null};
    const table = {
      id: "table-1",
      nodeType: BlockNodeType.block,
      flavour: "table",
      parentBlock: root,
    };
    const row = {
      id: "row-1",
      nodeType: BlockNodeType.block,
      flavour: "table-row",
      parentBlock: table,
    };
    const cell = {
      id: "cell-1",
      nodeType: BlockNodeType.block,
      flavour: "table-cell",
      hostElement: cellHost,
      parentBlock: row,
    };
    const selectBlock = jasmine.createSpy("selectBlock");
    component.doc = {
      getBlockById: () => cell,
      selection: {selectBlock},
    };

    component.onSelectstart(makeContext(cellHost));

    expect(component.selecting$.value).toBe("end");
    expect(selectBlock).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it("keeps the block-level selecting chain for non-editable block starts", () => {
    const {fixture, component} = createComponent();
    const imageHost = document.createElement("div");
    imageHost.setAttribute("data-block-id", "image-1");
    const root = {id: "root", nodeType: BlockNodeType.root, parentBlock: null};
    const image = {
      id: "image-1",
      nodeType: BlockNodeType.void,
      flavour: "image",
      hostElement: imageHost,
      parentBlock: root,
    };
    component.doc = {
      getBlockById: () => image,
      selection: {selectBlock: jasmine.createSpy("selectBlock")},
    };

    component.onSelectstart(makeContext(imageHost));

    expect(component.selecting$.value).toBe("start");
    fixture.destroy();
  });

  it("projects compact document typography and accepts safe legacy font stacks", () => {
    const {fixture, component} = createComponent();
    component._native = rootNative({ff: "kai", fs: 18, lh: 1.75});

    component.applyDocumentTypographyProjection();

    expect(component.documentFontFamily).toContain("Kaiti SC");
    expect(component.documentFontSize).toBe("18px");
    expect(component.documentLineHeight).toBe("1.75");
    expect(component.hostElement.style.fontFamily).toContain("Kaiti SC");
    expect(component.hostElement.style.getPropertyValue("--bc-fs")).toBe("18px");
    expect(component.hostElement.style.getPropertyValue("--bc-lh")).toBe("1.75");

    component._native = rootNative({ff: "Georgia, serif"});
    component.applyDocumentTypographyProjection();
    expect(component.hostElement.style.fontFamily).toBe("Georgia, serif");
    fixture.destroy();
  });

  it("drops invalid root typography instead of projecting raw CSS", () => {
    const {fixture, component} = createComponent();
    component._native = rootNative({
      ff: "url(javascript:bad)",
      fs: 9,
      lh: 4,
    });

    component.applyDocumentTypographyProjection();

    expect(component.documentFontFamily).toBeNull();
    expect(component.documentFontSize).toBeNull();
    expect(component.documentLineHeight).toBeNull();
    expect(component.hostElement.style.fontFamily).toBe("");
    expect(component.hostElement.style.getPropertyValue("--bc-fs")).toBe("");
    expect(component.hostElement.style.getPropertyValue("--bc-lh")).toBe("");
    fixture.destroy();
  });

  it("coalesces local/remote root typography changes into one layout refresh", async () => {
    const {fixture, component} = createComponent();
    const refreshLayoutMetrics = jasmine.createSpy("refreshLayoutMetrics");
    component.doc = {refreshLayoutMetrics};
    component._native = rootNative({ff: "sans", fs: 16, lh: 1.5});
    component.bindDocumentTypographyProjection();

    component._native.props.ff = "serif";
    component.onPropsChange.emit(new Map([["ff", {}]]) as any);
    await Promise.resolve();

    expect(refreshLayoutMetrics).toHaveBeenCalledTimes(1);
    expect(component.hostElement.style.fontFamily).toContain("Songti SC");

    component._native.props.fs = 20;
    component.onPropsChange.emit(new Map([["fs", {}]]) as any);
    component._native.props.lh = 2;
    component.onPropsChange.emit(new Map([["lh", {}]]) as any);
    await Promise.resolve();

    expect(refreshLayoutMetrics).toHaveBeenCalledTimes(2);
    expect(component.hostElement.style.getPropertyValue("--bc-fs")).toBe("20px");
    expect(component.hostElement.style.getPropertyValue("--bc-lh")).toBe("2");

    component.onPropsChange.emit(new Map([["color", {}]]) as any);
    await Promise.resolve();
    expect(refreshLayoutMetrics).toHaveBeenCalledTimes(2);
    fixture.destroy();
  });
});

function rootNative(props: Record<string, unknown>) {
  return {
    id: "root",
    flavour: "root",
    nodeType: BlockNodeType.root,
    props,
    meta: {},
    children: [],
  } as any;
}
