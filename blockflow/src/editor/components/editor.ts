import {Component, inject, Injector, Input, ViewChild} from "@angular/core";
import {Controller, EditorRoot, IBlockModelMap, LazyEditorRoot} from "@core";
import {GlobalConfig} from "@editor/types";
import {NgForOf, NgIf, NgSwitch} from "@angular/common";

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
    NgSwitch
  ]
})
export class BlockFlowEditor {

  _globalConfig!: GlobalConfig
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

}
