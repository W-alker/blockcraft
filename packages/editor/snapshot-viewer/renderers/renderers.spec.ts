import {BlockNodeType, IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {DocLinkPreviewerService} from "../../framework/services/link-previewer.service";
import {createSnapshotRenderer} from "../create-snapshot-renderer";
import {createAllBlocksFixture} from "../testing/fixtures/all-blocks.fixture";

describe("snapshot-viewer renderers", () => {
  it("renders a callout prefix and nested paragraph children", () => {
    const host = renderFixture(createAllBlocksFixture().callout)
    expect(host.querySelector(".callout-block-prefix")?.textContent).toContain("📢")
    expect(host.querySelector(".paragraph-block")).not.toBeNull()
  })

  it("renders list-like text blocks with readonly prefixes", () => {
    const fixture = createAllBlocksFixture()
    const host = renderFixture([fixture.bullet, fixture.ordered, fixture.todo])

    expect(host.querySelector(".bullet-block-prefix .circle")).not.toBeNull()
    expect(host.querySelector(".ordered-block-prefix")?.textContent).toContain("2.")
    expect(host.querySelector(".todo-block.is-checked")).not.toBeNull()
  })

  it("renders heading paragraphs, blockquotes, and captions with editable containers", () => {
    const fixture = createAllBlocksFixture()
    const host = renderFixture([fixture.headingParagraph, fixture.blockquote, fixture.caption])

    expect(host.querySelector('.paragraph-block[data-heading="2"]')).not.toBeNull()
    expect(host.querySelector(".blockquote-block .edit-container")).not.toBeNull()
    expect(host.querySelector("figcaption.caption-block")).not.toBeNull()
  })

  it("renders divider and columns shells", () => {
    const fixture = createAllBlocksFixture()
    const host = renderFixture([fixture.divider, fixture.columns])

    expect(host.querySelector(".divider-block .divide-line.dashed")).not.toBeNull()
    expect(host.querySelector(".columns-block .columns-layout")).not.toBeNull()
    expect(host.querySelectorAll(".column-block .column-content").length).toBe(2)
  })

  it("renders frame indentation and code shell", () => {
    const fixture = createAllBlocksFixture()
    const host = renderFixture([fixture.frame, fixture.code])

    const frame = host.querySelector(".frame-block") as HTMLElement | null
    expect(frame?.style.marginLeft).toBe("4em")
    expect(host.querySelector(".code-block .code-block__head")).not.toBeNull()
    expect(host.querySelector(".code-block pre.edit-container")?.textContent).toContain("const x = 1;")
  })

  it("renders table shells with rows, cells, and nested paragraph content", () => {
    const host = renderFixture(createAllBlocksFixture().table)
    expect(host.querySelector(".table-block .table-wrapper table")).not.toBeNull()
    expect(host.querySelectorAll("tr.table-row-block").length).toBe(1)
    expect(host.querySelectorAll("td.table-cell-block").length).toBe(2)
    expect(host.querySelector(".table-cell__children-wrapper .paragraph-block")).not.toBeNull()
  })

  it("renders media shells for image, video, audio, and attachment", async () => {
    const fixture = createAllBlocksFixture()
    const host = renderFixture([fixture.image, fixture.video, fixture.audio, fixture.attachment], {
      resolveSvgIcon: async (name: string) => {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
        svg.setAttribute("data-icon-name", name)
        return svg
      },
    })
    await flushPromises()

    expect(host.querySelector(".image-block .img-wrapper img")).not.toBeNull()
    expect(host.querySelector(".video-block video")).not.toBeNull()
    expect(host.querySelector(".audio-block audio")).not.toBeNull()
    expect(host.querySelector(".attachment-block__name")?.textContent).toContain("Guide.pdf")
    expect(host.querySelector('.attachment-block__icon-wrapper mat-icon[data-mat-icon-type="svg"]')).not.toBeNull()
  })

  it("uses dedicated empty states for video/audio without playable resources", () => {
    const host = renderFixture([
      {
        id: "video-empty",
        flavour: "video",
        nodeType: BlockNodeType.void,
        meta: {},
        props: {
          url: "",
          sourceType: "link",
        },
        children: [],
      },
      {
        id: "audio-empty",
        flavour: "audio",
        nodeType: BlockNodeType.void,
        meta: {},
        props: {
          url: "",
          sourceType: "link",
        },
        children: [],
      },
    ])

    expect(host.querySelector('.bc-snapshot-empty-state--video')).not.toBeNull()
    expect(host.querySelector('.bc-snapshot-empty-state--audio')).not.toBeNull()
  })

  it("keeps bookmark shell visible when preview enhancement rejects", async () => {
    const host = renderFixture(createAllBlocksFixture().bookmark, {
      enhancers: {
        bookmark: {
          load: async () => {
            throw new Error("offline")
          },
        },
      },
    })
    await flushPromises()

    expect(host.querySelector(".bookmark-block")).not.toBeNull()
    expect(host.textContent).toContain("example.com")
  })

  it("uses the default bookmark preview fetcher when no custom enhancer is provided", async () => {
    const querySpy = spyOn(DocLinkPreviewerService.prototype, "query").and.resolveTo({
      title: "Angular",
      description: "Framework",
      icon: "https://cdn.example.com/icon.png",
      image: "https://cdn.example.com/banner.png",
    })

    const host = renderFixture(createAllBlocksFixture().bookmark)
    await flushPromises()

    expect(querySpy).toHaveBeenCalled()
    expect(host.textContent).toContain("Angular")
    expect(host.querySelector(".bookmark-icon img")?.getAttribute("src")).toBe("https://cdn.example.com/icon.png")
    expect(host.querySelector(".bookmark-banner img")?.getAttribute("src")).toBe("https://cdn.example.com/banner.png")
  })

  it("renders formula and mermaid shells and applies custom enhancements", async () => {
    const fixture = createAllBlocksFixture()
    const host = renderFixture([fixture.formula, fixture.mermaid], {
      enhancers: {
        formula: {
          render: async (latex: string) => `<span class="katex">${latex}</span>`,
        },
        mermaid: {
          render: async () => `<svg data-rendered="true"></svg>`,
        },
      },
    })
    await flushPromises()

    expect(host.querySelector(".formula-block .katex")).not.toBeNull()
    expect(host.querySelector('.mermaid-block .graph-con [data-rendered="true"]')).not.toBeNull()
  })

  it("applies async syntax highlighting to code and mermaid text blocks", async () => {
    const fixture = createAllBlocksFixture()
    const host = renderFixture([fixture.code, fixture.mermaid])
    await flushPromises()

    expect(host.querySelector('.code-block .edit-container c-element[style*="color"]')).not.toBeNull()
    expect(host.querySelector('.mermaid-textarea.edit-container, .mermaid-textarea .edit-container')).not.toBeNull()
    expect(host.querySelector('.mermaid-textarea .edit-container c-element[style*="color"]')).not.toBeNull()
  })

  it("mounts iframe-style embeds only when resource loading is enabled", async () => {
    const fixture = createAllBlocksFixture()
    const offHost = renderFixture([fixture.figmaEmbed, fixture.juejinEmbed], {resourcePolicy: "off"})
    expect(offHost.querySelector("iframe")).toBeNull()

    const eagerHost = renderFixture([fixture.figmaEmbed, fixture.juejinEmbed], {resourcePolicy: "eager"})
    await flushPromises()
    expect(eagerHost.querySelectorAll("iframe").length).toBe(2)
  })

  it("does not render video loading text for embed links", async () => {
    const host = renderFixture({
      id: "video-embed",
      flavour: "video",
      nodeType: BlockNodeType.void,
      meta: {},
      props: {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        sourceType: "link",
      },
      children: [],
    })

    await flushPromises()
    expect(host.textContent).not.toContain("加载中")
  })
})

function renderFixture(snapshot: IBlockSnapshot | IBlockSnapshot[], options = {}) {
  const host = document.createElement("div")
  const renderer = createSnapshotRenderer(options)
  renderer.render(host, snapshot)
  return host
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}
