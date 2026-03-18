import {
  DeltaInsertEmbed,
  DeltaInsertText,
  IInlineNodeAttrs,
} from "../types";
import {
  INLINE_ELEMENT_TAG,
  INLINE_TEXT_NODE_TAG
} from "./const";
import setAttributes from "./setAttributes";
import {getAttributesFrom} from "./getAttributes";

export type EmbedConverter = {
  toDelta: EmbedViewToDelta
  toView: CreateEmbedView
  onDestroy?: (element: HTMLElement, delta: DeltaInsertEmbed) => void
}
export type CreateEmbedView = (delta: DeltaInsertEmbed) => HTMLElement
export type EmbedViewToDelta = (ele: HTMLElement) => DeltaInsertEmbed

/**
 * Static utility class for inline DOM node creation and attribute management.
 * Instance rendering/patching logic has moved to InlineRuntime + ScrollBlot (blot tree).
 */
export class InlineManager {

  static setAttrs(element: HTMLElement, attributes?: IInlineNodeAttrs) {
    if (!attributes) return
    setAttributes(element, attributes)
  }

  static getAttrs(element: HTMLElement): IInlineNodeAttrs {
    return getAttributesFrom(element)
  }

  static createTextNode(text: string): HTMLElement {
    const node = document.createElement(INLINE_TEXT_NODE_TAG)
    node.textContent = text
    return node
  }

  static createTextElement(delta: DeltaInsertText): HTMLElement {
    const node = document.createElement(INLINE_ELEMENT_TAG)
    node.appendChild(InlineManager.createTextNode(delta.insert))
    delta.attributes && setAttributes(node, delta.attributes)
    return node
  }

}

export * from './const'
export * from './compareAttributes'
export * from './position/inline-position-mapper'
export * from './blot'
export * from './runtime'
