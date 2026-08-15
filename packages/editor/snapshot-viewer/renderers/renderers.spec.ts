import {BlockNodeType, IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {shikiService} from "../../blocks/code-block/shiki-config";
import {createSnapshotRenderer} from "../create-snapshot-renderer";
import {createAllBlocksFixture} from "../testing/fixtures/all-blocks.fixture";
import {WordArtBlockSchema} from "../../blocks";

describe("snapshot-viewer renderers", () => {
  it("renders a callout prefix and nested paragraph children", () => {
    const host = renderFixture(createAllBlocksFixture().callout)
    const callout = host.querySelector<HTMLElement>(".callout-block")!
    expect(callout.querySelector(".callout-block-prefix")?.textContent).toContain("📢")
    expect(host.querySelector(".paragraph-block")).not.toBeNull()
    expect(callout.style.getPropertyValue("--bc-callout-background-color"))
      .toBe("#FFE6CD")
    expect(callout.style.backgroundColor).toBe("")
  })

  it("renders list-like text blocks with readonly prefixes", () => {
    const fixture = createAllBlocksFixture()
    const host = renderFixture([fixture.bullet, fixture.ordered, fixture.todo])

    expect(host.querySelector(".bullet-block-prefix .circle")).not.toBeNull()
    expect(host.querySelector(".ordered-block-prefix")?.textContent).toContain("3.")
    expect(host.querySelector(".todo-block.is-checked")).not.toBeNull()
  })

  it("renders heading paragraphs, blockquotes, and captions with editable containers", () => {
    const fixture = createAllBlocksFixture()
    const host = renderFixture([fixture.headingParagraph, fixture.blockquote, fixture.caption])

    expect(host.querySelector('.paragraph-block[data-heading="2"]')).not.toBeNull()
    expect(host.querySelector(".blockquote-block .edit-container")).not.toBeNull()
    expect(host.querySelector("figcaption.caption-block")).not.toBeNull()
  })

  it("renders editable word art with CSS-owned presentation data", () => {
    const wordArt = WordArtBlockSchema.createSnapshot("新品发布", {
      width: 360,
      height: 110,
      rotation: 15,
      fontSize: 54,
      fillType: "linear-gradient",
      gradientColors: ["#00FFFF", "#0000FF"],
      gradientStops: [0, 1],
      outlineColor: "#111111",
      outlineWidthEm: 0.05,
      effect: "slant-right",
    })
    const host = renderFixture(wordArt)
    const surface = host.querySelector(
      ".word-art-block__surface",
    ) as HTMLElement
    const content = surface.querySelector(
      ".word-art-block__editor",
    ) as HTMLElement

    expect(surface.style.width).toBe("360px")
    expect(surface.style.transform).toBe("rotate(15deg)")
    expect(content.textContent).toBe("新品发布")
    expect(content.style.fontSize).toBe("54px")
    expect(content.style.backgroundImage).toContain("linear-gradient(")
    expect(content.style.webkitTextFillColor).toBe("transparent")
    expect(content.style.backgroundClip).toBe("text")
    expect(content.style.getPropertyValue("-webkit-background-clip")).toBe("text")
    expect(content.style.getPropertyValue("-webkit-text-stroke"))
      .toContain("0.05em")
    expect(content.style.transform).toBe("skewX(10deg)")
    expect(content.dataset["bcWordArtPrintProps"]).toContain("linear-gradient")
    expect(content.dataset["bcWordArtEffectTransform"]).toBe("skewX(10deg)")
    expect(surface.querySelector("svg")).toBeNull()
  })

  it("renders divider and columns shells", () => {
    const fixture = createAllBlocksFixture()
    const host = renderFixture([fixture.divider, fixture.columns])

    expect(host.querySelector(".divider-block .divide-line.dashed")).not.toBeNull()
    expect(host.querySelector(".columns-block .columns-layout")).not.toBeNull()
    expect(host.querySelectorAll(".column-block .column-content").length).toBe(2)
  })

  it("uses the root content box for readonly absolute placement", () => {
    const host = renderFixture({
      id: "placement",
      flavour: "placement-layout",
      nodeType: BlockNodeType.block,
      meta: {},
      props: {},
      children: [],
    })
    const plane = host.querySelector<HTMLElement>("[data-bc-placement-layout]")!
    const content = plane.querySelector<HTMLElement>(
      ":scope > .children-render-container",
    )!

    expect(plane.style.left).toBe("0px")
    expect(plane.style.right).toBe("0px")
    expect(plane.style.width).toBe("auto")
    expect(plane.style.padding).toBe("inherit")
    expect(content.style.position).toBe("relative")
    expect(content.style.width).toBe("100%")
  })

  it("renders and patches a fixed object group with local ratio sizing", () => {
    const group: IBlockSnapshot = {
      id: "group",
      flavour: "object-group",
      nodeType: BlockNodeType.block,
      meta: {},
      props: {width: 400, height: 220},
      children: [{
        id: "image-in-group",
        flavour: "image",
        nodeType: BlockNodeType.block,
        meta: {},
        props: {
          src: "https://cdn.example.com/group.png",
          wr: 50,
          ar: 2,
          position: {x: 30, y: 40},
        },
        children: [],
      }],
    }
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer({resourcePolicy: "off"})
    renderer.render(host, group)

    const shell = host.querySelector<HTMLElement>("[data-bc-object-group]")!
    const image = host.querySelector<HTMLElement>(
      '[data-block-id="image-in-group"]',
    )!
    const figure = image.querySelector<HTMLElement>(".image-block__container")!
    expect(shell.style.width).toBe("400px")
    expect(shell.style.height).toBe("220px")
    expect(shell.style.padding).toBe("8px")
    expect(shell.querySelector<HTMLElement>(
      ":scope > .object-group-block__children",
    )?.style.width).toBe("100%")
    expect(image.style.left).toBe("30px")
    expect(image.style.top).toBe("40px")
    expect(figure.style.width).toBe("50%")

    const next = structuredClone(group)
    ;(next.children[0] as IBlockSnapshot).props['position'] = {x: 80, y: 90}
    renderer.update(next)
    expect(image.style.left).toBe("80px")
    expect(image.style.top).toBe("90px")
    renderer.destroy()
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

  it("renders wr/ar media sizing and preserves legacy pixel sizing", () => {
    const host = renderFixture([
      {
        id: "image-ratio",
        flavour: "image",
        nodeType: BlockNodeType.block,
        meta: {},
        props: {src: "https://cdn.example.com/image.png", wr: 40, ar: 2},
        children: [],
      },
      {
        id: "video-ratio",
        flavour: "video",
        nodeType: BlockNodeType.void,
        meta: {},
        props: {
          url: "https://cdn.example.com/video.mp4",
          sourceType: "link",
          wr: 60,
          ar: 16 / 9,
        },
        children: [],
      },
      {
        id: "image-legacy",
        flavour: "image",
        nodeType: BlockNodeType.block,
        meta: {},
        props: {
          src: "https://cdn.example.com/legacy.png",
          width: 320,
          height: 180,
        },
        children: [],
      },
    ])

    const ratioImageFigure = host.querySelector(
      '[data-block-id="image-ratio"] .image-block__container',
    ) as HTMLElement
    const ratioImage = host.querySelector(
      '[data-block-id="image-ratio"] .img-wrapper',
    ) as HTMLElement
    const ratioVideo = host.querySelector(
      '[data-block-id="video-ratio"] .video-block__wrapper',
    ) as HTMLElement
    const legacyImage = host.querySelector(
      '[data-block-id="image-legacy"] img',
    ) as HTMLImageElement

    expect(ratioImageFigure.style.width).toBe("40%")
    expect(ratioImage.style.width).toBe("100%")
    expect(Number.parseFloat(ratioImage.style.aspectRatio)).toBe(2)
    expect(ratioVideo.style.width).toBe("60%")
    expect(Number.parseFloat(ratioVideo.style.aspectRatio)).toBeCloseTo(16 / 9, 4)
    expect(legacyImage.style.width).toBe("320px")
    expect(legacyImage.style.height).toBe("180px")
  })

  it("keeps a stable image placeholder and disposes it with the renderer", async () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    renderer.render(host, {
      id: "image-placeholder",
      flavour: "image",
      nodeType: BlockNodeType.block,
      meta: {},
      props: {
        src: "https://cdn.example.com/image.png",
        wr: 50,
        ar: 2,
      },
      children: [],
    })
    await flushPromises()

    const frame = host.querySelector(".img-wrapper") as HTMLElement
    const image = frame.querySelector("img") as HTMLImageElement
    expect(frame.dataset["bcResourceState"]).toBe("loading")
    expect(Number.parseFloat(frame.style.aspectRatio)).toBe(2)

    image.dispatchEvent(new Event("error"))
    expect(frame.dataset["bcResourceState"]).toBe("error")

    renderer.update({
      id: "image-placeholder",
      flavour: "image",
      nodeType: BlockNodeType.block,
      meta: {},
      props: {
        src: "https://cdn.example.com/image-next.png",
        wr: 50,
        ar: 2,
      },
      children: [],
    })
    await flushPromises()
    const nextFrame = host.querySelector(".img-wrapper") as HTMLElement
    const nextImage = nextFrame.querySelector("img") as HTMLImageElement
    expect(nextFrame).not.toBe(frame)
    expect(nextFrame.dataset["bcResourceState"]).toBe("loading")
    nextImage.dispatchEvent(new Event("error"))
    expect(nextFrame.dataset["bcResourceState"]).toBe("error")

    renderer.destroy()
    expect(nextFrame.querySelector(".bc-resource-placeholder")).toBeNull()
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
    const fetchSpy = spyOn(window, "fetch").and.resolveTo({
      ok: true,
      json: async () => ({
        title: "Angular",
        description: "Framework",
        favicons: ["https://cdn.example.com/icon.png"],
        images: ["https://cdn.example.com/banner.png"],
      }),
    } as Response)

    const host = renderFixture(createAllBlocksFixture().bookmark)
    await flushPromises()

    expect(fetchSpy).toHaveBeenCalled()
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
    await shikiService.getHighlighter()
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
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await Promise.resolve()
  await Promise.resolve()
}
