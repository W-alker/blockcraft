import Konva from 'konva';
import {DrawingTool, ToolConfig, TextTool} from './drawing-tools';
import {DrawingStateManager} from './drawing-state';

export class DrawingCanvas {
    private stage: Konva.Stage | null = null;
    private drawingLayer!: Konva.Layer;
    private previewLayer!: Konva.Layer;
    private laserLayer!: Konva.Layer;
    private stateManager = new DrawingStateManager();
    private currentTool: DrawingTool | null = null;
    private toolConfig: ToolConfig = {color: '#E74F1F', width: 4, fillColor: '', opacity: 1, dash: [], eraserWidth: 10};
    private undoStack: string[] = [];
    private redoStack: string[] = [];
    private isDrawing = false;
    private enabled = false;
    private container: HTMLElement | null = null;
    private scrollContainer: HTMLElement | null = null;
    private stageContainer: HTMLElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private scrollSyncRaf: number | null = null;
    private strokeHistory: { json: string; timestamp: number }[] = [];
    private readonly onScroll = () => this.scheduleSyncViewport();

    // private isReplaying = false;

    mount(container: HTMLElement, scrollContainer?: HTMLElement): void {
        this.container = container;
        this.scrollContainer = scrollContainer ?? this.findScrollContainer(container);

        const stageContainer = document.createElement('div');
        stageContainer.className = 'drawing-canvas-container';
        stageContainer.style.cssText = `
          position: absolute;
          top: 0; left: 0;
          width: 100%;
          z-index: 10001;
          pointer-events: none;
          overflow: hidden;
        `;
        this.stageContainer = stageContainer;
        container.appendChild(stageContainer);

        const viewportHeight = this.getViewportHeight();
        Konva.pixelRatio = 1;
        this.stage = new Konva.Stage({
            container: stageContainer,
            width: container.offsetWidth,
            height: viewportHeight,
        });

        this.drawingLayer = new Konva.Layer({name: 'drawingLayer'});
        this.previewLayer = new Konva.Layer({ name: 'previewLayer' });
        this.laserLayer = new Konva.Layer({name: 'laserLayer'});

        this.stage.add(this.drawingLayer);
        this.stage.add(this.previewLayer);
        this.stage.add(this.laserLayer);

        this.bindStageEvents();
        this.observeResize(container);
        this.scrollContainer?.addEventListener('scroll', this.onScroll, {passive: true});
        this.syncViewport();
    }

    unmount(): void {
        this.currentTool?.onDestroy?.();
        this.resizeObserver?.disconnect();
        if (this.scrollSyncRaf !== null) {
            cancelAnimationFrame(this.scrollSyncRaf);
            this.scrollSyncRaf = null;
        }
        this.scrollContainer?.removeEventListener('scroll', this.onScroll);
        this.stage?.destroy();
        this.stageContainer?.remove();
        this.stage = null;
        this.stageContainer = null;
        this.scrollContainer = null;
        this.container = null;
    }

    setTool(tool: DrawingTool | null): void {
        this.currentTool?.onDestroy?.();
        this.currentTool = tool;
        if (this.stage) {
            const stageContainer = this.stage.container();
            stageContainer.style.cursor = tool?.cursor ?? 'default';
        }
        if (tool instanceof TextTool && this.container) {
            tool.setContainer(this.container);
        }
        // if (tool instanceof SelectTool) {
        //   tool.setLayer(this.drawingLayer);
        // }
        // if (tool instanceof SpotlightTool && this.container) {
        //   tool.setContainer(this.container);
        // }
        // if (tool instanceof MagnifierTool && this.container) {
        //   tool.setContainer(this.container);
        // }
    }

    setColor(color: string): void {
        this.toolConfig.color = color;
    }

    setWidth(width: number): void {
        this.toolConfig.width = width;
    }

    setFillColor(fillColor: string): void {
        this.toolConfig.fillColor = fillColor;
    }

    setEraserWidth(width: number): void {
        this.toolConfig.eraserWidth = width;
    }

    setOpacity(opacity: number): void {
        this.toolConfig.opacity = Math.max(0, Math.min(1, opacity));
    }

    setDash(dash: number[]): void {
        this.toolConfig.dash = dash;
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (this.stage) {
            const stageContainer = this.stage.container();
            stageContainer.style.pointerEvents = enabled ? 'auto' : 'none';
        }
    }

    undo(): void {
        if (this.undoStack.length === 0) return;
        this.redoStack.push(this.drawingLayer.toJSON());
        const prev = this.undoStack.pop()!;
        this.restoreLayerFromJSON(this.drawingLayer, prev);
    }

    redo(): void {
        if (this.redoStack.length === 0) return;
        this.undoStack.push(this.drawingLayer.toJSON());
        const next = this.redoStack.pop()!;
        this.restoreLayerFromJSON(this.drawingLayer, next);
    }

    clear(): void {
        this.pushUndo();
        this.drawingLayer.destroyChildren();
        this.drawingLayer.batchDraw();
        this.redoStack = [];
        this.strokeHistory = [];
    }

    savePageState(pageIndex: number): void {
        this.stateManager.savePage(pageIndex, this.drawingLayer);
    }

    restorePageState(pageIndex: number): void {
        this.stateManager.restorePage(pageIndex, this.drawingLayer);
        this.undoStack = [];
        this.redoStack = [];
    }

    resizeToContainer(): void {
        this.syncViewport();
    }

    toggleVisibility(): boolean {
        const visible = !this.drawingLayer.visible();
        this.drawingLayer.visible(visible);
        this.drawingLayer.getStage()?.batchDraw();
        return visible;
    }

    isVisible(): boolean {
        return this.drawingLayer.visible();
    }

