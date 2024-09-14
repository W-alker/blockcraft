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

  @HostBinding('id')
  get id() {
    return this.model.id
  }

  @HostBinding('attr.bf-node-type')
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

  setProps<T extends keyof Model['props']>(key: T, value: Model['props'][T]) {
    this.model.setProps(key, value)
  }

  ngOnInit() {
  }

  ngAfterViewInit() {
    this.controller.storeBlockRef(this)
  }

  ngOnDestroy() {
    this.onDestroy.emit()
  }

}
