import {ApplicationRef, ComponentRef, createComponent} from "@angular/core";
import {DemoControlBarComponent} from "./widgets/demo-control-bar.component";
import {nextTick, throttle} from "../../global";
import {BlockCraftDoc, IBlockSnapshot, SchemaManager} from "../../framework";
import * as Y from 'yjs';
import {DemoCoverBlockModel, DemoCoverBlockSchema, DemoRootBlockSchema, DemoRootComponent} from "./blocks";
import {SimpleImagePreview} from "./widgets/simple-image-preview.component";
import {
  PenTool, HighlighterTool, EraserTool,
  RectTool, EllipseTool, ArrowTool,
  TextTool, LaserTool, DrawingTool,
  LineTool, TriangleTool, DiamondTool,
  CalloutTool
} from "./drawing/drawing-tools";
import {DrawingCanvas} from "./drawing/drawing-canvas";
import {DrawingToolbarComponent, DrawingToolType} from "./drawing/drawing-toolbar.component";

export interface DemoConfig {
  // presentation?: {
  //   focusStrategy: 'viewport';
  //   unfocusedOpacity: number;
  //   showProgress: boolean;
  //   autoHideControls: boolean;
  //   autoHideDelay: number;
  //   enableTransition: boolean;
  //   transitionDuration: number;
  // };
  preview?: {
    showToolbar: boolean;
  },
  cover?: DemoCoverBlockModel['props']
  /**
   * 演示模式相对源文档字号的放大倍数。
   * demo 容器的 --bc-fs 会被设为 sourceFs * fontScale，表格列宽（colWidths）
   * 按同样倍数缩放。默认 1.5。设为 1 可关闭放大。
   */
  fontScale?: number
  /**
   * 演示模式相对源文档行高（--bc-lh）的缩放倍数。默认与 fontScale 保持一致，
   * 这样 lh / fs 比例不变。需要更紧凑或更宽松的行距时单独设置。
   */
  lineHeightScale?: number
  /**
   * 演示模式相对源文档块间距（--bc-segments-gap）的缩放倍数。默认与 fontScale
   * 保持一致；单独设置可让段落留白更窄或更宽。
   */
  segmentsGapScale?: number
}

const DEFAULT_DEMO_FONT_SCALE = 1.5;

export class PresentationController {
  private pages: IBlockSnapshot[][] = [];
  private currentPageIndex = 0;
  private controlBarRef: ComponentRef<DemoControlBarComponent> | null = null;
  private eventCleanups: (() => void)[] = [];
  private presentationContainer: HTMLElement | null = null;

  private drawingCanvas: DrawingCanvas | null = null;
  private drawingToolbarRef: ComponentRef<DrawingToolbarComponent> | null = null;
  private drawingTools: Map<DrawingToolType, DrawingTool> = new Map();
  private isDrawingMode = false;
  private isImgPreviewMode = false;
  private needReenterFullscreen = false;
  private currentPreview: SimpleImagePreview | null = null;

  private _demoDoc: BlockCraft.Doc | null = null;

  constructor(
    private originDoc: BlockCraft.Doc,
    private config: DemoConfig
  ) {
  }

  start() {
    const rootSnapshot = this.originDoc.exportSnapshot()!;

    this.pages = this.analyzePages(rootSnapshot.children as IBlockSnapshot[]);

    if(this.config.cover) {
      this.pages.unshift([DemoCoverBlockSchema.createSnapshot(this.config.cover)])
    }

    if (this.pages.length === 0) {
      console.warn('No pages to present');
      return;
    }

    nextTick().then(() => {
      this.createDemoDocAndContainer(rootSnapshot)

      this.enterFullscreen();

      this.renderControlBar();

      this.bindEvents();

      this.renderPage(0);
    })

  }

