import {
  createGenericBlockAdapterContribution,
  MARKDOWN_ADAPTER_PROFILE_CONFIG,
  MarkdownAdapter,
} from "../../adapters";
import {createBundledAdapterRegistry} from "../../editor/bundled-adapter-registry";
import {
  BlockNodeType,
  DocAttachmentInfo,
  DocFileService,
  IBlockSnapshot,
} from "../../framework";
import {FetchUtils} from "../../global";
import {SnapshotRenderer} from "../types";
import {SnapshotViewerStreamEngine} from "./stream-engine";
import {MarkdownStreamSnapshotParser} from './stream-parser'

class MarkdownStreamSpecFileService extends DocFileService {
  uploadImg(): Promise<string> { return Promise.resolve("") }
  uploadVideo(): Promise<DocAttachmentInfo> {
    return Promise.resolve({name: "", type: "", url: "", size: 0})
  }
  uploadAttachment(): Promise<DocAttachmentInfo> {
    return Promise.resolve({name: "", type: "", url: "", size: 0})
  }
  previewAttachment(): void {}
  previewImg(): void {}
  createObjectURL(): string { return "" }
  getFileByObjectURL(): File | undefined { return undefined }
  getFilePreviewURLByObjectURL(): string { return "" }
  removeObjectURL(): void {}
  isLocalObjectURL(): boolean { return false }
  isOverMaxSize(): boolean { return false }
}

