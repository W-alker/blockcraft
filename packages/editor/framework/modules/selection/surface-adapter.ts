import {focusEditingHostForBlock} from './focus-editing-host';

export interface SelectionSurfaceAdapter {
  readonly ownerDocument: Document
  getActiveElement(): Element | null
  getNativeSelection(): globalThis.Selection | null
  clearNativeSelection(): void
  createRange(): Range
  focusRoot(): void
  focusEditingHost(blockId?: string): void
  hasEditorFocus(): boolean
  isFocusDropped(): boolean
  isRootConnected(): boolean
  ownsNativeSelection(): boolean
  requestFrame(callback: FrameRequestCallback): number
  cancelFrame(frame: number): void
  getElementRect(element: Element): DOMRect
  getRangeRect(range: Range): DOMRect
  getRangeRects(range: Range): DOMRectList
}

/**
 * Browser-facing port for the selection domain. It deliberately owns no
 * selection state and performs no caching; callers keep model state in
 * SelectionManager and use this adapter only at DOM projection boundaries.
 */
export class DOMSelectionSurfaceAdapter implements SelectionSurfaceAdapter {
  constructor(private readonly doc: BlockCraft.Doc) {}

  get ownerDocument(): Document {
    return this.root.ownerDocument
  }

  getActiveElement(): Element | null {
    return this.ownerDocument.activeElement
  }

  getNativeSelection(): globalThis.Selection | null {
    return this.ownerDocument.getSelection()
  }

  clearNativeSelection(): void {
    this.getNativeSelection()?.removeAllRanges()
  }

  createRange(): Range {
    return this.ownerDocument.createRange()
  }

  focusRoot(): void {
    this.root.focus({preventScroll: true})
  }

  focusEditingHost(blockId?: string): void {
    let block: BlockCraft.BlockComponent | null = null
    try {
      if (blockId) {
        block = this.doc.getBlockById(blockId)
      }
    } catch {
      // Restored components can mount one frame after their Yjs data returns.
    }
    focusEditingHostForBlock(this.doc, block)
  }

  hasEditorFocus(): boolean {
    const active = this.getActiveElement()
    return !!active && (active === this.root || this.root.contains(active))
  }

  isFocusDropped(): boolean {
    const active = this.getActiveElement()
    return !active || active === this.ownerDocument.body || active === this.ownerDocument.documentElement
  }

  isRootConnected(): boolean {
    return this.root.isConnected
  }

  ownsNativeSelection(): boolean {
    const selection = this.getNativeSelection()
    const anchor = selection?.anchorNode ?? null
    const head = selection?.focusNode ?? null
    return !!selection?.rangeCount &&
      !!anchor && !!head &&
      this.contains(anchor) &&
      this.contains(head)
  }

  requestFrame(callback: FrameRequestCallback): number {
    return this.ownerDocument.defaultView?.requestAnimationFrame(callback) ?? requestAnimationFrame(callback)
  }

  cancelFrame(frame: number): void {
    const view = this.ownerDocument.defaultView
    if (view) view.cancelAnimationFrame(frame)
    else cancelAnimationFrame(frame)
  }

  getElementRect(element: Element): DOMRect {
    return element.getBoundingClientRect()
  }

  getRangeRect(range: Range): DOMRect {
    return range.getBoundingClientRect()
  }

  getRangeRects(range: Range): DOMRectList {
    return range.getClientRects()
  }

  private get root(): HTMLElement {
    return this.doc.root.hostElement
  }

  private contains(node: Node): boolean {
    return node === this.root || this.root.contains(node)
  }
}
