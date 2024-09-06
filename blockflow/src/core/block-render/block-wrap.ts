import {Component, HostBinding, Input, ViewChild, ViewContainerRef} from "@angular/core";
import {Controller, IBlockModel} from "@core";

@Component({
  selector: 'div[bf-block-wrap]',
  template: `
    <ng-container #container></ng-container>
  `,
  standalone: true,
})
export class BlockWrap {
  @Input({required: true}) controller!: Controller
  @Input({required: true}) model!: IBlockModel

  @ViewChild('container', {read: ViewContainerRef, static: true}) container!: ViewContainerRef

  @HostBinding('attr.data-block-id')
  get blockId() {
    return this.model.id
  }

  @HostBinding('style.margin-left')
  get marginLeft() {
    return `${(this.model.meta.indent || 0) * 2}em`
  }

  ngAfterViewInit() {
    this.createBlockView(this.model)
  }

  createBlockView(block: IBlockModel) {
    const schema = this.controller.schemaStore.get(block.flavour)
    if (!schema) throw new Error(`Schema not found for flavour ${block.flavour}`)
    const cpr = this.container.createComponent(schema.render)
    cpr.setInput('model', block)
    cpr.setInput('controller', this.controller)
    cpr.changeDetectorRef.detectChanges()
    return cpr
  }
}
