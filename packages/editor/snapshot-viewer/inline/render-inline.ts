import {InlineModel, IInlineNodeAttrs} from "../../framework/block-std/types/inline.type";
import {DeltaInsertEmbed, DeltaInsertText} from "../../framework/block-std/types/delta.type";
import katex from "katex";

const INLINE_ELEMENT_TAG = "c-element";

export function renderInline(model: InlineModel): DocumentFragment {
  const fragment = document.createDocumentFragment()

  for (const item of model) {
    if (typeof item.insert === "string") {
      fragment.append(createTextElement(item as DeltaInsertText))
      continue
    }

    fragment.append(createEmbedElement(item as DeltaInsertEmbed))
  }

  return fragment
}

function createTextElement(item: DeltaInsertText): HTMLElement {
  const element = document.createElement(INLINE_ELEMENT_TAG)
  applyAttributes(element, item.attributes)

  const link = item.attributes?.["a:link"]
  if (link) {
    const anchor = document.createElement("a")
    anchor.setAttribute("href", `${link}`)
    anchor.setAttribute("target", "_blank")
    anchor.setAttribute("rel", "noopener noreferrer")
    anchor.textContent = item.insert
    element.append(anchor)
    return element
  }

  element.textContent = item.insert
  return element
}

function createEmbedElement(item: DeltaInsertEmbed): HTMLElement {
  const element = document.createElement(INLINE_ELEMENT_TAG)
  applyAttributes(element, item.attributes)

  const [embedKey = "embed"] = Object.keys(item.insert)
  const wrapper = document.createElement("span")
  wrapper.setAttribute("contenteditable", "false")
  wrapper.append(createInlineEmbedView(item, embedKey))

  element.append(wrapper)
  return element
}

function createInlineEmbedView(item: DeltaInsertEmbed, embedKey: string): HTMLElement {
  switch (embedKey) {
    case "latex":
      return createInlineFormulaElement(`${item.insert[embedKey] || ""}`)
    case "mention":
      return createMentionElement(item)
    default:
      return createGenericEmbedElement(item, embedKey)
  }
}

function createInlineFormulaElement(latex: string): HTMLElement {
  const formula = document.createElement("span")
  formula.classList.add("inline-formula")
  formula.setAttribute("data-latex", latex)

  try {
    katex.render(latex, formula, {output: "mathml", throwOnError: false})
  } catch {
    formula.textContent = latex
  }

  return formula
}

function createMentionElement(item: DeltaInsertEmbed): HTMLElement {
  const mention = document.createElement("span")
  mention.textContent = `${item.insert["mention"] || ""}`

  const mentionId = item.attributes?.["mentionId"] || item.attributes?.["d:mentionId"]
  const mentionType = item.attributes?.["mentionType"] || item.attributes?.["d:mentionType"]
  if (mentionId) {
    mention.setAttribute("data-mention-id", `${mentionId}`)
  }
  if (mentionType) {
    mention.setAttribute("data-mention-type", `${mentionType}`)
  }

  return mention
}

function createGenericEmbedElement(item: DeltaInsertEmbed, embedKey: string): HTMLElement {
  const wrapper = document.createElement("span")
  wrapper.classList.add("bc-snapshot-inline-embed")
  const value = item.insert[embedKey]
  wrapper.dataset["inlineEmbed"] = embedKey
  wrapper.textContent = isPrimitive(value) ? `${value}` : embedKey
  return wrapper
}

function applyAttributes(element: HTMLElement, attributes?: IInlineNodeAttrs): void {
  if (!attributes) {
    return
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false || value === "") {
      continue
    }

    if (key.startsWith("a:")) {
      element.setAttribute(key.slice(2), `${value}`)
      continue
    }

    if (key.startsWith("d:")) {
      element.dataset[key.slice(2)] = `${value}`
      continue
    }

    if (key.startsWith("s:")) {
      element.style.setProperty(key.slice(2), `${value}`)
      continue
    }

    element.setAttribute(key, `${value}`)
  }
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}
