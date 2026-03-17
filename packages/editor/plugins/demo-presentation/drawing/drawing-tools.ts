import Konva from 'konva';

export interface ToolConfig {
  color: string;
  width: number;
  eraserWidth: number;
  fillColor: string;
  opacity: number;
  dash: number[];
}

export interface DrawingTool {
  name: string;
  cursor: string;
  onMouseDown(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig): void;
  onMouseMove(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig): void;
  onMouseUp(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig): Konva.Node | null;
  onDestroy?(): void;
}

// ─── Helpers ───
function getPreviewLayer(layer: Konva.Layer): Konva.Layer | null {
  return layer.getStage()?.findOne('.previewLayer') as Konva.Layer ?? null;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Catmull-Rom → cubic bezier smooth points
function smoothPoints(raw: number[]): number[] {
  if (raw.length < 6) return raw;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < raw.length; i += 2) pts.push({ x: raw[i], y: raw[i + 1] });
  const out: number[] = [pts[0].x, pts[0].y];
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    out.push((p0.x + 4 * p1.x + p2.x) / 6, (p0.y + 4 * p1.y + p2.y) / 6);
  }
  out.push(pts[pts.length - 1].x, pts[pts.length - 1].y);
  return out;
}

// ─── PenTool (smooth + pressure) ───
export class PenTool implements DrawingTool {
  name = 'pen';
  cursor = 'crosshair';
  private currentLine: Konva.Line | null = null;
  private rawPoints: number[] = [];
  private lastPos: { x: number; y: number } | null = null;
  private lastTime = 0;
  private currentWidth = 0;
  onMouseDown(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig) {
    this.rawPoints = [pos.x, pos.y];
    this.lastPos = pos;
    this.lastTime = Date.now();
    this.currentWidth = config.width;
    this.currentLine = new Konva.Line({
      stroke: config.color,
      strokeWidth: config.width,
      globalCompositeOperation: 'source-over',
      lineCap: 'round',
      lineJoin: 'round',
      opacity: config.opacity,
      tension: 0.4,
      points: [pos.x, pos.y],
      hitStrokeWidth: 20,
    });
    layer.add(this.currentLine);
  }

  onMouseMove(pos: { x: number; y: number }, _layer: Konva.Layer, config: ToolConfig) {
    if (!this.currentLine || !this.lastPos) return;
    // Velocity-based pressure: faster → thinner
    const now = Date.now();
    const dt = Math.max(now - this.lastTime, 1);
    const d = dist(pos, this.lastPos);
    const velocity = d / dt;
    const targetWidth = config.width * Math.max(0.3, Math.min(1, 1 - velocity * 0.15));
    this.currentWidth += (targetWidth - this.currentWidth) * 0.3;
    this.currentLine.strokeWidth(this.currentWidth);
    this.lastPos = pos;
    this.lastTime = now;
    // Skip points too close together
    if (d < 2) return;
    this.rawPoints.push(pos.x, pos.y);
    this.currentLine.points(smoothPoints(this.rawPoints));
    this.currentLine.getLayer()?.batchDraw();
  }

  onMouseUp(): Konva.Node | null {
    if (this.currentLine) {
      this.currentLine.points(smoothPoints(this.rawPoints));
      this.currentLine.getLayer()?.batchDraw();
    }
    const line = this.currentLine;
    this.currentLine = null;
    this.rawPoints = [];
    this.lastPos = null;
    return line;
  }
}

// ─── HighlighterTool ───
export class HighlighterTool implements DrawingTool {
  name = 'highlighter';
  cursor = 'crosshair';
  private currentLine: Konva.Line | null = null;

  onMouseDown(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig) {
    this.currentLine = new Konva.Line({
      stroke: config.color,
      strokeWidth: Math.max(config.width * 3, 20),
      globalCompositeOperation: 'source-over',
      lineCap: 'square',
      lineJoin: 'round',
      opacity: 0.35,
      tension: 0.4,
      points: [pos.x, pos.y],
      hitStrokeWidth: 20,
    });
    layer.add(this.currentLine);
  }

  onMouseMove(pos: { x: number; y: number }) {
    if (!this.currentLine) return;
    const points = this.currentLine.points().concat([pos.x, pos.y]);
    this.currentLine.points(points);
    this.currentLine.getLayer()?.batchDraw();
  }

