import {ApplicationRef, ComponentRef, createComponent} from "@angular/core";
import {DemoControlBarComponent} from "./widgets/demo-control-bar.component";
import {nextTick, throttle} from "../../global";
import {
  BlockCraftDoc,
  DocConfig,
  IBlockSnapshot,
  SchemaManager,
  stripBlockLockMetaDeep,
} from "../../framework";
import {ORIGIN_READONLY_VIEW_PROJECTION} from "../../framework/doc/origins";
import {analyzePages} from "./page-analyzer";
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
import {PaginationPlugin} from "../pagination";
import {PaginationDocumentHeaderOptions} from "../../framework/modules/pagination";
import {StablePaginationLayout} from "../../framework/modules/pagination/view/stable-pagination-layout";

type PresentationLayoutMode = 'flow' | 'paginated';
type PaginatedScaleMode = 'fit' | 'manual';
type PaginatedScrollAnchor = {x: number; y: number};

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
   * 流式演示页的整体视觉缩放。通过 demo Doc 的 viewScale 统一缩放完整页面，
   * 不改写字号、行高、段间距或 Snapshot 尺寸。默认 1.5，范围 0.5–2。
   * 分页演示会按真实纸页自动适配视口，不读取该值。
   */
  viewScale?: number
  /**
   * @deprecated 请使用 viewScale。为了兼容旧调用，未传 viewScale 时它作为别名，
   * 但现在缩放的是完整页面，不再单独改写 --bc-fs。
   */
  fontScale?: number
  /**
   * @deprecated 请直接修改文档行高。仅作为旧调用的显式兼容修正量保留。
   */
  lineHeightScale?: number
  /**
   * @deprecated 请直接修改文档块间距。仅作为旧调用的显式兼容修正量保留。
   */
  segmentsGapScale?: number
}

const DEFAULT_DEMO_VIEW_SCALE = 1.5;
const PAGINATED_LOOKAHEAD_PAGES = 2;
const PAGINATED_PREPARE_MAX_FRAMES = 12;

export class PresentationController {
  private pages: IBlockSnapshot[][] = [];
  private currentPageIndex = 0;
  private controlBarRef: ComponentRef<DemoControlBarComponent> | null = null;
  private eventCleanups: (() => void)[] = [];
  private presentationContainer: HTMLElement | null = null;
  private presentationViewport: HTMLElement | null = null;
  private presentationTrack: HTMLElement | null = null;
  private presentationSurface: HTMLElement | null = null;
  private presentationScaleProbe: HTMLElement | null = null;
  private bodyThemeBeforePresentation: string | null = null;
  private presentationTheme: string | null = null;
  private bodyThemeCaptured = false;

  private drawingCanvas: DrawingCanvas | null = null;
  private drawingToolbarRef: ComponentRef<DrawingToolbarComponent> | null = null;
  private drawingTools: Map<DrawingToolType, DrawingTool> = new Map();
  private isDrawingMode = false;
  private isImgPreviewMode = false;
  private needReenterFullscreen = false;
  private currentPreview: SimpleImagePreview | null = null;
  private layoutMode: PresentationLayoutMode = 'flow';
  private sourcePaginationPlugin: PaginationPlugin | null = null;
  private demoPaginationPlugin: PaginationPlugin | null = null;
  private paginatedFitScale = 1;
  private paginatedScaleMode: PaginatedScaleMode = 'fit';
  private paginatedStableLayout: StablePaginationLayout | null = null;
  private paginatedPreparation: Promise<boolean> | null = null;
  private paginatedNavigationPending = false;
  private lifecycleRevision = 0;

  private _demoDoc: BlockCraft.Doc | null = null;

  constructor(
    private originDoc: BlockCraft.Doc,
    private config: DemoConfig
  ) {
  }

