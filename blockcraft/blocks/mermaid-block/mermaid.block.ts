import { ChangeDetectionStrategy, Component } from "@angular/core";
import {
  BaseBlockComponent, DOC_FILE_SERVICE_TOKEN,
  generateId,
  getPositionWithOffset,
} from "../../framework";
import { MermaidBlockModel } from "./index";
import mermaid from "mermaid";
import { Subject, takeUntil } from "rxjs";
import { MermaidTypeListComponent } from "./widgets/mermaid-type-list.component";
import { IMermaidType, MermaidViewMode } from "./types";
import { debounce, nextTick } from "../../global";
import { MermaidViewSwitchComponent } from "./widgets/mermaid-view-switch.component";
import { AsyncPipe } from "@angular/common";

// import {ScaleRatioPipe} from "./ratio.pipe";

@Component({
  selector: 'div.mermaid-block',
  template: `
    <div class="head" (mousedown)="onFocus($event)">
      <div class="btn">Mermaid</div>

      @if (!(doc.readonlySwitch$ | async)) {
        <div class="template-btn btn" (click)="onShowList($event, 'prefix')" [hidden]="props.mode === 'graph'">类型
          <i class="bc_icon bc_xiajaintou" style="font-size: .8em"></i>
        </div>
        <div class="template-btn btn" (click)="onShowList($event, 'template')" [hidden]="props.mode === 'graph'">模板
          <i class="bc_icon bc_xiajaintou"></i>
        </div>
      }

      <div class="control-btns" [hidden]="props.mode === 'text' ">
        <span class="btn" (mousedown)="scaleGraph(-0.25)"><i class="bc_icon bc_suoxiao"></i></span>
        <span class="btn" (mousedown)="scaleGraph(0.25)"><i class="bc_icon bc_fangda"></i></span>
        <!--        <span class="text">缩放： {{ graphScale | scaleRatio }}</span>-->
      </div>

      <div class="switch-btn btn" [hidden]="doc.readonlySwitch$ | async" (mousedown)="onSwitchView($event)">
        <i class="bc_icon bc_qiehuan"></i>
      </div>
    </div>

    <div class="content">
      <div class="text-container children-render-container" spellcheck="false">
      </div>

      <div class="graph-container" (mousedown)="onFocus($event)">
        <div class="graph-con" (mousedown)="onPreviewGraph($event)"></div>
      </div>

    </div>
  `,
  standalone: true,
  imports: [
    AsyncPipe,
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

  protected _viewMode: MermaidViewMode | null = null

  override ngAfterViewInit() {
    super.ngAfterViewInit();

    this.graphContainer = this.hostElement.querySelector('.graph-con') as HTMLDivElement;

    this.setView(this.props.mode)

    this.onPropsChange.pipe(takeUntil(this.onDestroy$)).subscribe(map => {
      if (map.has('mode')) {
        this.setView(this.props.mode)
      }
    })

    requestAnimationFrame(() => {
      const textarea = this.firstChildren as BlockCraft.IBlockComponents['mermaid-textarea']
      textarea.onTextChange.pipe(takeUntil(this.onDestroy$)).subscribe(this._onPreviewObserver)
    })

  }

  override ngOnDestroy() {
    super.ngOnDestroy();
    this.intersectionObserver.disconnect()
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

  private _onPreviewObserver = debounce(() => {
    nextTick().then(() => {
      this.renderGraph()
    })
  }, 500)

  private _prevTextContent = ''

  protected onFocus($event: MouseEvent) {
    $event.stopPropagation()
    $event.preventDefault()
    this.doc.selection.selectBlock(this.id)
  }

  async renderGraph() {
    if (!this.isIntersecting) return
    const textarea = this.firstChildren as BlockCraft.IBlockComponents['mermaid-textarea']
    if (!textarea.textLength) return
    const graphDefinition = textarea.textContent();
    if (graphDefinition === this._prevTextContent && this.graphContainer.childElementCount) return
    this._prevTextContent = graphDefinition
    try {
      const { svg } = await mermaid.render('graph' + generateId(11), graphDefinition, this.graphContainer);
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
    if (view !== 'text') {
      !this.graphContainer.childElementCount && this.renderGraph()
    } else {
      this.graphContainer.childElementCount && this.graphContainer.replaceChildren()
    }
  }

  onSwitchView($event: MouseEvent) {
    $event.preventDefault()
    $event.stopPropagation()

    const close$ = new Subject()
    const btn = $event.target as HTMLElement
    btn.classList.add('active')
    const { componentRef } = this.doc.overlayService.createConnectedOverlay<MermaidViewSwitchComponent>({
      target: $event.target as HTMLElement,
      component: MermaidViewSwitchComponent,
      backdrop: true,
      positions: [getPositionWithOffset('top-right', 0, 6), getPositionWithOffset('bottom-right', 0, 6)]
    }, close$, () => {
      btn.classList.remove('active')
    })
    componentRef.setInput('viewMode', this.props.mode)

    componentRef.instance.itemClicked.pipe(takeUntil(close$)).subscribe(v => {
      close$.next(true)
      this.updateProps({
        mode: v
      })
    })

  }

  onShowList($event: MouseEvent, prefix: string) {
    $event.preventDefault()
    $event.stopPropagation()

    const close$ = new Subject()
    const btn = $event.target as HTMLElement
    btn.classList.add('active')
    const { componentRef } = this.doc.overlayService.createConnectedOverlay<MermaidTypeListComponent>({
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
    const textarea = this.firstChildren as BlockCraft.IBlockComponents['mermaid-textarea']
    textarea.textLength && textarea.deleteText(0, textarea.textLength)
    textarea.insertText(0, item.prefix + item.template)
  }

  scaleGraph(number: number) {
    let ratio = this.graphScale + number
    if (number < 0) {
      ratio = Math.max(0.5, ratio)
    } else {
      ratio = Math.min(8, ratio)
    }
    if (ratio === this.graphScale) return
    this.graphScale = ratio
    this.graphContainer.style.width = ratio * 100 + '%'
    this.setGraphWidth(ratio)
  }

  private setGraphWidth(ratio: number) {
    const svg = this.graphContainer.firstElementChild! as SVGElement
    if (!svg) return;
    svg.style.maxWidth = this.graphMaxWidth * ratio + 'px'
  }

  async onPreviewGraph(evt: MouseEvent) {
    const sel = this.doc.selection.value
    if (!sel || sel.to || sel.from.blockId !== this.id) return
    evt.stopPropagation()
    evt.preventDefault()
    const svg = this.graphContainer.firstElementChild
    if (!svg || !(svg instanceof SVGElement)) return
    //svg转img
    const svgString = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image()
    img.src = url
    this.doc.injector.get(DOC_FILE_SERVICE_TOKEN).previewImg({
      el: img,
      title: 'mermaid',
      className: 'blockcraft-mermaid-preview-graph',
      stop: () => {
        url && URL.revokeObjectURL(url)
      }
    })
    img.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true, view: window }))
  }
}
