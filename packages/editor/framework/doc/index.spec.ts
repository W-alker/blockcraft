import {BlockCraftDoc} from "./index";

describe("BlockCraftDoc path queries", () => {
  function block(id: string, parentId: string | null, childrenIds: string[] = []) {
    return {
      id,
      parentId,
      childrenIds,
    } as any;
  }

  function createDoc(blocks: Record<string, any>) {
    return {
      getBlockById: (id: string) => blocks[id],
      getBlockPath: (target: any) => {
        const result: string[] = [];
        let current = typeof target === "string" ? blocks[target] : target;
        while (current) {
          result.unshift(current.id);
          current = current.parentId ? blocks[current.parentId] : null;
        }
        return result;
      },
    };
  }

  function expectSegment(
    through: ReturnType<BlockCraftDoc["queryBlocksThroughPathDeeply"]>,
    parent: string,
    index: number,
    group: string[],
  ) {
    expect(through).toContain(jasmine.objectContaining({
      parent,
      index,
      length: group.length,
      group,
    }));
  }

  function expectSegmentsHaveConsistentLength(
    through: ReturnType<BlockCraftDoc["queryBlocksThroughPathDeeply"]>,
  ) {
    through.forEach(segment => {
      expect(segment.length).toBe(segment.group.length);
      expect(segment.length).toBeGreaterThanOrEqual(0);
    });
  }

  it("includes nested siblings on both endpoints and the middle ancestor group", () => {
    const root = block("root", null, ["columns-1"]);
    const columns = block("columns-1", "root", ["column-1", "column-2", "column-3"]);
    const column1 = block("column-1", "columns-1", ["start-p", "after-start-a", "after-start-b"]);
    const column2 = block("column-2", "columns-1", ["middle-p"]);
    const column3 = block("column-3", "columns-1", ["before-end-a", "before-end-b", "end-p"]);
    const startParagraph = block("start-p", "column-1");
    const afterStartA = block("after-start-a", "column-1");
    const afterStartB = block("after-start-b", "column-1");
    const middleParagraph = block("middle-p", "column-2");
    const beforeEndA = block("before-end-a", "column-3");
    const beforeEndB = block("before-end-b", "column-3");
    const endParagraph = block("end-p", "column-3");
    const blocks: Record<string, any> = {
      root,
      "columns-1": columns,
      "column-1": column1,
      "column-2": column2,
      "column-3": column3,
      "start-p": startParagraph,
      "after-start-a": afterStartA,
      "after-start-b": afterStartB,
      "middle-p": middleParagraph,
      "before-end-a": beforeEndA,
      "before-end-b": beforeEndB,
      "end-p": endParagraph,
    };
    const doc = createDoc(blocks);

    const through = BlockCraftDoc.prototype.queryBlocksThroughPathDeeply.call(
      doc,
      startParagraph,
      endParagraph,
    );

    expectSegmentsHaveConsistentLength(through);
    expectSegment(through, "column-1", 1, ["after-start-a", "after-start-b"]);
    expectSegment(through, "column-3", 0, ["before-end-a", "before-end-b"]);
    expectSegment(through, "columns-1", 1, ["column-2"]);
  });

  it("keeps adjacent endpoint paths as empty non-negative segments", () => {
    const root = block("root", null, ["columns-1"]);
    const columns = block("columns-1", "root", ["column-1", "column-2"]);
    const column1 = block("column-1", "columns-1", ["start-p"]);
    const column2 = block("column-2", "columns-1", ["end-p"]);
    const startParagraph = block("start-p", "column-1");
    const endParagraph = block("end-p", "column-2");
    const blocks: Record<string, any> = {
      root,
      "columns-1": columns,
      "column-1": column1,
      "column-2": column2,
      "start-p": startParagraph,
      "end-p": endParagraph,
    };
    const doc = createDoc(blocks);

    const through = BlockCraftDoc.prototype.queryBlocksThroughPathDeeply.call(
      doc,
      startParagraph,
      endParagraph,
    );

    expectSegmentsHaveConsistentLength(through);
    expectSegment(through, "columns-1", 1, []);
  });
});