  onMouseUp(): Konva.Node | null {
    const line = this.currentLine;
    this.currentLine = null;
    return line;
  }
}

// ─── EraserTool ───
export class EraserTool implements DrawingTool {
  name = 'eraser';
  cursor = 'crosshair';
  private currentLine: Konva.Line | null = null;

  onMouseDown(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig) {
    this.currentLine = new Konva.Line({
      stroke: '#ffffff',
      strokeWidth: config.eraserWidth * 2,
      globalCompositeOperation: 'destination-out',
      lineCap: 'round',
      lineJoin: 'round',
      points: [pos.x, pos.y],
    });
    layer.add(this.currentLine);
  }

  onMouseMove(pos: { x: number; y: number }) {
    if (!this.currentLine) return;
    const points = this.currentLine.points().concat([pos.x, pos.y]);
    this.currentLine.points(points);
    this.currentLine.getLayer()?.batchDraw();
  }

  onMouseUp(): Konva.Node | null {
    const line = this.currentLine;
    this.currentLine = null;
    return line;
  }
}

// ─── LineTool ───
export class LineTool implements DrawingTool {
  name = 'line';
  cursor = 'crosshair';
  private startPos: { x: number; y: number } | null = null;
  private preview: Konva.Line | null = null;
  private pLayer: Konva.Layer | null = null;

  onMouseDown(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig) {
    this.startPos = pos;
    this.pLayer = getPreviewLayer(layer);
    if (this.pLayer) {
      this.preview = new Konva.Line({
        points: [pos.x, pos.y, pos.x, pos.y],
        stroke: config.color, strokeWidth: config.width,
        dash: config.dash, opacity: config.opacity,
      });
      this.pLayer.add(this.preview);
    }
  }

  onMouseMove(pos: { x: number; y: number }) {
    if (!this.startPos || !this.preview) return;
    this.preview.points([this.startPos.x, this.startPos.y, pos.x, pos.y]);
    this.pLayer?.batchDraw();
  }

  onMouseUp(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig): Konva.Node | null {
    this.preview?.destroy();
    this.pLayer?.batchDraw();
    if (!this.startPos || dist(pos, this.startPos) < 5) { this.startPos = null; return null; }
    const line = new Konva.Line({
      points: [this.startPos.x, this.startPos.y, pos.x, pos.y],
      stroke: config.color, strokeWidth: config.width,
      lineCap: 'round', dash: config.dash, opacity: config.opacity,
    });
    this.startPos = null;
    layer.add(line);
    layer.batchDraw();
    return line;
  }
}

// ─── RectTool ───
export class RectTool implements DrawingTool {
  name = 'rect';
  cursor = 'crosshair';
  private startPos: { x: number; y: number } | null = null;
  private preview: Konva.Rect | null = null;
  private pLayer: Konva.Layer | null = null;

  onMouseDown(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig) {
    this.startPos = pos;
    this.pLayer = getPreviewLayer(layer);
    if (this.pLayer) {
      this.preview = new Konva.Rect({
        x: pos.x, y: pos.y, width: 0, height: 0,
        stroke: config.color, strokeWidth: config.width,
        dash: [6, 3], opacity: config.opacity,
      });
      this.pLayer.add(this.preview);
    }
  }

  onMouseMove(pos: { x: number; y: number }) {
    if (!this.startPos || !this.preview) return;
    this.preview.setAttrs({
      x: Math.min(this.startPos.x, pos.x),
      y: Math.min(this.startPos.y, pos.y),
      width: Math.abs(pos.x - this.startPos.x),
      height: Math.abs(pos.y - this.startPos.y),
    });
    this.pLayer?.batchDraw();
  }

  onMouseUp(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig): Konva.Node | null {
    this.preview?.destroy();
    this.pLayer?.batchDraw();
    if (!this.startPos) return null;
    const w = Math.abs(pos.x - this.startPos.x), h = Math.abs(pos.y - this.startPos.y);
    if (w < 5 && h < 5) { this.startPos = null; return null; }
    const rect = new Konva.Rect({
      x: Math.min(this.startPos.x, pos.x),
      y: Math.min(this.startPos.y, pos.y),
      width: w, height: h,
      stroke: config.color, strokeWidth: config.width,
      fill: config.fillColor || undefined,
      dash: config.dash, opacity: config.opacity,
    });
    this.startPos = null;
    layer.add(rect);
    layer.batchDraw();
    return rect;
  }
}

