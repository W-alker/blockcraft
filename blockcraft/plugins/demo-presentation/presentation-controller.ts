import {ApplicationRef, ComponentRef, createComponent} from "@angular/core";
import {DemoControlBarComponent} from "./widgets/demo-control-bar.component";
import {nextTick, throttle} from "../../global";

export interface DemoConfig {
  presentation?: {
    focusStrategy: 'viewport';
    unfocusedOpacity: number;
    showProgress: boolean;
    autoHideControls: boolean;
    autoHideDelay: number;
    enableTransition: boolean;
    transitionDuration: number;
  };
  preview?: {
    showToolbar: boolean;
  }
}

export class PresentationController {
  private pages: BlockCraft.BlockComponent[][] = [];
  private currentPageIndex = 0;
  private controlBarRef: ComponentRef<DemoControlBarComponent> | null = null;
  private originalReadonlyState = false;
  private eventCleanups: (() => void)[] = [];
  private presentationContainer: HTMLElement | null = null;
  private contentWrapper: HTMLElement | null = null;

  constructor(
    private doc: BlockCraft.Doc,
    private config: DemoConfig
  ) {
  }

  start() {
    // 保存原始状态
    this.originalReadonlyState = this.doc.isReadonly;

    // 1. 分析文档结构，生成分页
    this.pages = this.analyzePages();

    if (this.pages.length === 0) {
      console.warn('No pages to present');
      return;
    }

    // 2. 设置只读模式
    this.doc.toggleReadonly(true);

    nextTick().then(() => {
      // 3. 创建演示容器
      this.createPresentationContainer();

      // 4. 进入全屏
      this.enterFullscreen();

      // 5. 渲染控制栏
      this.renderControlBar();

      // 6. 绑定事件
      this.bindEvents();

      // 7. 显示第一页
      this.renderPage(0);
    })

  }

  private analyzePages(): BlockCraft.BlockComponent[][] {
    const pages: BlockCraft.BlockComponent[][] = [];
    let currentPage: BlockCraft.BlockComponent[] = [];

    const rootChildren = this.doc.root.getChildrenBlocks();

    for (const block of rootChildren) {
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

  private isPageBreakBlock(block: BlockCraft.BlockComponent): boolean {
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

  private createPresentationContainer() {
    // 创建演示容器
    this.presentationContainer = document.createElement('div');
    this.presentationContainer.className = 'presentation-stage readonly';
    this.presentationContainer.setAttribute('data-blockcraft-root', 'true')
    this.presentationContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: var(--bc-bg-primary, #ffffff);
      z-index: 9999;
      overflow: auto;
      padding: 10vh 10vw;
      box-sizing: border-box;
    `;

    // 创建内容包装器（限制宽度）
    this.contentWrapper = document.createElement('div');
    this.contentWrapper.style.cssText = `
      margin: 0 auto;
      min-height: calc(100% - 20vh);
      display: flex;
      flex-direction: column;
      justify-content: center;
      width: 100%;
    `;

    this.presentationContainer.appendChild(this.contentWrapper);
    document.body.appendChild(this.presentationContainer);

    // 添加演示模式特定样式
    const style = document.createElement('style');
    style.id = 'demo-presentation-stage-style';
    style.textContent = `
      .presentation-stage {
        user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
      }

      .presentation-stage * {
        cursor: default !important;
      }

      .presentation-stage .page-block-wrapper {
        opacity: 0;
        transform: translateY(20px);
        animation: slideIn ${this.config.presentation?.transitionDuration ?? 300}ms ease forwards;
      }

      @keyframes slideIn {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .presentation-stage .page-block-wrapper + .page-block-wrapper {
        margin-top: 24px;
      }
    `;
    document.head.appendChild(style);

    this.eventCleanups.push(() => {
      style.remove();
      this.presentationContainer?.remove();
    });
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

    const appRef = this.doc.injector.get(ApplicationRef);
    const controlBarRef = createComponent(DemoControlBarComponent, {
      environmentInjector: appRef.injector,
      elementInjector: this.doc.injector,
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

    this.eventCleanups.push(() => {
      prevSub.unsubscribe();
      nextSub.unsubscribe();
      exitSub.unsubscribe();
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
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          this.next();
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          this.prev();
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
          this.destroy();
          break;
      }
    };

    document.addEventListener('keydown', keydownHandler);
    this.eventCleanups.push(() => {
      document.removeEventListener('keydown', keydownHandler);
    });

    // 鼠标点击导航（上半部分=上一页，下半部分=下一页）
    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 避免点击控制栏触发导航
      if (target.closest('demo-control-bar')) {
        return;
      }

      const windowHeight = window.innerHeight;
      const clickY = e.clientY;

      if (clickY < windowHeight / 2) {
        this.prev();
      } else {
        this.next();
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
    if (!this.contentWrapper) return;

    this.currentPageIndex = index;

    // 清空容器（添加淡出效果）
    if (this.config.presentation?.enableTransition) {
      this.contentWrapper.style.opacity = '0';
      setTimeout(() => {
        this.updatePageContent(index);
        if (this.contentWrapper) {
          this.contentWrapper.style.transition = `opacity ${this.config.presentation?.transitionDuration ?? 300}ms ease`;
          this.contentWrapper.style.opacity = '1';
        }
      }, this.config.presentation?.transitionDuration ?? 300);
    } else {
      this.updatePageContent(index);
    }

    // 更新进度
    if (this.controlBarRef) {
      this.controlBarRef.instance.totalPages = this.pages.length;
      this.controlBarRef.setInput('currentPage', index + 1);
      this.controlBarRef.instance.updateView();
    }
  }

  private updatePageContent(index: number) {
    if (!this.contentWrapper) return;

    // 清空内容
    this.contentWrapper.innerHTML = '';

    const currentPage = this.pages[index];
    currentPage.forEach((block, blockIndex) => {
      // 创建包装器
      const wrapper = document.createElement('div');
      wrapper.className = 'page-block-wrapper';

      // 添加延迟动画效果
      if (this.config.presentation?.enableTransition) {
        wrapper.style.animationDelay = `${blockIndex * 50}ms`;
      }

      // 克隆节点并添加到包装器
      const clonedNode = block.hostElement.cloneNode(true) as HTMLElement;
      wrapper.appendChild(clonedNode);

      this.contentWrapper!.appendChild(wrapper);
    });

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

  destroy() {
    // 退出全屏
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => {
        console.warn('Failed to exit fullscreen:', err);
      });
    }

    // 恢复只读状态
    this.doc.toggleReadonly(this.originalReadonlyState);

    // 清理事件监听和DOM
    this.eventCleanups.forEach(cleanup => cleanup());
    this.eventCleanups = [];

    // 重置引用
    this.presentationContainer = null;
    this.contentWrapper = null;
  }
}