    getDrawingLayer(): Konva.Layer {
        return this.drawingLayer;
    }

    // replay(): void {
    //   if (this.isReplaying || this.strokeHistory.length === 0) return;
    //   this.isReplaying = true;
    //
    //   // Save current state
    //   const savedJSON = this.drawingLayer.toJSON();
    //   this.drawingLayer.destroyChildren();
    //   this.drawingLayer.batchDraw();
    //
    //   let index = 0;
    //   const strokes = this.strokeHistory;
    //
    //   const addNext = () => {
    //     if (index >= strokes.length) {
    //       // Restore original state
    //       this.restoreLayerFromJSON(this.drawingLayer, savedJSON);
    //       this.isReplaying = false;
    //       return;
    //     }
    //     const node = Konva.Node.create(strokes[index].json);
    //     this.drawingLayer.add(node);
    //     this.drawingLayer.batchDraw();
    //     index++;
    //
    //     const delay = index < strokes.length
    //       ? Math.min(strokes[index].timestamp - strokes[index - 1].timestamp, 500)
    //       : 800;
    //     setTimeout(addNext, Math.max(delay, 100));
    //   };
    //
    //   addNext();
    // }

    private bindStageEvents(): void {
        if (!this.stage) return;

        this.stage.on('mousedown touchstart', (e) => {
            if (!this.enabled || !this.currentTool) return;
            this.isDrawing = true;
            const pos = this.stage!.getPointerPosition();
            if (!pos) return;
            // Adjust for scroll offset
            const adjusted = this.adjustPos(pos);
            this.pushUndo();
            this.currentTool.onMouseDown(adjusted, this.drawingLayer, this.toolConfig);
        });

        this.stage.on('mousemove touchmove', (e) => {
            if (!this.enabled || !this.currentTool) return;
            const pos = this.stage!.getPointerPosition();
            if (!pos) return;
            const adjusted = this.adjustPos(pos);
            if (this.isDrawing) {
                this.currentTool.onMouseMove(adjusted, this.drawingLayer, this.toolConfig);
            }
        });

        this.stage.on('mouseup touchend', (e) => {
            if (!this.enabled || !this.currentTool) return;
            this.isDrawing = false;
            const pos = this.stage!.getPointerPosition();
            if (!pos) return;
            const adjusted = this.adjustPos(pos);
            const node = this.currentTool.onMouseUp(adjusted, this.drawingLayer, this.toolConfig);
            if (node) {
                this.redoStack = [];
                this.strokeHistory.push({json: node.toJSON(), timestamp: Date.now()});
            }
        });
    }

    private adjustPos(pos: { x: number; y: number }): { x: number; y: number } {
        return {x: pos.x, y: pos.y + this.getScrollTop()};
    }

    private pushUndo(): void {
        this.undoStack.push(this.drawingLayer.toJSON());
        if (this.undoStack.length > 50) {
            this.undoStack.shift();
        }
    }

    private restoreLayerFromJSON(layer: Konva.Layer, json: string): void {
        layer.destroyChildren();
        const data = JSON.parse(json);
        if (data.children) {
            for (const childData of data.children) {
                const node = Konva.Node.create(JSON.stringify(childData));
                layer.add(node);
            }
        }
        layer.batchDraw();
    }

    private observeResize(container: HTMLElement): void {
        this.resizeObserver = new ResizeObserver(() => {
            this.scheduleSyncViewport();
        });
        this.resizeObserver.observe(container);
        if (this.scrollContainer && this.scrollContainer !== container) {
            this.resizeObserver.observe(this.scrollContainer);
        }
    }

    private scheduleSyncViewport(): void {
        if (this.scrollSyncRaf !== null) return;
        this.scrollSyncRaf = requestAnimationFrame(() => {
            this.scrollSyncRaf = null;
            this.syncViewport();
        });
    }

    private syncViewport(): void {
        if (!this.stage || !this.container || !this.stageContainer) return;

        const viewportHeight = this.getViewportHeight();
        const viewportWidth = this.container.offsetWidth;
        const scrollTop = this.getScrollTop();
        const layerOffsetY = -scrollTop;
        let changed = false;

        if (this.stage.width() !== viewportWidth) {
            this.stage.width(viewportWidth);
            changed = true;
        }
        if (this.stage.height() !== viewportHeight) {
            this.stage.height(viewportHeight);
            changed = true;
        }

        const top = `${scrollTop}px`;
        if (this.stageContainer.style.top !== top) {
            this.stageContainer.style.top = top;
            changed = true;
        }
        const height = `${viewportHeight}px`;
        if (this.stageContainer.style.height !== height) {
            this.stageContainer.style.height = height;
            changed = true;
        }

        if (this.drawingLayer.y() !== layerOffsetY) {
            this.drawingLayer.y(layerOffsetY);
            changed = true;
        }
        if (this.previewLayer.y() !== layerOffsetY) {
            this.previewLayer.y(layerOffsetY);
            changed = true;
        }
        if (this.laserLayer.y() !== layerOffsetY) {
            this.laserLayer.y(layerOffsetY);
            changed = true;
        }

        if (changed) {
            this.stage.batchDraw();
        }
    }

    private getScrollTop(): number {
        return this.scrollContainer?.scrollTop ?? 0;
    }

    private getViewportHeight(): number {
        if (this.scrollContainer) {
            return this.scrollContainer.clientHeight;
        }
        return this.container?.offsetHeight ?? window.innerHeight;
    }

    private findScrollContainer(el: HTMLElement): HTMLElement | null {
        let parent: HTMLElement | null = el.parentElement;
        while (parent) {
            const style = window.getComputedStyle(parent);
            const overflowY = style.overflowY;
            if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
                return parent;
            }
            parent = parent.parentElement;
        }
        return null;
    }
}