// ─── EllipseTool ───
export class EllipseTool implements DrawingTool {
  name = 'ellipse';
  cursor = 'crosshair';
  private startPos: { x: number; y: number } | null = null;
  private preview: Konva.Ellipse | null = null;
  private pLayer: Konva.Layer | null = null;

  onMouseDown(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig) {
    this.startPos = pos;
    this.pLayer = getPreviewLayer(layer);
    if (this.pLayer) {
      this.preview = new Konva.Ellipse({
        x: pos.x, y: pos.y, radiusX: 0, radiusY: 0,
        stroke: config.color, strokeWidth: config.width,
        dash: [6, 3], opacity: config.opacity,
      });
      this.pLayer.add(this.preview);
    }
  }

  onMouseMove(pos: { x: number; y: number }) {
    if (!this.startPos || !this.preview) return;
    this.preview.setAttrs({
      x: (this.startPos.x + pos.x) / 2,
      y: (this.startPos.y + pos.y) / 2,
      radiusX: Math.abs(pos.x - this.startPos.x) / 2,
      radiusY: Math.abs(pos.y - this.startPos.y) / 2,
    });
    this.pLayer?.batchDraw();
  }

  onMouseUp(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig): Konva.Node | null {
    this.preview?.destroy();
    this.pLayer?.batchDraw();
    if (!this.startPos) return null;
    const rx = Math.abs(pos.x - this.startPos.x) / 2;
    const ry = Math.abs(pos.y - this.startPos.y) / 2;
    if (rx < 3 && ry < 3) { this.startPos = null; return null; }
    const ellipse = new Konva.Ellipse({
      x: (this.startPos.x + pos.x) / 2,
      y: (this.startPos.y + pos.y) / 2,
      radiusX: rx, radiusY: ry,
      stroke: config.color, strokeWidth: config.width,
      fill: config.fillColor || undefined,
      dash: config.dash, opacity: config.opacity,
    });
    this.startPos = null;
    layer.add(ellipse);
    layer.batchDraw();
    return ellipse;
  }
}

// ─── TriangleTool ───
export class TriangleTool implements DrawingTool {
  name = 'triangle';
  cursor = 'crosshair';
  private startPos: { x: number; y: number } | null = null;
  private preview: Konva.Line | null = null;
  private pLayer: Konva.Layer | null = null;

  onMouseDown(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig) {
    this.startPos = pos;
    this.pLayer = getPreviewLayer(layer);
    if (this.pLayer) {
      this.preview = new Konva.Line({
        points: [pos.x, pos.y], closed: true,
        stroke: config.color, strokeWidth: config.width,
        dash: [6, 3], opacity: config.opacity,
      });
      this.pLayer.add(this.preview);
    }
  }

  onMouseMove(pos: { x: number; y: number }) {
    if (!this.startPos || !this.preview) return;
    const s = this.startPos;
    const pts = [(s.x + pos.x) / 2, s.y, pos.x, pos.y, s.x, pos.y];
    this.preview.points(pts);
    this.pLayer?.batchDraw();
  }

  onMouseUp(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig): Konva.Node | null {
    this.preview?.destroy();
    this.pLayer?.batchDraw();
    if (!this.startPos || dist(pos, this.startPos) < 5) { this.startPos = null; return null; }
    const s = this.startPos;
    const tri = new Konva.Line({
      points: [(s.x + pos.x) / 2, s.y, pos.x, pos.y, s.x, pos.y],
      closed: true,
      stroke: config.color, strokeWidth: config.width,
      fill: config.fillColor || undefined,
      dash: config.dash, opacity: config.opacity,
      lineJoin: 'round',
    });
    this.startPos = null;
    layer.add(tri);
    layer.batchDraw();
    return tri;
  }
}

// ─── DiamondTool ───
export class DiamondTool implements DrawingTool {
  name = 'diamond';
  cursor = 'crosshair';
  private startPos: { x: number; y: number } | null = null;
  private preview: Konva.Line | null = null;
  private pLayer: Konva.Layer | null = null;

