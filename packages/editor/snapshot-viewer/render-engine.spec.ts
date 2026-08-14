import {createSnapshotRenderer} from "./index";
import {BlockNodeType, IBlockSnapshot} from "../framework/block-std/types/block.type";
import {createAllBlocksFixture} from "./testing/fixtures/all-blocks.fixture";
import {serializeTextBoxWordArtStyle} from "../blocks/text-box-block";

describe("SnapshotRenderEngine", () => {
  it("renders a root snapshot into a host container", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const snapshot = createAllBlocksFixture().minimalParagraphDoc

    renderer.render(host, snapshot)

    expect(host.querySelector('[data-block-id="paragraph-1"]')).not.toBeNull()
    expect(host.textContent).toContain("hello snapshot viewer")
  })

  it("patches a paragraph in place when only text changes and id stays stable", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const first = wrapRoot([createParagraphFixture("paragraph-1", "before")])
    const second = wrapRoot([createParagraphFixture("paragraph-1", "after")])

    renderer.render(host, first)
    const oldNode = host.querySelector('[data-block-id="paragraph-1"]')
    renderer.update(second)
    const newNode = host.querySelector('[data-block-id="paragraph-1"]')

    expect(newNode).toBe(oldNode)
    expect(host.textContent).toContain("after")
  })

  it("projects, updates, and clears common block appearance props", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const first = createParagraphFixture("paragraph-1", "styled")
    first.props = {
      ...first.props,
      backColor: "#FBF3DB",
      borderColor: "#E9E9E7",
    }

    renderer.render(host, wrapRoot([first]))
    const block = host.querySelector<HTMLElement>('[data-block-id="paragraph-1"]')!
    expect(block.hasAttribute("data-bc-block-background")).toBeTrue()
    expect(block.hasAttribute("data-bc-block-border")).toBeTrue()
    expect(block.style.getPropertyValue("--bc-block-background-color"))
      .toBe("#FBF3DB")
    expect(block.style.getPropertyValue("--bc-block-border-color"))
      .toBe("#E9E9E7")

    const cleared = createParagraphFixture("paragraph-1", "styled")
    cleared.props = {...cleared.props, backColor: null, borderColor: "transparent"}
    renderer.update(wrapRoot([cleared]))

    expect(host.querySelector('[data-block-id="paragraph-1"]')).toBe(block)
    expect(block.hasAttribute("data-bc-block-background")).toBeFalse()
    expect(block.hasAttribute("data-bc-block-border")).toBeFalse()
    expect(block.style.getPropertyValue("--bc-block-background-color")).toBe("")
    expect(block.style.getPropertyValue("--bc-block-border-color")).toBe("")
  })

  it("ignores persisted appearance colors on non-editable snapshot blocks", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const divider: IBlockSnapshot = {
      id: "divider-1",
      flavour: "divider",
      nodeType: BlockNodeType.void,
      meta: {},
      props: {backColor: "#FBF3DB", borderColor: "#E9E9E7"},
      children: [],
    }

    renderer.render(host, wrapRoot([divider]))
    const block = host.querySelector<HTMLElement>('[data-block-id="divider-1"]')!
    expect(block.hasAttribute("data-bc-block-background")).toBeFalse()
    expect(block.hasAttribute("data-bc-block-border")).toBeFalse()
    expect(block.style.getPropertyValue("--bc-block-background-color")).toBe("")
    expect(block.style.getPropertyValue("--bc-block-border-color")).toBe("")
  })

  it("projects and updates render-unit appearance without using the editable-block contract", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const region = createRenderUnitFixture("region-1", {
      backColor: "#FBF3DB",
      borderColor: "#DFAB01",
    })

    renderer.render(host, wrapRoot([region]))
    const block = host.querySelector<HTMLElement>('[data-block-id="region-1"]')!
    expect(block.getAttribute("data-bc-render-unit")).toBe("true")
    expect(block.style.getPropertyValue("--bc-render-unit-background-color"))
      .toBe("#FBF3DB")
    expect(block.style.getPropertyValue("--bc-render-unit-border-color"))
      .toBe("#DFAB01")

    renderer.update(wrapRoot([
      createRenderUnitFixture("region-1", {
        backColor: "#DDEDEA",
        borderColor: "transparent",
      }),
    ]))

    expect(host.querySelector('[data-block-id="region-1"]')).toBe(block)
    expect(block.style.getPropertyValue("--bc-render-unit-background-color"))
      .toBe("#DDEDEA")
    expect(block.style.getPropertyValue("--bc-render-unit-border-color"))
      .toBe("")
  })

  it("projects and clears render-unit padding and background images in place", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer({
      baseUrl: "https://docs.example.com/manual/",
    })
    const region = createRenderUnitFixture("region-surface", {
      p: [8, 12, 16, 20],
      bgi: "images/paper.png",
      bgs: "stretch",
      bgx: 25,
      bgy: 75,
      bgo: 0.45,
    })

    renderer.render(host, wrapRoot([region]))
    const block = host.querySelector<HTMLElement>(
      '[data-block-id="region-surface"]',
    )!
    const paragraph = host.querySelector<HTMLElement>(
      '[data-block-id="region-surface-paragraph"]',
    )!
    const image = block.querySelector<HTMLImageElement>(
      ".render-unit-background-image",
    )!

    expect(block.style.getPropertyValue("--bc-render-unit-padding-top"))
      .toBe("8px")
    expect(block.style.getPropertyValue("--bc-render-unit-padding-right"))
      .toBe("12px")
    expect(block.style.getPropertyValue("--bc-render-unit-padding-bottom"))
      .toBe("16px")
    expect(block.style.getPropertyValue("--bc-render-unit-padding-left"))
      .toBe("20px")
    expect(image.src).toBe("https://docs.example.com/manual/images/paper.png")
    expect(image.style.objectFit).toBe("fill")
    expect(image.style.objectPosition).toBe("25% 75%")
    expect(image.style.opacity).toBe("0.45")

    renderer.update(wrapRoot([
      createRenderUnitFixture("region-surface", {}),
    ]))

    expect(host.querySelector('[data-block-id="region-surface"]')).toBe(block)
    expect(host.querySelector('[data-block-id="region-surface-paragraph"]'))
      .toBe(paragraph)
    expect(block.querySelector(".render-unit-background-image")).toBeNull()
    expect(block.style.getPropertyValue("--bc-render-unit-padding-top"))
      .toBe("0px")
    expect(block.style.getPropertyValue("--bc-render-unit-padding-left"))
      .toBe("0px")
  })

  it("does not fetch render-unit background images when resources are off", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer({resourcePolicy: "off"})

    renderer.render(host, wrapRoot([
      createRenderUnitFixture("region-off", {
        bgi: "https://cdn.example.com/paper.png",
      }),
    ]))

    expect(host.querySelector(".render-unit-background-image")).toBeNull()
  })

  it("patches fixed text-box geometry and surface without remounting children", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer({
      baseUrl: "https://docs.example.com/manual/",
    })
    const textBox = createTextBoxFixture("text-box-1", {
      width: 320,
      height: 160,
      rotation: 15,
      backColor: "#fff7d6",
      borderColor: "#dfab01",
      sh: "rounded-speech-bubble",
      fo: 0.9,
      bw: 2,
      bs: "dashed",
      wa: serializeTextBoxWordArtStyle({
        fillType: "solid",
        fillColor: "#2563EB",
        outlineColor: "#FFFFFF",
        shadowEnabled: true,
      }),
      p: [8, 12, 16, 20],
      bgi: "images/paper.png",
      bgs: "stretch",
      bgx: 25,
      bgy: 75,
      bgo: 0.45,
      position: {
        x: 40,
        y: 60,
      },
      placementLayer: "under",
    })

    renderer.render(host, wrapRoot([wrapPlacement([textBox])]))
    const block = host.querySelector<HTMLElement>(
      '[data-block-id="text-box-1"]',
    )!
    let surface = block.querySelector<HTMLElement>(
      ".text-box-block__surface",
    )!
    const paragraph = block.querySelector<HTMLElement>(
      '[data-block-id="text-box-1-paragraph"]',
    )!
    const image = block.querySelector<HTMLImageElement>(
      ".text-box-block__background-image",
    )!

    expect(block.getAttribute("data-bc-text-box")).toBe("true")
    expect(surface.style.width).toBe("320px")
    expect(surface.style.height).toBe("160px")
    expect(surface.style.transform).toBe("rotate(15deg)")
    expect(block.querySelectorAll("[data-bc-print-visual-surface]").length)
      .toBe(1)
    expect(surface.querySelector(".text-box-block__geometry--fill path"))
      .not.toBeNull()
    expect(surface.querySelector("clipPath path")).not.toBeNull()
    expect(surface.querySelector(".text-box-block__geometry--outline path"))
      .not.toBeNull()
    expect(surface.querySelector(".text-box-block__content")
      ?.classList.contains("text-box-block__content--word-art")).toBeTrue()
    expect(block.style.getPropertyValue("--bc-text-box-word-art-color"))
      .toBe("#2563EB")
    expect(block.style.left).toBe("40px")
    expect(block.style.top).toBe("60px")
    expect(block.dataset["bcPlacementLayer"]).toBe("under")
    expect(block.style.getPropertyValue("--bc-text-box-padding-left"))
      .toBe("20px")
    expect(image.src).toBe("https://docs.example.com/manual/images/paper.png")
    expect(image.style.objectFit).toBe("fill")
    expect(image.style.objectPosition).toBe("25% 75%")
    expect(image.style.opacity).toBe("0.45")

    renderer.update(wrapRoot([wrapPlacement([
      createTextBoxFixture("text-box-1", {
        width: 240,
        height: 120,
        rotation: 0,
        p: 0,
        position: {x: 40, y: 60},
      }),
    ])]))

    expect(host.querySelector('[data-block-id="text-box-1"]')).toBe(block)
    expect(host.querySelector('[data-block-id="text-box-1-paragraph"]'))
      .toBe(paragraph)
    expect(block.querySelector(".text-box-block__background-image")).toBeNull()
    surface = block.querySelector<HTMLElement>(".text-box-block__surface")!
    expect(surface.style.width).toBe("240px")
    expect(surface.style.height).toBe("120px")
    expect(surface.style.transform).toBe("")
    expect(block.style.getPropertyValue("--bc-text-box-padding-left"))
      .toBe("0px")
  })

  it("does not fetch text-box background images when resources are off", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer({resourcePolicy: "off"})

    renderer.render(host, wrapRoot([
      createTextBoxFixture("text-box-off", {
        width: 240,
        height: 120,
        bgi: "https://cdn.example.com/paper.png",
      }),
    ]))

    expect(host.querySelector(".text-box-block__background-image")).toBeNull()
  })

  it("projects compact document and editable-block typography", () => {
    const host = document.createElement("div")
    const renderer = createSnapshotRenderer()
    const paragraph = createParagraphFixture("paragraph-typography", "styled")
    paragraph.props = {...paragraph.props, lh: 1.8}
    const snapshot = wrapRoot([paragraph])
    snapshot.props = {ff: "kai", fs: 18, lh: 1.6}

    renderer.render(host, snapshot)

    const root = host.querySelector<HTMLElement>('[data-blockcraft-root="true"]')!
    expect(root.dataset["bcFf"]).toBe("kai")
    expect(root.dataset["bcFs"]).toBe("18")
    expect(root.dataset["bcLh"]).toBe("1.6")
    expect(root.style.fontFamily).toContain("Kaiti SC")
    expect(root.style.getPropertyValue("--bc-fs")).toBe("18px")
    expect(root.style.getPropertyValue("--bc-lh")).toBe("1.6")

    const block = host.querySelector<HTMLElement>(
      '[data-block-id="paragraph-typography"]',
    )!
    expect(block.hasAttribute("data-bc-block-lh")).toBeTrue()
    expect(block.style.getPropertyValue("--bc-block-lh")).toBe("1.8")
  })
})

