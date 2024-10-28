import {Component, ElementRef, HostListener, Injector, Input, ViewChild} from "@angular/core";
import {NgForOf, NgIf, NgSwitch} from "@angular/common";
import {Controller, EditorRoot, LazyEditorRoot} from "../../core";
import {GlobalConfig} from "../types";

@Component({
  selector: 'bf-editor',
  standalone: true,
  template: `
    <ng-container *ngIf="!globalConfig.lazyload else lazyloadTpl">
      <div bf-node-type="root" lazy-load="false" #root></div>
    </ng-container>
    <ng-template #lazyloadTpl>
      <div bf-node-type="root" lazy-load="true" [config]="globalConfig.lazyload!" #root></div>
    </ng-template>
  `,
  imports: [
    NgIf,
    NgForOf,
    EditorRoot,
    LazyEditorRoot,
    NgSwitch,
  ]
})
export class BlockFlowEditor {

  private _globalConfig!: GlobalConfig
  @Input({required: true, alias: 'config'})
  set globalConfig(config: GlobalConfig) {
    this._globalConfig = config
    !this.controller && this.createController(this.globalConfig)
  }

  get globalConfig() {
    return this._globalConfig
  }

  @ViewChild('root') root!: EditorRoot

  protected _controller!: Controller
  get controller() {
    return this._controller
  }

  constructor(
    private host: ElementRef<HTMLElement>,
    private injector: Injector
  ) {
  }

  ngAfterViewInit() {
    !this.controller && this.createController(this.globalConfig)
  }

  private createController(config: GlobalConfig) {
    if (!config || !this.root) return
    this._globalConfig = config
    this._controller = new Controller(config, this.injector)
    this._controller.attach(this.root)
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    if (this.controller.readonly$.value || event.target !== this.host.nativeElement || this.controller.root.selectedBlockRange) return
    const lastBm = this.controller.rootModel.at(-1)
    if (lastBm && lastBm.nodeType === 'editable' && !['code', 'mermaid', 'callout'].includes(lastBm.flavour)) {
      this.controller.setSelection(lastBm.id, 'end')
      return
    }
    const p = this.controller.createBlock('paragraph')
    this.controller.insertBlocks(this.controller.rootModel.length, [p]).then(() => {
      this.controller.setSelection(p.id, 'start')
    })
  }

}
