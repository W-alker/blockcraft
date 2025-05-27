import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent, generateId, getPositionWithOffset, ORIGIN_SKIP_SYNC} from "../../framework";
import {MermaidBlockModel} from "./index";
import mermaid from "mermaid";
import {Subject, Subscription, takeUntil} from "rxjs";
import {MermaidTypeListComponent} from "./widgets/mermaid-type-list.component";
import {IMermaidType, MermaidViewMode} from "./types";
import {nextTick} from "../../global";
// import {ScaleRatioPipe} from "./ratio.pipe";

@Component({
  selector: 'div.mermaid-block',
  template: `
    <div class="head" contenteditable="false">
      <div class="btn">Mermaid</div>
      <div class="template-btn btn" (click)="onShowList($event, 'prefix')" [hidden]="props.mode === 'graph'">类型
        <i class="bf_icon bf_xiajaintou" style="font-size: .8em"></i>
      </div>
      <div class="template-btn btn" (click)="onShowList($event, 'template')" [hidden]="props.mode === 'graph'">模板
        <i class="bf_icon bf_xiajaintou"></i>
      </div>

      <div class="control-btns" [hidden]="props.mode === 'text' ">
        <span class="btn" (mousedown)="scaleGraph(-0.25)"><i class="bc_icon bc_suoxiao"></i></span>
        <span class="btn" (mousedown)="scaleGraph(0.25)"><i class="bc_icon bc_fangda"></i></span>
        <!--        <span class="text">缩放： {{ graphScale | scaleRatio }}</span>-->
      </div>

      <div class="switch-btn btn" (click)="onSwitchView()"><i class="bc_icon bf_qiehuan"></i></div>
    </div>

    <ng-container #childrenContainer></ng-container>

    <div class="graph-container">
      <div class="graph-con"></div>
    </div>
  `,
  standalone: true,
  imports: [
    // ScaleRatioPipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MermaidBlockComponent extends BaseBlockComponent<MermaidBlockModel> {

  protected graphScale = 1
  protected graphMaxWidth = 0

  protected graphContainer!: HTMLDivElement
  protected isIntersecting = false
  protected intersectionObserver = new IntersectionObserver(([entry]) => {
    this.isIntersecting = entry.isIntersecting
    if (this.isIntersecting && this.props.mode !== this._viewMode) {
      this.setView(this.props.mode)
    }
  }, {
    threshold: [0, 1]
  })

  private _propsChangeSubscription!: Subscription;
  protected _viewMode: MermaidViewMode | null = null

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.graphContainer = this.hostElement.querySelector('.graph-con') as HTMLDivElement;

    this.setView(this.props.mode)
    this._propsChangeSubscription = this.onPropsChange.subscribe(map => {
      if (map.has('mode')) {
        this.setView(this.props.mode)
      }
    })
  }

  override _init() {
    super._init()
    nextTick().then(() => {
      this.intersectionObserver.observe(this.hostElement)
    })
  }

  override detach() {
    super.detach();
    this.intersectionObserver.unobserve(this.hostElement)
    this.isIntersecting = false
  }

  async renderGraph() {
    const textarea = this.firstChildren as BlockCraft.IBlockComponents['mermaid-textarea']
    if (!textarea.textLength) return
    const graphDefinition = textarea.textContent();
    try {
      const {svg} = await mermaid.render('graph' + generateId(11), graphDefinition, this.graphContainer);
      this.graphContainer.innerHTML = svg
      this.graphMaxWidth = parseInt((this.graphContainer.firstElementChild! as SVGAElement).style.maxWidth)
      this.setGraphWidth(this.graphScale)
    } catch (err) {
      // this.graphContainer.innerHTML = `<div style="color: var(--bc-error-color);">${err}</div>`
    }
  }

  setView(view: MermaidViewMode) {
    if (!this.isIntersecting || this._viewMode === view) return
    this.hostElement.setAttribute('data-mode', this._viewMode = view)
    if (view === 'graph') {
      !this.graphContainer.childElementCount && this.renderGraph()
    } else {
      this.graphContainer.childElementCount && this.graphContainer.replaceChildren()
    }
  }

  onSwitchView() {
    this.updateProps({
      mode: this._native.props.mode === 'graph' ? 'text' : 'graph'
    })
  }

  onShowList($event: MouseEvent, prefix: string) {
    const close$ = new Subject()
    const btn = $event.target as HTMLElement
    btn.classList.add('active')
    const {componentRef} = this.doc.overlayService.createConnectedOverlay<MermaidTypeListComponent>({
      target: $event.target as HTMLElement,
      component: MermaidTypeListComponent,
      backdrop: true,
      positions: [getPositionWithOffset('top-center', 0, 6), getPositionWithOffset('bottom-center', 0, 6)]
    }, close$, () => {
      btn.classList.remove('active')
    })

    componentRef.instance.itemClicked.pipe(takeUntil(close$)).subscribe(v => {
      close$.next(true)
      switch (prefix) {
        case 'prefix':
          this.addTypePrefix(v.prefix);
          break;
        case 'template':
          this.useTemplate(v);
          break;
      }
    })
  }

  addTypePrefix(prefix: string) {
    (this.firstChildren as BlockCraft.IBlockComponents['mermaid-textarea']).insertText(0, prefix)
  }

  useTemplate(item: IMermaidType) {
    this.doc.crud.transact(() => {
      const textarea = this.firstChildren as BlockCraft.IBlockComponents['mermaid-textarea']
      textarea.textLength && textarea.deleteText(0, textarea.textLength)
      textarea.insertText(0, item.prefix + item.template)
    }, ORIGIN_SKIP_SYNC)
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
    this.intersectionObserver.disconnect()
    this._propsChangeSubscription.unsubscribe()
  }

  scaleGraph(number: number) {
    let ratio = this.graphScale + number
    if (number < 0) {
      ratio = Math.max(0.5, ratio)
    } else {
      ratio = Math.min(3, ratio)
    }
    if (ratio === this.graphScale) return
    this.graphScale = ratio
    this.graphContainer.style.width = ratio * 100 + '%'
    this.setGraphWidth(ratio)
  }

  private setGraphWidth(ratio: number) {
    const svg = this.graphContainer.firstElementChild! as SVGAElement
    if (!svg) return;
    svg.style.maxWidth = this.graphMaxWidth * ratio + 'px'
  }
}
