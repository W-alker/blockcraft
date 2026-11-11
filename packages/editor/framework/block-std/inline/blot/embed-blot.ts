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

    // 通用 DOM 格式属性（a:/d:/s:）直接、廉价地落到外层 c-element。
    setAttributes(this.cElement, attrs)

    // 无前缀的 embed 语义属性（如 mentionId/mentionType）决定 converter 渲染出的
    // 内层视图，setAttributes 不认这些 key。一旦它们变化（典型：远端 format 改了
    // mention 指向），必须重跑 converter.toView 刷新内层视图——否则视图永久陈旧、
    // 点击仍用旧 id，且一致性检查（delta vs blot 树）测不出这种 blot-vs-DOM 偏差。
    // a:/d:/s: 的常规格式化（加粗/颜色，含跨越 embed 的范围格式）不会命中这里，
    // 避免给 latex 等 embed 带来无谓的 KaTeX 重渲染。
    const hasSemanticChange = Object.keys(attrs).some(
      k => !k.startsWith('a:') && !k.startsWith('d:') && !k.startsWith('s:')
    )
    const nextDelta: DeltaInsertEmbed = {insert: this._delta.insert, attributes: this.attrs}
    if (hasSemanticChange && this._converter) {
      try {
        const newView = this._converter.toView(nextDelta)
        this._converter.onDestroy?.(this._embedElement, this._delta)
        this._embedElement.replaceWith(newView)
        this._embedElement = newView
      } catch {
        // converter 渲染失败：保留旧视图，整段 rerender 是最终兜底
      }
    }
    this._delta = nextDelta
  }

  /**
   * Remove from DOM and call converter.onDestroy if registered.
   */
  override detach() {
    this._converter?.onDestroy?.(this._embedElement, this._delta)
    super.detach()
  }
}
