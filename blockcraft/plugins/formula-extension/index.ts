import {closetBlockId, DocPlugin, EventListen, getPositionWithOffset} from "../../framework";
import {Subject, takeUntil} from "rxjs";
import {FormulaBlockToolbar} from "./widgets/formula-toolbar";
import {UIEventStateContext} from "../../framework";
import {ComponentRef} from "@angular/core";

export class FormulaBlockExtensionPlugin extends DocPlugin {
  override name = "FormulaBlockExtensionPlugin";

  private _closeToolbar$ = new Subject<void>()
  private _activeBlock: BlockCraft.IBlockComponents['formula'] | null = null
  private _toolbarRef: ComponentRef<FormulaBlockToolbar> | null = null

  init() {}

  @EventListen('mouseDown', {flavour: 'formula'})
  onClick(ctx: UIEventStateContext) {
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

  closeToolbar = () => {
    this._activeBlock?.hostElement.classList.remove('editing')
    this._closeToolbar$.next()
    this._activeBlock = null
    this._toolbarRef = null
  }

  destroy() {}
}
