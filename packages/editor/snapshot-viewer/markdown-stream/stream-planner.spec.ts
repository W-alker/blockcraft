import {markdownStreamFixtures} from "../testing/fixtures/markdown-stream.fixture";
import {planMarkdownStream} from "./stream-planner";

describe("planMarkdownStream", () => {
  it("marks an open paragraph tail as provisional before a blank-line boundary", () => {
    const result = planMarkdownStream(markdownStreamFixtures.paragraphProvisional);

    expect(result.provisionalRanges.length).toBe(1);
    expect(result.provisionalRanges[0]?.kind).toBe("paragraph");
    expect(result.readyRanges).toEqual([]);
    expect(result.pendingRanges).toEqual([]);
  });

  it("marks a paragraph ready after a blank-line boundary", () => {
    const result = planMarkdownStream(markdownStreamFixtures.paragraphStable);

    expect(result.readyRanges.length).toBe(1);
    expect(result.readyRanges[0]?.kind).toBe("paragraph");
    expect(result.provisionalRanges).toEqual([]);
    expect(result.pendingRanges).toEqual([]);
  });

  it("keeps a fenced code block pending until the closing fence arrives", () => {
    const result = planMarkdownStream(markdownStreamFixtures.fencedCodePending);

    expect(result.provisionalRanges.length).toBe(1);
    expect(result.provisionalRanges[0]?.kind).toBe("raw-text");
    expect(result.readyRanges).toEqual([]);
    expect(result.pendingRanges).toEqual([]);
  });

  it("keeps a mermaid fenced block pending until the closing fence arrives", () => {
    const result = planMarkdownStream(markdownStreamFixtures.mermaidPending);

    expect(result.pendingRanges.length).toBe(1);
    expect(result.pendingRanges[0]?.kind).toBe("mermaid");
    expect(result.readyRanges).toEqual([]);
  });

  it("keeps a table pending until the table boundary is stable", () => {
    const result = planMarkdownStream(markdownStreamFixtures.tablePending);

    expect(result.pendingRanges.length).toBe(1);
    expect(result.pendingRanges[0]?.kind).toBe("table");
    expect(result.readyRanges).toEqual([]);
  });

  it("backtracks to the start of the table block when finalizing a trailing table", () => {
    const result = planMarkdownStream(markdownStreamFixtures.tableFinalizeWithPrefix);

    expect(result.reparseStart).toBe("Intro\n\n".length);
    expect(result.readyRanges.some((range) => range.kind === "table")).toBeTrue();
  });

  it("computes a conservative reparse start when prior text is rewritten", () => {
    const result = planMarkdownStream(markdownStreamFixtures.rewriteWindow);

    expect(result.changedOffset).toBeGreaterThan(0);
    expect(result.reparseStart).toBe(0);
    expect(result.readyRanges[0]?.kind).toBe("heading");
  });
});
