import {createSnapshotRenderer} from "./index";
import {BlockNodeType, IBlockSnapshot} from "../framework/block-std/types/block.type";
import {createAllBlocksFixture} from "./testing/fixtures/all-blocks.fixture";

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
    const region = createRenderUnitFixture("region-1", "#FBF3DB", "#DFAB01")

    renderer.render(host, wrapRoot([region]))
    const block = host.querySelector<HTMLElement>('[data-block-id="region-1"]')!
    expect(block.getAttribute("data-bc-render-unit")).toBe("true")
    expect(block.style.getPropertyValue("--bc-render-unit-background-color"))
      .toBe("#FBF3DB")
    expect(block.style.getPropertyValue("--bc-render-unit-border-color"))
      .toBe("#DFAB01")

    renderer.update(wrapRoot([
      createRenderUnitFixture("region-1", "#DDEDEA", "transparent"),
    ]))

    expect(host.querySelector('[data-block-id="region-1"]')).toBe(block)
    expect(block.style.getPropertyValue("--bc-render-unit-background-color"))
      .toBe("#DDEDEA")
    expect(block.style.getPropertyValue("--bc-render-unit-border-color"))
      .toBe("")
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
  backColor: string,
  borderColor: string,
): IBlockSnapshot {
  return {
    id,
    flavour: "render-unit",
    nodeType: BlockNodeType.block,
    meta: {},
    props: {backColor, borderColor},
    children: [createParagraphFixture(`${id}-paragraph`, "region content")],
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
