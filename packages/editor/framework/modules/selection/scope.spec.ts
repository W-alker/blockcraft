import {BlockNodeType, BlockSelectionScopeMetadata} from "../../block-std";
import {ISelectionPoint} from "./types";
import {
  getSelectionScopePolicy,
  resolveCommonSelectionScope,
  resolveSelectionContainerId,
  resolveSelectionScopeForBlockId,
  resolveSelectionScopePolicyForBlockId,
  resolveSelectionScope,
} from "./scope";
import {SelectionManager} from "./index";
import {Subject} from "rxjs";

describe("Selection scope", () => {
  const DEFAULT_SCOPE_BY_FLAVOUR: Record<string, BlockSelectionScopeMetadata> = {
    root: "document",
    table: "table",
    columns: "columns",
    callout: "container",
    mermaid: "transparent",
    "mermaid-textarea": "transparent",
  }

  function schemaDoc(selectionScope: BlockSelectionScopeMetadata | null | undefined) {
    return {
      schemas: {
        get: () => ({
          metadata: {
            selectionScope,
          },
        }),
      },
    }
  }

  function block(
    id: string,
    flavour: string,
    nodeType: BlockNodeType,
    parent?: any,
    selectionScope: BlockSelectionScopeMetadata | null | undefined = DEFAULT_SCOPE_BY_FLAVOUR[flavour],
  ) {
    const hostElement = document.createElement(nodeType === BlockNodeType.editable ? "p" : "div")
    hostElement.setAttribute("data-block-id", id)
    hostElement.setAttribute("data-node-type", nodeType)
    return {
      id,
      flavour,
      nodeType,
      hostElement,
      parentId: parent?.id ?? null,
      parentBlock: parent ?? null,
      doc: schemaDoc(selectionScope),
    } as any
  }

  function getBlockFactory(blocks: Record<string, any>) {
    return (id: string) => {
      const value = blocks[id]
      if (!value) throw new Error(`missing block: ${id}`)
      return value
    }
  }

  function text(block: any, offset = 0): ISelectionPoint {
    return {blockId: block.id, type: "text", offset, block} as any
  }

  function selected(block: any): ISelectionPoint {
    return {blockId: block.id, type: "selected", block} as any
  }

  function gap(block: any): ISelectionPoint {
    return {blockId: block.id, type: "gap", side: "after", block} as any
  }

  function boundary(block: any, index = 0): ISelectionPoint {
    return {blockId: block.id, type: "boundary", index, block} as any
  }

  function appendEditable(host: HTMLElement, textContent: string): Text {
    const textNode = document.createTextNode(textContent)
    host.appendChild(textNode)
    return textNode
  }

  function createSelectionManager(root: any, blocks: Record<string, any>) {
    const doc = {
      root,
      event: {add() {}, bindHotkey() {}},
      afterInit() {},
      onDestroy$: new Subject<void>(),
      getBlockById: getBlockFactory(blocks),
      compareBlockPosition: (a: string, b: string) =>
        blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy("warn")},
    }
    return new SelectionManager(doc as any)
  }

  function setNativeRange(start: Text, end: Text): Range {
    const range = document.createRange()
    range.setStart(start, 0)
    range.setEnd(end, end.length)
    const nativeSelection = document.getSelection()!
    nativeSelection.removeAllRanges()
    nativeSelection.addRange(range)
    return range
  }

  afterEach(() => {
    document.getSelection()?.removeAllRanges()
    document.querySelectorAll("[data-selection-scope-test]").forEach(el => el.remove())
  })

  it("treats whole-block selected and gap points as belonging to the parent scope", () => {
    const root = block("root", "root", BlockNodeType.root)
    const callout = block("callout-1", "callout", BlockNodeType.block, root)
    const getBlock = getBlockFactory({root, "callout-1": callout})

    expect(resolveSelectionScope(selected(callout), getBlock)).toEqual({
      kind: "document",
      blockId: "root",
    })
    expect(resolveSelectionScope(gap(callout), getBlock)).toEqual({
      kind: "document",
      blockId: "root",
    })
    expect(resolveSelectionContainerId(selected(callout))).toBe("root")
  })

  it("keeps callout content inside the callout scope", () => {
    const root = block("root", "root", BlockNodeType.root)
    const callout = block("callout-1", "callout", BlockNodeType.block, root)
    const p1 = block("p1", "paragraph", BlockNodeType.editable, callout)
    const p2 = block("p2", "paragraph", BlockNodeType.editable, root)
    const getBlock = getBlockFactory({root, "callout-1": callout, p1, p2})

    expect(resolveSelectionScope(text(p1), getBlock)).toEqual({
      kind: "container",
      blockId: "callout-1",
    })
    expect(resolveSelectionScope(boundary(callout), getBlock)).toEqual({
      kind: "container",
      blockId: "callout-1",
    })
    expect(resolveCommonSelectionScope(text(p1), text(p2), getBlock)).toBeNull()
  })

  it("groups table descendants and table-cell model points under the table scope", () => {
    const root = block("root", "root", BlockNodeType.root)
    const table = block("table-1", "table", BlockNodeType.block, root)
    const row = block("row-1", "table-row", BlockNodeType.block, table)
    const cell = block("cell-1", "table-cell", BlockNodeType.block, row)
    const p = block("p1", "paragraph", BlockNodeType.editable, cell)
    const getBlock = getBlockFactory({root, "table-1": table, "row-1": row, "cell-1": cell, p1: p})

    expect(resolveSelectionScope(text(p), getBlock)).toEqual({
      kind: "table",
      blockId: "table-1",
    })
    expect(resolveSelectionScope({blockId: "cell-1", type: "table-cell", tableId: "table-1", block: cell} as any, getBlock)).toEqual({
      kind: "table",
      blockId: "table-1",
    })
    expect(resolveSelectionScope(selected(table), getBlock)).toEqual({
      kind: "document",
      blockId: "root",
    })
  })

  it("groups column descendants under the columns scope without making the columns block selected point internal", () => {
    const root = block("root", "root", BlockNodeType.root)
    const columns = block("columns-1", "columns", BlockNodeType.block, root)
    const column1 = block("column-1", "column", BlockNodeType.block, columns)
    const column2 = block("column-2", "column", BlockNodeType.block, columns)
    const p1 = block("p1", "paragraph", BlockNodeType.editable, column1)
    const p2 = block("p2", "paragraph", BlockNodeType.editable, column2)
    const getBlock = getBlockFactory({root, "columns-1": columns, "column-1": column1, "column-2": column2, p1, p2})

    expect(resolveCommonSelectionScope(text(p1), text(p2), getBlock)).toEqual({
      kind: "columns",
      blockId: "columns-1",
    })
    expect(resolveSelectionScope(boundary(column1), getBlock)).toEqual({
      kind: "columns",
      blockId: "columns-1",
    })
    expect(resolveSelectionScope(selected(columns), getBlock)).toEqual({
      kind: "document",
      blockId: "root",
    })
  })

  it("resolves operation policy from the nearest configured scope", () => {
    const root = block("root", "root", BlockNodeType.root)
    const columns = block("columns-1", "columns", BlockNodeType.block, root)
    const column = block("column-1", "column", BlockNodeType.block, columns)
    const table = block("table-1", "table", BlockNodeType.block, root)
    const row = block("row-1", "table-row", BlockNodeType.block, table)
    const getBlock = getBlockFactory({root, "columns-1": columns, "column-1": column, "table-1": table, "row-1": row})

    expect(resolveSelectionScopeForBlockId("column-1", getBlock)).toEqual({
      kind: "columns",
      blockId: "columns-1",
    })
    expect(resolveSelectionScopePolicyForBlockId("column-1", getBlock)).toEqual({
      kind: "columns",
      useModelForTextBeforeInput: true,
      textRangeTailMode: "preserve",
      coveredBlockClassMode: "text-endpoints",
    })
    expect(resolveSelectionScopeForBlockId("row-1", getBlock)).toEqual({
      kind: "table",
      blockId: "table-1",
    })
    expect(resolveSelectionScopePolicyForBlockId("row-1", getBlock)?.coveredBlockClassMode)
      .toBe("text-endpoints")
    expect(getSelectionScopePolicy(resolveSelectionScopeForBlockId("root", getBlock))).toEqual({
      kind: "document",
      useModelForTextBeforeInput: false,
      textRangeTailMode: "merge",
      coveredBlockClassMode: "query",
    })
  })

  it("leaves mermaid-textarea transparent so it can share the document scope", () => {
    const root = block("root", "root", BlockNodeType.root)
    const mermaid = block("mermaid-1", "mermaid", BlockNodeType.block, root)
    const textarea = block("textarea-1", "mermaid-textarea", BlockNodeType.editable, mermaid)
    const p = block("p1", "paragraph", BlockNodeType.editable, root)
    const getBlock = getBlockFactory({root, "mermaid-1": mermaid, "textarea-1": textarea, p1: p})

    expect(resolveSelectionScope(text(textarea), getBlock)).toEqual({
      kind: "document",
      blockId: "root",
    })
    expect(resolveCommonSelectionScope(text(textarea), text(p), getBlock)).toEqual({
      kind: "document",
      blockId: "root",
    })
  })

  it("uses schema selectionScope metadata for custom scopes", () => {
    const root = block("root", "root", BlockNodeType.root)
    const panel = block("panel-1", "custom-panel", BlockNodeType.block, root, "container")
    const slot = block("slot-1", "custom-slot", BlockNodeType.block, panel, "transparent")
    const p = block("p1", "paragraph", BlockNodeType.editable, slot)
    const getBlock = getBlockFactory({root, "panel-1": panel, "slot-1": slot, p1: p})

    expect(resolveSelectionScope(text(p), getBlock)).toEqual({
      kind: "container",
      blockId: "panel-1",
    })
  })

  it("allows recalculate across different columns in the same columns scope", () => {
    const root = block("root", "root", BlockNodeType.root)
    root.hostElement.setAttribute("contenteditable", "true")
    root.hostElement.setAttribute("data-selection-scope-test", "true")
    const columns = block("columns-1", "columns", BlockNodeType.block, root)
    const column1 = block("column-1", "column", BlockNodeType.block, columns)
    const column2 = block("column-2", "column", BlockNodeType.block, columns)
    const p1 = block("p1", "paragraph", BlockNodeType.editable, column1)
    const p2 = block("p2", "paragraph", BlockNodeType.editable, column2)
    const p1Text = appendEditable(p1.hostElement, "one")
    const p2Text = appendEditable(p2.hostElement, "two")
    column1.hostElement.appendChild(p1.hostElement)
    column2.hostElement.appendChild(p2.hostElement)
    columns.hostElement.append(column1.hostElement, column2.hostElement)
    root.hostElement.appendChild(columns.hostElement)
    document.body.appendChild(root.hostElement)
    const blocks = {root, "columns-1": columns, "column-1": column1, "column-2": column2, p1, p2}
    const manager = createSelectionManager(root, blocks)
    setNativeRange(p1Text, p2Text)
    spyOn<any>(manager, "_normalizeRange").and.returnValue({start: text(p1), end: text(p2)})

    const result = manager.recalculate()

    expect(result.value).not.toBeNull()
    expect(result.value?.commonParent).toBe("columns-1")
  })

  it("rejects recalculate from callout content to root content when the scope cannot be projected", () => {
    const root = block("root", "root", BlockNodeType.root)
    root.hostElement.setAttribute("contenteditable", "true")
    root.hostElement.setAttribute("data-selection-scope-test", "true")
    const callout = block("callout-1", "callout", BlockNodeType.block, root)
    const p1 = block("p1", "paragraph", BlockNodeType.editable, callout)
    const p2 = block("p2", "paragraph", BlockNodeType.editable, root)
    const p1Text = appendEditable(p1.hostElement, "one")
    const p2Text = appendEditable(p2.hostElement, "two")
    callout.hostElement.appendChild(p1.hostElement)
    root.hostElement.append(callout.hostElement, p2.hostElement)
    document.body.appendChild(root.hostElement)
    const blocks = {root, "callout-1": callout, p1, p2}
    const manager = createSelectionManager(root, blocks)
    const range = setNativeRange(p1Text, p2Text)
    spyOn<any>(manager, "_normalizeRange").and.returnValue({start: text(p1), end: text(p2)})

    const result = manager.recalculate()

    expect(result.value).toBeNull()
    expect(manager.value).toBeNull()
    expect(range.collapsed).toBeTrue()
  })

  it("projects a closed container end endpoint to its parent boundary", () => {
    const root = block("root", "root", BlockNodeType.root)
    root.hostElement.setAttribute("contenteditable", "true")
    root.hostElement.setAttribute("data-selection-scope-test", "true")
    const p0 = block("p0", "paragraph", BlockNodeType.editable, root)
    const callout = block("callout-1", "callout", BlockNodeType.block, root)
    const p1 = block("p1", "paragraph", BlockNodeType.editable, callout)
    const p0Text = appendEditable(p0.hostElement, "before")
    const p1Text = appendEditable(p1.hostElement, "inside")
    root.childrenIds = ["p0", "callout-1"]
    root.childrenLength = 2
    callout.childrenIds = ["p1"]
    callout.childrenLength = 1
    p0.getIndexOfParent = () => 0
    callout.getIndexOfParent = () => 1
    p1.getIndexOfParent = () => 0
    callout.hostElement.appendChild(p1.hostElement)
    root.hostElement.append(p0.hostElement, callout.hostElement)
    document.body.appendChild(root.hostElement)
    const blocks = {root, p0, "callout-1": callout, p1}
    const manager = createSelectionManager(root, blocks)
    setNativeRange(p0Text, p1Text)
    spyOn<any>(manager, "_normalizeRange").and.returnValue({
      start: text(p0, 2),
      end: text(p1, 3),
    })

    const result = manager.recalculate(false)

    expect(result.value?.toJSON()).toEqual({
      anchor: {blockId: "p0", type: "text", offset: 2},
      head: {blockId: "root", type: "boundary", index: 2},
      commonParent: "root",
    })
  })

  it("projects a closed container start endpoint to its parent boundary", () => {
    const root = block("root", "root", BlockNodeType.root)
    root.hostElement.setAttribute("contenteditable", "true")
    root.hostElement.setAttribute("data-selection-scope-test", "true")
    const callout = block("callout-1", "callout", BlockNodeType.block, root)
    const p1 = block("p1", "paragraph", BlockNodeType.editable, callout)
    const p2 = block("p2", "paragraph", BlockNodeType.editable, root)
    const p1Text = appendEditable(p1.hostElement, "inside")
    const p2Text = appendEditable(p2.hostElement, "after")
    root.childrenIds = ["callout-1", "p2"]
    root.childrenLength = 2
    callout.childrenIds = ["p1"]
    callout.childrenLength = 1
    callout.getIndexOfParent = () => 0
    p1.getIndexOfParent = () => 0
    p2.getIndexOfParent = () => 1
    callout.hostElement.appendChild(p1.hostElement)
    root.hostElement.append(callout.hostElement, p2.hostElement)
    document.body.appendChild(root.hostElement)
    const blocks = {root, "callout-1": callout, p1, p2}
    const manager = createSelectionManager(root, blocks)
    setNativeRange(p1Text, p2Text)
    spyOn<any>(manager, "_normalizeRange").and.returnValue({
      start: text(p1, 2),
      end: text(p2, 3),
    })

    const result = manager.recalculate(false)

    expect(result.value?.toJSON()).toEqual({
      anchor: {blockId: "root", type: "boundary", index: 0},
      head: {blockId: "p2", type: "text", offset: 3},
      commonParent: "root",
    })
  })

  it("allows recalculate from mermaid textarea content to root content", () => {
    const root = block("root", "root", BlockNodeType.root)
    root.hostElement.setAttribute("contenteditable", "true")
    root.hostElement.setAttribute("data-selection-scope-test", "true")
    const mermaid = block("mermaid-1", "mermaid", BlockNodeType.block, root)
    const textarea = block("textarea-1", "mermaid-textarea", BlockNodeType.editable, mermaid)
    const p = block("p1", "paragraph", BlockNodeType.editable, root)
    const textareaText = appendEditable(textarea.hostElement, "graph TD")
    const pText = appendEditable(p.hostElement, "after")
    mermaid.hostElement.appendChild(textarea.hostElement)
    root.hostElement.append(mermaid.hostElement, p.hostElement)
    document.body.appendChild(root.hostElement)
    const blocks = {root, "mermaid-1": mermaid, "textarea-1": textarea, p1: p}
    const manager = createSelectionManager(root, blocks)
    setNativeRange(textareaText, pText)
    spyOn<any>(manager, "_normalizeRange").and.returnValue({start: text(textarea), end: text(p)})

    const result = manager.recalculate()

    expect(result.value).not.toBeNull()
    expect(result.value?.commonParent).toBe("root")
  })

  it("repairs a document-to-callout drag endpoint to the callout parent boundary", () => {
    const root = block("root", "root", BlockNodeType.root)
    root.hostElement.setAttribute("contenteditable", "true")
    root.hostElement.setAttribute("data-selection-scope-test", "true")
    const p0 = block("p0", "paragraph", BlockNodeType.editable, root)
    const callout = block("callout-1", "callout", BlockNodeType.block, root)
    const calloutText = block("callout-p", "paragraph", BlockNodeType.editable, callout)
    root.childrenIds = ["p0", "callout-1"]
    root.childrenLength = 2
    callout.childrenIds = ["callout-p"]
    callout.childrenLength = 1
    callout.getIndexOfParent = () => 1
    p0.getIndexOfParent = () => 0
    calloutText.getIndexOfParent = () => 0
    const p0Text = appendEditable(p0.hostElement, "before")
    const calloutDomText = appendEditable(calloutText.hostElement, "inside")
    callout.hostElement.appendChild(calloutText.hostElement)
    root.hostElement.append(p0.hostElement, callout.hostElement)
    document.body.appendChild(root.hostElement)
    const blocks = {root, p0, "callout-1": callout, "callout-p": calloutText}
    const manager = createSelectionManager(root, blocks)
    setNativeRange(p0Text, calloutDomText)
    spyOn<any>(manager, "_normalizeRange").and.returnValue({start: text(p0, 2), end: text(calloutText, 3)})

    const result = manager.recalculate()

    expect(result.value).not.toBeNull()
    expect(result.value?.commonParent).toBe("root")
    expect(result.value?.start.type).toBe("text")
    expect(result.value?.end.type).toBe("boundary")
    if (result.value?.end.type === "boundary") {
      expect(result.value.end.blockId).toBe("root")
      expect(result.value.end.index).toBe(2)
    }
  })

  it("repairs a columns-to-document drag endpoint to the columns parent boundary", () => {
    const root = block("root", "root", BlockNodeType.root)
    root.hostElement.setAttribute("contenteditable", "true")
    root.hostElement.setAttribute("data-selection-scope-test", "true")
    const columns = block("columns-1", "columns", BlockNodeType.block, root)
    const column = block("column-1", "column", BlockNodeType.block, columns)
    const columnText = block("column-p", "paragraph", BlockNodeType.editable, column)
    const p1 = block("p1", "paragraph", BlockNodeType.editable, root)
    root.childrenIds = ["columns-1", "p1"]
    root.childrenLength = 2
    columns.childrenIds = ["column-1"]
    columns.childrenLength = 1
    column.childrenIds = ["column-p"]
    column.childrenLength = 1
    columns.getIndexOfParent = () => 0
    column.getIndexOfParent = () => 0
    columnText.getIndexOfParent = () => 0
    p1.getIndexOfParent = () => 1
    const columnDomText = appendEditable(columnText.hostElement, "inside")
    const p1Text = appendEditable(p1.hostElement, "after")
    column.hostElement.appendChild(columnText.hostElement)
    columns.hostElement.appendChild(column.hostElement)
    root.hostElement.append(columns.hostElement, p1.hostElement)
    document.body.appendChild(root.hostElement)
    const blocks = {root, "columns-1": columns, "column-1": column, "column-p": columnText, p1}
    const manager = createSelectionManager(root, blocks)
    setNativeRange(columnDomText, p1Text)
    spyOn<any>(manager, "_normalizeRange").and.returnValue({start: text(columnText, 2), end: text(p1, 3)})

    const result = manager.recalculate()

    expect(result.value).not.toBeNull()
    expect(result.value?.commonParent).toBe("root")
    expect(result.value?.start.type).toBe("boundary")
    expect(result.value?.end.type).toBe("text")
    if (result.value?.start.type === "boundary") {
      expect(result.value.start.blockId).toBe("root")
      expect(result.value.start.index).toBe(0)
    }
  })
})