function createParagraphFixture(id: string, text: string): IBlockSnapshot {
  return {
    id,
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    meta: {},
    props: {
      depth: 0,
    },
    children: [{insert: text}],
  }
}

function createRenderUnitFixture(
  id: string,
  props: IBlockSnapshot["props"],
): IBlockSnapshot {
  return {
    id,
    flavour: "render-unit",
    nodeType: BlockNodeType.block,
    meta: {},
    props,
    children: [createParagraphFixture(`${id}-paragraph`, "region content")],
  }
}

function createTextBoxFixture(
  id: string,
  props: IBlockSnapshot["props"],
): IBlockSnapshot {
  return {
    id,
    flavour: "text-box",
    nodeType: BlockNodeType.block,
    meta: {},
    props,
    children: [createParagraphFixture(`${id}-paragraph`, "text box content")],
  }
}

function wrapRoot(children: IBlockSnapshot[]): IBlockSnapshot {
  return {
    id: "root-test",
    flavour: "root",
    nodeType: BlockNodeType.root,
    meta: {},
    props: {},
    children,
  }
}

function wrapPlacement(children: IBlockSnapshot[]): IBlockSnapshot {
  return {
    id: "placement-layout-test",
    flavour: "placement-layout",
    nodeType: BlockNodeType.block,
    meta: {},
    props: {},
    children,
  }
}
