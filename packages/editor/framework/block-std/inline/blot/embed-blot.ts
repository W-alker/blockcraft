import {BlotType, IFormattedBlot, LeafBlot} from "./blot";
import {IInlineNodeAttrs} from "../../types";
import {INLINE_ELEMENT_TAG} from "../const";
import setAttributes from "../setAttributes";
import {createZeroSpace} from "../../../utils";

/**
 * EmbedBlot represents an atomic inline embed (mention, formula, inline-image, etc.).
 *
 * Its logical length is always 1.
 *
 * DOM contract (Phase 1 — matches current InlineManager output):
 * ```
 *   <c-element [attrs]>
 *     <span contenteditable="false">
 *       <!-- embed view rendered by converter -->
 *     </span>
 *     <span data-zero-space="true">​</span>
 *   </c-element>
 * ```
 *
 * The trailing zero-width space is the caret parking spot for "after embed" position.
 */
export class EmbedBlot extends LeafBlot implements IFormattedBlot {
  readonly type = BlotType.Embed
  readonly length = 1

  attrs: IInlineNodeAttrs | undefined

  private _embedElement: HTMLElement

  constructor(
    embedView: HTMLElement,
    attrs?: IInlineNodeAttrs
  ) {
    const cElement = document.createElement(INLINE_ELEMENT_TAG)
    const span = document.createElement('span')
    span.setAttribute('contenteditable', 'false')
    span.appendChild(embedView)
    if (attrs) setAttributes(cElement, attrs)
    cElement.append(span, createZeroSpace())
    super(cElement)
    this._embedElement = embedView
    this.attrs = attrs
  }

  get cElement(): HTMLElement {
    return this.domNode as HTMLElement
  }

  get embedElement(): HTMLElement {
    return this._embedElement
  }

  get gapNode(): HTMLElement {
    return this.cElement.querySelector('[data-zero-space="true"]') as HTMLElement
  }

  /**
   * Update formatting attributes on the outer c-element.
   */
  format(attrs: IInlineNodeAttrs) {
    this.attrs = attrs
    setAttributes(this.cElement, attrs)
  }
}
