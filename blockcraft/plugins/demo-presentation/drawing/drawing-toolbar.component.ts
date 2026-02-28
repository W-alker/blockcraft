import {
    ChangeDetectionStrategy, ChangeDetectorRef, Component,
    EventEmitter, Input, Output
} from '@angular/core';
import {NgClass} from '@angular/common';

export type DrawingToolType =
    | 'select' | 'pen' | 'highlighter' | 'eraser'
    | 'line' | 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'star'
    | 'arrow' | 'text' | 'laser'
    | 'spotlight' | 'magnifier' | 'countdown' | 'callout' | 'ruler' | 'stamp';

interface ToolDef {
    type: DrawingToolType | 'undo' | 'redo' | 'clear' | 'close' | 'shapes' | 'replay' | 'toggleVisibility' | 'stamps';
    baseClass: string;
    icon: string;
    label: string;
    dividerAfter?: boolean;
    children?: ToolDef[];
}

const COLORS = [
    '#E74F1F', '#E96A27', '#F7DA3C', '#4AB452',
    '#3970F7', '#1E22BD', '#582FF4', '#333333', '#FFFFFF',
];

const WIDTHS = [
    {label: '细', value: 2},
    {label: '中', value: 4},
    {label: '粗', value: 8},
];

const ERASER_WIDTHS = [
    {label: '小', value: 10},
    {label: '中', value: 20},
    {label: '大', value: 40},
    {label: '超大', value: 60},
];

const DASH_STYLES = [
    {label: '实线', value: [] as number[]},
    {label: '虚线', value: [8, 4]},
    {label: '点线', value: [2, 4]},
];

const OPACITY_LEVELS = [
    {label: '100%', value: 1},
    {label: '75%', value: 0.75},
    {label: '50%', value: 0.5},
    {label: '25%', value: 0.25},
];

