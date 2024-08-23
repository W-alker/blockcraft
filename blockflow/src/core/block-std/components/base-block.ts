import {
  Component,
  ElementRef,
  HostBinding,
  inject,
  Input,
} from "@angular/core";
import {DOCUMENT} from "@angular/common";
import {IBlockModel} from "../../types";
import {Controller} from "@core/controller";
import Y from "@core/yjs";

@Component({
  selector: '[bf-base-block]',
  standalone: true,
  template: ``,
})
export class BaseBlock<Model extends IBlockModel = IBlockModel> {
  @Input({required: true}) readonly controller!: Controller

  @Input({required: true}) model!: Model


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

  get children() {
    return this.model!.children as Model['children']
  }

  public hostEl = inject(ElementRef)
  protected DOCUMENT = inject(DOCUMENT)

  yModel!: Y.Map<any>

  ngOnInit() {
    this.yModel = this.controller.docManager.queryYBlockModel(this.model.id)!
  }

  ngAfterViewInit() {
    this.controller.storeBlockRef(this)
  }

}