  createDemoDocAndContainer(rootSnapshot: IBlockSnapshot) {
    const schemas = this.originDoc.schemas.getSchemaList()
    schemas.push(DemoCoverBlockSchema)
    const schemaStore = new SchemaManager(schemas)
    // 重新注册根block
    schemaStore.register(DemoRootBlockSchema)
    this._demoDoc = new BlockCraftDoc({
      ...this.originDoc.config,
      plugins: [],
      yDoc: new Y.Doc(),
      theme: 'light',
      schemas: schemaStore,
      readonly: true,
    })
    rootSnapshot.children = []
    this.presentationContainer = document.createElement('div')
    this.presentationContainer.className = 'presentation-stage';
    this.presentationContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: var(--bc-bg-primary, #ffffff);
      z-index: 9999;
      overflow: auto;
      margin: 0;
      padding: 10vh 10vw;
      box-sizing: border-box;
    `
    // 根据源文档当前 --bc-fs / --bc-lh / --bc-segments-gap 注入演示模式各自的尺寸。
    // 默认所有 scale 都跟随 fontScale，使整体节奏保持源文档比例；用户可在 config 中
    // 单独覆盖 lineHeightScale / segmentsGapScale 调整行距和块间距。表格 colWidths
    // 用 fontScale 缩放。子级（含 demo-root）通过 CSS 变量继承读取这些值。
    const sourceFs = this.readSourceCssLength('--bc-fs', 16);
    const sourceLh = this.readSourceCssLength('--bc-lh', 24);
    const sourceGap = this.readSourceCssLength('--bc-segments-gap', 10);
    this.presentationContainer.style.setProperty('--bc-fs', `${sourceFs * this.getFontScale()}px`);
    this.presentationContainer.style.setProperty('--bc-lh', `${sourceLh * this.getLineHeightScale()}px`);
    this.presentationContainer.style.setProperty('--bc-segments-gap', `${sourceGap * this.getSegmentsGapScale()}px`);

    document.body.appendChild(this.presentationContainer);
    this._demoDoc.initBySnapshot(rootSnapshot, this.presentationContainer);
  }

  private analyzePages(snapshots: IBlockSnapshot[]): IBlockSnapshot[][] {
    const pages: IBlockSnapshot[][] = [];
    let currentPage: IBlockSnapshot[] = [];

    for (const block of snapshots) {
      if (this.isPageBreakBlock(block)) {
        // 遇到分页标记
        if (currentPage.length > 0) {
          // 结束当前页，开始新页
          pages.push(currentPage);
          currentPage = [block];
        } else {
          // 当前页为空，将分页标记作为新页的开始
          currentPage = [block];
        }
      } else {
        currentPage.push(block);
      }
    }

    // 添加最后一页（如果有内容）
    if (currentPage.length > 0) {
      pages.push(currentPage);
    }

    return pages;
  }

  private isPageBreakBlock(block: IBlockSnapshot): boolean {
    // divider、带有 heading 属性的块、callout
    // @ts-ignore
    if (block.flavour === 'page-divider') {
      return true;
    }

    if (block.flavour === 'callout') {
      return true;
    }

    // 检查 props 中是否有 heading 属性
    if (block.props['heading']) {
      return true;
    }

    return false;
  }

  private tryReenterFullscreen() {
    if (this.needReenterFullscreen && !document.fullscreenElement) {
      this.needReenterFullscreen = false;
      this.enterFullscreen();
    }
  }

  private enterFullscreen() {
    if (this.presentationContainer && this.presentationContainer.requestFullscreen) {
      this.presentationContainer.requestFullscreen().then(() => {
        // 锁定 Escape 键，防止浏览器在图片预览时自动退出全屏
        (navigator as any).keyboard?.lock?.(['Escape'])?.catch?.(() => {});
      }).catch(err => {
        console.warn('Failed to enter fullscreen:', err);
      });
    }
  }

  private renderControlBar() {
    if(!this._demoDoc) return
    const appRef = this._demoDoc.injector.get(ApplicationRef);
    const controlBarRef = createComponent(DemoControlBarComponent, {
      environmentInjector: appRef.injector,
      elementInjector: this._demoDoc.injector,
    });
    this.controlBarRef = controlBarRef;
    appRef.attachView(controlBarRef.hostView)

    this.controlBarRef.setInput('currentPage', 1);
    this.controlBarRef.setInput('totalPages', this.pages.length);
    this.controlBarRef.instance.updateView()

    // 监听事件
    const prevSub = controlBarRef.instance.prev.subscribe(() => this.prev());
    const nextSub = controlBarRef.instance.next.subscribe(() => this.next());
    const exitSub = controlBarRef.instance.exit.subscribe(() => this.destroy());
    const drawingSub = controlBarRef.instance.toggleDrawing.subscribe(() => this.toggleDrawing());

    this.eventCleanups.push(() => {
      prevSub.unsubscribe();
      nextSub.unsubscribe();
      exitSub.unsubscribe();
      drawingSub.unsubscribe();
    });

    this.presentationContainer?.appendChild(controlBarRef.location.nativeElement)
    this.presentationContainer?.addEventListener('mouseover', throttle(() => {
      this.controlBarRef!.instance.isHidden = false
      this.controlBarRef?.instance.startHideTimer()
      this.controlBarRef?.instance.updateView()
    }, 500))

    this.eventCleanups.push(() => {
      controlBarRef.destroy();
    });
  }

  private bindEvents() {
    // 键盘导航
    const keydownHandler = (e: KeyboardEvent) => {
      e.stopPropagation()
      // 绘图模式下的快捷键
      if (this.isDrawingMode) {
        if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
          e.preventDefault();
          this.drawingCanvas?.redo();
          return;
        }
        if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.drawingCanvas?.undo();
          return;
        }
      }

      // 非 Escape 键时尝试恢复全屏（Safari 降级：预览关闭后借用户交互重新进入全屏）
      if (e.key !== 'Escape') {
        this.tryReenterFullscreen();
      }

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          !this.isImgPreviewMode && this.next();
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          !this.isImgPreviewMode && this.prev();
          break;
        case 'Home':
          e.preventDefault();
          // this.goToPage(0);
          break;
        case 'End':
          e.preventDefault();
          // this.goToPage(this.pages.length - 1);
          break;
        case 'Escape':
          e.preventDefault();
          !this.isImgPreviewMode && this.destroy();
          break;
      }
    };

    document.addEventListener('keydown', keydownHandler);
    this.eventCleanups.push(() => {
      document.removeEventListener('keydown', keydownHandler);
    });

    // 鼠标点击导航（上半部分=上一页，下半部分=下一页）
    const clickHandler = (e: MouseEvent) => {
      // 绘图模式下不触发点击翻页
      if (this.isDrawingMode) return;
      this.tryReenterFullscreen();

      const target = e.target as HTMLElement;
      if (target === this.presentationContainer) {
        const windowWidth = window.innerWidth;
        const clickX = e.clientX;

        if (clickX < windowWidth / 2) {
          this.prev();
        } else {
          this.next();
        }
        return;
      }

      // 避免点击控制栏触发导航
      if (target.closest('demo-control-bar')) {
        return;
      }

      const img = target.closest('.image-block');
      if (img) {
        this.showSimpleImagePreview(img as HTMLElement)
        return;
      }

      const mermaidGraph = target.closest('.graph-con');
      if (mermaidGraph) {
        const svg = mermaidGraph.querySelector('svg');
        if (svg) {
          this.showMermaidPreview(mermaidGraph as HTMLElement);
          return;
        }
      }
    };

    if (this.presentationContainer) {
      this.presentationContainer.addEventListener('click', clickHandler);
      this.eventCleanups.push(() => {
        this.presentationContainer?.removeEventListener('click', clickHandler);
      });
    }

    // 拦截 mermaid 图表的 mousedown，阻止 block 自身的 viewerjs 预览
    if (this.presentationContainer) {
      const mermaidMousedownInterceptor = (e: MouseEvent) => {
        if (this.isDrawingMode) return;
        const target = e.target as HTMLElement;
        if (target.closest('.graph-con')?.querySelector('svg')) {
          e.stopPropagation();
        }
      };
      this.presentationContainer.addEventListener('mousedown', mermaidMousedownInterceptor, true);
      this.eventCleanups.push(() => {
        this.presentationContainer?.removeEventListener('mousedown', mermaidMousedownInterceptor, true);
      });
    }

    // 监听全屏退出
    const fullscreenChangeHandler = () => {
      if (!document.fullscreenElement) {
        if (this.isImgPreviewMode) {
          // Safari 中 ESC 不会触发 keydown，需在此主动关闭预览
          this.currentPreview?.hide();
          this.needReenterFullscreen = true;
        } else {
          this.destroy();
        }
      }
    };

    document.addEventListener('fullscreenchange', fullscreenChangeHandler);
    this.eventCleanups.push(() => {
      document.removeEventListener('fullscreenchange', fullscreenChangeHandler);
    });
  }

  private renderPage(index: number) {
    if (index < 0 || index >= this.pages.length) return;
    if (!this._demoDoc?.root) return;

    // 翻页前保存当前页绘图状态
    if (this.drawingCanvas) {
      this.drawingCanvas.savePageState(this.currentPageIndex);
      // 翻页时重置编号气泡计数器
      const calloutTool = this.drawingTools.get('callout') as CalloutTool | undefined;
      calloutTool?.resetCounter();
    }

    this.currentPageIndex = index;

    this.updatePageContent(index);
    // 翻页后恢复新页绘图
    if (this.drawingCanvas) {
      this.drawingCanvas.restorePageState(index);
      this.drawingCanvas.resizeToContainer();
    }

    // 更新进度
    if (this.controlBarRef) {
      this.controlBarRef.instance.totalPages = this.pages.length;
      this.controlBarRef.setInput('currentPage', index + 1);
      this.controlBarRef.instance.updateView();
    }
  }

  private updatePageContent(index: number) {
    if (!this._demoDoc?.root) return;

    const currentPage = this.scaleTableColWidths(this.pages[index]);

    this._demoDoc.crud.deleteBlocks(this._demoDoc.rootId, 0, this._demoDoc.root.childrenLength, true)
    this._demoDoc.crud.insertBlocks(this._demoDoc.rootId, 0, currentPage)

    // 滚动到顶部
    if (this.presentationContainer) {
      this.presentationContainer.scrollTop = 0;
    }
  }

  // demo fs = sourceFs * fontScale，所以表格 colWidths 的缩放比例
  // 就是同一个 fontScale，跟当前源文档具体多少像素无关。
  // 外部未传入或值非法（<=0）时回落到 DEFAULT_DEMO_FONT_SCALE。
  private getFontScale(): number {
    return this.normalizeScale(this.config.fontScale, DEFAULT_DEMO_FONT_SCALE);
  }

  // 行高 / 块间距默认跟随 fontScale，保持整体节奏与源文档比例一致；
  // 用户在 config 中显式给值时单独覆盖。
  private getLineHeightScale(): number {
    return this.normalizeScale(this.config.lineHeightScale, this.getFontScale());
  }

  private getSegmentsGapScale(): number {
    return this.normalizeScale(this.config.segmentsGapScale, this.getFontScale());
  }

  private normalizeScale(v: number | undefined, fallback: number): number {
    return Number.isFinite(v) && (v as number) > 0 ? (v as number) : fallback;
  }

  // 读源文档 root 的 computed CSS 长度变量（如 --bc-fs / --bc-lh / --bc-segments-gap）。
  // 源未挂载或变量异常时退回到 fallback。
  private readSourceCssLength(varName: string, fallback: number): number {
    const root = (this.originDoc as any)?.root?.hostElement as HTMLElement | undefined;
    if (root) {
      const v = parseFloat(getComputedStyle(root).getPropertyValue(varName));
      if (Number.isFinite(v) && v > 0) return v;
    }
    return fallback;
  }

  // 递归遍历 snapshot 树，对 flavour === 'table' 的节点按字号比例缩放 colWidths。
  // 返回新对象，不修改 this.pages 原始数据，确保多次翻页结果一致。
  private scaleTableColWidths(snapshots: IBlockSnapshot[]): IBlockSnapshot[] {
    const ratio = this.getFontScale();
    if (ratio === 1) return snapshots;
    return snapshots.map(snap => this.scaleSnapshot(snap, ratio));
  }

  private scaleSnapshot(snap: IBlockSnapshot, ratio: number): IBlockSnapshot {
    let next = snap;
    const colWidths = (snap.props as any)?.colWidths;
    if (snap.flavour === 'table' && Array.isArray(colWidths)) {
      next = {
        ...snap,
        props: {
          ...snap.props,
          colWidths: colWidths.map((w: number) => Math.round(w * ratio)),
        },
      };
    }
    if (Array.isArray(next.children) && next.children.length > 0) {
      next = {
        ...next,
        children: (next.children as IBlockSnapshot[]).map(child => this.scaleSnapshot(child, ratio)),
      } as IBlockSnapshot;
    }
    return next;
  }

  next() {
    if (this.currentPageIndex < this.pages.length - 1) {
      this.renderPage(this.currentPageIndex + 1);
    }
  }

  prev() {
    if (this.currentPageIndex > 0) {
      this.renderPage(this.currentPageIndex - 1);
    }
  }

  // ─── Drawing ───

  private initDrawingTools(): void {
    // this.drawingTools.set('select', new SelectTool());
    this.drawingTools.set('pen', new PenTool());
    this.drawingTools.set('highlighter', new HighlighterTool());
    this.drawingTools.set('eraser', new EraserTool());
    this.drawingTools.set('line', new LineTool());
    this.drawingTools.set('rect', new RectTool());
    this.drawingTools.set('ellipse', new EllipseTool());
    this.drawingTools.set('triangle', new TriangleTool());
    this.drawingTools.set('diamond', new DiamondTool());
    this.drawingTools.set('arrow', new ArrowTool());
    this.drawingTools.set('text', new TextTool());
    this.drawingTools.set('laser', new LaserTool());
    this.drawingTools.set('callout', new CalloutTool());
  }

  toggleDrawing(): void {
    this.isDrawingMode = !this.isDrawingMode;
    if (this.isDrawingMode) {
      this.enableDrawing();
    } else {
      this.disableDrawing();
    }
  }

  private enableDrawing(): void {
    if (!this.presentationContainer || !this._demoDoc?.root) return;

    // 初始化工具映射
    if (this.drawingTools.size === 0) {
      this.initDrawingTools();
    }

    // 创建 DrawingCanvas（如果尚未创建）
    if (!this.drawingCanvas) {
      this.drawingCanvas = new DrawingCanvas();
      this.drawingCanvas.mount(this._demoDoc.root.hostElement, this.presentationContainer);
      this.drawingCanvas.restorePageState(this.currentPageIndex);
    }
    this.drawingCanvas.setEnabled(true);

    // 创建工具栏（如果尚未创建）
    if (!this.drawingToolbarRef) {
      const appRef = this.originDoc.injector.get(ApplicationRef);
      this.drawingToolbarRef = createComponent(DrawingToolbarComponent, {
        environmentInjector: appRef.injector,
        elementInjector: this.originDoc.injector,
      });
      appRef.attachView(this.drawingToolbarRef.hostView);

      const toolbar = this.drawingToolbarRef.instance;
      const toolSub = toolbar.toolChange.subscribe((t: DrawingToolType) => {
        const tool = this.drawingTools.get(t) || null;
        this.drawingCanvas?.setTool(tool);
      });
      const colorSub = toolbar.colorChange.subscribe((c: string) => {
        this.drawingCanvas?.setColor(c);
      });
      const widthSub = toolbar.widthChange.subscribe((w: number) => {
        this.drawingCanvas?.setWidth(w);
      });
      const fillSub = toolbar.fillColorChange.subscribe((c: string) => {
        this.drawingCanvas?.setFillColor(c);
      });
      const opacitySub = toolbar.opacityChange.subscribe((o: number) => {
        this.drawingCanvas?.setOpacity(o);
      });
      const eraserSub = toolbar.eraserWidthChange.subscribe((e: number) => {
        this.drawingCanvas?.setEraserWidth(e);
      });
      const dashSub = toolbar.dashChange.subscribe((d: number[]) => {
        this.drawingCanvas?.setDash(d);
      });
      const undoSub = toolbar.undoAction.subscribe(() => this.drawingCanvas?.undo());
      const redoSub = toolbar.redoAction.subscribe(() => this.drawingCanvas?.redo());
      const clearSub = toolbar.clearAction.subscribe(() => this.drawingCanvas?.clear());
      const closeSub = toolbar.closeAction.subscribe(() => this.toggleDrawing());
      // const replaySub = toolbar.replayAction.subscribe(() => this.drawingCanvas?.replay());
      const toggleVisSub = toolbar.toggleVisibilityAction.subscribe(() => this.drawingCanvas?.toggleVisibility());
      // const stampSub = toolbar.stampChange.subscribe((stamp: string) => {
      //     const stampTool = this.drawingTools.get('stamp') as StampTool | undefined;
      //     stampTool?.setStamp(stamp);
      // });
      // const durationSub = toolbar.durationChange.subscribe((duration: number) => {
      //     if (!this.countdownWidget) {
      //         this.countdownWidget = new CountdownWidget();
      //         this.countdownWidget.mount(this.presentationContainer!);
      //     }
      //     this.countdownWidget.setDuration(duration);
      // });

      this.eventCleanups.push(() => {
        toolSub.unsubscribe();
        colorSub.unsubscribe();
        widthSub.unsubscribe();
        fillSub.unsubscribe();
        opacitySub.unsubscribe();
        dashSub.unsubscribe();
        undoSub.unsubscribe();
        redoSub.unsubscribe();
        clearSub.unsubscribe();
        closeSub.unsubscribe();
        eraserSub.unsubscribe();
        // replaySub.unsubscribe();
        toggleVisSub.unsubscribe();
        // stampSub.unsubscribe();
        // durationSub.unsubscribe();
      });

      this.presentationContainer.appendChild(this.drawingToolbarRef.location.nativeElement);
    }

    // 显示工具栏
    this.drawingToolbarRef.location.nativeElement.style.display = '';
    this.drawingToolbarRef.instance.pinned = true;
    this.drawingToolbarRef.instance.show();

    // 控制栏也常驻显示
    if (this.controlBarRef) {
      this.controlBarRef.instance.pinned = true;
      this.controlBarRef.instance.show();
    }

    // 默认选中画笔
    const penTool = this.drawingTools.get('pen')!;
    this.drawingCanvas.setTool(penTool);
    this.drawingToolbarRef.setInput('activeTool', 'pen');
    this.drawingToolbarRef.instance.updateView();
  }

  private disableDrawing(): void {
    // 保存当前页绘图状态
    if (this.drawingCanvas) {
      this.drawingCanvas.savePageState(this.currentPageIndex);
      this.drawingCanvas.setEnabled(false);
      this.drawingCanvas.setTool(null);
    }

    // 隐藏工具栏
    if (this.drawingToolbarRef) {
      this.drawingToolbarRef.instance.pinned = false;
      this.drawingToolbarRef.location.nativeElement.style.display = 'none';
    }

    // 控制栏恢复自动隐藏
    if (this.controlBarRef) {
      this.controlBarRef.instance.pinned = false;
      this.controlBarRef.instance.startHideTimer();
    }
  }

  private showSimpleImagePreview(imgElement: HTMLElement) {
    const img = imgElement instanceof HTMLImageElement
      ? imgElement
      : imgElement.querySelector('img');

    if (!img?.src) return;
    this.isImgPreviewMode = true;

    this.currentPreview = new SimpleImagePreview({
      src: img.src,
      container: this.presentationContainer || document.body,
      onClose: () => {
        this.currentPreview = null;
        setTimeout(() => {
          this.isImgPreviewMode = false;
        }, 100)
      },
      onError: (error) => {
        console.error('Image preview error:', error);
      }
    });
    this.currentPreview.show();
  }

  private showMermaidPreview(graphCon: HTMLElement) {
    const svg = graphCon.querySelector('svg');
    if (!svg || !(svg instanceof SVGElement)) return;

    this.isImgPreviewMode = true;

    // 克隆 SVG 并修正尺寸，使其脱离原容器后仍能正确显示
    const previewSvg = svg.cloneNode(true) as SVGElement;
    if (previewSvg instanceof SVGSVGElement) {
      previewSvg.style.removeProperty('max-width');
      previewSvg.style.removeProperty('width');
      previewSvg.style.removeProperty('height');

      let width = 0;
      let height = 0;
      const viewBoxAttr = previewSvg.getAttribute('viewBox');
      if (viewBoxAttr) {
        const viewBox = viewBoxAttr.split(/[\s,]+/).map(Number);
        if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
          width = viewBox[2];
          height = viewBox[3];
        }
      }
      if (!width || !height) {
        const rect = svg.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          width = rect.width;
          height = rect.height;
        }
      }
      if (width > 0 && height > 0) {
        previewSvg.setAttribute('width', `${width}`);
        previewSvg.setAttribute('height', `${height}`);
      }
    }

    const svgString = new XMLSerializer().serializeToString(previewSvg);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    this.currentPreview = new SimpleImagePreview({
      src: url,
      container: this.presentationContainer || document.body,
      onClose: () => {
        this.currentPreview = null;
        URL.revokeObjectURL(url);
        setTimeout(() => {
          this.isImgPreviewMode = false;
        }, 100);
      },
      onError: (error) => {
        URL.revokeObjectURL(url);
        console.error('Mermaid preview error:', error);
      }
    });
    this.currentPreview.show();
  }

  destroy() {
    (navigator as any).keyboard?.unlock?.();

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => {
        console.warn('Failed to exit fullscreen:', err);
      });
    }

    // 清理事件监听和DOM
    this.eventCleanups.forEach(cleanup => cleanup());
    this.eventCleanups = [];

    // 重置引用
    this.drawingCanvas?.unmount();
    this.drawingCanvas = null;
    this.drawingToolbarRef?.destroy();
    this.drawingToolbarRef = null;
    this.isDrawingMode = false;
    this._demoDoc?.destroy()
    this._demoDoc = null;
    this.presentationContainer?.remove();
    this.presentationContainer = null;
  }
}
