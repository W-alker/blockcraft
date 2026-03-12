import {BlotType, LeafBlot} from "./blot";
import {INLINE_ELEMENT_TAG, INLINE_END_BREAK_CLASS} from "../const";

/**
 * BreakBlot is the sentinel node at the end of each inline container.
 *
 * It does NOT contribute to the logical text length (length = 0).
 * Its sole purpose is to provide a valid caret target when the user
 * places the cursor at the very end of a block.
 *
 * DOM contract:
 * ```
 *   <c-element class="bc-end-break">
 *     <br>
 *   </c-element>
 * ```
 */
export class BreakBlot extends LeafBlot {
  readonly type = BlotType.Break
  readonly length = 0

  constructor() {
    const node = document.createElement(INLINE_ELEMENT_TAG)
    node.classList.add(INLINE_END_BREAK_CLASS)
    node.appendChild(document.createElement('br'))
    super(node)
  }

  get cElement(): HTMLElement {
    return this.domNode as HTMLElement
  }
}
