import {IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {
  normalizeDocumentFontSize,
  normalizeTypographyLineHeight,
  resolveTypographyFontFamily,
} from "../../framework/block-std/typography";
import {
  blockSurfaceImageFitToObjectFit,
  resolveBlockSurface,
} from "../../framework/block-std/block/block-surface";
import {
  normalizeTextBoxProps,
  normalizeTextBoxWordArtStyle,
  type TextBoxBlockProps,
} from "../../blocks/text-box-block";
import {getShapeDefinition} from "../../blocks/shape-block/shape-definitions";
import {resolveDividerPresentation} from "../../blocks/divider-block/divider-presentation";
import type {DividerBlockModel} from "../../blocks/divider-block";
import {
  getTextBoxArtwork,
  resolveTextBoxArtworkSrc,
} from "../../blocks/text-box-block";
import {resolveWordArtPresentation} from "../../blocks/word-art-block";
import {
  BLOCK_OBJECT_GROUP_PADDING,
  normalizeBlockObjectGroupProps,
} from "../../framework";
import {createBlockShell} from "../dom/create-block-shell";
import {SnapshotBlockRenderer, SnapshotRenderContext} from "../types";

const STRUCTURAL_FLAVOURS = new Set([
  "root",
  "placement-layout",
  "object-group",
  "render-unit",
  "text-box",
  "callout",
  "divider",
  "columns",
  "column",
  "frame",
  "table",
  "table-row",
  "table-cell",
]);

export function createStructuralRenderers(): SnapshotBlockRenderer[] {
  return [{
    canRender: (snapshot) => STRUCTURAL_FLAVOURS.has(snapshot.flavour),
    render(ctx, snapshot) {
      switch (`${snapshot.flavour}`) {
        case "render-unit":
          return renderRenderUnit(snapshot, ctx)
        case "text-box":
          return renderTextBox(snapshot, ctx)
        case "callout":
          return renderCallout(snapshot, ctx)
        case "divider":
          return renderDivider(snapshot)
        case "columns":
          return renderColumns(snapshot, ctx)
        case "column":
          return renderColumn(snapshot, ctx)
        case "frame":
          return renderFrame(snapshot, ctx)
        case "table":
          return renderTable(snapshot, ctx)
        case "table-row":
          return renderTableRow(snapshot, ctx)
        case "table-cell":
          return renderTableCell(snapshot, ctx)
        case "placement-layout":
          return renderPlacementLayout(snapshot, ctx)
        case "object-group":
          return renderObjectGroup(snapshot, ctx)
        case "root":
        default:
          return renderRoot(snapshot, ctx)
      }
    },
  }]
}

function renderPlacementLayout(
  snapshot: IBlockSnapshot,
  ctx: SnapshotRenderContext,
) {
  const element = createBlockShell(snapshot)
  element.setAttribute("data-bc-placement-layer-bridge", "")
  element.setAttribute("data-bc-placement-layout", "")
  Object.assign(element.style, {
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    width: "auto",
    height: "0",
    boxSizing: "border-box",
    padding: "inherit",
    margin: "0",
    pointerEvents: "none",
    overflow: "visible",
  })
  const content = document.createElement("div")
  content.classList.add("children-render-container")
  content.setAttribute("data-bc-placement-container", "")
  content.style.position = "relative"
  content.style.boxSizing = "border-box"
  content.style.width = "100%"
  content.style.height = "0"
  content.style.isolation = "auto"
  content.style.pointerEvents = "none"
  appendChildren(content, ctx, snapshot.children)
  element.append(content)
  projectAbsolutePlaneChildren(element, snapshot)
  return {element}
}

function renderObjectGroup(
  snapshot: IBlockSnapshot,
  ctx: SnapshotRenderContext,
) {
  const element = createBlockShell(snapshot)
  const props = normalizeBlockObjectGroupProps(snapshot.props)
  element.setAttribute("data-bc-object-group", "")
  Object.assign(element.style, {
    width: `${props.width}px`,
    height: `${props.height}px`,
    boxSizing: "border-box",
    padding: `${BLOCK_OBJECT_GROUP_PADDING}px`,
    overflow: "visible",
  })
  element.style.setProperty(
    "--bc-object-group-padding",
    `${BLOCK_OBJECT_GROUP_PADDING}px`,
  )
  const content = document.createElement("div")
  content.classList.add(
    "object-group-block__children",
    "children-render-container",
  )
  content.setAttribute("data-bc-placement-container", "")
  Object.assign(content.style, {
    position: "relative",
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    isolation: "isolate",
    overflow: "visible",
  })
  appendChildren(content, ctx, snapshot.children)
  element.append(content)
  projectAbsolutePlaneChildren(element, snapshot)
  return {element}
}

/** Reapply model placement after structural snapshot children are patched. */
export function projectAbsolutePlaneChildren(
  element: HTMLElement,
  snapshot: IBlockSnapshot,
): void {
  if (snapshot.flavour !== "placement-layout" && snapshot.flavour !== "object-group") {
    return
  }
  const content = element.querySelector<HTMLElement>(
    ":scope > .children-render-container",
  )
  if (!content) return
  const snapshots = Array.isArray(snapshot.children)
    ? snapshot.children as IBlockSnapshot[]
    : []
  for (const [index, child] of Array.from(content.children).entries()) {
    if (!(child instanceof HTMLElement)) continue
    const props = snapshots[index]?.props as Record<string, unknown> | undefined
    const position = props?.["position"]
    const state = position && typeof position === "object"
      ? position as Record<string, unknown>
      : {}
    const x = Number(state["x"] ?? 0)
    const y = Number(state["y"] ?? 0)
    const layer = snapshot.flavour === "placement-layout" &&
      props?.["placementLayer"] === "under"
      ? "under"
      : "over"
    child.dataset["bcPlacement"] = "absolute"
    child.dataset["bcPlacementLayer"] = layer
    child.style.position = "absolute"
    child.style.left = `${Number.isFinite(x) ? x : 0}px`
    child.style.top = `${Number.isFinite(y) ? y : 0}px`
    child.style.zIndex = layer === "under" ? "0" : "2"
    child.style.margin = "0"
    child.style.pointerEvents = "auto"
  }
}

function renderRoot(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const props = snapshot.props as Record<string, unknown>
  const fontFamily = resolveTypographyFontFamily(props["ff"])
  const fontSize = normalizeDocumentFontSize(props["fs"])
  const lineHeight = normalizeTypographyLineHeight(props["lh"])
  if (fontFamily) {
    element.dataset["bcFf"] = `${props["ff"]}`
    element.style.fontFamily = fontFamily
  }
  if (fontSize !== null) {
    element.dataset["bcFs"] = `${fontSize}`
    element.style.setProperty("--bc-fs", `${fontSize}px`)
  }
  if (lineHeight !== null) {
    element.dataset["bcLh"] = `${lineHeight}`
    element.style.setProperty("--bc-lh", `${lineHeight}`)
  }
  // Document text color — same pair RootBlockComponent binds ('[style.color]' +
  // '[style.--bc-color]'). Document background stays a host concern in both
  // surfaces: the editor root does not bind it either.
  if (typeof props["color"] === "string" && props["color"]) {
    element.style.color = `${props["color"]}`
    element.style.setProperty("--bc-color", `${props["color"]}`)
  }
  appendChildren(element, ctx, snapshot.children)
  return {element}
}

function renderRenderUnit(
  snapshot: IBlockSnapshot,
  ctx: SnapshotRenderContext,
) {
  const element = createBlockShell(snapshot)
  const {backgroundImage} = resolveBlockSurface(
    snapshot.props as Record<string, unknown>,
  )

  if (backgroundImage && ctx.options.resourcePolicy !== "off") {
    element.append(createSurfaceBackgroundImage(
      "render-unit-background-image",
      backgroundImage,
      ctx,
    ))
  }

  const content = document.createElement("div")
  content.classList.add("children-render-container", "render-unit-content")
  appendChildren(content, ctx, snapshot.children)
  element.append(content)
  return {element}
}

function renderTextBox(
  snapshot: IBlockSnapshot,
  ctx: SnapshotRenderContext,
) {
  const element = createBlockShell(snapshot)
  const props = normalizeTextBoxProps(
    snapshot.props as Partial<TextBoxBlockProps>,
  )
  const {padding, backgroundImage} = resolveBlockSurface(props)
  element.setAttribute("data-bc-text-box", "true")
  element.setAttribute("data-bc-text-box-wm", props.wm)
  // Same variable name as the live Block so one theme rule drives both paths.
  // Horizontal frames leave it unset and fall back to `horizontal-tb`.
  if (props.wm === "v") {
    element.style.setProperty("--bc-text-box-writing-mode", "vertical-rl")
  }
  element.style.setProperty(
    "--bc-text-box-background-color",
    props.backColor ?? "transparent",
  )
  element.style.setProperty(
    "--bc-text-box-border-color",
    props.borderColor ?? "transparent",
  )
  element.style.setProperty("--bc-text-box-padding-top", `${padding.top}px`)
  element.style.setProperty("--bc-text-box-padding-right", `${padding.right}px`)
  element.style.setProperty("--bc-text-box-padding-bottom", `${padding.bottom}px`)
  element.style.setProperty("--bc-text-box-padding-left", `${padding.left}px`)
  const definition = getShapeDefinition(props.sh)
  // Same precedence as the live Block: a catalog drawing carries its own
  // text-safe frame, a plain rectangle has none, otherwise the shape's.
  const artwork = getTextBoxArtwork(props.bgi)
  const shapeInsets = artwork
    ? artwork.textInsets
    : props.sh === "rectangle"
      ? {top: 0, right: 0, bottom: 0, left: 0}
      : definition.textInsets
  element.style.setProperty(
    "--bc-text-box-shape-inset-top",
    `${shapeInsets.top * 100}%`,
  )
  element.style.setProperty(
    "--bc-text-box-shape-inset-right",
    `${shapeInsets.right * 100}%`,
  )
  element.style.setProperty(
    "--bc-text-box-shape-inset-bottom",
    `${shapeInsets.bottom * 100}%`,
  )
  element.style.setProperty(
    "--bc-text-box-shape-inset-left",
    `${shapeInsets.left * 100}%`,
  )

  const surface = document.createElement("div")
  surface.classList.add("text-box-block__surface")
  surface.setAttribute("data-bc-print-visual-surface", "")
  surface.style.width = `${props.width}px`
  surface.style.height = `${props.height}px`
  surface.style.transform = props.rotation === 0
    ? ""
    : `rotate(${props.rotation}deg)`
  const clipPathId = `bc-text-box-clip-${snapshot.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`
  surface.append(createTextBoxFillGeometry(definition, props, clipPathId))

  // `bgi` is a reference; the drawing itself never travels in the snapshot.
  const paintedSrc = backgroundImage
    ? resolveTextBoxArtworkSrc(backgroundImage.src)
    : null
  if (backgroundImage && paintedSrc && ctx.options.resourcePolicy !== "off") {
    const image = createSurfaceBackgroundImage(
      "text-box-block__background-image",
      {...backgroundImage, src: paintedSrc},
      ctx,
    )
    image.style.clipPath = `url(#${clipPathId})`
    image.style.setProperty("-webkit-clip-path", `url(#${clipPathId})`)
    surface.append(image)
  }

  const content = document.createElement("div")
  content.classList.add("children-render-container", "text-box-block__content")
  if (props.wa) {
    const wordArt = resolveWordArtPresentation(
      normalizeTextBoxWordArtStyle(props.wa),
    )
    content.classList.add("text-box-block__content--word-art")
    element.style.setProperty(
      "--bc-text-box-word-art-font-family",
      wordArt.fontFamily,
    )
    element.style.setProperty(
      "--bc-text-box-word-art-font-size",
      `${wordArt.props.fontSize}px`,
    )
    element.style.setProperty(
      "--bc-text-box-word-art-font-weight",
      `${wordArt.props.fontWeight}`,
    )
    element.style.setProperty(
      "--bc-text-box-word-art-font-style",
      wordArt.props.fontStyle,
    )
    element.style.setProperty(
      "--bc-text-box-word-art-letter-spacing",
      `${wordArt.props.letterSpacingEm}em`,
    )
    element.style.setProperty(
      "--bc-text-box-word-art-line-height",
      `${wordArt.props.lineHeight}`,
    )
    element.style.setProperty(
      "--bc-text-box-word-art-align",
      wordArt.props.horizontalAlign,
    )
    element.style.setProperty(
      "--bc-text-box-word-art-vertical",
      wordArt.props.verticalAlign === "top"
        ? "flex-start"
        : wordArt.props.verticalAlign === "bottom"
          ? "flex-end"
          : "center",
    )
    element.style.setProperty("--bc-text-box-word-art-color", wordArt.textColor)
    element.style.setProperty(
      "--bc-text-box-word-art-background",
      wordArt.backgroundImage,
    )
    element.style.setProperty("--bc-text-box-word-art-stroke", wordArt.textStroke)
    element.style.setProperty("--bc-text-box-word-art-shadow", wordArt.textShadow)
    element.style.setProperty(
      "--bc-text-box-word-art-transform",
      wordArt.effectTransform || "none",
    )
  }
  appendChildren(content, ctx, snapshot.children)
  surface.append(content, createTextBoxOutlineGeometry(definition, props))
  element.append(surface)
  return {element}
}

const SVG_NS = "http://www.w3.org/2000/svg"

function createTextBoxFillGeometry(
  definition: ReturnType<typeof getShapeDefinition>,
  props: ReturnType<typeof normalizeTextBoxProps>,
  clipPathId: string,
): SVGSVGElement {
  const svg = textBoxSvg("text-box-block__geometry--fill")
  const defs = document.createElementNS(SVG_NS, "defs")
  const clipPath = document.createElementNS(SVG_NS, "clipPath")
  clipPath.id = clipPathId
  clipPath.setAttribute("clipPathUnits", "objectBoundingBox")
  const clipShape = document.createElementNS(SVG_NS, "path")
  clipShape.setAttribute("d", definition.path)
  clipShape.setAttribute("transform", "scale(.001)")
  clipPath.append(clipShape)
  defs.append(clipPath)
  const fill = document.createElementNS(SVG_NS, "path")
  fill.setAttribute("d", definition.path)
  fill.setAttribute("fill", props.backColor)
  fill.setAttribute("fill-opacity", `${props.fo}`)
  if (definition.fillRule) fill.setAttribute("fill-rule", definition.fillRule)
  svg.append(defs, fill)
  return svg
}

function createTextBoxOutlineGeometry(
  definition: ReturnType<typeof getShapeDefinition>,
  props: ReturnType<typeof normalizeTextBoxProps>,
): SVGSVGElement {
  const svg = textBoxSvg("text-box-block__geometry--outline")
  for (const pathValue of [definition.path, definition.detailPath]) {
    if (!pathValue) continue
    const path = document.createElementNS(SVG_NS, "path")
    path.setAttribute("d", pathValue)
    path.setAttribute("fill", "none")
    path.setAttribute("stroke", props.borderColor)
    path.setAttribute("stroke-width", `${props.bw}`)
    path.setAttribute("vector-effect", "non-scaling-stroke")
    if (props.bs === "dashed") path.setAttribute("stroke-dasharray", "10 8")
    svg.append(path)
  }
  return svg
}

function textBoxSvg(modifier: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg")
  svg.classList.add("text-box-block__geometry", modifier)
  svg.setAttribute("viewBox", "0 0 1000 1000")
  svg.setAttribute("preserveAspectRatio", "none")
  svg.setAttribute("aria-hidden", "true")
  return svg
}

function renderCallout(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const props = snapshot.props as Record<string, unknown>
  if (props["backColor"]) {
    element.style.setProperty(
      "--bc-callout-background-color",
      `${props["backColor"]}`,
    )
  }
  if (props["color"]) {
    element.style.color = `${props["color"]}`
  }
  if (props["borderColor"]) {
    element.style.borderColor = `${props["borderColor"]}`
  }

  const prefix = document.createElement("span")
  prefix.classList.add("callout-block-prefix")
  prefix.setAttribute("contenteditable", "false")
  prefix.textContent = `${props["prefix"] ?? ""}`

  const content = document.createElement("div")
  content.classList.add("callout-content")
  appendChildren(content, ctx, snapshot.children)

  element.append(prefix, content)
  return {element}
}

function renderDivider(snapshot: IBlockSnapshot) {
  const element = createBlockShell(snapshot)
  const props = snapshot.props as DividerBlockModel["props"]
  // Same resolver as DividerBlockComponent (length/thickness with the deprecated
  // `size` fallback, opacity/label clamps) and the same DOM contract: the theme's
  // divider rules key off `.divider-block > .bc-block-content` and the
  // data-length / data-thickness / data-align attributes.
  const view = resolveDividerPresentation(props)

  const content = document.createElement("div")
  content.classList.add("bc-block-content")
  if (props.lineColor) {
    content.style.setProperty("--bc-divider-line-color", `${props.lineColor}`)
  }

  const applyLineAttrs = (line: HTMLElement, withAlign: boolean) => {
    line.dataset["length"] = view.length
    line.dataset["thickness"] = view.thickness
    if (withAlign) {
      line.dataset["align"] = view.align
    }
    if (view.opacity !== 1) {
      line.style.opacity = `${view.opacity}`
    }
  }
  const createLabel = () => {
    const label = document.createElement("span")
    label.classList.add("divide-label")
    if (props.color) {
      label.style.color = `${props.color}`
    }
    label.style.fontSize = `${view.label.fontSize}px`
    label.style.fontWeight = view.label.fontWeight
    label.style.fontStyle = view.label.fontStyle
    label.style.letterSpacing = `${view.label.letterSpacing}px`
    label.textContent = view.text
    return label
  }

  if (view.text && view.isTape) {
    const line = document.createElement("div")
    line.classList.add("divide-line", "divide-tape", view.style)
    applyLineAttrs(line, true)
    line.append(createLabel())
    content.append(line)
  } else if (view.text) {
    const line = document.createElement("div")
    line.classList.add("divide-line-text")
    applyLineAttrs(line, true)
    const leadingSegment = document.createElement("span")
    leadingSegment.classList.add("divide-seg", view.style)
    const trailingSegment = document.createElement("span")
    trailingSegment.classList.add("divide-seg", view.style)
    line.append(leadingSegment, createLabel(), trailingSegment)
    content.append(line)
  } else {
    const line = document.createElement("div")
    line.classList.add("divide-line", view.style)
    applyLineAttrs(line, false)
    content.append(line)
  }

  element.append(content)
  return {element}
}

function renderColumns(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const wrapper = document.createElement("div")
  wrapper.classList.add("columns-wrapper")

  const layout = document.createElement("div")
  layout.classList.add("children-render-container", "columns-layout")

  const widths = Array.isArray((snapshot.props as Record<string, unknown>)["columnWidths"])
    ? ((snapshot.props as Record<string, unknown>)["columnWidths"] as number[])
    : []
  widths.forEach((width, index) => {
    wrapper.style.setProperty(`--column-width-${index}`, `${width}%`)
  })

  appendChildren(layout, ctx, snapshot.children)
  wrapper.append(layout)
  element.append(wrapper)
  return {element}
}

function renderColumn(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const content = document.createElement("div")
  content.classList.add("children-render-container", "column-content")
  appendChildren(content, ctx, snapshot.children)
  element.append(content)
  return {element}
}

function renderFrame(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const deep = Number((snapshot.props as Record<string, unknown>)["deep"] ?? 0)
  if (deep > 0) {
    element.style.marginLeft = `${deep * 2}em`
  }
  appendChildren(element, ctx, snapshot.children)
  return {element}
}

function renderTable(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const scrollable = document.createElement("div")
  scrollable.classList.add("table-scrollable", "bc-scrollable-container")

  const wrapper = document.createElement("div")
  wrapper.classList.add("table-wrapper")

  const table = document.createElement("table")
  const colgroup = document.createElement("colgroup")
  const widths = Array.isArray((snapshot.props as Record<string, unknown>)["colWidths"])
    ? ((snapshot.props as Record<string, unknown>)["colWidths"] as number[])
    : []
  widths.forEach((width) => {
    const col = document.createElement("col")
    col.setAttribute("width", `${width}`)
    colgroup.append(col)
  })

  const tbody = document.createElement("tbody")
  tbody.classList.add("children-render-container")
  appendChildren(tbody, ctx, snapshot.children)

  table.append(colgroup, tbody)
  wrapper.append(table)
  scrollable.append(wrapper)
  element.append(scrollable)
  return {element}
}

function renderTableRow(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  appendChildren(element, ctx, snapshot.children)
  return {element}
}

function renderTableCell(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const props = snapshot.props as Record<string, unknown>
  if (props["verticalAlign"]) {
    element.style.verticalAlign = `${props["verticalAlign"]}`
  }
  if (props["color"]) {
    element.style.color = `${props["color"]}`
  }
  if (props["backColor"]) {
    element.style.backgroundColor = `${props["backColor"]}`
  }
  if (props["display"]) {
    element.style.display = `${props["display"]}`
  }
  if (props["rowspan"]) {
    element.setAttribute("rowspan", `${props["rowspan"]}`)
  }
  if (props["colspan"]) {
    element.setAttribute("colspan", `${props["colspan"]}`)
  }

  const content = document.createElement("div")
  content.classList.add("table-cell__children-wrapper", "children-render-container")
  if (props["textAlign"]) {
    content.dataset["align"] = `${props["textAlign"]}`
  }
  appendChildren(content, ctx, snapshot.children)

  element.append(content)
  return {element}
}

function appendChildren(
  container: HTMLElement,
  ctx: SnapshotRenderContext,
  children: IBlockSnapshot[] | IBlockSnapshot["children"]
) {
  if (!Array.isArray(children)) {
    return
  }

  children.forEach((child) => container.append(ctx.renderBlock(child as IBlockSnapshot)))
}

function resolveResourceUrl(src: string, baseUrl?: string): string {
  if (!baseUrl) return src
  try {
    return new URL(src, baseUrl).toString()
  } catch {
    return src
  }
}

function createSurfaceBackgroundImage(
  className: string,
  backgroundImage: NonNullable<
    ReturnType<typeof resolveBlockSurface>["backgroundImage"]
  >,
  ctx: SnapshotRenderContext,
): HTMLImageElement {
  const image = document.createElement("img")
  image.classList.add(className)
  image.alt = ""
  image.setAttribute("aria-hidden", "true")
  image.loading = "eager"
  image.decoding = "async"
  image.draggable = false
  image.style.objectFit = blockSurfaceImageFitToObjectFit(backgroundImage.fit)
  image.style.objectPosition = `${backgroundImage.positionX}% ${backgroundImage.positionY}%`
  image.style.opacity = `${backgroundImage.opacity}`
  image.src = resolveResourceUrl(backgroundImage.src, ctx.options.baseUrl)
  return image
}
