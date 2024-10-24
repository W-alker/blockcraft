import {Component, DestroyRef, ElementRef, Input, ViewChild, ViewContainerRef} from "@angular/core";
import {Controller} from "../controller";
import {BlockModel} from "../yjs";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {IBaseMetadata} from "../types";

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

  constructor(
    private hostEl: ElementRef<HTMLElement>,
    private destroyRef: DestroyRef
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
}
