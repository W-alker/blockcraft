import {IBlockSnapshot} from "../framework/block-std/types/block.type";
import {InlineModel} from "../framework/block-std/types/inline.type";
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

    if (next.nodeType === "editable" || next.nodeType === "void") {
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

  private syncElement(target: HTMLElement, source: HTMLElement, replaceChildren = true) {
    if (target.tagName !== source.tagName) {
      return
    }

    Array.from(target.getAttributeNames()).forEach((name) => target.removeAttribute(name))
    Array.from(source.getAttributeNames()).forEach((name) => {
      const value = source.getAttribute(name)
      if (value !== null) {
        target.setAttribute(name, value)
      }
    })
    target.className = source.className
    target.style.cssText = source.style.cssText

    if (replaceChildren) {
      target.replaceChildren(...Array.from(source.childNodes).map((node) => node.cloneNode(true)))
    }
  }
}
