import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input,
  Output, ViewChild, signal, inject, NgZone, type OnChanges, type OnInit, type OnDestroy, type SimpleChanges, type AfterViewInit,
} from '@angular/core';
import {CsTooltipDirective} from '@cses/ui';
import {Subject, type Subscription} from 'rxjs';

export interface FloatingToolbarOptions {
  /** 初始是否收起；默认展开。只影响当前插件实例，不写入文档。 */
  collapsed?: boolean;
}

/** 插件持有状态，浮层重建时继续复用；其他工具栏可使用同一外壳与操作。 */
export class FloatingToolbarState {
  private readonly collapsedValue;
  readonly collapsed;
  private readonly changes = new Subject<boolean>();
  readonly changes$ = this.changes.asObservable();

  constructor(options: FloatingToolbarOptions = {}) {
    this.collapsedValue = signal(options.collapsed ?? false);
    this.collapsed = this.collapsedValue.asReadonly();
  }

  setCollapsed(collapsed: boolean): void {
    if (collapsed === this.collapsedValue()) return;
    this.collapsedValue.set(collapsed);
    this.changes.next(collapsed);
  }

  toggle(): void { this.setCollapsed(!this.collapsedValue()); }
}

/** 可投影任意工具条；收起时保留一个可键盘操作的展开入口。 */
@Component({
  selector: 'bc-floating-toolbar',
  standalone: true,
  imports: [CsTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {contenteditable: 'false'},
  template: `
    <div class="floating-toolbar" [class.floating-toolbar--left]="side === 'left'"
         [class.floating-toolbar--constrained]="constrainHeight"
         [attr.data-bc-toolbar-collapsed]="state.collapsed()">
      <button #toggle type="button" class="floating-toolbar__toggle"
              [attr.aria-label]="(state.collapsed() ? '展开' : '收起') + label"
              [csTooltip]="(state.collapsed() ? '展开' : '收起') + label"
              [attr.aria-expanded]="!state.collapsed()" (click)="state.toggle()">
        <i class="bc_icon" [class.bc_plus]="state.collapsed()"
           [class.bc_minus]="!state.collapsed()" aria-hidden="true"></i>
      </button>
      <div #content class="floating-toolbar__content" [hidden]="state.collapsed()"><ng-content /></div>
    </div>
  `,
  styles: `
    :host{display:block;max-width:100%;max-height:inherit}
    .floating-toolbar{display:flex;flex-direction:column;align-items:flex-start;gap:1px;max-width:100%;color:var(--bc-float-toolbar-item-color,#1f2937)}
    .floating-toolbar--left{align-items:flex-end}
    .floating-toolbar__toggle{position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-sizing:border-box;width:24px;height:24px;margin:0 5px;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer}
    .floating-toolbar__toggle::before{content:"";position:absolute;inset:2px;border-radius:50%;background:var(--bc-float-toolbar-bg,#fff);box-shadow:var(--bc-fixed-toolbar-shadow,0 2px 8px rgba(15,23,42,.16));pointer-events:none}
    .floating-toolbar__toggle .bc_icon{position:relative;font-size:12px;line-height:1}
    .floating-toolbar__toggle:hover::before{background:var(--bc-float-toolbar-item-hover-bg,#f1f5f9)}
    .floating-toolbar__toggle:focus-visible{outline:2px solid var(--bc-active-color,#4857e2);outline-offset:2px}
    .floating-toolbar__content{max-width:100%}
    .floating-toolbar--constrained{max-height:inherit;min-height:0}
    .floating-toolbar--constrained .floating-toolbar__content{min-height:0}
    .floating-toolbar__content[hidden]{display:none}
    @media(pointer:coarse){.floating-toolbar{gap:3px}.floating-toolbar__toggle{width:34px;height:34px;margin:0}.floating-toolbar__toggle::before{inset:0}}
  `,
})
export class FloatingToolbarComponent implements OnChanges, OnInit, AfterViewInit, OnDestroy {
  @Input() state = new FloatingToolbarState();
  @Input() label = '对象工具栏';
  @Input() side: 'left' | 'right' = 'right';
  /** 接入按可用空间限高的 Overlay 时，仅内容区滚动，保留顶部开关。 */
  @Input() constrainHeight = false;
  /** 包括程序切换，宿主可在此提交输入、关闭面板并清理临时预览。 */
  @Output() readonly collapsedChange = new EventEmitter<boolean>();
  @ViewChild('toggle') private toggleButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('content') private content?: ElementRef<HTMLElement>;
  private subscription?: Subscription;
  private readonly zone = inject(NgZone);
  private boundsOwner?: HTMLElement;
  private boundsObserver?: MutationObserver;
  private boundsFrame: number | null = null;
  private viewReady = false;

  ngOnInit(): void {
    if (!this.subscription) this.bindState();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['state']) this.bindState();
    if (changes['constrainHeight'] && this.viewReady) this.bindBounds();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.bindBounds();
  }

  private bindBounds(): void {
    this.releaseBounds();
    if (!this.constrainHeight) return;
    this.boundsOwner = this.content?.nativeElement.closest<HTMLElement>('.cdk-overlay-pane') ?? undefined;
    if (!this.boundsOwner) return;
    this.zone.runOutsideAngular(() => {
      // Overlay 已负责计算可用高度，这里只投影预算，不增加第二层滚动容器。
      this.boundsObserver = new MutationObserver(this.scheduleBoundsUpdate);
      this.boundsObserver.observe(this.boundsOwner!, {attributes: true, attributeFilter: ['style']});
      this.scheduleBoundsUpdate();
    });
  }

  private readonly scheduleBoundsUpdate = (): void => {
    const view = this.boundsOwner?.ownerDocument.defaultView;
    if (!view || this.boundsFrame !== null) return;
    this.boundsFrame = view.requestAnimationFrame(() => {
      this.boundsFrame = null;
      const content = this.content?.nativeElement;
      const toggle = this.toggleButton?.nativeElement;
      if (!content || !toggle || !this.boundsOwner) return;
      const limit = parseFloat(this.boundsOwner.style.maxHeight);
      if (this.state.collapsed() || !Number.isFinite(limit)) {
        content.style.removeProperty('--bc-floating-toolbar-content-height');
        return;
      }
      const gap = parseFloat(view.getComputedStyle(content.parentElement!).rowGap) || 0;
      const value = `${Math.max(0, limit - toggle.offsetHeight - gap)}px`;
      if (content.style.getPropertyValue('--bc-floating-toolbar-content-height') !== value) {
        content.style.setProperty('--bc-floating-toolbar-content-height', value);
      }
    });
  };

  private releaseBounds(): void {
    this.boundsObserver?.disconnect();
    this.boundsObserver = undefined;
    if (this.boundsFrame !== null) this.boundsOwner?.ownerDocument.defaultView?.cancelAnimationFrame(this.boundsFrame);
    this.boundsFrame = null;
    this.boundsOwner = undefined;
    this.content?.nativeElement.style.removeProperty('--bc-floating-toolbar-content-height');
  }

  private bindState(): void {
    this.subscription?.unsubscribe();
    this.subscription = this.state.changes$.subscribe(collapsed => this.onCollapsedChange(collapsed));
    if (this.state.collapsed()) this.onCollapsedChange(true);
  }

  private onCollapsedChange(collapsed: boolean): void {
    const content = this.content?.nativeElement;
    if (collapsed && content?.contains(content.ownerDocument.activeElement)) {
      this.toggleButton?.nativeElement.focus({preventScroll: true});
    }
    this.collapsedChange.emit(collapsed);
    this.scheduleBoundsUpdate();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.releaseBounds();
  }
}
