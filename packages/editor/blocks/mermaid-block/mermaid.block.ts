import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from "@angular/core";
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
import { isFormatOnlyDelta } from "../code-block/color-merge";
import { BlockFullscreenController } from "../../framework/services/block-fullscreen-controller";

// import {ScaleRatioPipe} from "./ratio.pipe";

@Component({
  selector: 'div.mermaid-block',
  template: `
    <div class="head" (mousedown)="onFocus($event)">
      <div class="btn">Mermaid</div>

      @if (!isReadonly) {
        <div class="template-btn btn" (click)="onShowList($event, 'prefix')" [hidden]="props.mode === 'graph'">类型
          <i class="bc_icon bc_xiajaintou" style="font-size: .8em"></i>
        </div>
        <div class="template-btn btn" (click)="onShowList($event, 'template')" [hidden]="props.mode === 'graph'">模板
          <i class="bc_icon bc_xiajaintou"></i>
        </div>
      }

      <div class="download-btn btn icon-btn"
           [hidden]="props.mode === 'text'"
           title="导出 SVG"
           (mousedown)="onDownloadSvg($event)">
        <i class="bc_icon bc_xiazai"></i>
      </div>

      <div class="control-btns" [hidden]="props.mode === 'text' ">
        <span class="btn icon-btn" (mousedown)="scaleGraph(-0.25)" title="缩小"><i class="bc_icon bc_suoxiao"></i></span>
        <span class="btn icon-btn" (mousedown)="scaleGraph(0.25)" title="放大"><i class="bc_icon bc_fangda"></i></span>
        <!--        <span class="text">缩放： {{ graphScale | scaleRatio }}</span>-->
      </div>

      <div class="switch-btn btn icon-btn" [hidden]="isReadonly" (mousedown)="onSwitchView($event)">
        <i class="bc_icon bc_qiehuan"></i>
      </div>

      <button class="fullscreen-btn btn icon-btn"
              type="button"
              contenteditable="false"
              [class.only-fullscreen]="isReadonly && props.mode === 'text'"
              [attr.aria-label]="isFullscreen ? '退出全屏' : '全屏'"
              [attr.title]="isFullscreen ? '退出全屏 · Esc' : '全屏'"
              (mousedown)="$event.preventDefault(); $event.stopPropagation()"
              (click)="toggleFullscreen(); $event.stopPropagation()">
        <i class="bc_icon"
           [class.bc_arrow-expand]="!isFullscreen"
           [class.bc_x-circle-contained]="isFullscreen"></i>
      </button>
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MermaidBlockComponent extends BaseBlockComponent<MermaidBlockModel> {
  private fullscreenController?: BlockFullscreenController
  private releaseFullscreenViewLease: () => void = () => undefined
  private readonly cdr = inject(ChangeDetectorRef)

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

    this.fullscreenController = new BlockFullscreenController(
      this.hostElement,
      () => this.doc.scrollContainer,
      () => this.doc.viewScale?.value ?? 1,
      'block',
    )
    this.fullscreenController.state$
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(isFullscreen => {
        this.releaseFullscreenViewLease()
        this.releaseFullscreenViewLease = isFullscreen
          ? this.doc.virtualization.acquireBlockViewLease([this.id])
          : () => undefined
        this.cdr.markForCheck()
      })

    this.graphContainer = this.hostElement.querySelector('.graph-con') as HTMLDivElement;

    this.setView(this.props.mode)

    this.onPropsChange.pipe(takeUntil(this.onDestroy$)).subscribe(map => {
      if (map.has('mode')) {
        this.setView(this.props.mode)
      }
    })

    requestAnimationFrame(() => {
      const textarea = this.firstChildren as BlockCraft.IBlockComponents['mermaid-textarea']
      textarea.onTextChange.pipe(takeUntil(this.onDestroy$)).subscribe(e => {
        // 纯格式变更（如染色）不改变 mermaid 文本，图无需重渲，跳过预览调度
        if (isFormatOnlyDelta(e.op)) return
        this._onPreviewObserver()
      })
    })

  }

  override ngOnDestroy() {
    this.fullscreenController?.destroy()
    this.releaseFullscreenViewLease()
    this.releaseFullscreenViewLease = () => undefined
    this.intersectionObserver.disconnect()
    super.ngOnDestroy();
  }

  protected get isFullscreen(): boolean {
    return this.fullscreenController?.isFullscreen ?? false
  }

  protected toggleFullscreen(): void {
    this.fullscreenController?.toggle()
  }

  override _init() {
    super._init()
    nextTick().then(() => {
      this.intersectionObserver.observe(this.hostElement)
    })
  }

  protected override beforeDetach() {
    this.intersectionObserver.unobserve(this.hostElement)
    this.isIntersecting = false
  }

  private _onPreviewObserver = debounce(() => {
    nextTick().then(() => {
      this.renderGraph()
    })
  }, 500)

  private _renderedTextContent = ''

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
    if (graphDefinition === this._renderedTextContent && this.graphContainer.childElementCount) return
    try {
      const { svg } = await mermaid.render('graph' + generateId(11), graphDefinition, this.graphContainer);
      this.graphContainer.innerHTML = svg
      this._renderedTextContent = graphDefinition
      this.graphMaxWidth = parseInt((this.graphContainer.firstElementChild! as SVGAElement).style.maxWidth)
      this.setGraphWidth(this.graphScale)
    } catch (err) {
      this._renderedTextContent = ''
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
    if (this.isReadonly) return
    $event.preventDefault()
    $event.stopPropagation()

    const close$ = new Subject()
    const btn = $event.currentTarget as HTMLElement
    btn.classList.add('active')
    const { componentRef } = this.doc.overlayService.createConnectedOverlay<MermaidViewSwitchComponent>({
      target: btn,
      component: MermaidViewSwitchComponent,
      backdrop: true,
      clampTo: this.isFullscreen ? this.hostElement : undefined,
      positions: [getPositionWithOffset('top-right', 0, 6), getPositionWithOffset('bottom-right', 0, 6)]
    }, close$, () => {
      btn.classList.remove('active')
    })
    componentRef.setInput('viewMode', this.props.mode)

    componentRef.instance.itemClicked.pipe(takeUntil(close$)).subscribe(v => {
      close$.next(true)
      if (this.isReadonly) return
      this.updateProps({
        mode: v
      })
    })

  }

  onShowList($event: MouseEvent, prefix: string) {
    if (this.isReadonly) return
    $event.preventDefault()
    $event.stopPropagation()

    const close$ = new Subject()
    const btn = $event.currentTarget as HTMLElement
    btn.classList.add('active')
    const { componentRef } = this.doc.overlayService.createConnectedOverlay<MermaidTypeListComponent>({
      target: btn,
      component: MermaidTypeListComponent,
      backdrop: true,
      clampTo: this.isFullscreen ? this.hostElement : undefined,
      positions: [getPositionWithOffset('top-center', 0, 6), getPositionWithOffset('bottom-center', 0, 6)]
    }, close$, () => {
      btn.classList.remove('active')
    })

    componentRef.instance.itemClicked.pipe(takeUntil(close$)).subscribe(v => {
      close$.next(true)
      if (this.isReadonly) return
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

  onDownloadSvg($event: MouseEvent) {
    $event.preventDefault()
    $event.stopPropagation()
    if (this.props.mode === 'text') {
      return
    }
    void this.exportSvg()
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

  private createPreviewSvg(svg: SVGElement) {
    const previewSvg = svg.cloneNode(true) as SVGElement
    if (!(previewSvg instanceof SVGSVGElement)) return previewSvg

    // Mermaid 默认会输出 width="100%" + max-width，脱离原容器后会导致固有尺寸异常
    previewSvg.style.removeProperty('max-width')
    previewSvg.style.removeProperty('width')
    previewSvg.style.removeProperty('height')

    let width = 0
    let height = 0
    const viewBoxAttr = previewSvg.getAttribute('viewBox')
    if (viewBoxAttr) {
      const viewBox = viewBoxAttr.split(/[\s,]+/).map(v => Number(v.trim()))
      if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
        width = viewBox[2]
        height = viewBox[3]
      }
    }

    if (!width || !height) {
      const rect = svg.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        width = rect.width
        height = rect.height
      }
    }

    if (width > 0 && height > 0) {
      previewSvg.setAttribute('width', `${width}`)
      previewSvg.setAttribute('height', `${height}`)
    }

    return previewSvg
  }

  private async exportSvg() {
    const source = this.getGraphDefinition()
    if (!source.trim()) {
      this.doc.messageService.warn('Mermaid 内容为空，无法导出')
      return
    }

    const svg = await this.createExportSvg(source)
    if (!svg) return

    const svgBlob = new Blob([this.serializeSvg(svg)], { type: 'image/svg+xml;charset=utf-8' })

    // 通过宿主注入的 DocFileService 下载，而不是直接走浏览器 <a download>。
    // 浏览器环境下基类实现回退到锚点下载；在 Tauri/WKWebView 等宿主中，
    // 宿主可重写 downloadAttachment 走原生保存对话框（锚点下载在 WKWebView 中会被静默忽略）。
    const blobUrl = URL.createObjectURL(svgBlob)
    try {
      await this.doc.injector
        .get(DOC_FILE_SERVICE_TOKEN)
        .downloadAttachment({ url: blobUrl, name: this.getExportFileName() })
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  }

  private async createExportSvg(graphDefinition: string) {
    const renderedSvg = this.graphContainer.firstElementChild
    if (renderedSvg instanceof SVGElement && graphDefinition === this._renderedTextContent) {
      return this.createPreviewSvg(renderedSvg)
    }

    try {
      const container = document.createElement('div')
      const { svg } = await mermaid.render('graph' + generateId(11), graphDefinition, container)
      const parsedSvg = this.parseSvgMarkup(svg)
      if (!parsedSvg) {
        throw new Error('invalid svg')
      }
      return this.createPreviewSvg(parsedSvg)
    } catch {
      this.doc.messageService.warn('Mermaid 语法有误，无法导出图表')
      return null
    }
  }

  private getGraphDefinition() {
    const textarea = this.firstChildren as BlockCraft.IBlockComponents['mermaid-textarea']
    return textarea.textLength ? textarea.textContent() : ''
  }

  private parseSvgMarkup(svgMarkup: string) {
    const doc = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml')
    return doc.querySelector('svg')
  }

  private serializeSvg(svg: SVGElement) {
    return new XMLSerializer().serializeToString(svg)
  }

  private getExportFileName() {
    return `mermaid-${this.id}.svg`
  }

  async onPreviewGraph(evt: MouseEvent) {
    if (this.isFullscreen) return
    const sel = this.doc.selection.value
    if (
      !sel ||
      !sel.isInSameBlock ||
      sel.start.blockId !== this.id ||
      sel.anchor.type !== 'selected' ||
      sel.head.type !== 'selected'
    ) return
    evt.stopPropagation()
    evt.preventDefault()
    const svg = this.graphContainer.firstElementChild
    if (!svg || !(svg instanceof SVGElement)) return
    //svg转img
    const svgString = new XMLSerializer().serializeToString(this.createPreviewSvg(svg));
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image()
    img.onload = () => {
      this.doc.injector.get(DOC_FILE_SERVICE_TOKEN).previewImg({
        el: img,
        title: 'mermaid',
        className: 'blockcraft-mermaid-preview-graph',
        hidden: () => {
          url && URL.revokeObjectURL(url)
        }
      })
      img.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true, view: window }))
    }
    img.onerror = () => {
      url && URL.revokeObjectURL(url)
    }
    img.src = url
  }
}
