import {
  createGenericBlockAdapterContribution,
  createInlineDirectiveAdapterContribution,
} from "../../adapters";
import {createBundledAdapterRegistry} from "../../editor/bundled-adapter-registry";
import {BlockNodeType, DeltaInsert, IBlockSnapshot} from "../../framework";
import {MarkdownStreamSnapshotParser} from "./stream-parser";

describe("MarkdownStreamSnapshotParser", () => {
  it("parses heading and paragraph source into block snapshots", async () => {
    const parser = new MarkdownStreamSnapshotParser()

    const result = await parser.parse({
      markdown: "# Hello\n\nWorld\n",
    })

    expect(result.blocks.length).toBe(2)
    expect(result.blocks[0]?.flavour).toBe("paragraph")
    expect(result.blocks[1]?.flavour).toBe("paragraph")
  })

  it("parses fenced code source into a code block snapshot", async () => {
    const parser = new MarkdownStreamSnapshotParser()

    const result = await parser.parse({
      markdown: "```ts\nconst x = 1;\n```\n",
    })

    expect(result.blocks.some((block) => block.flavour === "code")).toBeTrue()
  })

  it("parses Mermaid fenced source into a Mermaid block snapshot", async () => {
    const parser = new MarkdownStreamSnapshotParser()

    const result = await parser.parse({
      markdown: "```mermaid\ngraph TD\nA-->B\n```\n",
    })

    expect(result.blocks.some((block) => block.flavour === "mermaid")).toBeTrue()
  })

  it("lets the adapter turn an unclosed code fence into Mermaid", async () => {
    const parser = new MarkdownStreamSnapshotParser()
    const markdown = "```mermaid\ngraph TD\nA-->B"
    const result = await parser.parse({markdown})

    expect(result.blocks.length).toBe(1)
    expect(result.blocks[0]?.flavour).toBe("mermaid")
    expect((result.blocks[0]?.children[0] as IBlockSnapshot)?.flavour)
      .toBe("mermaid-textarea")
  })

  it("lets the Mermaid adapter handle its legacy mermiad language alias", async () => {
    const parser = new MarkdownStreamSnapshotParser()

    const result = await parser.parse({
      markdown: "```mermiad\ngraph TD\nA-->B\n```\n",
    })

    expect(result.blocks.length).toBe(1)
    expect(result.blocks[0]?.flavour).toBe("mermaid")
  })

  it("parses table source into a table block snapshot", async () => {
    const parser = new MarkdownStreamSnapshotParser()

    const result = await parser.parse({
      markdown: "| A | B |\n| --- | --- |\n| 1 | 2 |\n",
    })

    expect(result.blocks.some((block) => block.flavour === "table")).toBeTrue()
  })

  it("parses a custom BlockCraft directive with the supplied adapter registry", async () => {
    const contribution = createGenericBlockAdapterContribution({
      flavour: "stream-widget",
      nodeType: BlockNodeType.void,
    })
    const parser = new MarkdownStreamSnapshotParser({
      adapterRegistry: createBundledAdapterRegistry({
        additionalBlocks: [contribution],
      }),
      markdownProfile: "blockcraft",
    })

    const result = await parser.parse({
      markdown: "::bc-stream-widget\n",
    })

    expect(result.blocks.length).toBe(1)
    expect(result.blocks[0]?.flavour).toBe("stream-widget")
    expect(result.blocks[0]?.nodeType).toBe(BlockNodeType.void)
  })

  it("parses a custom Inline Embed with the supplied adapter registry", async () => {
    const contribution = createInlineDirectiveAdapterContribution({
      key: "stream-chip",
    })
    const parser = new MarkdownStreamSnapshotParser({
      adapterRegistry: createBundledAdapterRegistry({
        additionalInlineEmbeds: [contribution],
      }),
      markdownProfile: "blockcraft",
    })

    const result = await parser.parse({
      markdown: "Hello :bc-stream-chip[Chip]\n",
    })
    const paragraph = result.blocks[0]
    const delta = paragraph?.children as DeltaInsert[]

    expect(paragraph?.flavour).toBe("paragraph")
    expect(delta[1]?.insert).toEqual({"stream-chip": "Chip"})
  })

  it("recognizes a mention URN through the bundled Adapter registry", async () => {
    const parser = new MarkdownStreamSnapshotParser()
    const result = await parser.parse({
      markdown: "成员：[@张三](urn:blockcraft:mention:user:u-1 \"blockcraft:mention\")\n",
    })
    const paragraph = result.blocks[0]
    const delta = paragraph?.children as DeltaInsert[]

    expect(delta[1]?.insert).toEqual({mention: "张三"})
    expect(delta[1]?.attributes).toEqual(jasmine.objectContaining({
      mentionId: "u-1",
      mentionType: "user",
    }))
  })

  it("preserves blank lines inside one BlockCraft container directive", async () => {
    const parser = new MarkdownStreamSnapshotParser({
      markdownProfile: "blockcraft",
    })
    const markdown = [
      ":::bc-callout",
      "First paragraph",
      "",
      "Second paragraph",
      ":::",
    ].join("\n")
    const result = await parser.parse({markdown})
    const callout = result.blocks[0]

    expect(result.blocks.length).toBe(1)
    expect(callout?.flavour).toBe("callout")
    expect((callout?.children as IBlockSnapshot[])
      .map(child => child.flavour))
      .toEqual(["paragraph", "paragraph"])
  })

  it("uses the default hybrid adapter for custom Blocks with YAML metadata", async () => {
    const parser = new MarkdownStreamSnapshotParser()
    const markdown = [
      ":::bc-text-box",
      "",
      "---",
      "width: 360",
      "height: 180",
      "---",
      "",
      "Streamed text box",
      ":::",
    ].join("\n")

    const result = await parser.parse({markdown})
    const textBox = result.blocks[0]

    expect(textBox?.flavour).toBe("text-box")
    expect(textBox?.props).toEqual(jasmine.objectContaining({
      width: 360,
      height: 180,
    }))
    expect((textBox?.children as IBlockSnapshot[]).map(child => child.flavour))
      .toEqual(["paragraph"])
  })

  it("keeps nested column directives and their YAML scopes separate", async () => {
    const parser = new MarkdownStreamSnapshotParser()
    const markdown = [
      "::::bc-columns",
      "",
      "---",
      "gap: 24",
      "---",
      "",
      ":::bc-column",
      "",
      "---",
      "width: 0.4",
      "---",
      "",
      "左栏",
      "",
      ":::",
      "",
      ":::bc-column",
      "",
      "---",
      "width: 0.6",
      "---",
      "",
      "右栏",
      "",
      ":::",
      "",
      "::::",
    ].join("\n")

    const result = await parser.parse({markdown})
    const columns = result.blocks[0]
    const children = columns?.children as IBlockSnapshot[]

    expect(columns?.flavour).toBe("columns")
    expect(columns?.props["gap"]).toBe(24)
    expect(children.map(child => child.flavour)).toEqual(["column", "column"])
    expect(children.map(child => child.props["width"])).toEqual([0.4, 0.6])
  })

  it("parses tilde and long backtick fences through the same adapters", async () => {
    const parser = new MarkdownStreamSnapshotParser()
    const markdown = [
      "````ts",
      "const marker = '```';",
      "```",
      "````",
      "",
      "~~~mermaid",
      "graph TD",
      "A-->B",
      "~~~",
      "",
    ].join("\n")
    const parsed = await parser.parse({markdown})

    expect(parsed.blocks.map(block => block.flavour))
      .toEqual(["code", "mermaid"])
  })
})
