import {IBlockSnapshot} from "../framework/block-std/types/block.type";
import {InlineModel} from "../framework/block-std/types/inline.type";
import {DeltaInsert} from "../framework/block-std/types/delta.type";
import {patchChildren, resolveChildContainer} from "./dom/patch-children";
import {normalizeSnapshot} from "./dom/normalize-snapshot";
import {renderInline} from "./inline/render-inline";
import {createBuiltinRendererRegistry} from "./registry";
import {
  MountedSnapshotNode,
  SnapshotBlockRenderer,
  SnapshotEnhancementTask,
  SnapshotRenderContext,
  SnapshotRenderer,
  SnapshotViewerOptions
} from "./types";

export class SnapshotRenderEngine implements SnapshotRenderer {
  private container: HTMLElement | null = null
  private options: SnapshotViewerOptions
  private readonly renderers: SnapshotBlockRenderer[]
  private readonly enhancementCache = new Map<string, unknown>()
  private readonly activeEnhancements = new Map<string, AbortController>()
  private readonly enhancementCleanups = new Set<() => void>()
  private mountedRoot: MountedSnapshotNode | null = null

  constructor(options: SnapshotViewerOptions = {}) {
    this.options = options
    this.renderers = createBuiltinRendererRegistry()
  }

  render(container: HTMLElement, snapshot: IBlockSnapshot | IBlockSnapshot[]): void {
    this.container = container
    this.commitRender(snapshot)
  }

  update(snapshot: IBlockSnapshot | IBlockSnapshot[]): void {
    if (!this.container) {
      return
    }
    this.commitUpdate(snapshot)
  }

  destroy(): void {
    this.cancelEnhancements()
    if (this.container) {
      this.container.replaceChildren()
    }
    this.container = null
    this.mountedRoot = null
  }

  private commitRender(snapshot: IBlockSnapshot | IBlockSnapshot[]) {
    this.cancelEnhancements()
    const normalized = normalizeSnapshot(snapshot, this.options)
    const enhancementQueue: SnapshotEnhancementTask[] = []
    const renderContext = this.createRenderContext()
    renderContext.scheduleEnhancement = (task) => {
      enhancementQueue.push(task)
    }
    const mountedRoot = this.mountNode(normalized.root, renderContext)
    this.container!.replaceChildren(mountedRoot.element)
    this.mountedRoot = mountedRoot
    this.flushEnhancements(enhancementQueue)
  }

  private commitUpdate(snapshot: IBlockSnapshot | IBlockSnapshot[]) {
    if (!this.container) {
      return
    }

    this.cancelEnhancements()
    const normalized = normalizeSnapshot(snapshot, this.options)
    const enhancementQueue: SnapshotEnhancementTask[] = []
    const renderContext = this.createRenderContext()
    renderContext.scheduleEnhancement = (task) => {
      enhancementQueue.push(task)
    }

    if (!this.mountedRoot || !this.canPatch(this.mountedRoot.snapshot, normalized.root)) {
      const mountedRoot = this.mountNode(normalized.root, renderContext)
      this.container.replaceChildren(mountedRoot.element)
      this.mountedRoot = mountedRoot
      this.flushEnhancements(enhancementQueue)
      return
    }

    this.mountedRoot = this.patchNode(this.mountedRoot, normalized.root, renderContext)
    if (this.container.firstElementChild !== this.mountedRoot.element) {
      this.container.replaceChildren(this.mountedRoot.element)
    }
    this.flushEnhancements(enhancementQueue)
  }

  private renderBlock(snapshot: IBlockSnapshot, renderContext: SnapshotRenderContext): HTMLElement {
    const renderer = this.renderers.find(candidate => candidate.canRender(snapshot))
    if (!renderer) {
      throw new Error(`No snapshot renderer found for flavour "${snapshot.flavour}"`)
    }

    return renderer.render(renderContext, snapshot).element
  }

  private mountNode(snapshot: IBlockSnapshot, renderContext: SnapshotRenderContext): MountedSnapshotNode {
    const element = this.renderBlock(snapshot, renderContext)
    return this.createMountedNode(snapshot, element)
  }

  private createMountedNode(snapshot: IBlockSnapshot, element: HTMLElement): MountedSnapshotNode {
    const childContainer = resolveChildContainer(element, snapshot)
    const childSnapshots = this.getBlockChildren(snapshot)
    const childElements = childContainer
      ? Array.from(childContainer.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement && child.hasAttribute("data-block-id"))
      : []

    return {
      snapshot,
      element,
      children: childSnapshots.map((child, index) => this.createMountedNode(child, childElements[index] as HTMLElement)),
    }
  }