describe("SnapshotViewerStreamEngine", () => {
  it("renders an image loading frame on the first flush without ingesting it again on later chunks", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})
    const parser = (engine as unknown as {
      parser: MarkdownStreamSnapshotParser
    }).parser
    const adapter = (parser as unknown as {adapter: MarkdownAdapter}).adapter
    const src = "https://cdn.example.com/stream-cover.png"
    const fetchSpy = spyOn(FetchUtils, "fetchImage").and.callFake(async () => {
      throw new Error("stream adapter must not fetch imported images")
    })
    const uploadSpy = spyOn(adapter.fileService, "uploadImg")
      .and.resolveTo("unexpected-upload.png")

    engine.append(`![Cover](${src})\n\n`)
    await flushPromises()

    const imageBlock = host.querySelector<HTMLElement>(".bc-flavour-image")
    const frame = imageBlock?.querySelector<HTMLElement>(".img-wrapper")
    const image = frame?.querySelector<HTMLImageElement>("img")
    expect(imageBlock).not.toBeNull()
    expect(frame?.dataset["bcResourceState"]).toBe("loading")
    expect(image?.getAttribute("src")).toBe(src)

    engine.append("Following paragraph")
    await flushPromises()

    const imageBlockAfter = host.querySelector<HTMLElement>(".bc-flavour-image")
    const frameAfter = imageBlockAfter?.querySelector<HTMLElement>(".img-wrapper")
    const imageAfter = frameAfter?.querySelector<HTMLImageElement>("img")
    expect(imageBlockAfter).toBe(imageBlock)
    expect(frameAfter).toBe(frame)
    expect(imageAfter).toBe(image)
    expect(host.textContent).toContain("Following paragraph")
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(uploadSpy).not.toHaveBeenCalled()
    engine.destroy()
  })

  it("renders an incomplete paragraph immediately", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("Hello world")
    await flushPromises()

    expect(host.textContent).toContain("Hello world")
  })

  it("keeps previously rendered blocks when later chunks append", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("First paragraph\n\n")
    await flushPromises()
    engine.append("Second paragraph\n\n")
    await flushPromises()

    expect(host.textContent).toContain("First paragraph")
    expect(host.textContent).toContain("Second paragraph")
  })

  it("passes the complete accumulated source to one adapter parse per refresh", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})
    const parser = (engine as unknown as {
      parser: MarkdownStreamSnapshotParser
    }).parser
    const parseSpy = spyOn(parser, "parse").and.callThrough()

    engine.append("First paragraph\n\n")
    await flushPromises()
    engine.append("Second paragraph")
    await flushPromises()

    expect(parseSpy.calls.mostRecent().args[0].markdown)
      .toBe("First paragraph\n\nSecond paragraph")
    expect(parseSpy.calls.count()).toBe(2)
  })

  it("coalesces synchronous chunks into one full-source adapter parse", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})
    const parser = (engine as unknown as {
      parser: MarkdownStreamSnapshotParser
    }).parser
    const parseSpy = spyOn(parser, "parse").and.callThrough()

    engine.append("Alpha")
    engine.append(" Beta")
    engine.append(" Gamma")
    await flushPromises()

    expect(parseSpy).toHaveBeenCalledTimes(1)
    expect(parseSpy.calls.mostRecent().args[0].markdown)
      .toBe("Alpha Beta Gamma")
  })

  it("renders the code-block shell while an open code fence is still being typed", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("Intro\n\n```ts\nconst x = 1;\n")
    await flushPromises()
    expect(host.textContent).toContain("Intro")
    expect(host.textContent).toContain("const x = 1;")
    const codeEl = host.querySelector('.bc-flavour-code')
    expect(codeEl).not.toBeNull()

    engine.append("```\n")
    await flushPromises()
    expect(host.textContent).toContain("const x = 1;")
    const codeElAfter = host.querySelector('.bc-flavour-code')
    expect(codeElAfter).toBe(codeEl)
  })

  it("appends new body characters into the same incomplete code block element", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("```ts\nconst x = 1;\n")
    await flushPromises()
    const codeEl = host.querySelector('.bc-flavour-code')
    expect(codeEl).not.toBeNull()
    expect(host.textContent).toContain("const x = 1;")

    engine.append("const y = 2;\n")
    await flushPromises()
    const codeElAfter = host.querySelector('.bc-flavour-code')
    expect(codeElAfter).toBe(codeEl)
    expect(host.textContent).toContain("const y = 2;")
  })

  it("preserves the edit-container's existing child nodes when a code block body grows", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("```ts\nfoo\n")
    await flushPromises()
    const codeEl = host.querySelector('.bc-flavour-code') as HTMLElement
    expect(codeEl).not.toBeNull()
    const editContainer = codeEl.querySelector(".edit-container") as HTMLElement
    expect(editContainer).not.toBeNull()
    // Simulate an async post-render pass (e.g. shiki) mutating the edit-container's
    // children so they no longer map 1:1 to the delta. The append fast-path must
    // still cope with that.
    const sentinel = document.createElement("c-element")
    sentinel.textContent = "foo\n"
    editContainer.replaceChildren(sentinel)

    engine.append("bar\n")
    await flushPromises()
    const editContainerAfter = codeEl.querySelector(".edit-container") as HTMLElement
    expect(editContainerAfter).toBe(editContainer)
    expect(editContainerAfter.firstElementChild).toBe(sentinel)
    expect(editContainerAfter.textContent).toContain("foo")
    expect(editContainerAfter.textContent).toContain("bar")
  })

  it("preserves the inline text node identity when body grows character by character", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("Intro\n\nHello")
    await flushPromises()
    const paragraphsBefore = host.querySelectorAll('.bc-flavour-paragraph')
    const paraBefore = paragraphsBefore.item(paragraphsBefore.length - 1)
    expect(paraBefore).not.toBeNull()
    const textNodeBefore = findFirstText(paraBefore as HTMLElement)
    expect(textNodeBefore).not.toBeNull()
    expect(textNodeBefore!.data).toBe("Hello")

    engine.append(" world")
    await flushPromises()
    const paragraphsAfter = host.querySelectorAll('.bc-flavour-paragraph')
    const paraAfter = paragraphsAfter.item(paragraphsAfter.length - 1)
    const textNodeAfter = findFirstText(paraAfter as HTMLElement)
    expect(paraAfter).toBe(paraBefore)
    expect(textNodeAfter).toBe(textNodeBefore)
    expect(textNodeAfter!.data).toBe("Hello world")
  })

  it("keeps an incomplete code fence rendered as code when finish flushes", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("```ts\nconst x = 1;\n")
    await flushPromises()
    expect(host.textContent).toContain("const x = 1;")

    engine.finish()
    await flushPromises()
    expect(host.textContent).toContain("const x = 1;")
    expect(host.querySelector('.bc-flavour-code')).not.toBeNull()
  })

  it("moves a growing table from paragraph syntax to the adapter table flavour", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("Intro\n\n| Name | Value |")
    await flushPromises()
    expect(host.textContent).toContain("| Name | Value |")

    engine.append("\n| --- | --- |")
    await flushPromises()
    expect(host.textContent).toContain("Intro")
    expect(host.textContent).toContain("Name")
    expect(host.querySelector('.bc-flavour-table')).not.toBeNull()
  })

  it("renders an open Mermaid fence through the configured Markdown adapter", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("Intro\n\n```mermaid\ngraph TD")
    await flushPromises()
    expect(host.textContent).toContain("Intro")
    expect(host.textContent).toContain("graph TD")
    expect(host.querySelector('.bc-flavour-mermaid')).not.toBeNull()
  })

  it("preserves a closed fence block when subsequent chunks arrive", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("Intro\n\n```mermaid\ngraph TD\n  A-->B\n```\n")
    await flushPromises()
    const mermaidEl = host.querySelector('.bc-flavour-mermaid')
    expect(mermaidEl).not.toBeNull()

    engine.append("\n| Name |")
    await flushPromises()
    const mermaidElAfter = host.querySelector('.bc-flavour-mermaid')
    expect(mermaidElAfter).not.toBeNull()
    expect(mermaidElAfter).toBe(mermaidEl)
  })

  it("updates prior rendered content after replace()", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.replace("# Old\n\nBody\n\n")
    await flushPromises()
    const oldHeading = host.querySelector('.bc-flavour-paragraph')

    engine.replace("# New\n\nBody\n\n")
    await flushPromises()

    expect(host.textContent).toContain("New")
    expect(host.textContent).not.toContain("Old")
    expect(oldHeading).not.toBeNull()
  })

  it("reparses the preceding AST node when a blank line splits a paragraph", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.replace("Alpha\nBeta")
    await flushPromises()
    expect(host.querySelectorAll('.bc-flavour-paragraph').length).toBe(1)

    engine.replace("Alpha\n\nBeta")
    await flushPromises()

    const paragraphs = host.querySelectorAll('.bc-flavour-paragraph')
    expect(paragraphs.length).toBe(2)
    expect(paragraphs[0]?.textContent).toContain('Alpha')
    expect(paragraphs[1]?.textContent).toContain('Beta')
  })

  it("processes a chunk appended while an async adapter parse is in flight", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})
    const parser = (engine as unknown as {
      parser: MarkdownStreamSnapshotParser
    }).parser
    const originalParse = parser.parse.bind(parser)
    let releaseParse!: () => void
    let markStarted!: () => void
    const parseStarted = new Promise<void>(resolve => { markStarted = resolve })
    const parseGate = new Promise<void>(resolve => { releaseParse = resolve })
    let firstParse = true
    const parseSpy = spyOn(parser, 'parse').and.callFake(async input => {
      if (firstParse) {
        firstParse = false
        markStarted()
        await parseGate
      }
      return originalParse(input)
    })

    engine.append('Alpha')
    await parseStarted
    engine.append(' Beta')
    releaseParse()
    await flushPromises()

    expect(host.textContent).toContain('Alpha Beta')
    expect(parseSpy.calls.count()).toBeLessThan(5)
  })

  it("does not commit an in-flight adapter result after destroy", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})
    const parser = (engine as unknown as {
      parser: MarkdownStreamSnapshotParser
    }).parser
    const renderer = (engine as unknown as {renderer: SnapshotRenderer}).renderer
    const renderSpy = spyOn(renderer, "render").and.callThrough()
    const originalParse = parser.parse.bind(parser)
    let releaseParse!: () => void
    let markStarted!: () => void
    const parseStarted = new Promise<void>(resolve => { markStarted = resolve })
    const parseGate = new Promise<void>(resolve => { releaseParse = resolve })
    spyOn(parser, "parse").and.callFake(async input => {
      markStarted()
      await parseGate
      return originalParse(input)
    })

    engine.append("Alpha")
    await parseStarted
    engine.destroy()
    releaseParse()
    await flushPromises()

    expect(renderSpy).not.toHaveBeenCalled()
  })

  it("reports a failed adapter parse and recovers on the next input", async () => {
    const host = document.createElement("div")
    const onError = jasmine.createSpy("onError")
    const engine = new SnapshotViewerStreamEngine({container: host, onError})
    const parser = (engine as unknown as {
      parser: MarkdownStreamSnapshotParser
    }).parser
    const originalParse = parser.parse.bind(parser)
    let firstParse = true
    spyOn(parser, "parse").and.callFake(input => {
      if (firstParse) {
        firstParse = false
        return Promise.reject(new Error("custom adapter failed"))
      }
      return originalParse(input)
    })

    engine.append("Alpha")
    await flushPromises()
    expect(onError).toHaveBeenCalledOnceWith(jasmine.any(Error))

    engine.append(" Beta")
    await flushPromises()
    expect(host.textContent).toContain("Alpha Beta")
  })

  it("keeps a BlockCraft container with blank lines as one rendered block", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({
      container: host,
      markdownProfile: "blockcraft",
    })

    engine.append(":::bc-callout\nFirst paragraph\n")
    await flushPromises()
    engine.append("\nSecond paragraph\n:::\n")
    await flushPromises()

    const callouts = host.querySelectorAll('.bc-flavour-callout')
    expect(callouts.length).toBe(1)
    expect(callouts[0]?.querySelectorAll('.bc-flavour-paragraph').length).toBe(2)
    expect(callouts[0]?.textContent).toContain("First paragraph")
    expect(callouts[0]?.textContent).toContain("Second paragraph")
  })

  it("matches the full MarkdownAdapter flavour tree after finish", async () => {
    const host = document.createElement("div")
    const contribution = createGenericBlockAdapterContribution({
      flavour: "stream-widget",
      nodeType: BlockNodeType.void,
    })
    const registry = createBundledAdapterRegistry({
      additionalBlocks: [contribution],
    })
    const markdown = [
      "# Heading",
      "",
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
      ":::bc-callout",
      "First paragraph",
      "",
      "Second paragraph",
      ":::",
      "",
      "::bc-stream-widget",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
    ].join("\n")
    const adapter = new MarkdownAdapter(
      new MarkdownStreamSpecFileService(),
      new Map([[MARKDOWN_ADAPTER_PROFILE_CONFIG, "blockcraft"]]),
      registry,
    )
    const expected = await adapter.toBlockSnapshot(markdown)
    const streamParser = new MarkdownStreamSnapshotParser({
      adapterRegistry: registry,
      markdownProfile: "blockcraft",
    })
    const streamedBlocks = (await streamParser.parse({markdown})).blocks
    expect(normalizeSnapshots(streamedBlocks)).toEqual(
      normalizeSnapshots(expected.children as IBlockSnapshot[]),
    )
    const engine = new SnapshotViewerStreamEngine({
      container: host,
      adapterRegistry: registry,
      markdownProfile: "blockcraft",
    })
    const boundaries = [13, 37, 59, 91, 127, markdown.length]
    let start = 0
    for (const end of boundaries) {
      engine.append(markdown.slice(start, end))
      start = end
      await flushPromises()
    }
    engine.finish()
    await flushPromises()

    const root = host.querySelector<HTMLElement>('.bc-flavour-root')
    expect(root).not.toBeNull()
    expect(readDomFlavourTree(root!)).toEqual(
      readSnapshotFlavourTree(expected.children as IBlockSnapshot[]),
    )
  })

  it("forwards the custom registry and BlockCraft profile to streaming parses", async () => {
    const host = document.createElement("div")
    const contribution = createGenericBlockAdapterContribution({
      flavour: "stream-widget",
      nodeType: BlockNodeType.void,
    })
    const engine = new SnapshotViewerStreamEngine({
      container: host,
      adapterRegistry: createBundledAdapterRegistry({
        additionalBlocks: [contribution],
      }),
      markdownProfile: "blockcraft",
    })

    engine.append("::bc-stream-widget\n")
    await flushPromises()

    expect(host.querySelector(".bc-flavour-stream-widget")).not.toBeNull()
  })
})

