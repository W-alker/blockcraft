import {IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {MountedSnapshotNode, SnapshotRenderContext} from "../types";

export function patchChildren(options: {
  parent: HTMLElement
  currentChildren: MountedSnapshotNode[]
  nextSnapshots: IBlockSnapshot[]
  renderContext: SnapshotRenderContext
  patchNode: (current: MountedSnapshotNode, next: IBlockSnapshot, renderContext: SnapshotRenderContext) => MountedSnapshotNode
  mountNode: (snapshot: IBlockSnapshot, renderContext: SnapshotRenderContext) => MountedSnapshotNode
}): MountedSnapshotNode[] {
  const {parent, currentChildren, nextSnapshots, renderContext} = options

  const currentById = new Map<string, MountedSnapshotNode>()
  currentChildren.forEach((child) => currentById.set(child.snapshot.id, child))

  const usedIds = new Set<string>()
  const nextChildren: MountedSnapshotNode[] = nextSnapshots.map((snapshot) => {
    const current = currentById.get(snapshot.id)
    if (current) {
      usedIds.add(snapshot.id)
      return options.patchNode(current, snapshot, renderContext)
    }
    return options.mountNode(snapshot, renderContext)
  })

  // 1. Detach mounted children that are no longer in the next list.
  currentChildren.forEach((child) => {
    if (!usedIds.has(child.snapshot.id) && child.element.parentNode === parent) {
      parent.removeChild(child.element)
    }
  })

  // 2. Reconcile element order in-place: only move/insert what's out of position.
  for (let i = 0; i < nextChildren.length; i += 1) {
    const targetEl = nextChildren[i]!.element
    const currentAtIndex = parent.childNodes[i] ?? null
    if (currentAtIndex !== targetEl) {
      parent.insertBefore(targetEl, currentAtIndex)
    }
  }

  // 3. Trim any unexpected trailing nodes (defensive; should already be empty).
  while (parent.childNodes.length > nextChildren.length) {
    parent.removeChild(parent.childNodes[parent.childNodes.length - 1]!)
  }

  return nextChildren
}

export function resolveChildContainer(element: HTMLElement, snapshot: IBlockSnapshot): HTMLElement | null {
  switch (`${snapshot.flavour}`) {
    case "root":
    case "frame":
    case "table-row":
      return element
    case "callout":
      return element.querySelector(".callout-content")
    case "render-unit":
      return element.querySelector(".render-unit-content")
    case "placement-layout":
      return element.querySelector(".children-render-container")
    case "text-box":
      return element.querySelector(".text-box-block__content")
    case "columns":
      return element.querySelector(".columns-layout")
    case "column":
      return element.querySelector(".column-content")
    case "table":
      return element.querySelector("tbody.children-render-container")
    case "table-cell":
      return element.querySelector(".table-cell__children-wrapper")
    case "image":
      return element.querySelector(".children-render-container")
    case "mermaid":
      return element.querySelector(".text-container")
    default:
      return null
  }
}