  private createRenderContext(): SnapshotRenderContext {
    const renderContext: SnapshotRenderContext = {
      renderBlock: (snapshot) => this.renderBlock(snapshot, renderContext),
      createInlineContent: (model: InlineModel) => renderInline(model),
      scheduleEnhancement: () => {
      },
      options: this.options,
    }

    return renderContext
  }

  private patchNode(current: MountedSnapshotNode, next: IBlockSnapshot, renderContext: SnapshotRenderContext): MountedSnapshotNode {
    if (!this.canPatch(current.snapshot, next)) {
      return this.mountNode(next, renderContext)
    }

    if (snapshotsAreEqual(current.snapshot, next)) {
      return current
    }

    if (next.nodeType === "editable" || next.nodeType === "void") {
      if (this.tryApplyEditableDelta(current, next)) {
        return {
          snapshot: next,
          element: current.element,
          children: [],
        }
      }
      const fresh = this.renderBlock(next, renderContext)
      this.syncElement(current.element, fresh)
      return {
        snapshot: next,
        element: current.element,
        children: [],
      }
    }

    const currentChildContainer = resolveChildContainer(current.element, current.snapshot)
    if (!currentChildContainer) {
      const fresh = this.renderBlock(next, renderContext)
      this.syncElement(current.element, fresh)
      return {
        snapshot: next,
        element: current.element,
        children: [],
      }
    }

    const fresh = this.renderBlock(next, renderContext)
    this.syncElement(current.element, fresh, false)

    const childContainer = resolveChildContainer(current.element, next)
    if (!childContainer) {
      return this.mountNode(next, renderContext)
    }

    const children = patchChildren({
      parent: childContainer,
      currentChildren: current.children,
      nextSnapshots: this.getBlockChildren(next),
      renderContext,
      patchNode: (mounted, snapshot) => this.patchNode(mounted, snapshot, renderContext),
      mountNode: (snapshot) => this.mountNode(snapshot, renderContext),
    })

    return {
      snapshot: next,
      element: current.element,
      children,
    }
  }

  private flushEnhancements(tasks: SnapshotEnhancementTask[]) {
    const defaultPolicy = this.options.resourcePolicy ?? "eager"
    if (defaultPolicy === "off") {
      return
    }

    const queuedTasks = Array.from(new Map(tasks.map((task) => [task.key, task])).values())

    queuedTasks.forEach((task) => {
      if (this.enhancementCache.has(task.key)) {
        task.apply(this.enhancementCache.get(task.key))
        return
      }

      const policy = task.policy ?? defaultPolicy
      if (policy === "visible" && typeof IntersectionObserver !== "undefined") {
        const observer = new IntersectionObserver((entries) => {
          if (!entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
            return
          }

          observer.disconnect()
          this.enhancementCleanups.delete(cleanup)
          this.runEnhancement(task)
        }, {
          rootMargin: "300px 0px 300px 0px",
          threshold: 0,
        })

        const cleanup = () => observer.disconnect()
        this.enhancementCleanups.add(cleanup)
        observer.observe(task.target)
        return
      }

      this.runEnhancement(task)
    })
  }

  private runEnhancement(task: SnapshotEnhancementTask) {
    const controller = new AbortController()
    this.activeEnhancements.set(task.key, controller)

    Promise.resolve(task.load(controller.signal))
      .then((value) => {
        if (controller.signal.aborted) {
          return
        }
        this.enhancementCache.set(task.key, value)
        task.apply(value)
      })
      .catch(() => {
      })
      .finally(() => {
        if (this.activeEnhancements.get(task.key) === controller) {
          this.activeEnhancements.delete(task.key)
        }
      })
  }

  private cancelEnhancements() {
    this.activeEnhancements.forEach((controller) => controller.abort())
    this.activeEnhancements.clear()
    this.enhancementCleanups.forEach((cleanup) => cleanup())
    this.enhancementCleanups.clear()
  }

  private getBlockChildren(snapshot: IBlockSnapshot): IBlockSnapshot[] {
    return Array.isArray(snapshot.children) ? snapshot.children as IBlockSnapshot[] : []
  }

  private canPatch(current: IBlockSnapshot, next: IBlockSnapshot): boolean {
    return current.id === next.id && current.flavour === next.flavour && current.nodeType === next.nodeType
  }

