export interface PreviewOptions {
    src: string;
    container?: HTMLElement;
    onClose?: () => void;
    initialScale?: number; // 可作为“打开时额外缩放倍率”，一般=1
    onError?: (error: Error) => void;
}

interface PreviewState {
    scale: number;
    minScale: number;
    maxScale: number;
    translateX: number; // 相对 wrapper 中心的像素偏移
    translateY: number;
    isDragging: boolean;
    startX: number;
    startY: number;
    startTranslateX: number;
    startTranslateY: number;
}

export class SimpleImagePreview {
    private state: PreviewState = {
        scale: 1,
        minScale: 1,
        maxScale: 10,
        translateX: 0,
        translateY: 0,
        isDragging: false,
        startX: 0,
        startY: 0,
        startTranslateX: 0,
        startTranslateY: 0,
    };

    private options: PreviewOptions;
    private overlay: HTMLElement | null = null;
    private imageElement: HTMLImageElement | null = null;
    private wrapper: HTMLElement | null = null;
    private container: HTMLElement;

    // 保存 handler 引用，便于 remove
    private onKeyDown?: (e: KeyboardEvent) => void;
    private onWheel?: (e: WheelEvent) => void;

    constructor(options: PreviewOptions) {
        this.options = { initialScale: 1, ...options };
        this.container = options.container || document.body;
    }

    show(): void {
        try {
            this.createOverlay();
            this.setupEventListeners();
            this.loadImage();
        } catch (error) {
            this.handleError(error as Error, "show");
        }
    }

    hide(): void {
        this.cleanup();
        this.options.onClose?.();
    }

    destroy(): void {
        this.cleanup();
    }

    private createOverlay(): void {
        this.overlay = document.createElement("div");
        this.overlay.className = "simple-preview-overlay";
        this.overlay.innerHTML = `
      <div class="preview-container">
        <button class="preview-close-btn" aria-label="关闭预览"><i class="bc_icon bc_guanbi"></i></button>
        <div class="preview-loading">加载中...</div>
        <div class="preview-image-wrapper">
          <img class="preview-image" alt="预览图片" draggable="false">
        </div>
      </div>
    `;

        if (this.isContainerInFullscreen()) {
            this.container.appendChild(this.overlay);
        } else {
            document.body.appendChild(this.overlay);
        }

        this.imageElement = this.overlay.querySelector(".preview-image") as HTMLImageElement;
        this.wrapper = this.overlay.querySelector(".preview-image-wrapper") as HTMLElement;
    }

    private setupEventListeners(): void {
        if (!this.overlay) return;

        const closeBtn = this.overlay.querySelector(".preview-close-btn");
        closeBtn?.addEventListener("click", () => this.hide());

        // 点击遮罩关闭（注意：不要给 overlay 再加一个阻止冒泡的 click，否则关不了）
        this.overlay.addEventListener("click", (e) => {
            if (e.target === this.overlay) this.hide();
        });

        // 双击背景关闭预览
        this.overlay.addEventListener("dblclick", (e) => {
            if (e.target !== this.imageElement) this.hide();
        });

        // 阻止点击 wrapper 时触发遮罩关闭
        this.wrapper?.addEventListener("click", (e) => {
            e.stopPropagation();
        });

        this.onKeyDown = (e: KeyboardEvent) => {
            // viewer 风格：Esc 关闭
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
            }
        };
        document.addEventListener("keydown", this.onKeyDown);

        // 滚轮缩放：绑定到 wrapper（更自然）
        this.onWheel = (e: WheelEvent) => {
            e.preventDefault();
            this.handleZoom(e);
        };
        this.wrapper?.addEventListener("wheel", this.onWheel, { passive: false });

