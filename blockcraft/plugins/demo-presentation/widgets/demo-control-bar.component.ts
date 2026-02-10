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
      z-index: 10000;

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
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() exit = new EventEmitter<void>();

  isHidden = false;
  private hideTimer?: number;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    // 初始显示，3秒后自动隐藏
    this.startHideTimer();
  }

  startHideTimer() {
    clearTimeout(this.hideTimer);
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

  updateView() {
    this.cdr.markForCheck();
  }
}
