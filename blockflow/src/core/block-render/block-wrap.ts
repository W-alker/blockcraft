import {Component, HostBinding, Input, ViewChild, ViewContainerRef} from "@angular/core";
import {BlockModel, Controller} from "@core";

@Component({
  selector: 'div[bf-block-wrap]',
  template: `
    <ng-container #container></ng-container>
  `,
  standalone: true,
})
export class BlockWrap {
  @Input({required: true}) controller!: Controller
  @Input({required: true}) model!: BlockModel

  @ViewChild('container', {read: ViewContainerRef, static: true}) container!: ViewContainerRef

  @HostBinding('attr.data-block-id')
  get blockId() {
    return this.model.id
  }

  ngAfterViewInit() {
    const schema = this.controller.schemas.get(this.model.flavour)
    if (!schema) throw new Error(`Schema not found for flavour: ${this.model.flavour}`)
    const cpr = this.container.createComponent(schema.render)
    cpr.instance.controller = this.controller
    cpr.setInput('model', this.model)
    cpr.changeDetectorRef.detectChanges()
    cpr.instance.cdr.detectChanges()
  }

}
