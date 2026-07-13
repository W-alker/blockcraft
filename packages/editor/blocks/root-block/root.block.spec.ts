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
});