  start() {
    const lifecycleRevision = ++this.lifecycleRevision;
    // 演示文档是独立的临时只读投影，不应显示或传播源文档的持久锁权限。
    // 文档级 readonly 仍会完整保留，负责阻断所有用户输入与普通 CRUD 调用。
    const rootSnapshot = stripBlockLockMetaDeep(this.originDoc.exportSnapshot()!);
    this.sourcePaginationPlugin = this.findEnabledPaginationPlugin();
    this.layoutMode = this.sourcePaginationPlugin ? 'paginated' : 'flow';

    if (this.layoutMode === 'flow') {
      this.pages = analyzePages(rootSnapshot.children as IBlockSnapshot[]);
      if(this.config.cover) {
        this.pages.unshift([DemoCoverBlockSchema.createSnapshot(this.config.cover)])
      }
    }

    if (this.layoutMode === 'flow' && this.pages.length === 0) {
      console.warn('No pages to present');
      return;
    }

    nextTick().then(() => void this.startPresentation(rootSnapshot, lifecycleRevision))

  }

  private async startPresentation(
    rootSnapshot: IBlockSnapshot,
    lifecycleRevision: number,
  ): Promise<void> {
    if (lifecycleRevision !== this.lifecycleRevision) return;
    this.createDemoDocAndContainer(rootSnapshot)

    if (
      this.layoutMode === 'paginated'
      && !await this.ensurePaginatedLookahead(0, lifecycleRevision)
    ) {
      if (lifecycleRevision !== this.lifecycleRevision) return;
      console.warn('Paginated presentation layout is not ready');
      this.destroy();
      return;
    }
    if (lifecycleRevision !== this.lifecycleRevision) return;

    if (this.totalPages === 0) {
      console.warn('No pages to present');
      this.destroy();
      return;
    }

    this.applyPresentationViewScale();
    if (this.layoutMode === 'paginated') {
      this.bindPaginatedPageCount();
      this.bindPaginatedReadinessInvalidation();
    }
    this.enterFullscreen();
    this.renderControlBar();
    this.bindEvents();
    this.renderPage(0);
  }

