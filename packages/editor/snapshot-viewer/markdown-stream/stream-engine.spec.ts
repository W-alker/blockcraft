import {SnapshotViewerStreamEngine} from "./stream-engine";

describe("SnapshotViewerStreamEngine", () => {
  it("renders a paragraph provisionally before it becomes stable", async () => {
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

  it("renders the code-block shell while an open code fence is still being typed", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("Intro\n\n```ts\nconst x = 1;\n")
    await flushPromises()
    expect(host.textContent).toContain("Intro")
    expect(host.textContent).toContain("const x = 1;")
    const codeEl = host.querySelector('[data-block-id^="code-"]')
    expect(codeEl).not.toBeNull()

    engine.append("```\n")
    await flushPromises()
    expect(host.textContent).toContain("const x = 1;")
    const codeElAfter = host.querySelector('[data-block-id^="code-"]')
    expect(codeElAfter).toBe(codeEl)
  })

  it("appends new body characters into the same provisional code block element", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("```ts\nconst x = 1;\n")
    await flushPromises()
    const codeEl = host.querySelector('[data-block-id^="code-"]')
    expect(codeEl).not.toBeNull()
    expect(host.textContent).toContain("const x = 1;")

    engine.append("const y = 2;\n")
    await flushPromises()
    const codeElAfter = host.querySelector('[data-block-id^="code-"]')
    expect(codeElAfter).toBe(codeEl)
    expect(host.textContent).toContain("const y = 2;")
  })

  it("preserves the edit-container's existing child nodes when a code block body grows", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("```ts\nfoo\n")
    await flushPromises()
    const codeEl = host.querySelector('[data-block-id^="code-"]') as HTMLElement
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
    const paraBefore = host.querySelector('[data-block-id^="paragraph-7"]')
    expect(paraBefore).not.toBeNull()
    const textNodeBefore = findFirstText(paraBefore as HTMLElement)
    expect(textNodeBefore).not.toBeNull()
    expect(textNodeBefore!.data).toBe("Hello")

    engine.append(" world")
    await flushPromises()
    const paraAfter = host.querySelector('[data-block-id^="paragraph-7"]')
    const textNodeAfter = findFirstText(paraAfter as HTMLElement)
    expect(paraAfter).toBe(paraBefore)
    expect(textNodeAfter).toBe(textNodeBefore)
    expect(textNodeAfter!.data).toBe("Hello world")
  })

  it("flushes a provisional code fence into a stable code block on finish", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("```ts\nconst x = 1;\n")
    await flushPromises()
    expect(host.textContent).toContain("const x = 1;")

    engine.finish()
    await flushPromises()
    expect(host.textContent).toContain("const x = 1;")
    expect(host.querySelector('[data-block-id^="code-"]')).not.toBeNull()
  })

  it("keeps previously rendered content visible while a table is still being typed", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("Intro\n\n| Name |")
    await flushPromises()
    expect(host.textContent).toContain("| Name |")

    engine.append("\n|-|-|")
    await flushPromises()
    expect(host.textContent).toContain("Intro")
    expect(host.textContent).toContain("| Name |")
    expect(host.textContent).toContain("|-|-|")
  })

  it("keeps prior stable blocks visible while a mermaid fence is still open", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("Intro\n\n```mermaid\ngraph TD")
    await flushPromises()
    expect(host.textContent).toContain("Intro")
    expect(host.textContent).not.toContain("graph TD")
  })

  it("preserves a stable closed fence block when subsequent chunks arrive", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("Intro\n\n```mermaid\ngraph TD\n  A-->B\n```\n")
    await flushPromises()
    const mermaidEl = host.querySelector('[data-block-id^="mermaid-"]')
    expect(mermaidEl).not.toBeNull()

    engine.append("\n| Name |")
    await flushPromises()
    const mermaidElAfter = host.querySelector('[data-block-id^="mermaid-"]')
    expect(mermaidElAfter).not.toBeNull()
    expect(mermaidElAfter).toBe(mermaidEl)
  })

  it("updates prior rendered content after replace()", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.replace("# Old\n\nBody\n\n")
    await flushPromises()
    const oldHeading = host.querySelector('[data-block-id^="heading-0"], [data-block-id^="paragraph-0"]')

    engine.replace("# New\n\nBody\n\n")
    await flushPromises()

    expect(host.textContent).toContain("New")
    expect(host.textContent).not.toContain("Old")
    expect(oldHeading).not.toBeNull()
  })
})

async function flushPromises() {
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
