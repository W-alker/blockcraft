import {
  closetBlockId,
  DocPlugin,
  EventListen,
  getPositionWithOffset,
  INLINE_ELEMENT_TAG
} from "../../framework";
import {Subject, takeUntil} from "rxjs";
import {FormulaBlockToolbar} from "./widgets/formula-toolbar";
import {UIEventStateContext} from "../../framework";
import {ComponentRef} from "@angular/core";

export class FormulaBlockExtensionPlugin extends DocPlugin {
  override name = "FormulaBlockExtensionPlugin";

  private _closeToolbar$ = new Subject<void>()
  private _activeBlock: BlockCraft.IBlockComponents['formula'] | null = null
  private _activeInlineFormulaEl: HTMLElement | null = null
  private _toolbarRef: ComponentRef<FormulaBlockToolbar> | null = null

  init() {
  }

  @EventListen('mouseDown', {flavour: 'formula'})
  onBlockClick(ctx: UIEventStateContext) {
    const target = ctx.getDefaultEvent().target as Node
    const blockId = closetBlockId(target)
    if (!blockId) return

    const block = this.doc.getBlockById(blockId) as BlockCraft.IBlockComponents['formula']
    if (this._activeBlock === block) return

    this.closeToolbar()
    this._activeBlock = block
    block.hostElement.classList.add('editing')

    const {componentRef} = this.doc.overlayService.createConnectedOverlay<FormulaBlockToolbar>({
      target: block,
      component: FormulaBlockToolbar,
      positions: [
        getPositionWithOffset("bottom-center", 0, 8),
        getPositionWithOffset("top-center", 0, 8),
      ],
      backdrop: true
    }, this._closeToolbar$, this.closeToolbar)

    componentRef.setInput('block', block)
    componentRef.setInput('doc', this.doc)
    this._toolbarRef = componentRef

    componentRef.instance.confirm.pipe(takeUntil(this._closeToolbar$)).subscribe(latex => {
      block.updateProps({latex})
      this.closeToolbar()
    })

    return true
  }

  @EventListen('mouseDown', {flavour: 'root'})
  onInlineClick(ctx: UIEventStateContext) {
    const target = ctx.getDefaultEvent().target as Element | null
    if (!target || !(target instanceof Element)) return

    const formulaEl = target.closest('.inline-formula') as HTMLElement | null
    if (!formulaEl) return

    const cElement = formulaEl.closest(INLINE_ELEMENT_TAG) as HTMLElement | null
    if (!cElement) return

    const blockId = closetBlockId(target)
    if (!blockId) return

    const block = this.doc.getBlockById(blockId)
    if (!this.doc.isEditable(block)) return

    const latex = formulaEl.getAttribute('data-latex') || ''

    this.closeToolbar()
    this._activeInlineFormulaEl = formulaEl
    formulaEl.classList.add('editing')

    const {componentRef} = this.doc.overlayService.createConnectedOverlay<FormulaBlockToolbar>({
      target: formulaEl,
      component: FormulaBlockToolbar,
      positions: [
        getPositionWithOffset("bottom-center", 0, 8),
        getPositionWithOffset("top-center", 0, 8),
      ],
      backdrop: true
    }, this._closeToolbar$, this.closeToolbar)

    componentRef.setInput('doc', this.doc)
    componentRef.setInput('initialLatex', latex)
    this._toolbarRef = componentRef

    componentRef.instance.confirm.pipe(takeUntil(this._closeToolbar$)).subscribe(newLatex => {
      const {from} = this.getEmbedRange(formulaEl)
      if (from.type !== 'text') return
      const embedIndex = from.index
      if(!newLatex) {
        block.applyDeltaOperations([
          {retain: embedIndex},
          {delete: 1}
        ])
      } else {
        block.applyDeltaOperations([
          {retain: embedIndex},
          {delete: 1},
          {insert: {latex: newLatex}}
        ])
      }
      requestAnimationFrame(() => {
        this.doc.selection.setCursorAt(block, embedIndex + 1)
      })
      this.closeToolbar()
    })

    return true
  }

  createEmbedRange(cElement: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(cElement);
    range.collapse(true)
    return range
  }

  getEmbedRange(target: HTMLElement) {
    const range = this.createEmbedRange(target);
    const normalizedRange = this.doc.selection.normalizeRange(range);
    range.detach();
    return normalizedRange;
  }

  closeToolbar = () => {
    this._activeBlock?.hostElement.classList.remove('editing')
    this._activeInlineFormulaEl?.classList.remove('editing')
    this._closeToolbar$.next()
    this._activeBlock = null
    this._activeInlineFormulaEl = null
    this._toolbarRef = null
  }

  destroy() {
  }
}
