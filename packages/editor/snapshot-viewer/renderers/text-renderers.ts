import {IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {InlineModel} from "../../framework/block-std/types/inline.type";
import {
  OrderedMarkerStyleId,
  resolveOrderedMarker,
  resolveOrderedMarkerDigitScale,
} from "../../blocks/ordered-block/utils/get-number-prefix";
import {renderHighlightedCodeModel} from "../highlight/render-highlighted-code";
import {createBlockShell} from "../dom/create-block-shell";
import {createEditableContainer} from "../dom/editable-container";
import {SnapshotBlockRenderer, SnapshotRenderContext} from "../types";

const TEXT_FLAVOURS = new Set([
  "paragraph",
  "bullet",
  "ordered",
  "todo",
  "blockquote",
  "caption",
  "code",
  "mermaid-textarea",
]);

export function createTextRenderers(): SnapshotBlockRenderer[] {
  return [{
    canRender: (snapshot) => TEXT_FLAVOURS.has(snapshot.flavour),
    render(ctx, snapshot) {
      switch (snapshot.flavour) {
        case "bullet":
          return renderBullet(snapshot, ctx)
        case "ordered":
          return renderOrdered(snapshot, ctx)
        case "todo":
          return renderTodo(snapshot, ctx)
        case "code":
          return renderCode(snapshot, ctx)
        case "mermaid-textarea":
          return renderMermaidTextarea(snapshot, ctx)
        case "blockquote":
        case "caption":
        case "paragraph":
        default:
          return renderSimpleEditable(snapshot, ctx)
      }
    },
  }]
}

function renderSimpleEditable(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  applyEditableProps(element, snapshot)
  element.append(createEditableContainer(ctx, snapshot, {host: element}))
  return {element}
}

function renderBullet(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  applyListAlignment(element, snapshot)

  const prefix = document.createElement("span")
  prefix.classList.add("bullet-block-prefix")
  prefix.setAttribute("contenteditable", "false")

  const marker = document.createElement("span")
  marker.classList.add(getBulletClass(snapshot))
  prefix.append(marker)

  element.append(prefix, createEditableContainer(ctx, snapshot, {host: element}))
  return {element}
}

function renderOrdered(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  applyListAlignment(element, snapshot)

  const props = snapshot.props as Record<string, unknown>
  const marker = resolveOrderedMarker(
    Number(props["order"] ?? 0),
    Number(props["depth"] ?? 0),
    props["ms"] as OrderedMarkerStyleId | null | undefined,
  )
  const prefix = document.createElement("button")
  prefix.classList.add("ordered-block-prefix")
  prefix.setAttribute("type", "button")
  prefix.setAttribute("contenteditable", "false")
  if (marker.enclosure) {
    prefix.setAttribute("data-bc-marker-enclosure", marker.enclosure)
  }
  const text = document.createElement("span")
  text.classList.add("ordered-block-prefix__text")
  const digitScale = resolveOrderedMarkerDigitScale(marker.text, marker.enclosure)
  if (digitScale) text.style.fontSize = digitScale
  text.textContent = marker.text
  prefix.append(text)

  element.append(prefix, createEditableContainer(ctx, snapshot, {host: element}))
  return {element}
}

function renderTodo(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  applyListAlignment(element, snapshot)

  const props = snapshot.props as Record<string, unknown>
  if (props["checked"]) {
    element.classList.add("is-checked")
  }

  const button = document.createElement("button")
  button.classList.add("todo-block-button")
  button.setAttribute("contenteditable", "false")

  const icon = document.createElement("i")
  icon.className = `bc_icon ${props["checked"] ? "bc_xuanzhong-fill" : "bc_weixuanzhong"}`
  button.append(icon)

  element.append(button, createEditableContainer(ctx, snapshot, {host: element}))
  return {element}
}

function renderCode(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const props = snapshot.props as Record<string, unknown>
  if (props["collapse"]) {
    element.classList.add("is-collapse")
  }

  const head = document.createElement("div")
  head.classList.add("code-block__head")
  head.setAttribute("contenteditable", "false")

  const blockName = document.createElement("span")
  blockName.classList.add("block-name")
  blockName.textContent = `${props["blockName"] || "代码块"}`

  const headGroup = document.createElement("div")
  headGroup.classList.add("head-btn__group")
  const headButton = document.createElement("div")
  headButton.classList.add("head-btn")
  const lang = document.createElement("span")
  lang.classList.add("lang")
  lang.textContent = `${props["lang"] || "PlainText"}`
  headButton.append(lang)
  headGroup.append(headButton)
  head.append(blockName, headGroup)

  const wrapper = document.createElement("div")
  wrapper.classList.add("edit-container-wrapper", "bc-scrollable-container")
  if (props["h"]) {
    wrapper.style.height = `${props["h"]}px`
  }

  // No `host`: shiki restructures this container, so the always-placeholder
  // contract deliberately does not apply to highlighted code.
  const content = createEditableContainer(ctx, snapshot, {tag: "pre"})
  scheduleCodeHighlight(content, snapshot, ctx, {
    lang: `${props["lang"] || "PlainText"}`,
    withLineBreak: true,
  })
  wrapper.append(content)

  element.append(head, wrapper)
  return {element}
}

function renderMermaidTextarea(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  element.append(createEditableContainer(ctx, snapshot))
  scheduleCodeHighlight(element.querySelector(".edit-container") as HTMLElement, snapshot, ctx, {
    lang: "mermaid",
    withLineBreak: false,
  })
  return {element}
}

function scheduleCodeHighlight(
  target: HTMLElement,
  snapshot: IBlockSnapshot,
  ctx: SnapshotRenderContext,
  options: {
    lang: string
    withLineBreak: boolean
  }
) {
  const source = stringifyInlineText(snapshot.children as InlineModel)
  if (!source) {
    return
  }

  const theme = document.body.getAttribute("blockcraft-theme") === "dark" ? "github-dark" : "github-light"

  ctx.scheduleEnhancement({
    key: `code-highlight:${snapshot.id}:${options.lang}:${theme}:${source}`,
    target,
    policy: "eager",
    load: async () => renderHighlightedCodeModel(source, {
      lang: options.lang,
      withLineBreak: options.withLineBreak,
      theme,
    }),
    apply: (model) => {
      target.replaceChildren()
      // ctx.createInlineContent, not a bare renderInline: it threads
      // inlineEmbeds AND registers resource-placeholder disposables — this
      // apply hook must not be the one inline path that skips either.
      target.append(ctx.createInlineContent(model as InlineModel))
    },
  })
}

function applyEditableProps(element: HTMLElement, snapshot: IBlockSnapshot) {
  const props = snapshot.props as Record<string, unknown>
  if (props["heading"]) {
    element.dataset["heading"] = `${props["heading"]}`
  }
  if (props["textAlign"]) {
    element.style.textAlign = `${props["textAlign"]}`
  }
}

function applyListAlignment(element: HTMLElement, snapshot: IBlockSnapshot) {
  const textAlign = `${snapshot.props.textAlign || ""}`
  if (textAlign === "center") {
    element.style.justifyContent = "center"
  } else if (textAlign === "right") {
    element.style.justifyContent = "flex-end"
  }
}

function getBulletClass(snapshot: IBlockSnapshot): string {
  const depth = Number((snapshot.props as Record<string, unknown>)["depth"] || 0)
  const bulletType = (depth + 1) % 3 === 0 ? 2 : (depth & 1)
  if (bulletType === 2) {
    return "square"
  }
  if (bulletType === 1) {
    return "circle"
  }
  return "point"
}

function stringifyInlineText(model: InlineModel) {
  return model
    .map((item) => typeof item.insert === "string" ? item.insert : "")
    .join("")
}
