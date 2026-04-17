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

  it("shows raw text for an open code fence until the closing fence arrives", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("```ts\nconst x = 1;\n")
    await flushPromises()
    expect(host.textContent).toContain("const x = 1;")

    engine.append("```\n")
    await flushPromises()
    expect(host.textContent).toContain("const x = 1;")
  })

  it("flushes pending complex blocks on finish", async () => {
    const host = document.createElement("div")
    const engine = new SnapshotViewerStreamEngine({container: host})

    engine.append("```ts\nconst x = 1;\n")
    await flushPromises()
    expect(host.textContent).not.toContain("const x = 1;")

    engine.finish()
    await flushPromises()
    expect(host.textContent).toContain("const x = 1;")
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
