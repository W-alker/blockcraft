import {
  ChangeDetectorRef,
  Component, DestroyRef,
  ElementRef, EventEmitter,
  inject,
  Input, Output,
} from "@angular/core";
import {DOCUMENT} from "@angular/common";
import {IBaseMetadata, IBlockModel, IEditableBlockModel} from "../../types";
import {Controller} from "../../controller";
import {BlockModel} from "../../yjs";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";

@Component({
  selector: '[bf-base-block]',
  standalone: true,
  template: ``,
})
export class BaseBlock<Model extends IBlockModel | IEditableBlockModel = IBlockModel> {
  @Input({required: true}) controller!: Controller
  @Input({required: true}) model!: BlockModel<Model>

  @Output() onDestroy = new EventEmitter<void>()

  get id() {
    return this.model.id
  }

  get nodeType() {
    return this.model.nodeType
  }

  get flavour() {
    return this.model.flavour
  }

  get props() {
    return this.model.props as Readonly<Model['props']>
  }

  get children() {
    return this.model.children
  }

  public readonly destroyRef = inject(DestroyRef)
  public readonly cdr = inject(ChangeDetectorRef)
  public readonly hostEl: ElementRef<HTMLElement> = inject(ElementRef)
  protected DOCUMENT = inject(DOCUMENT)

  setProp<T extends keyof Model['props']>(key: T, value: Model['props'][T]) {
    this.model.setProp(key, value)
  }

  deleteProp<T extends keyof Model['props']>(key: T) {
    this.model.deleteProp(key)
  }

  ngOnInit() {
    this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(t => {
      // this.controller.blockUpdate$.next({
      //   ...t,
      //   block: this
      // })
      if(t.event.transaction.origin === this.controller.historyManager) return;
      if (t.event.transaction.local) {
        this.setModifyRecord()
      }
      const pid = this.model.getParentId()
      if(!pid) return
      const parentModel = this.controller.getBlockModel(pid)
      if(!parentModel) return
      // @ts-ignore
      parentModel.update$.next({type: 'children', event: t.event})
    })
  }

  private setModifyRecord(time: number = Date.now()) {
    const m: IBaseMetadata['lastModified'] = {
      time,
      ...this.controller.config.localUser
    }
    this.model.setMeta('lastModified', m)
  }


  ngAfterViewInit() {
    this.controller.storeBlockRef(this)
    this.hostEl.nativeElement.setAttribute('id', this.model.id)
    this.hostEl.nativeElement.setAttribute('bf-node-type', this.model.nodeType)
  }

  ngOnDestroy() {
    this.onDestroy.emit()
  }

}
