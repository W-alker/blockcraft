import {
  ChangeDetectorRef,
  Component,
  ElementRef, EventEmitter,
  HostBinding,
  inject,
  Input, Output,
} from "@angular/core";
import {DOCUMENT} from "@angular/common";
import {IBlockModel, IEditableBlockModel} from "../../types";
import {Controller} from "@core/controller";
import {BlockModel} from "@core/yjs";

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
    return this.model.props
  }

  get children() {
    return this.model.children
  }

  public cdr = inject(ChangeDetectorRef)
  public hostEl: ElementRef<HTMLElement> = inject(ElementRef)
  protected DOCUMENT = inject(DOCUMENT)

  setProp<T extends keyof Model['props']>(key: T, value: Model['props'][T]) {
    this.model.setProp(key, value)
  }

  deleteProp<T extends keyof Model['props']>(key: T) {
    this.model.deleteProp(key)
  }

  ngOnInit() {
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
