import {BlockNodeType, IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {resolveBlockSurface} from "../../framework/block-std/block/block-surface";
import {normalizeTypographyLineHeight} from "../../framework/block-std/typography";

export function createBlockShell(snapshot: IBlockSnapshot): HTMLElement {
  const element = document.createElement(getTagName(snapshot))
  element.dataset["blockId"] = snapshot.id
  element.dataset["nodeType"] = `${snapshot.nodeType}`
  element.classList.add("bc-snapshot-block")
  element.classList.add(toBlockClassName(snapshot.flavour))
  element.classList.add(`bc-flavour-${toClassToken(snapshot.flavour)}`)

  if (snapshot.nodeType === BlockNodeType.root) {
    element.setAttribute("data-blockcraft-root", "true")
    element.classList.add("readonly")
  }

  if (snapshot.nodeType !== BlockNodeType.root) {
    applyBlockAppearance(
      element,
      snapshot.nodeType,
      snapshot.props as Record<string, unknown>,
    )
  }

  if (snapshot.nodeType === BlockNodeType.editable) {
    applyEditableTypography(
      element,
      snapshot.props as Record<string, unknown>,
    )
  }

  if (snapshot.flavour === "render-unit") {
    element.setAttribute("data-bc-render-unit", "true")
    applyRenderUnitAppearance(
      element,
      snapshot.props as Record<string, unknown>,
    )
  }

  return element
}

function applyEditableTypography(
  element: HTMLElement,
  props: Record<string, unknown>,
) {
  const lineHeight = normalizeTypographyLineHeight(props["lh"])
  if (lineHeight !== null) {
    element.setAttribute("data-bc-block-lh", "")
    element.style.setProperty("--bc-block-lh", `${lineHeight}`)
  }

}

function applyRenderUnitAppearance(
  element: HTMLElement,
  props: Record<string, unknown>,
) {
  const {padding} = resolveBlockSurface(props)
  element.style.setProperty("--bc-render-unit-padding-top", `${padding.top}px`)
  element.style.setProperty("--bc-render-unit-padding-right", `${padding.right}px`)
  element.style.setProperty("--bc-render-unit-padding-bottom", `${padding.bottom}px`)
  element.style.setProperty("--bc-render-unit-padding-left", `${padding.left}px`)

  const backColor = normalizeAppearanceColor(props["backColor"])
  if (backColor) {
    element.style.setProperty("--bc-render-unit-background-color", backColor)
  }

  const borderColor = normalizeAppearanceColor(props["borderColor"])
  if (borderColor) {
    element.style.setProperty("--bc-render-unit-border-color", borderColor)
  }
}

function applyBlockAppearance(
  element: HTMLElement,
  nodeType: BlockNodeType,
  props: Record<string, unknown>,
) {
  const backColor = nodeType === BlockNodeType.editable
    ? normalizeAppearanceColor(props["backColor"])
    : null
  if (backColor) {
    element.setAttribute("data-bc-block-background", "")
    element.style.setProperty("--bc-block-background-color", backColor)
  }

  const borderColor = nodeType === BlockNodeType.editable
    ? normalizeAppearanceColor(props["borderColor"])
    : null
  if (borderColor) {
    element.setAttribute("data-bc-block-border", "")
    element.style.setProperty("--bc-block-border-color", borderColor)
  }
}

function normalizeAppearanceColor(value: unknown): string | null {
  if (typeof value !== "string") return null
  const color = value.trim()
  return color && color.toLowerCase() !== "transparent" ? color : null
}

function getTagName(snapshot: IBlockSnapshot): string {
  switch (snapshot.flavour) {
    case "paragraph":
      return "p"
    case "blockquote":
      return "blockquote"
    case "caption":
      return "figcaption"
    case "table-row":
      return "tr"
    case "table-cell":
      return "td"
    default:
      return "div"
  }
}

function toBlockClassName(flavour: string): string {
  if (flavour === "mermaid-textarea") {
    return "mermaid-textarea"
  }
  return `${toClassToken(flavour)}-block`
}

function toClassToken(flavour: string): string {
  return `${flavour}`.replace(/[^a-zA-Z0-9-_]/g, "-")
}
