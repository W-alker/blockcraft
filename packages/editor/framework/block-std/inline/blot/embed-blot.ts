import {BlotType, IFormattedBlot, LeafBlot} from "./blot";
import {DeltaInsertEmbed, IInlineNodeAttrs} from "../../types";
import {INLINE_ELEMENT_TAG} from "../const";
import setAttributes from "../setAttributes";
import {createZeroSpace} from "../../../utils";
import type {EmbedConverter} from "../index";

/**
 * EmbedBlot represents an atomic inline embed (mention, formula, inline-image, etc.).
 *
 * Its logical length is always 1.
 *
 * DOM contract:
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
 *
 * Lifecycle: the EmbedBlot owns its converter reference and delta snapshot,
 * so that `detach()` can automatically call `converter.onDestroy()`.
 */
export class EmbedBlot extends LeafBlot implements IFormattedBlot {
  readonly type = BlotType.Embed
  readonly length = 1

  attrs: IInlineNodeAttrs | undefined

  private _embedElement: HTMLElement
  private _converter: EmbedConverter | null
  private _delta: DeltaInsertEmbed

  constructor(
    embedView: HTMLElement,
    attrs?: IInlineNodeAttrs,
    converter?: EmbedConverter | null,
    delta?: DeltaInsertEmbed
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
    this._converter = converter ?? null
    this._delta = delta ?? { insert: {} } as DeltaInsertEmbed
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

  get embedKey(): string {
    return Object.keys(this._delta.insert)[0] ?? ''
  }

  /**
   * Update formatting attributes on the outer c-element.
   * Merges with existing attrs; null values remove the attribute (delta semantics).
   */
  format(attrs: IInlineNodeAttrs) {
    const merged: Record<string, any> = {...(this.attrs || {})}
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) {
        delete merged[k]
      } else {
        merged[k] = v
      }
    }
    this.attrs = Object.keys(merged).length ? merged as IInlineNodeAttrs : undefined
    setAttributes(this.cElement, attrs)
  }

  /**
   * Remove from DOM and call converter.onDestroy if registered.
   */
  override detach() {
    this._converter?.onDestroy?.(this._embedElement, this._delta)
    super.detach()
  }
}
