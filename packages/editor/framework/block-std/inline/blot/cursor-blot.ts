import {BlotType, LeafBlot} from "./blot";
import {INLINE_ELEMENT_TAG, INLINE_TEXT_NODE_TAG, STR_ZERO_WIDTH_SPACE} from "../const";

/**
 * CursorBlot is a transient, zero-length blot used during composition or
 * boundary fallback scenarios where the browser needs a stable text node
 * to anchor the native caret / IME candidate window.
 *
 * Key properties:
 * - `length = 0` — it does NOT affect the delta model.
 * - It is never serialized back to Y.Text.
 * - It is inserted/removed by `CompositionSession` or `InlineRuntime`,
 *   not by the user or collaboration layer.
 *
 * DOM contract:
 * ```
 *   <c-element data-cursor-blot="true">
 *     <c-text>\u200B</c-text>
 *   </c-element>
 * ```
 */
export class CursorBlot extends LeafBlot {
  readonly type = BlotType.Cursor
  readonly length = 0

  constructor() {
    const cElement = document.createElement(INLINE_ELEMENT_TAG)
    cElement.setAttribute('data-cursor-blot', 'true')
    const cText = document.createElement(INLINE_TEXT_NODE_TAG)
    cText.textContent = STR_ZERO_WIDTH_SPACE
    cElement.appendChild(cText)
    super(cElement)
  }

  get cElement(): HTMLElement {
    return this.domNode as HTMLElement
  }

  /**
   * The zero-width text node that serves as the caret anchor.
   */
  get anchorNode(): Text {
    return this.cElement.firstElementChild!.firstChild as Text
  }

  /**
   * Extract the text that the browser wrote into this blot during composition.
   * Strips the initial zero-width space marker character.
   */
  extractCompositionText(): string {
    const raw = (this.domNode as HTMLElement).textContent || ''
    return raw.replace(/[\u200B\u200C]/g, '')
  }
}