  onMouseDown(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig) {
    this.startPos = pos;
    this.pLayer = getPreviewLayer(layer);
    if (this.pLayer) {
      this.preview = new Konva.Line({
        points: [pos.x, pos.y], closed: true,
        stroke: config.color, strokeWidth: config.width,
        dash: [6, 3], opacity: config.opacity,
      });
      this.pLayer.add(this.preview);
    }
  }

  onMouseMove(pos: { x: number; y: number }) {
    if (!this.startPos || !this.preview) return;
    const s = this.startPos;
    const cx = (s.x + pos.x) / 2, cy = (s.y + pos.y) / 2;
    const hw = Math.abs(pos.x - s.x) / 2, hh = Math.abs(pos.y - s.y) / 2;
    this.preview.points([cx, cy - hh, cx + hw, cy, cx, cy + hh, cx - hw, cy]);
    this.pLayer?.batchDraw();
  }

  onMouseUp(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig): Konva.Node | null {
    this.preview?.destroy();
    this.pLayer?.batchDraw();
    if (!this.startPos || dist(pos, this.startPos) < 5) { this.startPos = null; return null; }
    const s = this.startPos;
    const cx = (s.x + pos.x) / 2, cy = (s.y + pos.y) / 2;
    const hw = Math.abs(pos.x - s.x) / 2, hh = Math.abs(pos.y - s.y) / 2;
    const diamond = new Konva.Line({
      points: [cx, cy - hh, cx + hw, cy, cx, cy + hh, cx - hw, cy],
      closed: true,
      stroke: config.color, strokeWidth: config.width,
      fill: config.fillColor || undefined,
      dash: config.dash, opacity: config.opacity,
      lineJoin: 'round',
    });
    this.startPos = null;
    layer.add(diamond);
    layer.batchDraw();
    return diamond;
  }
}

// ─── ArrowTool ───
export class ArrowTool implements DrawingTool {
  name = 'arrow';
  cursor = 'crosshair';
  private startPos: { x: number; y: number } | null = null;
  private preview: Konva.Arrow | null = null;
  private pLayer: Konva.Layer | null = null;

  onMouseDown(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig) {
    this.startPos = pos;
    this.pLayer = getPreviewLayer(layer);
    if (this.pLayer) {
      this.preview = new Konva.Arrow({
        points: [pos.x, pos.y, pos.x, pos.y],
        stroke: config.color, strokeWidth: config.width,
        fill: config.color,
        pointerLength: config.width * 3,
        pointerWidth: config.width * 3,
        dash: [6, 3], opacity: config.opacity,
      });
      this.pLayer.add(this.preview);
    }
  }

  onMouseMove(pos: { x: number; y: number }) {
    if (!this.startPos || !this.preview) return;
    this.preview.points([this.startPos.x, this.startPos.y, pos.x, pos.y]);
    this.pLayer?.batchDraw();
  }

  onMouseUp(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig): Konva.Node | null {
    this.preview?.destroy();
    this.pLayer?.batchDraw();
    if (!this.startPos || dist(pos, this.startPos) < 5) { this.startPos = null; return null; }
    const arrow = new Konva.Arrow({
      points: [this.startPos.x, this.startPos.y, pos.x, pos.y],
      stroke: config.color, strokeWidth: config.width,
      fill: config.color,
      pointerLength: config.width * 3,
      pointerWidth: config.width * 3,
      lineCap: 'round', lineJoin: 'round',
      dash: config.dash, opacity: config.opacity,
    });
    this.startPos = null;
    layer.add(arrow);
    layer.batchDraw();
    return arrow;
  }
}

// ─── TextTool ───
export class TextTool implements DrawingTool {
  name = 'text';
  cursor = 'text';
  private container: HTMLElement | null = null;

  setContainer(container: HTMLElement) {
    this.container = container;
  }

  onMouseDown() {}
  onMouseMove() {}