@Component({
    selector: 'drawing-toolbar',
    template: `
      <div class="drawing-toolbar"
           [class.hidden]="isHidden"
           (mouseenter)="show()"
           (mouseleave)="startHideTimer()">
        @for (tool of tools; track tool.type) {
          @if (tool.type === 'shapes') {
            <div class="tool-wrapper">
              <button
                class="tool-btn"
                [class.active]="isShapeActive"
                (click)="onShapesToggle()">
                <i [ngClass]="[activeShapeDef.baseClass, activeShapeDef.icon]"></i>
                <span class="sub-arrow">▸</span>
                @if (!showShapes && !showPicker && !showStamps && !showDurations) {
                  <span class="tooltip">{{ activeShapeDef.label }}</span>
                }
              </button>
              @if (showShapes) {
                <div class="sub-menu">
                  @for (s of tool.children; track s.type) {
                    <button
                      class="sub-btn"
                      [class.active]="activeTool === s.type"
                      (click)="onShapeSelect(s)">
                      <i [ngClass]="[s.baseClass, s.icon]"></i>
                      <span class="sub-label">{{ s.label }}</span>
                    </button>
                  }
                </div>
              }
            </div>
          } @else if (tool.type === 'eraser') {
            <div class="tool-wrapper">
              <button
                class="tool-btn"
                [class.active]="activeTool === tool.type"
                (click)="onToolClick(tool)">
                <i [ngClass]="[tool.baseClass, tool.icon]"></i>
                @if (!showPicker && !showShapes && !showStamps && !showDurations) {
                  <span class="tooltip">{{ tool.label }}</span>
                }
              </button>
              @if (showEraserWidthPanel) {
                <div class="picker-panel">
                  <div class="panel-section">
                    <span class="panel-label">橡皮擦大小</span>
                    <div class="width-row">
                      @for (w of eraserWidths; track w.value) {
                        <span class="width-opt"
                              [class.active]="eraserWidth === w.value"
                              (click)="onEraserWidthSelect(w.value)">
                                    <span class="width-label">{{ w.label }}</span>
                                </span>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          } @else if (tool.type === 'toggleVisibility') {
            <button
              class="tool-btn"
              (click)="onToolClick(tool)">
              <i [ngClass]="[tool.baseClass, drawingVisible ? 'bc_yincang' : 'bc_xianshi']"></i>
              @if (!showPicker && !showShapes && !showStamps && !showDurations) {
                <span class="tooltip">{{ drawingVisible ? '隐藏标注' : '显示标注' }}</span>
              }
            </button>
          } @else {
            <button
              class="tool-btn"
              [class.active]="activeTool === tool.type"
              (click)="onToolClick(tool)">
              <i [ngClass]="[tool.baseClass, tool.icon]"></i>
              @if (!showPicker && !showShapes && !showStamps && !showDurations) {
                <span class="tooltip">{{ tool.label }}</span>
              }
            </button>
          }
          @if (tool.dividerAfter) {
            <span class="divider"></span>
          }
        }

        @if (showPicker) {
          <div class="picker-panel">
            <div class="panel-section">
              <span class="panel-label">描边颜色</span>
              <div class="color-row">
                @for (c of colors; track c) {
                  <span class="color-dot"
                        [class.active]="activeColor === c"
                        [style.background]="c"
                        (click)="onColorSelect(c)"></span>
                }
              </div>
            </div>
            <div class="panel-section">
              <span class="panel-label">粗细</span>
              <div class="width-row">
                @for (w of widths; track w.value) {
                  <span class="width-opt"
                        [class.active]="activeWidth === w.value"
                        (click)="onWidthSelect(w.value)">
                  <span class="width-dot" [style.width.px]="w.value * 2" [style.height.px]="w.value * 2"></span>
                </span>
                }
              </div>
            </div>
            <div class="panel-section">
              <span class="panel-label">填充颜色</span>
              <div class="color-row">
              <span class="color-dot no-fill"
                    [class.active]="!activeFillColor"
                    (click)="onFillColorSelect('')">✕</span>
                @for (c of colors; track c) {
                  <span class="color-dot"
                        [class.active]="activeFillColor === c"
                        [style.background]="c"
                        (click)="onFillColorSelect(c)"></span>
                }
              </div>
            </div>
            <div class="panel-section">
              <span class="panel-label">线型</span>
              <div class="dash-row">
                @for (d of dashStyles; track d.label) {
                  <span class="dash-opt"
                        [class.active]="activeDashLabel === d.label"
                        (click)="onDashSelect(d)">{{ d.label }}</span>
                }
              </div>
            </div>
            <div class="panel-section">
              <span class="panel-label">透明度</span>
              <div class="dash-row">
                @for (o of opacityLevels; track o.value) {
                  <span class="dash-opt"
                        [class.active]="activeOpacity === o.value"
                        (click)="onOpacitySelect(o.value)">{{ o.label }}</span>
                }
              </div>
            </div>
          </div>
        }
      </div>
    `,
    styles: [`
        .drawing-toolbar {
            position: fixed;
            left: 20px;
            top: 50%;
            transform: translateY(-50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            padding: 8px 6px;
            background: rgba(0, 0, 0, 0.8);
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 10002;
            transition: opacity 0.3s, transform 0.3s;

            &.hidden {
                opacity: 0;
                transform: translateY(-50%) translateX(-20px);
                pointer-events: none;
            }
        }

        .tool-wrapper {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .tool-btn {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: transparent;
            border: none;
            border-left: 2px solid transparent;
            color: white;
            cursor: pointer;
            border-radius: 4px;
            font-size: 18px;

            &:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            &:hover .tooltip {
                opacity: 1;
                visibility: visible;
            }

            &.active {
                background: rgba(255, 255, 255, 0.2);
                border-left-color: white;
            }
        }

        .tooltip {
            position: absolute;
            left: calc(100% + 8px);
            top: 50%;
            transform: translateY(-50%);
            white-space: nowrap;
            padding: 4px 8px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            font-size: 12px;
            border-radius: 4px;
            pointer-events: none;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.15s;
        }

        .divider {
            width: 24px;
            height: 1px;
            background: rgba(255, 255, 255, 0.2);
            margin: 4px 0;
        }

        .sub-arrow {
            position: absolute;
            right: 2px;
            bottom: 2px;
            font-size: 8px;
            color: rgba(255, 255, 255, 0.5);
            line-height: 1;
        }

        .sub-menu, picker-panel {
            position: absolute;
            left: calc(100% + 8px);
            top: 0;
            background: rgba(0, 0, 0, 0.85);
            border-radius: 8px;
            padding: 6px;
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 100px;
            z-index: 10003;
        }

        .sub-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            background: transparent;
            border: none;
            color: white;
            cursor: pointer;
            border-radius: 4px;
            font-size: 14px;
            white-space: nowrap;

            &:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            &.active {
                background: rgba(255, 255, 255, 0.2);
            }

            i {
                font-size: 16px;
            }
        }

        .sub-label {
            font-size: 12px;
        }

        .picker-panel {
            position: absolute;
            left: calc(100% + 8px);
            top: 0;
            background: rgba(0, 0, 0, 0.85);
            border-radius: 8px;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 180px;
        }

        .panel-section {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .panel-label {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.5);
        }

        .color-row {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .color-dot {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            cursor: pointer;
            border: 2px solid transparent;
            transition: border-color 0.15s;

            &:hover {
                border-color: rgba(255, 255, 255, 0.5);
            }

            &.active {
                border-color: white;
            }
        }

        .width-row {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .width-opt {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            cursor: pointer;
            border-radius: 4px;
            border: 1px solid transparent;
            flex-direction: column;
            gap: 2px;

            &:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            &.active {
                border-color: white;
            }
        }

        .width-dot {
            background: white;
            border-radius: 50%;
        }

        .width-label {
            font-size: 10px;
            color: rgba(255, 255, 255, 0.7);
        }

        .no-fill {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: rgba(255, 255, 255, 0.6);
            border: 1px dashed rgba(255, 255, 255, 0.3);
        }

        .dash-row {
            display: flex;
            gap: 4px;
        }

        .dash-opt {
            padding: 3px 8px;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.7);
            cursor: pointer;
            border-radius: 4px;
            border: 1px solid transparent;

            &:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            &.active {
                border-color: white;
                color: white;
            }
        }

        .stamp-menu {
            flex-direction: row;
            flex-wrap: wrap;
            min-width: 140px;
        }

        .stamp-btn {
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
        }

        .stamp-emoji {
            font-size: 22px;
        }
    `],
    standalone: true,
    imports: [NgClass],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DrawingToolbarComponent {
    @Input() activeTool: DrawingToolType | null = null;
    @Input() activeColor = '#E74F1F';
    @Input() activeWidth = 4;
    @Input() eraserWidth = 10; // 橡皮擦独立粗细设置

    @Output() toolChange = new EventEmitter<DrawingToolType>();
    @Output() colorChange = new EventEmitter<string>();
    @Output() widthChange = new EventEmitter<number>();
    @Output() eraserWidthChange = new EventEmitter<number>(); // 橡皮擦粗细变化事件
    @Output() fillColorChange = new EventEmitter<string>();
    @Output() opacityChange = new EventEmitter<number>();
    @Output() dashChange = new EventEmitter<number[]>();
    @Output() undoAction = new EventEmitter<void>();
    @Output() redoAction = new EventEmitter<void>();
    @Output() clearAction = new EventEmitter<void>();
    @Output() closeAction = new EventEmitter<void>();
    @Output() replayAction = new EventEmitter<void>();
    @Output() toggleVisibilityAction = new EventEmitter<void>();
    @Output() stampChange = new EventEmitter<string>();
    @Output() durationChange = new EventEmitter<number>();

    colors = COLORS;
    widths = WIDTHS;
    eraserWidths = ERASER_WIDTHS; // 橡皮擦粗细选项
    dashStyles = DASH_STYLES;
    opacityLevels = OPACITY_LEVELS;
    showPicker = false;
    showEraserWidthPanel = false; // 橡皮擦粗细面板显示状态
    showShapes = false;
    showStamps = false;
    showDurations = false;
    drawingVisible = true;
    isHidden = false;
    pinned = false;
    activeFillColor = '';
    activeDashLabel = '实线';
    activeOpacity = 1;
    private hideTimer?: number;

    private shapeTypes: Set<string> = new Set([
        'line', 'rect', 'ellipse', 'triangle', 'diamond', 'star',
    ]);

    // Tools that show the style picker when clicked
    private pickerTools: Set<string> = new Set([
        'pen', 'highlighter', 'line', 'rect', 'ellipse',
        'triangle', 'diamond', 'star', 'arrow',
    ]);

    // Track which shape is currently selected for the shapes group button
    activeShapeDef: ToolDef = {type: 'rect', baseClass: 'bc_icon', icon: 'bc_juxing', label: '矩形'};

    get isShapeActive(): boolean {
        return this.shapeTypes.has(this.activeTool as string);
    }

    tools: ToolDef[] = [
        // { type: 'select', baseClass: 'bc_icon', icon: 'bc_shubiao', label: '选择' },
        {type: 'pen', baseClass: 'bc_icon', icon: 'bc_huabi', label: '画笔'},
        {type: 'highlighter', baseClass: 'bc_icon', icon: 'bc_yingguangbi', label: '荧光笔', dividerAfter: true},
        {
            type: 'shapes', baseClass: 'bc_icon', icon: 'bc_tuxing', label: '图形', children: [
                {type: 'line', baseClass: 'bc_icon', icon: 'bc_zhixian', label: '直线'},
                {type: 'rect', baseClass: 'bc_icon', icon: 'bc_juxing', label: '矩形'},
                {type: 'ellipse', baseClass: 'bc_icon', icon: 'bc_tuoyuan', label: '椭圆'},
                {type: 'triangle', baseClass: 'bc_icon', icon: 'bc_sanjiaoxing', label: '三角形'},
                {type: 'diamond', baseClass: 'bc_icon', icon: 'bc_lingxing', label: '菱形'},
                {type: 'star', baseClass: 'bc_icon', icon: 'bc_star', label: '星形'},
            ]
        },
        {type: 'arrow', baseClass: 'bc_icon', icon: 'bc_jiantouhuabi', label: '箭头', dividerAfter: true},
        // {type: 'text', baseClass: 'bc_icon', icon: 'bc_wenben', label: '文字'},
        {type: 'laser', baseClass: 'bc_icon', icon: 'bc_jiguangbi', label: '激光笔'},
        {type: 'eraser', baseClass: 'bc_icon', icon: 'bc_xiangpica', label: '橡皮擦', dividerAfter: true},
        {type: 'callout', baseClass: 'bc_icon', icon: 'bc_bianhao1', label: '编号气泡', dividerAfter: true},
        {type: 'undo', baseClass: 'bc_icon', icon: 'bc_chehui', label: '撤销'},
        {type: 'redo', baseClass: 'bc_icon', icon: 'bc_huitui', label: '重做'},
        // {type: 'replay', baseClass: 'bc_icon', icon: 'bc_bofang', label: '回放'},
        {type: 'clear', baseClass: 'bc_icon', icon: 'bc_shanchu', label: '清空'},
        {
            type: 'toggleVisibility',
            baseClass: 'bc_icon',
            icon: 'bc_xianshi',
            label: '显示/隐藏',
            dividerAfter: true
        },
        {type: 'close', baseClass: 'bc_icon', icon: 'bc_guanbi', label: '关闭'},
    ];

    constructor(private cdr: ChangeDetectorRef) {
    }

    ngOnInit() {
        this.startHideTimer();
    }

    startHideTimer() {
        clearTimeout(this.hideTimer);
        if (this.pinned) return;
        this.hideTimer = window.setTimeout(() => {
            this.isHidden = true;
            this.cdr.markForCheck();
        }, 3000);
    }

    show() {
        clearTimeout(this.hideTimer);
        this.isHidden = false;
        this.cdr.markForCheck();
    }

    onToolClick(tool: ToolDef) {
        this.show();
        this.startHideTimer();
        this.showShapes = false;
        this.showStamps = false;
        this.showDurations = false;
        this.showEraserWidthPanel = false; // 默认关闭橡皮擦面板
        switch (tool.type) {
            case 'undo':
                this.undoAction.emit();
                return;
            case 'redo':
                this.redoAction.emit();
                return;
            case 'clear':
                this.clearAction.emit();
                return;
            case 'close':
                this.closeAction.emit();
                return;
            case 'replay':
                this.replayAction.emit();
                return;
            case 'toggleVisibility':
                this.drawingVisible = !this.drawingVisible;
                this.toggleVisibilityAction.emit();
                this.cdr.markForCheck();
                return;
        }
        const t = tool.type as DrawingToolType;
        if (t === 'eraser') {
            // 橡皮擦特殊处理：切换橡皮擦粗细面板
            this.activeTool = t;
            this.toolChange.emit(t);
            this.showEraserWidthPanel = !this.showEraserWidthPanel;
            this.showPicker = false; // 关闭通用样式面板
        } else if (this.activeTool === t) {
            this.showPicker = !this.showPicker && this.pickerTools.has(t);
        } else {
            this.activeTool = t;
            this.toolChange.emit(t);
            this.showPicker = this.pickerTools.has(t);
        }
        this.cdr.markForCheck();
    }

    onShapesToggle() {
        this.show();
        this.startHideTimer();
        this.showPicker = false;
        this.showStamps = false;
        this.showDurations = false;
        this.showShapes = !this.showShapes;
        this.cdr.markForCheck();
    }

    onShapeSelect(shape: ToolDef) {
        this.activeShapeDef = shape;
        this.activeTool = shape.type as DrawingToolType;
        this.toolChange.emit(this.activeTool);
        this.showShapes = false;
        this.showPicker = true;
        this.cdr.markForCheck();
    }

    onColorSelect(color: string) {
        this.activeColor = color;
        this.colorChange.emit(color);
        this.cdr.markForCheck();
    }

    onWidthSelect(width: number) {
        this.activeWidth = width;
        this.widthChange.emit(width);
        this.cdr.markForCheck();
    }

    onEraserWidthSelect(width: number) {
        this.eraserWidth = width;
        this.eraserWidthChange.emit(width);
        this.cdr.markForCheck();
    }

    onFillColorSelect(color: string) {
        this.activeFillColor = color;
        this.fillColorChange.emit(color);
        this.cdr.markForCheck();
    }

    onDashSelect(d: { label: string; value: number[] }) {
        this.activeDashLabel = d.label;
        this.dashChange.emit(d.value);
        this.cdr.markForCheck();
    }

    onOpacitySelect(opacity: number) {
        this.activeOpacity = opacity;
        this.opacityChange.emit(opacity);
        this.cdr.markForCheck();
    }

    updateView() {
        this.cdr.markForCheck();
    }
}
