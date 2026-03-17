import {IInlineNodeAttrs} from "../../types";

/**
 * Base interface for all blot types in the inline blot tree.
 *
 * A blot is a lightweight runtime node that sits between the delta model (Y.Text)
 * and the DOM. It owns a single DOM element and knows its logical text length.
 *
 * Blots do NOT participate in persistence or collaboration protocol;
 * Y.Text/Delta remains the sole source of truth.
 */
export interface IBlot {
  /** Blot type discriminator */
  readonly type: BlotType
  /** Logical text length this blot represents (0 for structural blots like BreakBlot) */
  readonly length: number
  /** The root DOM element owned by this blot */
  readonly domNode: Node
  /** Parent ScrollBlot, set when attached */
  parent: IScrollBlot | null

  /** Remove this blot's DOM from the tree and clean up */
  detach(): void
}

export interface IScrollBlot {
  readonly type: 'scroll'
  readonly domNode: HTMLElement
  readonly children: IBlot[]
}

export const enum BlotType {
  Scroll = 'scroll',
  Text = 'text',
  Embed = 'embed',
  Break = 'break',
  Cursor = 'cursor',
}

/**
 * Abstract base class providing shared bookkeeping for leaf blots.
 */
export abstract class LeafBlot implements IBlot {
  abstract readonly type: BlotType
  abstract readonly length: number
  parent: IScrollBlot | null = null

  constructor(public domNode: Node) {}

  detach() {
    this.domNode.parentNode?.removeChild(this.domNode)
    this.parent = null
  }
}

/**
 * Shared attribute snapshot for blots that carry inline formatting.
 */
export interface IFormattedBlot {
  attrs: IInlineNodeAttrs | undefined
}