  private tryApplyEditableDelta(current: MountedSnapshotNode, next: IBlockSnapshot): boolean {
    if (next.nodeType !== "editable" || current.snapshot.nodeType !== "editable") {
      return false
    }
    if (!propsEqual(current.snapshot.props, next.props)) {
      return false
    }
    const oldDelta = current.snapshot.children as unknown as DeltaInsert[]
    const newDelta = next.children as unknown as DeltaInsert[]
    if (!Array.isArray(oldDelta) || !Array.isArray(newDelta)) {
      return false
    }
    const editContainer = current.element.querySelector(".edit-container") as HTMLElement | null
    if (!editContainer) {
      return false
    }
    // 1) Pure-append fast path — works even when the container has been restructured
    //    (e.g. shiki tokenized a code block into many <c-element>s). We only need to
    //    locate the trailing text node and appendData the new tail.
    if (tryAppendOnlyDelta(editContainer, oldDelta, newDelta)) {
      return true
    }
    // 2) Structural c-element-level diff — requires the container children still map
    //    1:1 to the old delta.
    if (editContainer.childNodes.length === oldDelta.length) {
      return applyInlineDelta(editContainer, oldDelta, newDelta)
    }
    return false
  }

  private syncElement(target: HTMLElement, source: HTMLElement, replaceChildren = true) {
    if (target.tagName !== source.tagName) {
      return
    }

    syncAttributes(target, source)

    if (replaceChildren) {
      syncChildNodes(target, source)
    }
  }
}

function syncAttributes(target: Element, source: Element) {
  const sourceAttrNames = source.getAttributeNames()
  const sourceAttrSet = new Set(sourceAttrNames)
  target.getAttributeNames().forEach((name) => {
    if (!sourceAttrSet.has(name)) {
      target.removeAttribute(name)
    }
  })
  sourceAttrNames.forEach((name) => {
    const value = source.getAttribute(name)
    if (value === null) return
    if (target.getAttribute(name) !== value) {
      target.setAttribute(name, value)
    }
  })
}

function syncChildNodes(target: Node, source: Node) {
  const sourceChildren = Array.from(source.childNodes)

  for (let index = 0; index < sourceChildren.length; index += 1) {
    const sourceChild = sourceChildren[index]!
    const targetChild = target.childNodes[index]

    if (!targetChild) {
      target.appendChild(sourceChild.cloneNode(true))
      continue
    }

    if (sourceChild.nodeType !== targetChild.nodeType) {
      target.replaceChild(sourceChild.cloneNode(true), targetChild)
      continue
    }

    if (sourceChild.nodeType === Node.TEXT_NODE || sourceChild.nodeType === Node.COMMENT_NODE) {
      if (targetChild.nodeValue !== sourceChild.nodeValue) {
        targetChild.nodeValue = sourceChild.nodeValue
      }
      continue
    }

    if (sourceChild.nodeType === Node.ELEMENT_NODE) {
      const sourceEl = sourceChild as Element
      const targetEl = targetChild as Element
      if (sourceEl.tagName !== targetEl.tagName) {
        target.replaceChild(sourceChild.cloneNode(true), targetChild)
        continue
      }
      syncAttributes(targetEl, sourceEl)
      syncChildNodes(targetEl, sourceEl)
      continue
    }

    target.replaceChild(sourceChild.cloneNode(true), targetChild)
  }

  while (target.childNodes.length > sourceChildren.length) {
    target.removeChild(target.childNodes[target.childNodes.length - 1]!)
  }
}

function snapshotsAreEqual(a: IBlockSnapshot, b: IBlockSnapshot): boolean {
  if (a === b) return true
  if (a.id !== b.id || a.flavour !== b.flavour || a.nodeType !== b.nodeType) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

function propsEqual(a: IBlockSnapshot["props"], b: IBlockSnapshot["props"]): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})
}

function deltaAttributesEqual(
  a?: DeltaInsert["attributes"],
  b?: DeltaInsert["attributes"],
): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})
}

function deltaUnitEqual(a: DeltaInsert, b: DeltaInsert): boolean {
  if (!deltaAttributesEqual(a.attributes, b.attributes)) return false
  if (typeof a.insert === "string" && typeof b.insert === "string") {
    return a.insert === b.insert
  }
  if (typeof a.insert !== "object" || typeof b.insert !== "object") return false
  return JSON.stringify(a.insert) === JSON.stringify(b.insert)
}

