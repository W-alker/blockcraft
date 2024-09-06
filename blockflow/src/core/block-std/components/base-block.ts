import {
  Component,
  ElementRef, EventEmitter,
  HostBinding,
  inject,
  Input, Output,
} from "@angular/core";
import {DOCUMENT} from "@angular/common";
import {IBlockModel} from "../../types";
import {Controller} from "@core/controller";

@Component({
  selector: '[bf-base-block]',
  standalone: true,
  template: ``,
})
export class BaseBlock<Model extends IBlockModel = IBlockModel> {
  @Input({required: true}) readonly controller!: Controller
  @Input({required: true}) readonly model!: Model

  @Output() onDestroy = new EventEmitter<void>()

  @HostBinding('id')
  get id() {
    return this.model!.id
  }

  @HostBinding('attr.bf-node-type')
  get nodeType() {
    return this.model!.nodeType as Model['nodeType']
  }

  get flavour() {
    return this.model!.flavour as Model['flavour']
  }

  get props() {
    return this.model!.props as Model['props']
  }

  public hostEl: ElementRef<HTMLElement> = inject(ElementRef)
  protected DOCUMENT = inject(DOCUMENT)

  ngOnInit() {
  }

  ngAfterViewInit() {
    this.controller.storeBlockRef(this)
  }

  ngOnDestroy() {
    this.onDestroy.emit()
  }

}
