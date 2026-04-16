import {MarkdownToSnapshotWindowParser} from "./window-parser";

describe("MarkdownToSnapshotWindowParser", () => {
  it("parses a heading and paragraph window into block snapshots", async () => {
    const parser = new MarkdownToSnapshotWindowParser()

    const result = await parser.parse({
      markdown: "# Hello\n\nWorld\n",
    })

    expect(result.blocks.length).toBe(2)
    expect(result.blocks[0]?.flavour).toBe("paragraph")
    expect(result.blocks[1]?.flavour).toBe("paragraph")
  })

  it("parses a fenced code window into a code block snapshot", async () => {
    const parser = new MarkdownToSnapshotWindowParser()

    const result = await parser.parse({
      markdown: "```ts\nconst x = 1;\n```\n",
    })

    expect(result.blocks.some((block) => block.flavour === "code")).toBeTrue()
  })

  it("parses a mermaid fenced window into a mermaid block snapshot", async () => {
    const parser = new MarkdownToSnapshotWindowParser()

    const result = await parser.parse({
      markdown: "```mermaid\ngraph TD\nA-->B\n```\n",
    })

    expect(result.blocks.some((block) => block.flavour === "mermaid")).toBeTrue()
  })

  it("parses a stable table window into a table block snapshot", async () => {
    const parser = new MarkdownToSnapshotWindowParser()

    const result = await parser.parse({
      markdown: "| A | B |\n| --- | --- |\n| 1 | 2 |\n",
    })

    expect(result.blocks.some((block) => block.flavour === "table")).toBeTrue()
  })
})
