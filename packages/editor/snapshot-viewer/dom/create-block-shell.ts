import {BlockNodeType, IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {resolveBlockSurface} from "../../framework/block-std/block/block-surface";
import {
  normalizeParagraphFontScale,
  normalizeParagraphSpacing,
  normalizeTypographyLineHeight,
  paragraphPointsToCss,
  resolveEditableBlockFontScale,
} from "../../framework/block-std/typography";

export function createBlockShell(snapshot: IBlockSnapshot): HTMLElement {
  const element = document.createElement(getTagName(snapshot))
  element.dataset["blockId"] = snapshot.id
  element.dataset["nodeType"] = `${snapshot.nodeType}`
  element.classList.add("bc-snapshot-block")
  element.classList.add(toBlockClassName(snapshot.flavour))
  element.classList.add(`bc-flavour-${toClassToken(snapshot.flavour)}`)

  if (snapshot.nodeType === BlockNodeType.root) {
    element.setAttribute("data-blockcraft-root", "true")
    // The snapshot tree is display-only. Keep the same root marker/class used
    // by the live editor so the shared theme applies, while also preventing
    // the browser from treating the rendered tree as an editable surface.
    element.setAttribute("contenteditable", "false")
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
      snapshot.flavour,
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
  flavour: string,
) {
  const fontScale = normalizeParagraphFontScale(props["pfs"])
  if (fontScale !== null) {
    element.style.setProperty("--bc-block-fs-scale", `${fontScale}`)
    element.style.fontSize = `${resolveEditableBlockFontScale(props, flavour) * 100}%`
  }

  const lineHeight = normalizeTypographyLineHeight(props["lh"])
  if (lineHeight !== null) {
    element.setAttribute("data-bc-block-lh", "")
    element.style.setProperty("--bc-block-lh", `${lineHeight}`)
  }

  const spaceBefore = normalizeParagraphSpacing(props["psb"])
  if (spaceBefore !== null) {
    element.style.setProperty("--bc-block-sb", paragraphPointsToCss(spaceBefore))
  }

  const spaceAfter = normalizeParagraphSpacing(props["psa"])
  if (spaceAfter !== null) {
    element.style.setProperty("--bc-block-sa", paragraphPointsToCss(spaceAfter))
  }

}

/**
 * Projects the same one-gap rule as the live BaseBlockComponent: the physical
 * gap belongs to the preceding sibling and is max(previous after, next before).
 */
export function projectParagraphSiblingSpacing(
  snapshots: readonly IBlockSnapshot[],
  elements: readonly HTMLElement[],
): void {
  elements.forEach((element, index) => {
    element.style.removeProperty("--bc-next-block-sb")
    element.style.removeProperty("--bc-block-leading-sb")

    const snapshot = snapshots[index]
    if (!snapshot) return
    if (index === 0 && snapshot.nodeType === BlockNodeType.editable) {
      const before = normalizeParagraphSpacing(snapshot.props["psb"])
      if (before !== null) {
        element.style.setProperty(
          "--bc-block-leading-sb",
          paragraphPointsToCss(before),
        )
      }
    }

    const next = snapshots[index + 1]
    if (next?.nodeType !== BlockNodeType.editable) return
    const nextBefore = normalizeParagraphSpacing(next.props["psb"])
    if (nextBefore !== null) {
      element.style.setProperty(
        "--bc-next-block-sb",
        paragraphPointsToCss(nextBefore),
      )
    }
  })
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