async function flushPromises() {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function findFirstText(root: Node | null): Text | null {
  if (!root) return null
  if (root.nodeType === Node.TEXT_NODE) return root as Text
  for (let i = 0; i < root.childNodes.length; i += 1) {
    const found = findFirstText(root.childNodes[i]!)
    if (found) return found
  }
  return null
}

function readSnapshotFlavourTree(blocks: readonly IBlockSnapshot[]): string[] {
  return blocks.flatMap(block => [
    block.flavour,
    ...(block.nodeType === BlockNodeType.block || block.nodeType === BlockNodeType.root
      ? readSnapshotFlavourTree(block.children as IBlockSnapshot[])
      : []),
  ])
}

function readDomFlavourTree(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-block-id]'))
    .map(element => Array.from(element.classList)
      .find(className => className.startsWith('bc-flavour-'))
      ?.slice('bc-flavour-'.length))
    .filter((flavour): flavour is string => Boolean(flavour))
}

function normalizeSnapshots(
  snapshots: readonly IBlockSnapshot[],
): unknown[] {
  return snapshots.map(snapshot => ({
    flavour: snapshot.flavour,
    nodeType: snapshot.nodeType,
    props: snapshot.props,
    children: snapshot.nodeType === BlockNodeType.block ||
      snapshot.nodeType === BlockNodeType.root
      ? normalizeSnapshots(snapshot.children as IBlockSnapshot[])
      : snapshot.children,
  }))
}
