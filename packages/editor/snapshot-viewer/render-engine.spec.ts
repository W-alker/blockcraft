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
