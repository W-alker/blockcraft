import {fromEvent, take, takeUntil} from "rxjs";
import {ComponentRef, ViewContainerRef} from "@angular/core";
import {TriggerBtn} from "./widgets/trigger-btn";
import {closetBlockId, DocPlugin, EventListen} from "../../framework";
import {IContextMenuItem, customToolHandler} from "./types";

export class BlockControllerPlugin extends DocPlugin {
  override name = 'block-controller'
  override version = 1.0

  private _vcr!: ViewContainerRef
  private _cpr!: ComponentRef<TriggerBtn>

  private _activeBlock: BlockCraft.BlockComponent | null = null

  private isHidden = false

  private _timer?: number

  constructor(
    public readonly customTools: IContextMenuItem[] = [],
    private readonly customToolHandler?: customToolHandler
  ) {
    super();
  }

  init() {
    this._vcr = this.doc.injector.get(ViewContainerRef)
    this._cpr = this._vcr.createComponent(TriggerBtn, {
      injector: this.doc.injector
    })
    this._cpr.setInput('doc', this.doc)
    this._cpr.setInput('customTools', this.customTools)
    this._cpr.setInput('customToolHandler', this.customToolHandler)
    this.doc.root.hostElement.appendChild(this._cpr.location.nativeElement)

    fromEvent<MouseEvent>(this.doc.root.hostElement, 'mouseover').pipe(takeUntil(this.doc.onDestroy$)).subscribe(e => {
      if (this.doc.isReadonly || this.isHidden) return
      this.clearTimer()

      const target = e.target as HTMLElement
      if (target === this.doc.root.hostElement // 根元素不响应
        || target === this._activeBlock?.hostElement.parentElement // 防止因为margin导致的在父子块之间来回移动
        || this._cpr.location.nativeElement.contains(target)
      ) return

      const blockId = closetBlockId(target)
      if (!blockId || this._activeBlock?.id === blockId) return
      const block = this.doc.getBlockById(blockId)
      const schema = this.doc.schemas.get(block.flavour)
      if (!schema || schema.metadata.isLeaf) return

      this._timer = setTimeout(() => {
        this._cpr.setInput('activeBlock', this._activeBlock = block)
        this.clearTimer()
      }, 0)
    })

    this.doc.selection.selectionChange$.pipe(takeUntil(this.doc.onDestroy$)).subscribe(v => {
      if (this.doc.isReadonly) return
      if (v?.to) {
        this._cpr.setInput('activeBlock', this._activeBlock = null)
        this._cpr.setInput('hidden', this.isHidden = true)
      } else {
        this.isHidden && this._cpr.setInput('hidden', this.isHidden = false)
      }
    })

    this.doc.subscribeReadonlyChange(v => {
      this._cpr.setInput('hidden', this.isHidden = v)
    })
    this.addDraggable()
  }

  // drag handle 拖拽响应
  addDraggable() {

    fromEvent<DragEvent>(this._cpr.location.nativeElement, 'dragstart').pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(evt => {
        if (!this._activeBlock) return

        this._cpr.instance.menuDisabled = true
        this._cpr.instance.cdr.detectChanges()

        evt.dataTransfer?.setDragImage(this._activeBlock.hostElement, 0, 0);

        this.doc.dndService.startDrag(evt, 'origin-block', this._activeBlock.id)

        fromEvent(this._cpr.location.nativeElement, 'dragend').pipe(take(1)).subscribe(() => {
          this._cpr.instance.menuDisabled = false
        })
      })
  }

  // TODO 第一次selectstart没执行
  @EventListen('selectStart', {flavour: "root"})
  onSelectStart() {
    this._cpr.location.nativeElement.style.pointerEvents = 'none'
  }

  @EventListen('selectEnd', {flavour: "root"})
  onSelectEnd() {
    this._cpr.location.nativeElement.style.pointerEvents = 'auto'
  }

  clearTimer() {
    if (!this._timer) return
    clearTimeout(this._timer)
    this._timer = undefined
  }

  destroy() {
    this._cpr.destroy()
  }

}

