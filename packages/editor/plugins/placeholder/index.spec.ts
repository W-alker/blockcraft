import {Subject} from "rxjs"
import {PlaceholderPlugin} from "./index"

describe("PlaceholderPlugin", () => {
  type PlaceholderHarness = ReturnType<typeof createHarness>
  let harness: PlaceholderHarness | undefined

  afterEach(() => {
    harness?.plugin.destroy()
    harness = undefined
  })

  function createHarness(options: {
    meta?: Record<string, unknown>
    peerMeta?: Record<string, unknown>
    mountedInitially?: boolean
    schemaPlaceholder?: string | {
      default?: string
      heading?: {1?: string; 2?: string; 3?: string}
    }
    override?: string | null
  } = {}) {
    const rootHost = document.createElement("div")
    const hostElement = document.createElement("p")
    const containerElement = document.createElement("span")
    hostElement.appendChild(containerElement)

    const onTextChange = new Subject<unknown>()
    const onPropsChange = new Subject<Map<string, unknown>>()
    const onDestroy$ = new Subject<boolean>()
    const block = {
      id: "p1",
      flavour: "paragraph",
      nodeType: "editable",
      meta: {...(options.meta ?? {})},
      props: {depth: 0},
      childrenIds: [],
      textLength: 0,
      hostElement,
      containerElement,
      childrenRenderRef: {containerElement},
      onTextChange,
      onPropsChange,
      onDestroy$,
    }
    hostElement.dataset["blockId"] = block.id
    rootHost.appendChild(hostElement)

    const peerHostElement = document.createElement("p")
    const peerContainerElement = document.createElement("span")
    peerHostElement.appendChild(peerContainerElement)
    const peerBlock = options.peerMeta
      ? {
          ...block,
          id: "p2",
          meta: {...options.peerMeta},
          hostElement: peerHostElement,
          containerElement: peerContainerElement,
          childrenRenderRef: {containerElement: peerContainerElement},
        }
      : null
    if (peerBlock) {
      peerHostElement.dataset["blockId"] = peerBlock.id
      rootHost.appendChild(peerHostElement)
    }
    const editableBlocks = [block, ...(peerBlock ? [peerBlock] : [])]

    const selectionChange$ = new Subject<unknown>()
    const readonlySwitch$ = new Subject<boolean>()
    const onTextUpdate$ = new Subject<any>()
    const onPropsUpdate$ = new Subject<any>()
    const onChildrenUpdate$ = new Subject<any>()
    const structureChange$ = new Subject<any>()
    const viewChange$ = new Subject<any>()
    const onMetaUpdate$ = new Subject<{
      transactions: {
        blockId: string
        changes: Map<string, unknown>
      }[]
    }>()
    const rootBlock = {
      id: "root",
      flavour: "root",
      nodeType: "root",
      meta: {},
      props: {},
      childrenIds: editableBlocks.map(candidate => candidate.id),
      hostElement: rootHost,
    }
    let blockMounted = options.mountedInitially !== false
    const doc = {
      isReadonly: false,
      root: rootBlock,
      selection: {selectionChange$},
      readonlySwitch$,
      crud: {
        onMetaUpdate$,
        onTextUpdate$,
        onPropsUpdate$,
        onChildrenUpdate$,
      },
      readonlyManager: {isReadonly: () => false},
      model: {
        structureChange$,
        getNodeType: (id: string) => {
          if (editableBlocks.some(candidate => candidate.id === id)) {
            return "editable"
          }
          return "root"
        },
        getTextLength: (id: string) =>
          editableBlocks.find(candidate => candidate.id === id)?.textLength ?? 0,
        getChildrenIds: (id: string) => {
          if (id === rootBlock.id) return rootBlock.childrenIds
          return []
        },
        getParentId: (id: string) => {
          if (editableBlocks.some(candidate => candidate.id === id)) {
            return rootBlock.id
          }
          return null
        },
      },
      virtualization: {viewChange$},
      schemas: {
        get: () => ({
          metadata: {
            placeholder: options.schemaPlaceholder ?? "Schema placeholder",
          },
        }),
      },
      vm: {
        get: (id: string) => {
          const editableBlock = editableBlocks.find(
            candidate => candidate.id === id,
          )
          if (editableBlock && blockMounted) return {instance: editableBlock}
          if (id === rootBlock.id) return {instance: rootBlock}
          return undefined
        },
      },
      getBlockById: (id: string) =>
        editableBlocks.find(candidate => candidate.id === id),
      isEditable: (candidate: unknown) =>
        editableBlocks.some(editableBlock => editableBlock === candidate),
    }
    const plugin = new PlaceholderPlugin({
      overrides: options.override === undefined
        ? undefined
        : {paragraph: options.override},
    })
    plugin.register(doc as never)

    const focusBlock = () => {
      selectionChange$.next({
        start: {type: "text", blockId: block.id},
        isInSameBlock: true,
      })
    }
    const emitMetaChange = (blockId = block.id, key = "plh") => {
      onMetaUpdate$.next({
        transactions: [{
          blockId,
          changes: new Map([[key, {}]]),
        }],
      })
    }

    return {
      plugin,
      block,
      peerBlock,
      rootHost,
      containerElement,
      peerContainerElement,
      hostElement,
      focusBlock,
      emitMetaChange,
      mountBlock: () => {
        blockMounted = true
      },
      emitStructureChange: () => {
        structureChange$.next({
          reachableAddedIds: [block.id],
          reachableRemovedIds: [],
          affectedParentIds: [rootBlock.id],
        })
      },
    }
  }

  it("falls back to the schema placeholder when the block has no instance override", () => {
    harness = createHarness()

    harness.focusBlock()

    expect(harness.containerElement.getAttribute("data-placeholder"))
      .toBe("Schema placeholder")
    expect(harness.hostElement.classList.contains("empty")).toBeTrue()
  })

  it("uses the flavour override before the schema placeholder", () => {
    harness = createHarness({override: "Flavour placeholder"})

    harness.focusBlock()

    expect(harness.containerElement.getAttribute("data-placeholder"))
      .toBe("Flavour placeholder")
  })

  it("uses meta.plh before flavour and schema placeholders", () => {
    harness = createHarness({
      meta: {plh: "Instance placeholder"},
      override: "Flavour placeholder",
    })

    harness.focusBlock()

    expect(harness.containerElement.getAttribute("data-placeholder"))
      .toBe("Instance placeholder")
  })

  it("shows an always placeholder before the block receives focus", () => {
    harness = createHarness({
      meta: {plh: "Persistent hint", plhMode: "always"},
    })

    expect(harness.containerElement.getAttribute("data-placeholder"))
      .toBe("Persistent hint")
    expect(harness.hostElement.classList.contains("bc-placeholder-empty"))
      .toBeTrue()
  })

  it("hides only the composing block placeholder during IME input", () => {
    harness = createHarness({
      meta: {plh: "First hint", plhMode: "always"},
      peerMeta: {plh: "Second hint", plhMode: "always"},
    })

    harness.containerElement.dispatchEvent(
      new CompositionEvent("compositionstart", {bubbles: true}),
    )

    expect(harness.containerElement.hasAttribute("data-placeholder")).toBeFalse()
    expect(harness.peerContainerElement.getAttribute("data-placeholder"))
      .toBe("Second hint")

    harness.containerElement.dispatchEvent(
      new CompositionEvent("compositionend", {bubbles: true}),
    )

    expect(harness.containerElement.getAttribute("data-placeholder"))
      .toBe("First hint")
    expect(harness.peerContainerElement.getAttribute("data-placeholder"))
      .toBe("Second hint")
  })

  it("hides the active block immediately when IME targets the editor root", () => {
    harness = createHarness({
      meta: {plh: "First hint", plhMode: "always"},
      peerMeta: {plh: "Second hint", plhMode: "always"},
    })
    harness.focusBlock()

    harness.rootHost.dispatchEvent(
      new CompositionEvent("compositionstart", {bubbles: true}),
    )

    expect(harness.containerElement.hasAttribute("data-placeholder")).toBeFalse()
    expect(harness.peerContainerElement.getAttribute("data-placeholder"))
      .toBe("Second hint")

    harness.rootHost.dispatchEvent(
      new CompositionEvent("compositionend", {bubbles: true}),
    )

    expect(harness.containerElement.getAttribute("data-placeholder"))
      .toBe("First hint")
  })

  it("discovers an always placeholder after the model event precedes view mounting", async () => {
    harness = createHarness({
      meta: {plh: "Persistent hint", plhMode: "always"},
      mountedInitially: false,
    })

    harness.emitStructureChange()
    harness.mountBlock()
    await Promise.resolve()

    expect(harness.containerElement.getAttribute("data-placeholder"))
      .toBe("Persistent hint")
    expect(harness.hostElement.classList.contains("bc-placeholder-empty"))
      .toBeTrue()
  })

  it("treats an empty meta.plh as an explicit disable", () => {
    harness = createHarness({
      meta: {plh: ""},
      override: "Flavour placeholder",
    })

    harness.focusBlock()

    expect(harness.containerElement.hasAttribute("data-placeholder")).toBeFalse()
    expect(harness.hostElement.classList.contains("empty")).toBeFalse()
  })

  it("ignores a malformed instance placeholder and keeps the existing fallback", () => {
    harness = createHarness({
      meta: {plh: 42},
      override: "Flavour placeholder",
    })

    harness.focusBlock()

    expect(harness.containerElement.getAttribute("data-placeholder"))
      .toBe("Flavour placeholder")
  })

  it("refreshes the active block when its meta.plh changes", () => {
    harness = createHarness({meta: {plh: "Before"}})
    harness.focusBlock()

    harness.block.meta["plh"] = "After"
    harness.emitMetaChange()

    expect(harness.containerElement.getAttribute("data-placeholder")).toBe("After")
  })

  it("clears the active placeholder when meta.plh changes to an empty string", () => {
    harness = createHarness({meta: {plh: "Before"}})
    harness.focusBlock()

    harness.block.meta["plh"] = ""
    harness.emitMetaChange()

    expect(harness.containerElement.hasAttribute("data-placeholder")).toBeFalse()
    expect(harness.hostElement.classList.contains("empty")).toBeFalse()
  })

  it("restores fallback resolution when meta.plh is deleted", () => {
    harness = createHarness({
      meta: {plh: "Instance placeholder"},
      override: "Flavour placeholder",
    })
    harness.focusBlock()

    delete harness.block.meta["plh"]
    harness.emitMetaChange()

    expect(harness.containerElement.getAttribute("data-placeholder"))
      .toBe("Flavour placeholder")
  })

  it("ignores unrelated meta updates", () => {
    harness = createHarness({meta: {plh: "Instance placeholder"}})
    harness.focusBlock()
    const setAttribute = spyOn(harness.containerElement, "setAttribute").and.callThrough()

    harness.block.meta["plh"] = "Changed without matching event"
    harness.emitMetaChange("other-block")
    harness.emitMetaChange(harness.block.id, "lock")

    expect(setAttribute).not.toHaveBeenCalled()
    expect(harness.containerElement.getAttribute("data-placeholder"))
      .toBe("Instance placeholder")
  })
})
