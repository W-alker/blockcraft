import {ApplicationRef, ComponentRef, createComponent} from "@angular/core";
import {DemoControlBarComponent} from "./widgets/demo-control-bar.component";
import {nextTick, throttle} from "../../global";
import {BlockCraftDoc, IBlockSnapshot, SchemaManager} from "../../framework";
import * as Y from 'yjs';
import {DemoCoverBlockModel, DemoCoverBlockSchema, DemoRootComponent} from "./blocks";
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
}

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
    schemaStore.get('root')!.component = DemoRootComponent
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

  private enterFullscreen() {
    // 使用浏览器原生全屏 API
    if (this.presentationContainer && this.presentationContainer.requestFullscreen) {
      this.presentationContainer.requestFullscreen().catch(err => {
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
    };

    if (this.presentationContainer) {
      this.presentationContainer.addEventListener('click', clickHandler);
      this.eventCleanups.push(() => {
        this.presentationContainer?.removeEventListener('click', clickHandler);
      });
    }

    // 监听全屏退出
    const fullscreenChangeHandler = () => {
      if (!document.fullscreenElement) {
        // 用户按 ESC 退出了全屏
        this.destroy();
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

    const currentPage = this.pages[index];

    this._demoDoc.crud.deleteBlocks(this._demoDoc.rootId, 0, this._demoDoc.root.childrenLength, true)
    this._demoDoc.crud.insertBlocks(this._demoDoc.rootId, 0, currentPage)

    // 滚动到顶部
    if (this.presentationContainer) {
      this.presentationContainer.scrollTop = 0;
    }
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
      this.drawingCanvas.mount(this._demoDoc.root.hostElement);
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

    new SimpleImagePreview({
      src: img.src,
      container: this.presentationContainer || document.body,
      onClose: () => {
        // 预览关闭后的清理工作
        setTimeout(() => {
          this.isImgPreviewMode = false;
        }, 100)
      },
      onError: (error) => {
        console.error('Image preview error:', error);
      }
    }).show();
  }

  destroy() {
    // 退出全屏
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => {
        console.warn('Failed to exit fullscreen:', err);
      });
    }

    // 清理事件监听和DOM
    this.eventCleanups.forEach(cleanup => cleanup());
    this.eventCleanups = [];

    // 重置引用
    this._demoDoc?.destroy()
    this._demoDoc = null;
    this.presentationContainer?.remove();
    this.presentationContainer = null;
  }
}