  onMouseUp(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig): Konva.Node | null {
    if (!this.container) return null;
    const textarea = document.createElement('textarea');
    textarea.style.cssText = `
      position: absolute;
      left: ${pos.x}px; top: ${pos.y}px;
      min-width: 100px; min-height: 30px;
      font-size: ${Math.max(config.width * 2, 16)}px;
      color: ${config.color};
      background: transparent;
      border: 1px dashed rgba(255,255,255,0.5);
      outline: none; resize: none; overflow: hidden;
      z-index: 10003; padding: 4px;
      font-family: sans-serif;
    `;
    this.container.appendChild(textarea);
    textarea.focus();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const text = textarea.value.trim();
      textarea.remove();
      if (!text) return;
      const konvaText = new Konva.Text({
        x: pos.x, y: pos.y,
        text, fontSize: Math.max(config.width * 2, 16),
        fill: config.color, fontFamily: 'sans-serif',
        opacity: config.opacity,
      });
      layer.add(konvaText);
      layer.batchDraw();
    };

    textarea.addEventListener('blur', commit);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { textarea.value = ''; commit(); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
    });
    return null;
  }
}

// ─── LaserTool ───
export class LaserTool implements DrawingTool {
  name = 'laser';
  cursor = 'none';
  private dot: Konva.Circle | null = null;
  private trail: Konva.Line | null = null;
  private trailPoints: number[] = [];
  private fadeAnim: Konva.Animation | null = null;
  private laserLayer: Konva.Layer | null = null;

  onMouseDown(pos: { x: number; y: number }, _layer: Konva.Layer) {
    this.laserLayer = _layer.getStage()?.findOne('.laserLayer') as Konva.Layer;
    if (!this.laserLayer) return;
    this.trailPoints = [pos.x, pos.y];
    this.trail = new Konva.Line({
      points: this.trailPoints,
      stroke: 'rgba(255, 0, 0, 0.5)',
      strokeWidth: 3,
      lineCap: 'round', lineJoin: 'round',
      tension: 0.5,
    });
    this.dot = new Konva.Circle({
      x: pos.x, y: pos.y, radius: 6,
      fill: 'red',
      shadowColor: 'red', shadowBlur: 15, shadowOpacity: 0.8,
    });
    this.laserLayer.add(this.trail);
    this.laserLayer.add(this.dot);
    this.laserLayer.batchDraw();
  }

  onMouseMove(pos: { x: number; y: number }) {
    if (!this.dot || !this.trail || !this.laserLayer) return;
    this.dot.position(pos);
    this.trailPoints.push(pos.x, pos.y);
    if (this.trailPoints.length > 60) {
      this.trailPoints = this.trailPoints.slice(-60);
    }
    this.trail.points(this.trailPoints);
    this.laserLayer.batchDraw();
  }

  onMouseUp(): Konva.Node | null {
    this.fadeOut();
    return null;
  }

  private fadeOut() {
    if (!this.laserLayer) return;
    const dot = this.dot;
    const trail = this.trail;
    const layer = this.laserLayer;
    this.dot = null;
    this.trail = null;
    this.trailPoints = [];
    if (!dot && !trail) return;
    let opacity = 1;
    const fade = () => {
      opacity -= 0.05;
      if (opacity <= 0) {
        dot?.destroy();
        trail?.destroy();
        layer.batchDraw();
        return;
      }
      dot?.opacity(opacity);
      trail?.opacity(opacity);
      layer.batchDraw();
      requestAnimationFrame(fade);
    };
    requestAnimationFrame(fade);
  }

  onDestroy() {
    this.fadeAnim?.stop();
    this.dot?.destroy();
    this.trail?.destroy();
    this.laserLayer?.destroyChildren();
  }
}

// ─── SpotlightTool ───
export class SpotlightTool implements DrawingTool {
  name = 'spotlight';
  cursor = 'none';
  private container: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private radius = 120;
  private currentPos = { x: 0, y: 0 };
  private wheelHandler: ((e: WheelEvent) => void) | null = null;
  private moveHandler: ((e: MouseEvent) => void) | null = null;

  setContainer(container: HTMLElement) {
    this.container = container;
    this.createOverlay();
  }

