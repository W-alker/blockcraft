import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output } from "@angular/core";

@Component({
  selector: 'demo-control-bar',
  template: `
    <div class="demo-control-bar"
         [class.hidden]="isHidden"
         (mouseenter)="show()"
         (mouseleave)="startHideTimer()">

      <button (click)="onPrev()" [disabled]="currentPage === 1" title="上一页">
        <i class="bc_icon bc_chevron-left"></i>
      </button>

      <span class="progress">{{ currentPage }} / {{ totalPages }}</span>

      <button (click)="onNext()" [disabled]="currentPage === totalPages" title="下一页" style="transform: rotate(180deg);">
        <i class="bc_icon bc_chevron-left"></i>
      </button>

      @if (showZoomControls) {
        <span class="divider"></span>

        <span class="zoom-controls" aria-label="演示页面缩放">
          <button
            (click)="onZoomOut()"
            [disabled]="zoomPercent <= 50"
            title="缩小（Ctrl/Cmd+-）"
            aria-label="缩小演示页面">
            <i class="bc_icon bc_suoxiao"></i>
          </button>

          <button
            class="zoom-value"
            [class.zoom-value--fit]="fitPageActive"
            (click)="onFitPage()"
            title="适合页面（Ctrl/Cmd+0）">
            {{ zoomPercent }}%
          </button>

          <button
            (click)="onZoomIn()"
            [disabled]="zoomPercent >= 200"
            title="放大（Ctrl/Cmd++）"
            aria-label="放大演示页面">
            <i class="bc_icon bc_fangda"></i>
          </button>
        </span>
      }

      <span class="divider"></span>

      <button (click)="onToggleDrawing()" title="画笔标注">
        <i class="bc_icon bc_jihaobi"></i>
      </button>

      <span class="divider"></span>

      <button (click)="onExit()" title="退出演示模式 (ESC)">
        <i class="bc_icon bc_guanbi"></i>
      </button>
    </div>
  `,
  styles: [`
    .demo-control-bar {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);

      display: flex;
      align-items: center;
      gap: 8px;

      padding: 12px 20px;
      background: rgba(0, 0, 0, 0.8);
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);

      color: white;
      font-size: 14px;

      transition: opacity 0.3s, transform 0.3s;
      z-index: 10002;

      &.hidden {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
        pointer-events: none;
      }

      button {
        background: transparent;
        border: none;
        color: white;
        padding: 4px 8px;
        cursor: pointer;
        border-radius: 4px;

        &:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
        }

        &:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        i {
          font-size: 18px;
        }
      }

      .progress {
        min-width: 60px;
        text-align: center;
        font-weight: 500;
      }

      .zoom-controls {
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .zoom-value {
        min-width: 52px;
        font-variant-numeric: tabular-nums;

        &.zoom-value--fit {
          background: rgba(255, 255, 255, 0.14);
        }
      }

      .divider {
        width: 1px;
        height: 20px;
        background: rgba(255, 255, 255, 0.3);
      }
    }
  `],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DemoControlBarComponent {
  @Input() currentPage = 1;
  @Input() totalPages = 1;
  @Input() showZoomControls = false;
  @Input() zoomPercent = 100;
  @Input() fitPageActive = false;
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() zoomIn = new EventEmitter<void>();
  @Output() zoomOut = new EventEmitter<void>();
  @Output() fitPage = new EventEmitter<void>();
  @Output() exit = new EventEmitter<void>();
  @Output() toggleDrawing = new EventEmitter<void>();

  isHidden = false;
  pinned = false;
  private hideTimer?: number;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    // 初始显示，3秒后自动隐藏
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

  onPrev() {
    this.prev.emit();
    this.show();
    this.startHideTimer();
  }

  onNext() {
    this.next.emit();
    this.show();
    this.startHideTimer();
  }

  onExit() {
    this.exit.emit();
  }

  onZoomIn() {
    this.zoomIn.emit();
    this.show();
    this.startHideTimer();
  }

  onZoomOut() {
    this.zoomOut.emit();
    this.show();
    this.startHideTimer();
  }

  onFitPage() {
    this.fitPage.emit();
    this.show();
    this.startHideTimer();
  }

  onToggleDrawing() {
    this.toggleDrawing.emit();
    this.show();
    this.startHideTimer();
  }

  updateView() {
    this.cdr.markForCheck();
  }
}