  createDemoDocAndContainer(rootSnapshot: IBlockSnapshot) {
    const schemas = this.originDoc.schemas.getSchemaList()
    if (this.layoutMode === 'flow') {
      schemas.push(DemoCoverBlockSchema)
    }
    const schemaStore = new SchemaManager(schemas)
    if (this.layoutMode === 'flow') {
      // 流式演示使用专用根 Block 承载逐页 Snapshot；分页演示必须保留源 Root
      // Schema，否则额外包装会改变真实分页测量。
      schemaStore.register(DemoRootBlockSchema)
      rootSnapshot.children = []
    }
    const presentationContainer = document.createElement('div')
    presentationContainer.className = 'presentation-stage';
    presentationContainer.style.cssText = `
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
    // 仅复制源文档已解析的排版 token，不在这一层改变数值。
    // 完整页面的放大在 demo Doc 初始化后由 viewScale 统一完成。
    this.copySourceLayoutTokens(presentationContainer);
    this.applyLegacySpacingOverrides(presentationContainer);

    this.captureBodyTheme();
    this.presentationContainer = presentationContainer;
    const runtimeSurface = this.createRuntimeSurface(presentationContainer);
    const plugins = this.layoutMode === 'paginated'
      ? [this.createDemoPaginationPlugin(runtimeSurface.mountContainer)]
      : [];
    this._demoDoc = new BlockCraftDoc(
      this.createDemoDocConfig(
        schemaStore,
        runtimeSurface.scrollContainer,
        plugins,
      ),
    );
    document.body.appendChild(presentationContainer);
    this._demoDoc.initBySnapshot(rootSnapshot, runtimeSurface.mountContainer);
    if (this.layoutMode === 'paginated') {
      this.markPaginatedRootAsPresentationSurface();
    }
  }

  private markPaginatedRootAsPresentationSurface(): void {
    const root = this._demoDoc?.root?.hostElement;
    if (!root) return;
    root.classList.add('demo-root');
    root.setAttribute('data-bc-surface', 'presentation');
  }

  /** Build an isolated runtime config for the transient presentation surface. */
  private createDemoDocConfig(
    schemas: SchemaManager,
    scrollContainer: HTMLElement,
    plugins: BlockCraft.Plugin[] = [],
  ): DocConfig {
    const theme = this.bodyThemeBeforePresentation
      ?? this.originDoc.config.theme
      ?? 'light';
    this.presentationTheme = theme;
    return {
      ...this.originDoc.config,
      plugins,
      yDoc: new Y.Doc(),
      // A page is one exact presentation unit. Sparse root mounting can hide
      // page content and invalidates drawing/transition geometry.
      virtualization: {enabled: false},
      // Never reuse the authoring editor's scroll container in the overlay.
      scrollContainer,
      // Match the currently active global theme instead of forcing body to light.
      theme,
      schemas,
      readonly: true,
    };
  }

  private createRuntimeSurface(container: HTMLElement): {
    mountContainer: HTMLElement;
    scrollContainer: HTMLElement;
  } {
    if (this.layoutMode === 'flow') {
      this.presentationSurface = container;
      return {mountContainer: container, scrollContainer: container};
    }

    container.style.padding = '0';
    container.style.overflow = 'hidden';
    const viewport = document.createElement('div');
    viewport.className = 'presentation-page-viewport';
    const track = document.createElement('div');
    track.className = 'presentation-page-track';
    const surface = document.createElement('div');
    surface.className = 'presentation-page-surface';
    const scaleProbe = document.createElement('div');
    scaleProbe.className = 'presentation-scale-probe';
    track.appendChild(surface);
    viewport.append(scaleProbe, track);
    container.appendChild(viewport);
    this.presentationViewport = viewport;
    this.presentationTrack = track;
    this.presentationSurface = surface;
    this.presentationScaleProbe = scaleProbe;
    return {mountContainer: surface, scrollContainer: viewport};
  }

  private createDemoPaginationPlugin(surface: HTMLElement): PaginationPlugin {
    const source = this.sourcePaginationPlugin;
    if (!source) throw new Error('Paginated presentation requires an enabled PaginationPlugin');
    const documentHeader = this.clonePaginationDocumentHeader(source.documentHeader, surface);
    const plugin = new PaginationPlugin({
      ...source.config,
      enabled: true,
      experimentalSparseView: false,
      documentHeader,
    });
    this.demoPaginationPlugin = plugin;
    return plugin;
  }

  private clonePaginationDocumentHeader(
    options: Readonly<PaginationDocumentHeaderOptions> | undefined,
    surface: HTMLElement,
  ): PaginationDocumentHeaderOptions | undefined {
    if (!options) return undefined;
    const source = typeof options.element === 'function'
      ? options.element()
      : options.element;
    if (!source) return undefined;
    const clone = source.cloneNode(true) as HTMLElement;
    const clonedElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
    for (const element of clonedElements) {
      element.removeAttribute('id');
      for (const attribute of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns']) {
        element.removeAttribute(attribute);
      }
    }
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('inert', '');
    surface.appendChild(clone);
    return {...options, element: clone};
  }

  private findEnabledPaginationPlugin(): PaginationPlugin | null {
    return this.originDoc.plugins.find(
      (plugin): plugin is PaginationPlugin =>
        plugin instanceof PaginationPlugin && plugin.enabled,
    ) ?? null;
  }

  private get totalPages(): number {
    if (this.layoutMode === 'flow') return this.pages.length;
    return this.getPaginatedSheets().length;
  }

  private getPaginatedSheets(): HTMLElement[] {
    if (!this.presentationSurface) return [];
    return Array.from(
      this.presentationSurface.querySelectorAll<HTMLElement>('.bc-page-sheet'),
    );
  }

  /**
   * 分页演示不复用源编辑器可能仍是稀疏估算的分页结果。临时只读 Doc 完整挂载后，
   * 等待分页 controller 就绪并同步捕获一次 exact 布局；当前页和后两页的页框、
   * 顶层 Block DOM 都属于同一布局版本时，才允许进入或继续翻页。
   */
  private ensurePaginatedLookahead(
    pageIndex: number,
    lifecycleRevision = this.lifecycleRevision,
  ): Promise<boolean> {
    if (this.layoutMode !== 'paginated') return Promise.resolve(true);
    if (this.isPaginatedLookaheadReady(this.paginatedStableLayout, pageIndex)) {
      return Promise.resolve(true);
    }
    if (this.paginatedPreparation) {
      return this.paginatedPreparation.then(ready => ready
        && this.isPaginatedLookaheadReady(this.paginatedStableLayout, pageIndex));
    }

    const preparation = this.preparePaginatedLookahead(pageIndex, lifecycleRevision);
    this.paginatedPreparation = preparation;
    return preparation.finally(() => {
      if (this.paginatedPreparation === preparation) {
        this.paginatedPreparation = null;
      }
    });
  }

  private async preparePaginatedLookahead(
    pageIndex: number,
    lifecycleRevision: number,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < PAGINATED_PREPARE_MAX_FRAMES; attempt++) {
      if (lifecycleRevision !== this.lifecycleRevision) return false;
      this.demoPaginationPlugin?.recompute();
      await this.waitForPresentationFrame();
      if (lifecycleRevision !== this.lifecycleRevision) return false;

      // captureStableLayout 是同步重排屏障；它会取消尚未执行的分页 RAF，基于当前
      // 完整只读 DOM 重新测量并同步发布对应页框。
      const layout = this.demoPaginationPlugin?.captureStableLayout() ?? null;
      if (!this.isPaginatedLookaheadReady(layout, pageIndex)) continue;
      this.paginatedStableLayout = layout;
      return true;
    }
    return false;
  }

  private isPaginatedLookaheadReady(
    layout: StablePaginationLayout | null,
    pageIndex: number,
  ): layout is StablePaginationLayout {
    if (!layout || pageIndex < 0 || pageIndex >= layout.result.pages.length) return false;
    const sheets = this.getPaginatedSheets();
    if (sheets.length !== layout.result.pages.length) return false;

    const readyThrough = Math.min(
      layout.result.pages.length - 1,
      pageIndex + PAGINATED_LOOKAHEAD_PAGES,
    );
    const mountedBlockIds = new Set(
      Array.from(
        this.presentationSurface?.querySelectorAll<HTMLElement>('[data-block-id]') ?? [],
        element => element.getAttribute('data-block-id'),
      ).filter((id): id is string => id !== null),
    );
    for (let index = pageIndex; index <= readyThrough; index++) {
      if (layout.result.pages[index].slots.some(slot => !mountedBlockIds.has(slot.id))) {
        return false;
      }
    }
    return true;
  }

  private waitForPresentationFrame(): Promise<void> {
    const view = this.presentationSurface?.ownerDocument.defaultView;
    if (!view) return Promise.resolve();
    return new Promise(resolve => view.requestAnimationFrame(() => resolve()));
  }

  private captureBodyTheme(): void {
    if (this.bodyThemeCaptured) return;
    this.bodyThemeBeforePresentation = document.body.getAttribute('blockcraft-theme');
    this.bodyThemeCaptured = true;
  }

  private restoreBodyTheme(): void {
    if (!this.bodyThemeCaptured) return;
    // Do not overwrite a host theme change that happened while presenting.
    if (document.body.getAttribute('blockcraft-theme') === this.presentationTheme) {
      if (this.bodyThemeBeforePresentation === null) {
        document.body.removeAttribute('blockcraft-theme');
      } else {
        document.body.setAttribute('blockcraft-theme', this.bodyThemeBeforePresentation);
      }
    }
    this.bodyThemeBeforePresentation = null;
    this.presentationTheme = null;
    this.bodyThemeCaptured = false;
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
    this.controlBarRef.setInput('totalPages', this.totalPages);
    this.controlBarRef.setInput('showZoomControls', this.layoutMode === 'paginated');
    this.updatePaginatedScaleControls();
    this.controlBarRef.instance.updateView()

    // 监听事件
    const prevSub = controlBarRef.instance.prev.subscribe(() => this.prev());
    const nextSub = controlBarRef.instance.next.subscribe(() => this.next());
    const zoomInSub = controlBarRef.instance.zoomIn.subscribe(() => this.zoomPaginatedPage(0.1));
    const zoomOutSub = controlBarRef.instance.zoomOut.subscribe(() => this.zoomPaginatedPage(-0.1));
    const fitPageSub = controlBarRef.instance.fitPage.subscribe(() => this.fitPaginatedPage());
    const exitSub = controlBarRef.instance.exit.subscribe(() => this.destroy());
    const drawingSub = controlBarRef.instance.toggleDrawing.subscribe(() => this.toggleDrawing());

    this.eventCleanups.push(() => {
      prevSub.unsubscribe();
      nextSub.unsubscribe();
      zoomInSub.unsubscribe();
      zoomOutSub.unsubscribe();
      fitPageSub.unsubscribe();
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

      if (
        this.layoutMode === 'paginated'
        && (e.ctrlKey || e.metaKey)
        && !this.isImgPreviewMode
      ) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          this.zoomPaginatedPage(0.1);
          return;
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          this.zoomPaginatedPage(-0.1);
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          this.fitPaginatedPage();
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

    this.bindPaginatedZoomWheel();

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
    if (index < 0 || index >= this.totalPages) return;
    if (!this._demoDoc?.root) return;

    // 翻页前保存当前页绘图状态
    if (this.drawingCanvas) {
      this.drawingCanvas.savePageState(this.currentPageIndex);
      // 翻页时重置编号气泡计数器
      const calloutTool = this.drawingTools.get('callout') as CalloutTool | undefined;
      calloutTool?.resetCounter();
    }

    this.currentPageIndex = index;

    if (this.layoutMode === 'flow') {
      this.updatePageContent(index);
    } else {
      this.positionPaginatedPage(index);
      // 当前页显示后立即预热新的两页前瞻；用户很快继续翻页时通常无需等待。
      void this.ensurePaginatedLookahead(index);
    }
    // 翻页后恢复新页绘图
    if (this.drawingCanvas) {
      this.drawingCanvas.restorePageState(index);
      this.drawingCanvas.resizeToContainer();
    }

    // 更新进度
    if (this.controlBarRef) {
      this.controlBarRef.instance.totalPages = this.totalPages;
      this.controlBarRef.setInput('currentPage', index + 1);
      this.controlBarRef.instance.updateView();
    }
  }

  private updatePageContent(index: number) {
    const demoDoc = this._demoDoc;
    if (!demoDoc?.root) return;

    const currentPage = this.pages[index];

    // 演示文档及 DOM 始终保持只读；只有框架内置的页面投影事务可以替换
    // 临时根内容。该 origin 不进入 undo，也不会向 readonlySwitch$ 广播可写状态。
    demoDoc.crud.transact(() => {
      demoDoc.crud.deleteBlocks(
        demoDoc.rootId,
        0,
        demoDoc.root.childrenLength,
        true,
      );
      demoDoc.crud.insertBlocks(demoDoc.rootId, 0, currentPage);
    }, ORIGIN_READONLY_VIEW_PROJECTION);

    // 滚动到顶部
    if (this.presentationContainer) {
      this.presentationContainer.scrollTop = 0;
    }
  }

  private getViewScale(): number {
    const configured = this.config.viewScale ?? this.config.fontScale;
    const positive = Number.isFinite(configured) && (configured as number) > 0
      ? configured as number
      : DEFAULT_DEMO_VIEW_SCALE;
    return Math.round(Math.min(2, Math.max(0.5, positive)) * 100) / 100;
  }

  private copySourceLayoutTokens(target: HTMLElement): void {
    const root = (this.originDoc as any)?.root?.hostElement as HTMLElement | undefined;
    if (!root) return;
    const style = getComputedStyle(root);
    for (const token of ['--bc-fs', '--bc-lh', '--bc-segments-gap']) {
      const value = style.getPropertyValue(token).trim()
        || root.style.getPropertyValue(token).trim();
      if (value) target.style.setProperty(token, value);
    }
  }

  private applyLegacySpacingOverrides(target: HTMLElement): void {
    const viewScale = this.getViewScale();
    const overrides = [
      ['--bc-lh', this.config.lineHeightScale],
      ['--bc-segments-gap', this.config.segmentsGapScale],
    ] as const;
    for (const [token, configured] of overrides) {
      if (!Number.isFinite(configured) || (configured as number) <= 0) continue;
      const sourceValue = target.style.getPropertyValue(token).trim();
      if (!sourceValue) continue;
      const correction = Math.round(((configured as number) / viewScale) * 10000) / 10000;
      target.style.setProperty(token, `calc(${sourceValue} * ${correction})`);
    }
  }

  private applyPresentationViewScale(): void {
    const demoDoc = this._demoDoc;
    if (!demoDoc?.root) return;
    if (this.layoutMode === 'paginated') {
      this.applyPaginatedFitScale(true);
      return;
    }
    // 先设值再 attach，避免根节点先以 1x 投影后再跳变。
    demoDoc.viewScale.setScale(this.getViewScale());
    demoDoc.viewScale.attach(demoDoc.root.hostElement);
  }

  private applyPaginatedFitScale(forceFit = false): void {
    const demoDoc = this._demoDoc;
    const viewport = this.presentationViewport;
    const surface = this.presentationSurface;
    const scaleProbe = this.presentationScaleProbe;
    const firstSheet = this.getPaginatedSheets()[0];
    if (!demoDoc?.root || !viewport || !surface || !scaleProbe || !firstSheet) return;

    const pageWidth = firstSheet.offsetWidth;
    const pageHeight = firstSheet.offsetHeight;
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    if (pageWidth <= 0 || pageHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return;

    // 分页演示以一张真实纸页为适配单位。先冻结分页面的逻辑宽度，避免缩放后
    // 容器宽度反馈到分页计算，继而改变断点。
    surface.style.width = `${pageWidth}px`;
    // ViewScaleManager 会规范到两位小数；向下取整可保证规范化后页面仍不越界。
    this.paginatedFitScale = Math.floor(
      Math.min(viewportWidth / pageWidth, viewportHeight / pageHeight) * 100,
    ) / 100;
    if (forceFit) this.paginatedScaleMode = 'fit';
    const targetScale = this.paginatedScaleMode === 'fit'
      ? this.paginatedFitScale
      : demoDoc.viewScale.value;
    this.applyPaginatedScale(targetScale);
  }

  private applyPaginatedScale(scale: number): void {
    const demoDoc = this._demoDoc;
    const surface = this.presentationSurface;
    const scaleProbe = this.presentationScaleProbe;
    if (!demoDoc || !surface || !scaleProbe) return;

    const scrollAnchor = this.capturePaginatedScrollAnchor();
    const normalizedScale = demoDoc.viewScale.setScale(scale);
    // CSS zoom 会让百分比媒体、表格等重新参与布局并产生像素取整差异。
    // 分页面只做不重排的 transform；独立探针负责把同一比例投影给几何系统。
    demoDoc.viewScale.attach(scaleProbe);
    surface.style.transformOrigin = 'top left';
    surface.style.transform = `scale(${normalizedScale})`;
    surface.setAttribute('data-bc-view-scale', String(normalizedScale));
    this.updatePaginatedScaleControls();
    this.positionPaginatedPage(this.currentPageIndex, scrollAnchor);
  }

  private zoomPaginatedPage(delta: number): void {
    if (this.layoutMode !== 'paginated' || !this._demoDoc) return;
    this.paginatedScaleMode = 'manual';
    this.applyPaginatedScale(this._demoDoc.viewScale.value + delta);
  }

  private fitPaginatedPage(): void {
    if (this.layoutMode !== 'paginated') return;
    this.paginatedScaleMode = 'fit';
    this.applyPaginatedFitScale(true);
  }

  private updatePaginatedScaleControls(): void {
    if (!this.controlBarRef || this.layoutMode !== 'paginated' || !this._demoDoc) return;
    const scale = this._demoDoc.viewScale.value;
    this.controlBarRef.setInput('zoomPercent', Math.round(scale * 100));
    this.controlBarRef.setInput(
      'fitPageActive',
      this.paginatedScaleMode === 'fit'
        && Math.abs(scale - this.paginatedFitScale) < 0.005,
    );
    this.controlBarRef.instance.updateView();
  }

  private bindPaginatedZoomWheel(): void {
    const viewport = this.presentationViewport;
    if (this.layoutMode !== 'paginated' || !viewport) return;
    let pendingDirection = 0;
    let frame = 0;
    const wheelHandler = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return;
      event.preventDefault();
      event.stopPropagation();
      pendingDirection = event.deltaY < 0 ? 1 : -1;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        this.zoomPaginatedPage(pendingDirection * 0.1);
        pendingDirection = 0;
      });
    };
    viewport.addEventListener('wheel', wheelHandler, {capture: true, passive: false});
    this.eventCleanups.push(() => {
      if (frame) cancelAnimationFrame(frame);
      viewport.removeEventListener('wheel', wheelHandler, true);
    });
  }

  private positionPaginatedPage(
    index: number,
    scrollAnchor?: PaginatedScrollAnchor | null,
  ): void {
    const viewport = this.presentationViewport;
    const track = this.presentationTrack;
    const surface = this.presentationSurface;
    const sheet = this.getPaginatedSheets()[index];
    if (!viewport || !track || !surface || !sheet || !this._demoDoc) return;

    const scale = this._demoDoc.viewScale.value;
    const pageTop = this.getOffsetTopWithin(sheet, surface) * scale;
    const pageWidth = sheet.offsetWidth * scale;
    const pageHeight = sheet.offsetHeight * scale;
    const trackWidth = Math.max(viewport.clientWidth, pageWidth);
    const trackHeight = Math.max(viewport.clientHeight, pageHeight);
    const centeredLeft = Math.max(0, (trackWidth - pageWidth) / 2);
    const centeredTop = Math.max(0, (trackHeight - pageHeight) / 2);

    // track 是当前纸页的真实滚动画布；surface 只负责把完整分页文档中的当前页
    // 投影到画布内。其他页由 track 裁掉，避免放大后滚动穿越到相邻页。
    track.style.width = `${this.roundLayoutValue(trackWidth)}px`;
    track.style.height = `${this.roundLayoutValue(trackHeight)}px`;
    track.style.transform = '';
    surface.style.left = `${this.roundLayoutValue(centeredLeft)}px`;
    surface.style.top = `${this.roundLayoutValue(centeredTop - pageTop)}px`;

    if (scrollAnchor) {
      viewport.scrollLeft = this.clampScrollOffset(
        scrollAnchor.x * trackWidth - viewport.clientWidth / 2,
        trackWidth - viewport.clientWidth,
      );
      viewport.scrollTop = this.clampScrollOffset(
        scrollAnchor.y * trackHeight - viewport.clientHeight / 2,
        trackHeight - viewport.clientHeight,
      );
    } else {
      viewport.scrollLeft = Math.max(0, (trackWidth - viewport.clientWidth) / 2);
      viewport.scrollTop = 0;
    }
  }

  private capturePaginatedScrollAnchor(): PaginatedScrollAnchor | null {
    const viewport = this.presentationViewport;
    const track = this.presentationTrack;
    if (!viewport || !track) return null;
    const width = Math.max(track.offsetWidth, viewport.clientWidth);
    const height = Math.max(track.offsetHeight, viewport.clientHeight);
    if (width <= 0 || height <= 0) return null;
    return {
      x: (viewport.scrollLeft + viewport.clientWidth / 2) / width,
      y: (viewport.scrollTop + viewport.clientHeight / 2) / height,
    };
  }

  private clampScrollOffset(value: number, max: number): number {
    return Math.max(0, Math.min(Math.max(0, max), value));
  }

  private roundLayoutValue(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private getOffsetTopWithin(element: HTMLElement, ancestor: HTMLElement): number {
    let top = 0;
    let current: HTMLElement | null = element;
    while (current && current !== ancestor) {
      top += current.offsetTop;
      current = current.offsetParent as HTMLElement | null;
    }
    return top;
  }

  private bindPaginatedPageCount(): void {
    const backdrop = this.presentationSurface
      ?.querySelector<HTMLElement>('.bc-pagination-backdrop');
    if (!backdrop) return;

    const syncCurrentPage = (invalidateLayout = false) => {
      if (invalidateLayout) this.paginatedStableLayout = null;
      const total = this.totalPages;
      if (total === 0) return;
      this.currentPageIndex = Math.min(this.currentPageIndex, total - 1);
      if (this.controlBarRef) {
        this.controlBarRef.instance.totalPages = total;
        this.controlBarRef.setInput('currentPage', this.currentPageIndex + 1);
        this.controlBarRef.instance.updateView();
      }
      this.positionPaginatedPage(
        this.currentPageIndex,
        this.capturePaginatedScrollAnchor(),
      );
    };

    const pageObserver = new MutationObserver(() => syncCurrentPage(true));
    pageObserver.observe(backdrop, {childList: true});
    this.eventCleanups.push(() => pageObserver.disconnect());

    if (typeof ResizeObserver !== 'undefined' && this.presentationViewport) {
      const resizeObserver = new ResizeObserver(() => {
        this.applyPaginatedFitScale();
        syncCurrentPage();
      });
      resizeObserver.observe(this.presentationViewport);
      this.eventCleanups.push(() => resizeObserver.disconnect());
    }

    syncCurrentPage();
  }

  private bindPaginatedReadinessInvalidation(): void {
    const surface = this.presentationSurface;
    if (!surface) return;
    const invalidate = () => {
      this.paginatedStableLayout = null;
    };
    surface.addEventListener('load', invalidate, true);
    surface.addEventListener('error', invalidate, true);
    this.eventCleanups.push(() => {
      surface.removeEventListener('load', invalidate, true);
      surface.removeEventListener('error', invalidate, true);
    });

    const fonts = surface.ownerDocument.fonts;
    if (fonts && typeof fonts.addEventListener === 'function') {
      fonts.addEventListener('loadingdone', invalidate);
      this.eventCleanups.push(() => fonts.removeEventListener('loadingdone', invalidate));
    }
  }

  next() {
    if (this.currentPageIndex >= this.totalPages - 1 || this.paginatedNavigationPending) return;
    if (this.layoutMode !== 'paginated') {
      this.renderPage(this.currentPageIndex + 1);
      return;
    }
    void this.navigatePaginatedPage(this.currentPageIndex + 1, this.currentPageIndex);
  }

  private async navigatePaginatedPage(
    targetIndex: number,
    lookaheadFromIndex: number,
  ): Promise<void> {
    const lifecycleRevision = this.lifecycleRevision;
    const fromIndex = this.currentPageIndex;
    this.paginatedNavigationPending = true;
    try {
      const ready = await this.ensurePaginatedLookahead(lookaheadFromIndex, lifecycleRevision);
      if (
        !ready
        || lifecycleRevision !== this.lifecycleRevision
        || this.currentPageIndex !== fromIndex
      ) return;
      if (targetIndex >= 0 && targetIndex < this.totalPages) this.renderPage(targetIndex);
    } finally {
      if (lifecycleRevision === this.lifecycleRevision) {
        this.paginatedNavigationPending = false;
      }
    }
  }

  prev() {
    if (this.currentPageIndex <= 0 || this.paginatedNavigationPending) return;
    if (this.layoutMode !== 'paginated') {
      this.renderPage(this.currentPageIndex - 1);
      return;
    }
    const targetIndex = this.currentPageIndex - 1;
    void this.navigatePaginatedPage(targetIndex, targetIndex);
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
    this.lifecycleRevision++;
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
    this.presentationViewport = null;
    this.presentationTrack = null;
    this.presentationSurface = null;
    this.presentationScaleProbe = null;
    this.sourcePaginationPlugin = null;
    this.demoPaginationPlugin = null;
    this.pages = [];
    this.currentPageIndex = 0;
    this.layoutMode = 'flow';
    this.paginatedFitScale = 1;
    this.paginatedScaleMode = 'fit';
    this.paginatedStableLayout = null;
    this.paginatedPreparation = null;
    this.paginatedNavigationPending = false;
    this.restoreBodyTheme();
  }
}
