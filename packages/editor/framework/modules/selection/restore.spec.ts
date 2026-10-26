import {BlockNodeType} from "../../block-std";
import {
  focusBlockSelectionEdge,
  moveGapCaretAway,
  restoreSelectionAfterBlockDelete,
} from "./restore";

describe("selection restore helpers", () => {
  function makeDoc(blocks: Record<string, any> = {}) {
    return {
      isEditable: jasmine.createSpy("isEditable").and.callFake((block: any) => block?.nodeType === BlockNodeType.editable),
      getBlockById: jasmine.createSpy("getBlockById").and.callFake((id: string) => blocks[id]),
      prevSibling: jasmine.createSpy("prevSibling"),
      nextSibling: jasmine.createSpy("nextSibling"),
      selection: {
        replay: jasmine.createSpy("replay"),
        setGapCursor: jasmine.createSpy("setGapCursor"),
        selectBlock: jasmine.createSpy("selectBlock"),
        blur: jasmine.createSpy("blur"),
      },
    }
  }

  it("focuses editable block edges with a text cursor", () => {
    const block = {id: "p1", nodeType: BlockNodeType.editable, textLength: 5}
    const doc = makeDoc()

    const result = focusBlockSelectionEdge(doc as any, block as any, false)

    expect(result).toBeTrue()
    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: "p1", type: "text", offset: 5},
      head: {blockId: "p1", type: "text", offset: 5},
      commonParent: "p1",
    })
  })

  it("focuses non-editable block edges with a gap cursor", () => {
    const block = {id: "table-1", nodeType: BlockNodeType.block}
    const doc = makeDoc()

    const result = focusBlockSelectionEdge(doc as any, block as any, true)

    expect(result).toBeTrue()
    expect(doc.selection.setGapCursor).toHaveBeenCalledOnceWith(block, "before")
  })

  it("restores after deletion to the next block before the previous block", () => {
    const nextBlock = {id: "next-p", nodeType: BlockNodeType.editable, textLength: 3}
    const prevBlock = {id: "prev-p", nodeType: BlockNodeType.editable, textLength: 6}
    const doc = makeDoc()

    restoreSelectionAfterBlockDelete(doc as any, null, 0, prevBlock as any, nextBlock as any)

    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: "next-p", type: "text", offset: 0},
      head: {blockId: "next-p", type: "text", offset: 0},
      commonParent: "next-p",
    })
  })

  it("can restore after deletion to the previous block first", () => {
    const nextBlock = {id: "next-p", nodeType: BlockNodeType.editable, textLength: 3}
    const prevBlock = {id: "prev-table", nodeType: BlockNodeType.block}
    const doc = makeDoc()

    restoreSelectionAfterBlockDelete(doc as any, null, 0, prevBlock as any, nextBlock as any, "previous")

    expect(doc.selection.setGapCursor).toHaveBeenCalledOnceWith(prevBlock, "after")
    expect(doc.selection.replay).not.toHaveBeenCalled()
  })

  it("restores after deletion to a parent fallback child", () => {
    const fallback = {id: "fallback-p", nodeType: BlockNodeType.editable, textLength: 0}
    const parent = {
      id: "root",
      childrenLength: 1,
      childrenIds: [fallback.id],
    }
    const doc = makeDoc({[fallback.id]: fallback})

    restoreSelectionAfterBlockDelete(doc as any, parent as any, 2, null, null)

    expect(doc.getBlockById).toHaveBeenCalledOnceWith(fallback.id)
    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: fallback.id, type: "text", offset: 0},
      head: {blockId: fallback.id, type: "text", offset: 0},
      commonParent: fallback.id,
    })
  })

  it("skips the absolute placement plane and restores to the fallback paragraph", () => {
    const layout = {
      id: "placement-layout-1",
      flavour: "placement-layout",
      nodeType: BlockNodeType.block,
    }
    const fallback = {
      id: "fallback-p",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      textLength: 0,
    }
    const parent = {
      id: "root",
      childrenLength: 2,
      childrenIds: [fallback.id, layout.id],
    }
    const doc = makeDoc({[fallback.id]: fallback, [layout.id]: layout})

    restoreSelectionAfterBlockDelete(
      doc as any,
      parent as any,
      0,
      null,
      layout as any,
    )

    expect(doc.selection.setGapCursor).not.toHaveBeenCalled()
    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: fallback.id, type: "text", offset: 0},
      head: {blockId: fallback.id, type: "text", offset: 0},
      commonParent: fallback.id,
    })
  })

  it("moves an outer gap caret to the adjacent block edge without deleting anything", () => {
    const gapBlock = {id: "table-1", nodeType: BlockNodeType.block}
    const prevBlock = {id: "prev-p", nodeType: BlockNodeType.editable, textLength: 4}
    const doc = makeDoc()
    doc.prevSibling.and.returnValue(prevBlock)
    const selection = {
      collapsed: true,
      start: {type: "gap", side: "before", block: gapBlock},
    }

    const result = moveGapCaretAway(doc as any, selection as any, "before")

    expect(result).toBeTrue()
    expect(doc.prevSibling).toHaveBeenCalledOnceWith(gapBlock)
    expect(doc.selection.replay).toHaveBeenCalledWith({
      anchor: {blockId: prevBlock.id, type: "text", offset: prevBlock.textLength},
      head: {blockId: prevBlock.id, type: "text", offset: prevBlock.textLength},
      commonParent: prevBlock.id,
    })
  })
})
