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

export function resolveChildContainer(
  element: HTMLElement | null | undefined,
  snapshot: IBlockSnapshot,
): HTMLElement | null {
  // Editable mounts recurse over inline deltas without elements (see
  // createMountedNode's childElements indexing) — tolerate the missing element
  // for every branch, not just unknown flavours.
  if (!element) {
    return null
  }
  // Editable and void blocks never host child blocks: skip both the flavour
  // switch and the marker scan. This is load-bearing for cost, not just
  // clarity — a highlighted code block alone mounts thousands of <c-element>s
  // that a subtree query would walk for nothing.
  const nodeType = `${snapshot.nodeType}`
  if (nodeType === "editable" || nodeType === "void") {
    return null
  }
  // The builtin selector is tried first (cheap, exact); the marker is the
  // fallback — which also serves custom renderers that OVERRIDE a builtin
  // container flavour, whose DOM won't match the builtin selector. Builtin
  // hits pass the same ownership check: an overriding renderer without its own
  // `.callout-content` must not adopt one from a nested real callout child.
  const builtin = resolveBuiltinChildContainer(element, snapshot)
  if (builtin && (builtin === element || builtin.closest("[data-block-id]") === element)) {
    return builtin
  }
  return resolveMarkedChildContainer(element)
}

function resolveBuiltinChildContainer(element: HTMLElement, snapshot: IBlockSnapshot): HTMLElement | null {
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
    case "object-group":
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

/**
 * Container-style custom renderers (options.blockRenderers) mark their child
 * host with `data-bc-snapshot-children`. The marked container must hold ONLY
 * child-block elements — patching reconciles its children positionally, so a
 * decorative node inside it would be trimmed on the first update.
 *
 * A subtree hit can also belong to a NESTED block (a wrapper renderer without
 * its own marker around a marked container child) — adopting it would splice
 * this block's children into the descendant's DOM. Ownership is checked by the
 * candidate's nearest block root: only a marker whose closest `[data-block-id]`
 * ancestor is this element itself counts.
 */
function resolveMarkedChildContainer(element: HTMLElement): HTMLElement | null {
  if (element.matches("[data-bc-snapshot-children]")) {
    return element
  }
  const marked = element.querySelector<HTMLElement>("[data-bc-snapshot-children]")
  if (!marked) {
    return null
  }
  return marked.closest("[data-block-id]") === element ? marked : null
}
