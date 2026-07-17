import {fromEvent} from "rxjs";
import {BlockNodeType} from "../../framework";
import {BlockGapCreatorPlugin} from "./index";

describe("BlockGapCreatorPlugin", () => {
  const caretRangeDescriptor = Object.getOwnPropertyDescriptor(document, "caretRangeFromPoint")

  afterEach(() => {
    document.getSelection()?.removeAllRanges()
    document.querySelectorAll('[data-block-id="root"]').forEach(element => element.remove())
    if (caretRangeDescriptor) {
      Object.defineProperty(document, "caretRangeFromPoint", caretRangeDescriptor)
    } else {
      delete (document as any).caretRangeFromPoint
    }
  })

  const rect = (left: number, top: number, right: number, bottom: number): DOMRect => ({
    left,
    top,
    right,
    bottom,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect)

  function createHarness() {
    const host = document.createElement("div")
    host.setAttribute("data-block-id", "root")
    host.setAttribute("data-node-type", BlockNodeType.root)

    const rootBlock = {
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      hostElement: host,
    }
    const voidHost = document.createElement("div")
    voidHost.setAttribute("data-block-id", "void-1")
    voidHost.setAttribute("data-node-type", BlockNodeType.void)
    voidHost.getBoundingClientRect = () => rect(100, 100, 300, 200)
    const voidContent = document.createElement("div")
    voidContent.className = "bc-block-content"
    voidContent.getBoundingClientRect = () => rect(120, 120, 280, 180)
    voidHost.appendChild(voidContent)
    host.appendChild(voidHost)

    const voidBlock = {
      id: "void-1",
      flavour: "image",
      nodeType: BlockNodeType.void,
      hostElement: voidHost,
      parentBlock: rootBlock,
    }

    const lastHost = document.createElement("p")
    lastHost.setAttribute("data-block-id", "last")
    lastHost.setAttribute("data-node-type", BlockNodeType.editable)
    lastHost.getBoundingClientRect = () => rect(100, 300, 300, 340)
    host.appendChild(lastHost)

    const lastEditable = {
      id: "last",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement: lastHost,
      parentBlock: rootBlock,
    }

    const selection = {
      setGapCursor: jasmine.createSpy("setGapCursor"),
      setCursorAtBlock: jasmine.createSpy("setCursorAtBlock"),
      recalculate: jasmine.createSpy("recalculate"),
    }
    const doc = {
      isReadonly: false,
      root: {
        hostElement: host,
        lastChildren: lastEditable,
        getChildrenBlocks: () => [voidBlock, lastEditable],
      },
      event: {
        customListen: (target: EventTarget, eventName: string) => fromEvent(target, eventName),
      },
      schemas: {
        get: () => ({metadata: {isLeaf: false}}),
      },
      getBlockById: (id: string) => {
        if (id === "root") return rootBlock
        if (id === "void-1") return voidBlock
        if (id === "last") return lastEditable
        throw new Error(`Unknown block ${id}`)
      },
      isEditable: (block: any) => block.nodeType === BlockNodeType.editable,
      selection,
      onDestroy$: {subscribe: () => ({unsubscribe: () => {}})},
    }
    const plugin = new BlockGapCreatorPlugin()
    ;(plugin as any).doc = doc

    return {plugin: plugin as any, doc, host, voidHost, voidBlock, lastEditable, selection}
  }

  it("resolves root side gutter by row before falling back to the last child", () => {
    const {plugin, voidBlock, selection} = createHarness()

    const handled = plugin._resolveBlankAreaSelection(50, 150)

    expect(handled).toBeTrue()
    expect(selection.setGapCursor).toHaveBeenCalledOnceWith(voidBlock, "before")
    expect(selection.setCursorAtBlock).not.toHaveBeenCalled()
  })

  it("sets a gap cursor on root-padding mousedown before native selection can land", () => {
    const {plugin, host, voidBlock, selection} = createHarness()
    plugin.init()

    const down = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 150,
    })
    host.dispatchEvent(down)

    expect(down.defaultPrevented).toBeTrue()
    expect(selection.setGapCursor).toHaveBeenCalledOnceWith(voidBlock, "before")
    expect(selection.recalculate).not.toHaveBeenCalled()

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 150,
    })
    host.dispatchEvent(click)

    expect(click.defaultPrevented).toBeTrue()
    expect(selection.setGapCursor).toHaveBeenCalledTimes(1)
    expect(selection.setCursorAtBlock).not.toHaveBeenCalled()

    plugin.destroy()
  })

  it("recalculates once after caretRangeFromPoint installs a native text caret", () => {
    const {plugin, host, lastEditable, selection} = createHarness()
    document.body.appendChild(host)
    const text = document.createTextNode("hello")
    lastEditable.hostElement.appendChild(text)
    const range = document.createRange()
    range.setStart(text, 3)
    range.collapse(true)
    Object.defineProperty(document, "caretRangeFromPoint", {
      value: jasmine.createSpy("caretRangeFromPoint").and.returnValue(range),
      configurable: true,
      writable: true,
    })

    const handled = plugin._tryTextLineEndCaret(200, 320)

    expect(handled).toBeTrue()
    expect(selection.recalculate).toHaveBeenCalledTimes(1)
    const nativeRange = document.getSelection()!.getRangeAt(0)
    expect(nativeRange.startContainer).toBe(text)
    expect(nativeRange.startOffset).toBe(3)
  })

  it("resolves block blank-area hits using the content rect", () => {
    const {plugin, voidHost, voidBlock, selection} = createHarness()
    spyOn(document, "elementFromPoint").and.returnValue(voidHost)

    const shouldResolve = plugin._shouldResolveOnMouseDown({
      button: 0,
      detail: 1,
      clientX: 110,
      clientY: 150,
      target: voidHost,
    } as unknown as MouseEvent)
    const handled = plugin._resolveBlankAreaSelection(110, 150)

    expect(shouldResolve).toBeTrue()
    expect(handled).toBeTrue()
    expect(selection.setGapCursor).toHaveBeenCalledOnceWith(voidBlock, "before")
  })

  it("treats image right-side blank area as a gap instead of native editable DOM", () => {
    const {plugin, voidHost, voidBlock, selection} = createHarness()
    voidHost.setAttribute("data-node-type", BlockNodeType.block)
    voidBlock.nodeType = BlockNodeType.block
    const content = voidHost.querySelector(".bc-block-content") as HTMLElement
    content.className = "image-block__container"
    spyOn(document, "elementFromPoint").and.returnValue(voidHost)

    const shouldResolve = plugin._shouldResolveOnMouseDown({
      button: 0,
      detail: 1,
      clientX: 290,
      clientY: 150,
      target: voidHost,
    } as unknown as MouseEvent)
    const handled = plugin._resolveBlankAreaSelection(290, 150)

    expect(shouldResolve).toBeTrue()
    expect(handled).toBeTrue()
    expect(selection.setGapCursor).toHaveBeenCalledOnceWith(voidBlock, "after")
  })

  it("treats attachment host whitespace as a gap after content-hit plugins decline it", () => {
    const {plugin, voidHost, voidBlock, selection} = createHarness()
    voidBlock.flavour = "attachment"
    voidHost.getBoundingClientRect = () => rect(100, 100, 420, 180)
    voidHost.replaceChildren()
    const prefix = document.createElement("div")
    prefix.className = "attachment-block__prefix"
    prefix.getBoundingClientRect = () => rect(120, 120, 150, 160)
    const info = document.createElement("div")
    info.className = "attachment-block__info"
    info.getBoundingClientRect = () => rect(160, 115, 330, 165)
    const icon = document.createElement("div")
    icon.className = "attachment-block__icon-wrapper"
    icon.getBoundingClientRect = () => rect(340, 120, 390, 160)
    voidHost.append(prefix, info, icon)
    spyOn(document, "elementFromPoint").and.returnValue(voidHost)

    const shouldResolve = plugin._shouldResolveOnMouseDown({
      button: 0,
      detail: 1,
      clientX: 410,
      clientY: 140,
      target: voidHost,
    } as unknown as MouseEvent)
    const handled = plugin._resolveBlankAreaSelection(410, 140)

    expect(shouldResolve).toBeTrue()
    expect(handled).toBeTrue()
    expect(selection.setGapCursor).toHaveBeenCalledOnceWith(voidBlock, "after")
  })

  it("treats formula host whitespace as a gap after formula content clicks are filtered", () => {
    const {plugin, voidHost, voidBlock, selection} = createHarness()
    voidBlock.flavour = "formula"
    voidHost.getBoundingClientRect = () => rect(100, 100, 360, 190)
    voidHost.replaceChildren()
    const content = document.createElement("div")
    content.className = "formula-block-container"
    content.getBoundingClientRect = () => rect(130, 120, 330, 170)
    voidHost.appendChild(content)
    spyOn(document, "elementFromPoint").and.returnValue(voidHost)

    const shouldResolve = plugin._shouldResolveOnMouseDown({
      button: 0,
      detail: 1,
      clientX: 110,
      clientY: 145,
      target: voidHost,
    } as unknown as MouseEvent)
    const handled = plugin._resolveBlankAreaSelection(110, 145)

    expect(shouldResolve).toBeTrue()
    expect(handled).toBeTrue()
    expect(selection.setGapCursor).toHaveBeenCalledOnceWith(voidBlock, "before")
  })

  it("prevents native mousedown selection on image right-side blank area", () => {
    const {plugin, voidHost, voidBlock, selection} = createHarness()
    voidHost.setAttribute("data-node-type", BlockNodeType.block)
    voidBlock.nodeType = BlockNodeType.block
    const content = voidHost.querySelector(".bc-block-content") as HTMLElement
    content.className = "image-block__container"
    spyOn(document, "elementFromPoint").and.returnValue(voidHost)
    plugin.init()

    const down = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX: 290,
      clientY: 150,
    })
    voidHost.dispatchEvent(down)

    expect(down.defaultPrevented).toBeTrue()
    expect(selection.setGapCursor).toHaveBeenCalledOnceWith(voidBlock, "after")
    expect(selection.recalculate).not.toHaveBeenCalled()

    plugin.destroy()
  })

  it("extends the selection manually when a drag starts from root padding", () => {
    const {plugin, host} = createHarness()
    plugin.init()
    plugin._extendSelectionToPoint = jasmine.createSpy("_extendSelectionToPoint").and.returnValue(true)

    host.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 150,
    }))

    const move = new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      clientX: 80,
      clientY: 150,
    })
    window.dispatchEvent(move)

    expect(move.defaultPrevented).toBeTrue()
    expect(plugin._extendSelectionToPoint).toHaveBeenCalledOnceWith(80, 150)

    plugin.destroy()
  })

  it("does not run the click fallback after a handled root-padding mousedown", () => {
    const {plugin, host, voidBlock, selection} = createHarness()
    plugin.init()

    host.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 150,
    }))

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: 80,
      clientY: 150,
    })
    host.dispatchEvent(click)

    expect(click.defaultPrevented).toBeTrue()
    expect(selection.setGapCursor).toHaveBeenCalledOnceWith(voidBlock, "before")
    expect(selection.setCursorAtBlock).not.toHaveBeenCalled()

    plugin.destroy()
  })
})
