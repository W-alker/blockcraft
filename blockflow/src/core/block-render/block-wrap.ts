import {Component, ElementRef, Input, ViewChild, ViewContainerRef} from "@angular/core";
import {Controller} from "../controller";
import {BlockModel} from "../yjs";

@Component({
  selector: 'div[bf-block-wrap]',
  template: `
    <ng-container #container></ng-container>
<!--    <span style="display: block; cursor: text;" (mousedown)="onAppendAfter($event)">&ZeroWidthSpace;</span>-->
  `,
  standalone: true,
})
export class BlockWrap {
  @Input({required: true}) controller!: Controller
  @Input({required: true}) model!: BlockModel

  @ViewChild('container', {read: ViewContainerRef, static: true}) container!: ViewContainerRef

  constructor(
    private hostEl: ElementRef<HTMLElement>
  ) {
  }

  ngAfterViewInit() {
    const schema = this.controller.schemas.get(this.model.flavour)
    if (!schema) throw new Error(`Schema not found for flavour: ${this.model.flavour}`)
    const cpr = this.container.createComponent(schema.render)
    cpr.instance.controller = this.controller
    cpr.setInput('model', this.model)
    cpr.changeDetectorRef.detectChanges()
    cpr.instance.cdr.detectChanges()

    this.hostEl.nativeElement.setAttribute('data-block-id', this.model.id)
  }

  onAppendAfter(e: Event) {
    e.stopPropagation()
    e.preventDefault()
    const pos = this.controller.getBlockPosition(this.model.id)
    const np = this.controller.createBlock('paragraph')
    this.controller.insertBlocks(pos.index + 1, [np]).then(() => {
      this.controller.selection.setSelection(np.id, 0)
    })
  }
}