        // 拖拽：mousedown 在 wrapper，move/up 在 document
        this.imageElement?.addEventListener("mousedown", (e) => this.handleMouseDown(e));
    }

    private loadImage(): void {
        if (!this.imageElement) return;
        const loadingIndicator = this.overlay?.querySelector(".preview-loading");

        this.imageElement.onload = () => {
            loadingIndicator?.remove();
            this.resetTransform(); // 这里会计算 minScale + 初始 scale
        };

        this.imageElement.onerror = () => {
            loadingIndicator?.remove();
            this.handleError(new Error("图片加载失败"), "loadImage");
        };

        this.imageElement.src = this.options.src;
    }

    /**
     * viewer 风格缩放：以鼠标点为锚点缩放，缩放后 clamp
     */
    private handleZoom(event: WheelEvent): void {
        if (!this.imageElement || !this.wrapper) return;

        const rect = this.wrapper.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // viewer 通常是比较细腻的指数/比例缩放；这里用接近的手感
        const delta = -event.deltaY; // 向上滚 => 放大
        const zoomRatio = Math.exp(delta * 0.0015); // 可调：0.001 ~ 0.002
        const nextScale = this.clampScale(this.state.scale * zoomRatio);

        this.zoomAt(mouseX, mouseY, nextScale);
    }

    private zoomAt(px: number, py: number, nextScale: number): void {
        if (!this.imageElement || !this.wrapper) return;

        const { width: vw, height: vh } = this.wrapper.getBoundingClientRect();

        // 把点 px/py 转为以 wrapper 中心为原点的坐标
        const x = px - vw / 2;
        const y = py - vh / 2;

        const prevScale = this.state.scale;

        // 当前点在“图片内容坐标”里的位置（以 transform 后的中心为基准）
        // 由于我们用 translate + scale，且 transform-origin 在中心：
        // 屏幕坐标 = translate + contentCoord * scale
        // => contentCoord = (screenCoord - translate) / scale
        const contentX = (x - this.state.translateX) / prevScale;
        const contentY = (y - this.state.translateY) / prevScale;

        // 更新 scale，并计算新的 translate，使锚点保持不动：
        // x = newTranslate + contentX * newScale  => newTranslate = x - contentX * newScale
        this.state.scale = nextScale;
        this.state.translateX = x - contentX * nextScale;
        this.state.translateY = y - contentY * nextScale;

        this.applyTransform();
    }

    private clampScale(scale: number): number {
        return Math.max(this.state.minScale, Math.min(this.state.maxScale, scale));
    }

    /**
     * viewer 风格拖拽：只有图片大于视口（或 scale > minScale）才允许拖
     */
    private handleMouseDown(event: MouseEvent): void {
        if (!this.imageElement || !this.wrapper) return;

        event.preventDefault();
        event.stopPropagation();

        // if (!this.canDrag()) return;

        this.state.isDragging = true;
        this.state.startX = event.clientX;
        this.state.startY = event.clientY;
        this.state.startTranslateX = this.state.translateX;
        this.state.startTranslateY = this.state.translateY;

        this.overlay?.classList.add("dragging");

        document.addEventListener("mousemove", this.handleMouseMove);
        document.addEventListener("mouseup", this.handleMouseUp);
    }

    private handleMouseMove = (event: MouseEvent) =>{
        if (!this.state.isDragging || !this.imageElement) return;

        const dx = event.clientX - this.state.startX;
        const dy = event.clientY - this.state.startY;

        this.state.translateX = this.state.startTranslateX + dx;
        this.state.translateY = this.state.startTranslateY + dy;

        // 删掉/不要调用 clampTranslate()
        this.applyTransform();
    }

    private handleMouseUp = () => {
        this.state.isDragging = false;
        this.overlay?.classList.remove("dragging");
        document.removeEventListener("mousemove", this.handleMouseMove);
        document.removeEventListener("mouseup", this.handleMouseUp);
    }

    private applyTransform(): void {
        if (!this.imageElement) return;

        // 很关键：让 transform-origin 在中心，匹配上面的推导
        this.imageElement.style.transformOrigin = "50% 50%";
        this.imageElement.style.transform = `translate(${this.state.translateX}px, ${this.state.translateY}px) scale(${this.state.scale})`;
    }

    private resetTransform(): void {
        if (!this.imageElement || !this.wrapper) return;

        const rect = this.wrapper.getBoundingClientRect();
        const scaleX = rect.width / this.imageElement.naturalWidth;
        const scaleY = rect.height / this.imageElement.naturalHeight;

        // 留一点边距更像 viewer（可调 0.95~0.9）
        const fit = Math.min(scaleX, scaleY) * 0.95;

        this.state.minScale = Math.min(1, fit);
        const initial = this.state.minScale * (this.options.initialScale ?? 1);

        this.state.scale = this.clampScale(initial);
        this.state.translateX = 0;
        this.state.translateY = 0;

        this.applyTransform();
    }

    private isContainerInFullscreen(): boolean {
        const fullscreenElement = this.getFullscreenElement();
        if (!fullscreenElement) return false;
        return fullscreenElement === this.container || fullscreenElement.contains(this.container);
    }

    private getFullscreenElement(): Element | null {
        return (
            document.fullscreenElement ||
            (document as any).webkitFullscreenElement ||
            (document as any).mozFullScreenElement ||
            (document as any).msFullscreenElement
        );
    }

    private cleanup(): void {
        if (!this.overlay) return;

        // 移除事件监听器（用引用移除）
        if (this.onKeyDown) document.removeEventListener("keydown", this.onKeyDown);
        document.addEventListener("mousemove", this.handleMouseMove);
        document.addEventListener("mouseup", this.handleMouseUp);
        if (this.onWheel) this.wrapper?.removeEventListener("wheel", this.onWheel);

        this.onKeyDown = undefined;
        this.onWheel = undefined;

        this.overlay.remove();
        this.overlay = null;
        this.imageElement = null;
        this.wrapper = null;
    }

    private handleError(error: Error, context: string): void {
        console.error(`SimpleImagePreview Error [${context}]:`, error);
        this.options.onError?.(error);

        if (this.overlay) {
            const errorElement = document.createElement("div");
            errorElement.className = "preview-error";
            errorElement.textContent = "图片加载失败";
            this.overlay.appendChild(errorElement);

            setTimeout(() => this.hide(), 3000);
        }
    }
}
