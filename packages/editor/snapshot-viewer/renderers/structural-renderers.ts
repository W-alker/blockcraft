import {IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {createBlockShell} from "../dom/create-block-shell";
import {SnapshotBlockRenderer, SnapshotRenderContext} from "../types";

const STRUCTURAL_FLAVOURS = new Set([
  "root",
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
        case "root":
        default:
          return renderRoot(snapshot, ctx)
      }
    },
  }]
}

function renderRoot(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  appendChildren(element, ctx, snapshot.children)
  return {element}
}

function renderCallout(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const props = snapshot.props as Record<string, unknown>
  if (props["backColor"]) {
    element.style.backgroundColor = `${props["backColor"]}`
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
  const props = snapshot.props as Record<string, unknown>
  const line = document.createElement("div")
  line.classList.add("divide-line", `${props["style"] || "solid"}`)
  if (props["size"]) {
    line.dataset["size"] = `${props["size"]}`
  }
  element.append(line)
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