  private createOverlay() {
    if (!this.container || this.overlay) return;
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      pointer-events: none; z-index: 10004;
      background: radial-gradient(circle ${this.radius}px at ${this.currentPos.x}px ${this.currentPos.y}px, transparent ${this.radius}px, rgba(0,0,0,0.75) ${this.radius + 2}px);
    `;
    this.container.appendChild(this.overlay);

    this.moveHandler = (e: MouseEvent) => {
      this.currentPos = { x: e.clientX, y: e.clientY };
      this.updateGradient();
    };
    this.wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      this.radius = Math.max(40, Math.min(400, this.radius - e.deltaY * 0.5));
      this.updateGradient();
    };
    document.addEventListener('mousemove', this.moveHandler);
    document.addEventListener('wheel', this.wheelHandler, { passive: false });
  }

  private updateGradient() {
    if (!this.overlay) return;
    this.overlay.style.background = `radial-gradient(circle ${this.radius}px at ${this.currentPos.x}px ${this.currentPos.y}px, transparent ${this.radius}px, rgba(0,0,0,0.75) ${this.radius + 2}px)`;
  }

  onMouseDown() {}
  onMouseMove() {}
  onMouseUp(): Konva.Node | null { return null; }

  onDestroy() {
    if (this.moveHandler) document.removeEventListener('mousemove', this.moveHandler);
    if (this.wheelHandler) document.removeEventListener('wheel', this.wheelHandler);
    this.overlay?.remove();
    this.overlay = null;
    this.moveHandler = null;
    this.wheelHandler = null;
  }
}

// ─── MagnifierTool ───
export class MagnifierTool implements DrawingTool {
  name = 'magnifier';
  cursor = 'crosshair';
  private container: HTMLElement | null = null;
  private startPos: { x: number; y: number } | null = null;
  private selectionBox: HTMLElement | null = null;
  private floatingWindows: HTMLElement[] = [];

  setContainer(container: HTMLElement) {
    this.container = container;
  }

  onMouseDown(pos: { x: number; y: number }) {
    if (!this.container) return;
    this.startPos = pos;
    this.selectionBox = document.createElement('div');
    this.selectionBox.style.cssText = `
      position: absolute; border: 2px dashed #3970F7;
      background: rgba(57,112,247,0.08); z-index: 10004; pointer-events: none;
      left: ${pos.x}px; top: ${pos.y}px; width: 0; height: 0;
    `;
    this.container.appendChild(this.selectionBox);
  }

  onMouseMove(pos: { x: number; y: number }) {
    if (!this.startPos || !this.selectionBox) return;
    const x = Math.min(this.startPos.x, pos.x);
    const y = Math.min(this.startPos.y, pos.y);
    const w = Math.abs(pos.x - this.startPos.x);
    const h = Math.abs(pos.y - this.startPos.y);
    this.selectionBox.style.left = x + 'px';
    this.selectionBox.style.top = y + 'px';
    this.selectionBox.style.width = w + 'px';
    this.selectionBox.style.height = h + 'px';
  }

  onMouseUp(pos: { x: number; y: number }): Konva.Node | null {
    if (!this.startPos || !this.container) {
      this.selectionBox?.remove();
      this.selectionBox = null;
      return null;
    }
    const x = Math.min(this.startPos.x, pos.x);
    const y = Math.min(this.startPos.y, pos.y);
    const w = Math.abs(pos.x - this.startPos.x);
    const h = Math.abs(pos.y - this.startPos.y);
    this.selectionBox?.remove();
    this.selectionBox = null;
    this.startPos = null;
    if (w < 10 || h < 10) return null;

    this.createMagnifierWindow(x, y, w, h);
    return null;
  }

  private createMagnifierWindow(sx: number, sy: number, sw: number, sh: number) {
    if (!this.container) return;
    const floatW = sw * 2;
    const floatH = sh * 2;

    const win = document.createElement('div');
    const containerRect = this.container.getBoundingClientRect();
    let left = sx + sw + 16;
    let top = sy;
    if (left + floatW > containerRect.width) {
      left = sx;
      top = sy + sh + 16;
    }

    win.style.cssText = `
      position: absolute; left: ${left}px; top: ${top}px;
      width: ${floatW}px; height: ${floatH}px;
      border: 2px solid #3970F7; border-radius: 8px;
      overflow: hidden; z-index: 10005; background: white;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    `;

    const inner = document.createElement('div');
    inner.style.cssText = `
      position: absolute;
      transform: scale(2); transform-origin: ${sx}px ${sy}px;
      width: ${containerRect.width}px; height: ${containerRect.height}px;
      pointer-events: none;
    `;
    inner.innerHTML = this.container.innerHTML;
    // Remove toolbars from clone
    inner.querySelectorAll('drawing-toolbar, demo-control-bar, .drawing-canvas-container').forEach(el => el.remove());
    win.appendChild(inner);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      position: absolute; top: 4px; right: 4px; z-index: 1;
      width: 24px; height: 24px; border-radius: 50%;
      background: rgba(0,0,0,0.6); color: white; border: none;
      cursor: pointer; font-size: 14px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
    `;
    closeBtn.onclick = () => {
      win.remove();
      this.floatingWindows = this.floatingWindows.filter(w => w !== win);
    };
    win.appendChild(closeBtn);

    this.container.appendChild(win);
    this.floatingWindows.push(win);
  }

