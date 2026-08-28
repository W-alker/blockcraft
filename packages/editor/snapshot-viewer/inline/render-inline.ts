import {InlineModel, IInlineNodeAttrs} from "../../framework/block-std/types/inline.type";
import {DeltaInsertEmbed, DeltaInsertText} from "../../framework/block-std/types/delta.type";
import {applyInlineTypographyAttribute} from "../../framework/block-std/typography";
import {SnapshotInlineEmbedRenderer} from "../types";
import {
  INLINE_ICON_EMBED_KEY,
  inlineIconEmbedConverter,
} from "../../embeds/icon";
import {
  INLINE_IMAGE_EMBED_KEY,
  inlineImageEmbedConverter,
} from "../../embeds/image";
import {
  INLINE_DATE_EMBED_KEY,
  createInlineDateEmbedConverter,
} from "../../embeds/date";
import {
  INLINE_LATEX_EMBED_KEY,
  createInlineLatexEmbedConverter,
} from "../../embeds/latex";
import {
  INLINE_MENTION_EMBED_KEY,
  createInlineMentionEmbedConverter,
} from "../../embeds/mention";
import {
  INLINE_SHAPE_EMBED_KEY,
  createInlineShapeEmbedConverter,
} from "../../embeds/shape";
import {
  INLINE_WORD_ART_EMBED_KEY,
  createInlineWordArtEmbedConverter,
} from "../../embeds/word-art";

const INLINE_ELEMENT_TAG = "c-element";

/**
 * Reuse the live DOM converters so readonly inline embeds keep the same
 * presentation DOM and model normalization. Host renderers still override
 * these entries in `createInlineEmbedView` below.
 */
export function createBuiltinInlineEmbedRenderers(): Record<
  string,
  SnapshotInlineEmbedRenderer
> {
  return {
    [INLINE_ICON_EMBED_KEY]: inlineIconEmbedConverter.toView,
    [INLINE_IMAGE_EMBED_KEY]: inlineImageEmbedConverter.toView,
    [INLINE_DATE_EMBED_KEY]: createInlineDateEmbedConverter().toView,
    [INLINE_MENTION_EMBED_KEY]: createInlineMentionEmbedConverter().toView,
    [INLINE_LATEX_EMBED_KEY]: createInlineLatexEmbedConverter().toView,
    [INLINE_SHAPE_EMBED_KEY]: createInlineShapeEmbedConverter().toView,
    [INLINE_WORD_ART_EMBED_KEY]: createInlineWordArtEmbedConverter().toView,
  };
}

const BUILTIN_INLINE_EMBED_RENDERERS = createBuiltinInlineEmbedRenderers();

export function renderInline(
  model: InlineModel,
  inlineEmbeds?: Record<string, SnapshotInlineEmbedRenderer>,
): DocumentFragment {
  const fragment = document.createDocumentFragment()

  for (const item of model) {
    if (typeof item.insert === "string") {
      fragment.append(createTextElement(item as DeltaInsertText))
      continue
    }

    fragment.append(createEmbedElement(item as DeltaInsertEmbed, inlineEmbeds))
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

function createEmbedElement(
  item: DeltaInsertEmbed,
  inlineEmbeds?: Record<string, SnapshotInlineEmbedRenderer>,
): HTMLElement {
  const element = document.createElement(INLINE_ELEMENT_TAG)
  applyAttributes(element, item.attributes)

  const [embedKey = "embed"] = Object.keys(item.insert)
  const wrapper = document.createElement("span")
  wrapper.setAttribute("contenteditable", "false")
  wrapper.append(createInlineEmbedView(item, embedKey, inlineEmbeds))

  element.append(wrapper)
  return element
}

function createInlineEmbedView(
  item: DeltaInsertEmbed,
  embedKey: string,
  inlineEmbeds?: Record<string, SnapshotInlineEmbedRenderer>,
): HTMLElement {
  const renderer =
    inlineEmbeds?.[embedKey] ?? BUILTIN_INLINE_EMBED_RENDERERS[embedKey];
  if (renderer) {
    // A broken host renderer must not take the whole document preview down —
    // degrade to the generic chip, same contract as failed enhancement tasks.
    // That covers bad RETURN VALUES too, not just throws: append(null) would
    // stringify to a literal "null" in the document.
    try {
      const view = renderer(item);
      if (view instanceof HTMLElement) {
        return view;
      }
    } catch {
      // fall through to the generic chip
    }
    return createGenericEmbedElement(item, embedKey);
  }
  return createGenericEmbedElement(item, embedKey);
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
    if (applyInlineTypographyAttribute(element, key, value)) {
      continue
    }

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
      const raw = key.slice(2)
      const property = raw.startsWith("--")
        ? raw
        : raw.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
      element.style.setProperty(property, `${value}`)
      continue
    }

    element.setAttribute(key, `${value}`)
  }
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}
