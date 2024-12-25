import {Component, EventEmitter, Injector, Input, Output, ViewChild} from "@angular/core";
import {NgForOf, NgIf, NgSwitch} from "@angular/common";
import {Controller, EditorRoot, LazyEditorRoot} from "../../core";
import {GlobalConfig} from "../types";

@Component({
  selector: 'bf-editor',
  standalone: true,
  template: `
    @if (!globalConfig.lazyload) {
      <div bf-node-type="root" lazy-load="false" #root></div>
    } @else {
      <div bf-node-type="root" lazy-load="true" [config]="globalConfig.lazyload!" #root></div>
    }
    <div class="expand" (mousedown)="onMouseDown($event)" (mouseup)="onMouseUp($event)"></div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;

      > .expand {
        flex: 1;
        min-height: 60px;
      }
    }
  `],
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

  @Output() onReady = new EventEmitter<Controller>()

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
    this._controller.attach(this.root).then(() => {
      this.onReady.emit(this._controller)
    })
  }

  private mouseDownEventPhase = -1

  onMouseDown(event: MouseEvent) {
    this.mouseDownEventPhase = event.eventPhase
  }

  onMouseUp(event: MouseEvent) {
    if (this.mouseDownEventPhase !== event.eventPhase) return
    this.mouseDownEventPhase = -1
    if (this.controller.readonly$.value || this.controller.root.selectedBlockRange) return
    const lastBm = this.controller.rootModel.at(-1)
    if (lastBm && lastBm.nodeType === 'editable' && !['code', 'mermaid', 'callout', 'blockquote'].includes(lastBm.flavour)) {
      this.controller.selection.setSelection(lastBm.id, 'end')
      return
    }
    const p = this.controller.createBlock('paragraph')
    this.controller.insertBlocks(this.controller.rootModel.length, [p]).then(() => {
      this.controller.selection.setSelection(p.id, 'start')
    })
  }

}