  onDestroy() {
    this.selectionBox?.remove();
    this.floatingWindows.forEach(w => w.remove());
    this.floatingWindows = [];
  }
}

// ─── CalloutTool ───
export class CalloutTool implements DrawingTool {
  name = 'callout';
  cursor = 'crosshair';
  private counter = 0;

  resetCounter() {
    this.counter = 0;
  }

  onMouseDown() {}
  onMouseMove() {}

  onMouseUp(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig): Konva.Node | null {
    this.counter++;
    const radius = config.width * 3;
    const group = new Konva.Group({ x: pos.x, y: pos.y });

    const circle = new Konva.Circle({
      radius, fill: config.color, stroke: 'white', strokeWidth: 2,
    });
    group.add(circle);

    const text = new Konva.Text({
      text: String(this.counter),
      fontSize: radius * 1.2, fill: 'white',
      fontFamily: 'sans-serif', fontStyle: 'bold',
      align: 'center', verticalAlign: 'middle',
    });
    text.offsetX(text.width() / 2);
    text.offsetY(text.height() / 2);
    group.add(text);

    layer.add(group);
    layer.batchDraw();
    return group;
  }
}

// ─── RulerTool ───
export class RulerTool implements DrawingTool {
  name = 'ruler';
  cursor = 'crosshair';
  private startPos: { x: number; y: number } | null = null;
  private rulerLine: Konva.Line | null = null;
  private rulerText: Konva.Text | null = null;
  private pLayer: Konva.Layer | null = null;
  private rulerElements: Konva.Node[] = [];

  onMouseDown(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig) {
    this.startPos = pos;
    this.pLayer = getPreviewLayer(layer);
    if (!this.pLayer) return;

    this.rulerLine = new Konva.Line({
      points: [pos.x, pos.y, pos.x, pos.y],
      stroke: '#3970F7', strokeWidth: 2, dash: [8, 4],
    });
    this.rulerText = new Konva.Text({
      x: pos.x, y: pos.y - 20,
      text: '0 px', fontSize: 14, fill: '#3970F7',
      fontFamily: 'monospace', padding: 4,
    });
    this.pLayer.add(this.rulerLine);
    this.pLayer.add(this.rulerText);
  }

  onMouseMove(pos: { x: number; y: number }) {
    if (!this.startPos || !this.rulerLine || !this.rulerText || !this.pLayer) return;
    let endX = pos.x, endY = pos.y;

    // Snap to horizontal/vertical if angle < 5°
    const dx = pos.x - this.startPos.x;
    const dy = pos.y - this.startPos.y;
    const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
    if (angle < 5 || angle > 175) {
      endY = this.startPos.y;
    } else if (Math.abs(angle - 90) < 5) {
      endX = this.startPos.x;
    }

    const d = Math.round(dist(this.startPos, { x: endX, y: endY }));
    this.rulerLine.points([this.startPos.x, this.startPos.y, endX, endY]);
    const midX = (this.startPos.x + endX) / 2;
    const midY = (this.startPos.y + endY) / 2;
    this.rulerText.position({ x: midX, y: midY - 20 });
    this.rulerText.text(`${d} px`);
    this.pLayer.batchDraw();
  }

  onMouseUp(pos: { x: number; y: number }, layer: Konva.Layer): Konva.Node | null {
    if (!this.startPos || !this.pLayer) return null;
    // Keep ruler on preview layer (don't persist)
    if (this.rulerLine) this.rulerElements.push(this.rulerLine);
    if (this.rulerText) this.rulerElements.push(this.rulerText);
    this.rulerLine = null;
    this.rulerText = null;
    this.startPos = null;
    return null;
  }