function applyInlineDelta(
  container: HTMLElement,
  oldDelta: DeltaInsert[],
  newDelta: DeltaInsert[],
): boolean {
  const commonLen = Math.min(oldDelta.length, newDelta.length)

  for (let i = 0; i < commonLen; i += 1) {
    const oldItem = oldDelta[i]!
    const newItem = newDelta[i]!
    const child = container.childNodes[i]
    if (!child || child.nodeType !== Node.ELEMENT_NODE) {
      return false
    }
    const cElement = child as HTMLElement
    if (cElement.tagName !== "C-ELEMENT") {
      return false
    }

    if (deltaUnitEqual(oldItem, newItem)) {
      continue
    }

    if (
      typeof oldItem.insert === "string" &&
      typeof newItem.insert === "string" &&
      deltaAttributesEqual(oldItem.attributes, newItem.attributes)
    ) {
      // Same attribute run, only text changed → surgical CharacterData ops.
      if (!patchTextInCElement(cElement, oldItem.insert, newItem.insert)) {
        return false
      }
      continue
    }

    // Attributes, embed type or text-vs-embed changed → replace just this c-element.
    const replacement = renderInline([newItem]).firstElementChild as HTMLElement | null
    if (!replacement) {
      return false
    }
    container.replaceChild(replacement, cElement)
  }

  if (newDelta.length > oldDelta.length) {
    const extras = renderInline(newDelta.slice(oldDelta.length))
    container.appendChild(extras)
  } else if (oldDelta.length > newDelta.length) {
    while (container.childNodes.length > newDelta.length) {
      container.removeChild(container.lastChild!)
    }
  }

  return true
}

function patchTextInCElement(cElement: HTMLElement, oldText: string, newText: string): boolean {
  if (oldText === newText) return true
  const textNode = findFirstTextNode(cElement)
  if (!textNode) {
    cElement.textContent = newText
    return true
  }

  const minLen = Math.min(oldText.length, newText.length)
  let prefix = 0
  while (prefix < minLen && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < minLen - prefix &&
    oldText.charCodeAt(oldText.length - 1 - suffix) === newText.charCodeAt(newText.length - 1 - suffix)
  ) {
    suffix += 1
  }

  const deleteCount = oldText.length - prefix - suffix
  const insertText = newText.slice(prefix, newText.length - suffix)

  // Bail out if the text node content got out of sync somehow (e.g. modified by enhancements).
  if (textNode.data !== oldText) {
    textNode.data = newText
    return true
  }

  if (deleteCount > 0) {
    textNode.deleteData(prefix, deleteCount)
  }
  if (insertText.length > 0) {
    textNode.insertData(prefix, insertText)
  }
  return true
}

function findFirstTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const found = findFirstTextNode(node.childNodes[i]!)
    if (found) return found
  }
  return null
}

function findLastTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text
  for (let i = node.childNodes.length - 1; i >= 0; i -= 1) {
    const found = findLastTextNode(node.childNodes[i]!)
    if (found) return found
  }
  return null
}

function tryAppendOnlyDelta(
  container: HTMLElement,
  oldDelta: DeltaInsert[],
  newDelta: DeltaInsert[],
): boolean {
  // Only handle pure-text deltas; embeds change structure and need real diffing.
  for (const item of oldDelta) {
    if (typeof item.insert !== "string") return false
  }
  for (const item of newDelta) {
    if (typeof item.insert !== "string") return false
  }

  // All leading items must match exactly (same text, same attrs).
  if (newDelta.length < oldDelta.length) return false
  const leading = oldDelta.length - 1
  for (let i = 0; i < leading; i += 1) {
    if (!deltaUnitEqual(oldDelta[i]!, newDelta[i]!)) return false
  }

  // The last old delta item must be a text prefix of the corresponding new item,
  // with identical attributes. Items beyond old.length are appended as new c-elements.
  let tailOldText = ""
  let tailNewText = ""
  if (oldDelta.length > 0) {
    const oldLast = oldDelta[oldDelta.length - 1]!
    const newAtLast = newDelta[oldDelta.length - 1]!
    if (!deltaAttributesEqual(oldLast.attributes, newAtLast.attributes)) return false
    const oldText = oldLast.insert as string
    const newText = newAtLast.insert as string
    if (!newText.startsWith(oldText)) return false
    tailOldText = oldText
    tailNewText = newText
  }

  // Compute append tail to the existing last text node (if any).
  const extraInLastItem = tailNewText.slice(tailOldText.length)
  if (extraInLastItem.length > 0) {
    const lastText = findLastTextNode(container)
    if (!lastText) return false
    lastText.appendData(extraInLastItem)
  }

  // Append entirely new delta items as fresh c-elements.
  if (newDelta.length > oldDelta.length) {
    const extras = renderInline(newDelta.slice(oldDelta.length))
    container.appendChild(extras)
  }

  return true
}
