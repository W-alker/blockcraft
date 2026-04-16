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
  const currentById = new Map(options.currentChildren.map((child) => [child.snapshot.id, child]))
  const nextChildren = options.nextSnapshots.map((snapshot) => {
    const current = currentById.get(snapshot.id)
    if (current) {
      return options.patchNode(current, snapshot, options.renderContext)
    }

    return options.mountNode(snapshot, options.renderContext)
  })

  options.parent.replaceChildren(...nextChildren.map((child) => child.element))
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