  onDestroy() {
    this.rulerElements.forEach(el => el.destroy());
    this.rulerElements = [];
    this.rulerLine?.destroy();
    this.rulerText?.destroy();
    this.pLayer?.batchDraw();
  }
}

// ─── StampTool ───
export class StampTool implements DrawingTool {
  name = 'stamp';
  cursor = 'crosshair';
  private currentStamp = '✓';

  setStamp(emoji: string) {
    this.currentStamp = emoji;
  }

  onMouseDown() {}
  onMouseMove() {}

  onMouseUp(pos: { x: number; y: number }, layer: Konva.Layer, config: ToolConfig): Konva.Node | null {
    const fontSize = config.width * 6;
    const stamp = new Konva.Text({
      x: pos.x, y: pos.y,
      text: this.currentStamp,
      fontSize, fontFamily: 'sans-serif',
    });
    stamp.offsetX(stamp.width() / 2);
    stamp.offsetY(stamp.height() / 2);
    layer.add(stamp);
    layer.batchDraw();
    return stamp;
  }
}

// ─── SelectTool ───
export class SelectTool implements DrawingTool {
  name = 'select';
  cursor = 'default';
  private transformer: Konva.Transformer | null = null;
  private drawingLayer: Konva.Layer | null = null;
  private selectedNode: Konva.Node | null = null;
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  setLayer(layer: Konva.Layer) {
    this.drawingLayer = layer;
    this.setupTransformer();
    this.bindKeyboard();
  }

  private bindKeyboard() {
    this.unbindKeyboard();
    this.keyHandler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedNode) {
        e.preventDefault();
        this.selectedNode.destroy();
        this.selectedNode = null;
        this.transformer?.nodes([]);
        this.drawingLayer?.batchDraw();
      }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  private unbindKeyboard() {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  private setupTransformer() {
    if (!this.drawingLayer) return;
    this.cleanupTransformer();
    this.transformer = new Konva.Transformer({
      rotateEnabled: true,
      enabledAnchors: [
        'top-left', 'top-right', 'bottom-left', 'bottom-right',
        'middle-left', 'middle-right', 'top-center', 'bottom-center',
      ],
      borderStroke: '#3970F7',
      borderStrokeWidth: 1,
      anchorFill: '#ffffff',
      anchorStroke: '#3970F7',
      anchorSize: 8,
      anchorCornerRadius: 2,
      padding: 4,
    });
    this.drawingLayer.add(this.transformer);
    // Make all existing nodes draggable
    this.drawingLayer.getChildren().forEach(node => {
      if (node !== this.transformer) {
        node.draggable(true);
      }
    });
    this.drawingLayer.batchDraw();
  }

  onMouseDown(pos: { x: number; y: number }, layer: Konva.Layer) {
    if (!this.transformer) return;
    const stage = layer.getStage();
    if (!stage) return;
    const target = stage.getIntersection(pos);
    if (target && target.getLayer() === this.drawingLayer) {
      // Find the top-level shape (not transformer anchors)
      let node: Konva.Node | null = target;
      while (node && node.parent !== this.drawingLayer) {
        node = node.parent as Konva.Node;
      }
      if (node && node !== this.transformer) {
        this.selectedNode = node;
        this.transformer.nodes([node]);
        this.drawingLayer?.batchDraw();
        return;
      }
    }
    // Clicked empty area — deselect
    this.selectedNode = null;
    this.transformer.nodes([]);
    this.drawingLayer?.batchDraw();
  }

  onMouseMove() {}

  onMouseUp(): Konva.Node | null {
    return null;
  }

  private cleanupTransformer() {
    if (this.transformer) {
      this.transformer.nodes([]);
      this.transformer.destroy();
      this.transformer = null;
    }
  }

  onDestroy() {
    this.unbindKeyboard();
    // Disable draggable on all nodes
    this.drawingLayer?.getChildren().forEach(node => {
      if (node !== this.transformer) {
        node.draggable(false);
      }
    });
    this.cleanupTransformer();
    this.drawingLayer?.batchDraw();
  }
}
