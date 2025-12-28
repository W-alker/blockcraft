import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output,
  TrackByFunction,
  ViewChild,
  ViewContainerRef
} from '@angular/core';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { BcFloatToolbarItemComponent } from "./float-toolbar-item";

/**
 * 虚拟工具栏项数据接口
 */
export interface IVirtualToolbarItem {
  /** 唯一标识（必需，用于虚拟滚动追踪） */
  id: string;
  /** 项名称 */
  name: string;
  /** 项值 */
  value?: any;
  /** 图标类名 */
  icon?: string;
  /** 文本内容 */
  text?: string;
  /** 标题提示 */
  title?: string;
  /** 是否激活 */
  active?: boolean;
  /** 是否可展开 */
  expandable?: boolean;
  /** 是否为分隔符 */
  divider?: boolean;
  /** 自定义数据 */
  data?: any;
}

/**
 * 虚拟工具栏点击事件
 */
export interface IVirtualToolbarClickEvent {
  item: IVirtualToolbarItem;
  index: number;
  event: MouseEvent;
}

/**
 * 虚拟渲染浮动工具栏组件
 *
 * 特性：
 * - 支持大量工具栏项（1000+）的高性能渲染
 * - 基于 CDK Virtual Scroll 实现按需渲染
 * - 仅渲染可见区域的项，大幅降低 DOM 节点数量
 * - 支持水平和垂直两种滚动方向
 */
@Component({
  selector: 'bc-virtual-float-toolbar',
  template: `

    <div class="bc-virtual-float-toolbar__wrapper"
         [attr.data-direction]="direction"
         [style]="styles">

      @if (direction === 'column') {
        <!-- 垂直虚拟滚动 -->
        <cdk-virtual-scroll-viewport
          #viewport
          [itemSize]="itemSize"
          [minBufferPx]="minBufferPx"
          [maxBufferPx]="maxBufferPx"
          class="bc-virtual-toolbar__viewport bc-virtual-toolbar__viewport--vertical">

          <div *cdkVirtualFor="let item of items; let i = index; trackBy: trackByFn"
               class="bc-virtual-toolbar__item-wrapper">
            @if (item.divider) {
              <span class="bc-float-toolbar__divider"></span>
            } @else {
              <bc-float-toolbar-item
                [attr.data-index]="i"
                [attr.data-id]="item.id"
                [name]="item.name"
                [value]="item.value"
                [icon]="item.icon"
                [title]="item.title"
                [active]="item.active ?? false"
                [expandable]="item.expandable ?? false">
                {{ item.text }}
              </bc-float-toolbar-item>
            }
          </div>
        </cdk-virtual-scroll-viewport>
      } @else {
        <!-- 水平虚拟滚动 -->
        <cdk-virtual-scroll-viewport
          #viewport
          [itemSize]="itemSize"
          [minBufferPx]="minBufferPx"
          [maxBufferPx]="maxBufferPx"
          orientation="horizontal"
          class="bc-virtual-toolbar__viewport bc-virtual-toolbar__viewport--horizontal">

          <div *cdkVirtualFor="let item of items; let i = index; trackBy: trackByFn"
               class="bc-virtual-toolbar__item-wrapper">
            @if (item.divider) {
              <span class="bc-float-toolbar__divider"></span>
            } @else {
              <bc-float-toolbar-item
                [attr.data-index]="i"
                [attr.data-id]="item.id"
                [name]="item.name"
                [value]="item.value"
                [icon]="item.icon"
                [title]="item.title"
                [active]="item.active ?? false"
                [expandable]="item.expandable ?? false">
                {{ item.text }}
              </bc-float-toolbar-item>
            }
          </div>
        </cdk-virtual-scroll-viewport>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .bc-virtual-float-toolbar__wrapper {
      width: 100%;
      height: 100%;
      background: #fff;
      border-radius: 4px;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.10);
      overflow: hidden;
    }

    .bc-virtual-toolbar__viewport {
      width: 100%;
      height: 100%;
    }

    .bc-virtual-toolbar__viewport--vertical {
      display: flex;
      flex-direction: column;
    }

    .bc-virtual-toolbar__viewport--horizontal {
      display: flex;
      flex-direction: row;
    }

    .bc-virtual-toolbar__item-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 8px;
    }

    /* 垂直方向样式 */
    .bc-virtual-toolbar__viewport--vertical .bc-virtual-toolbar__item-wrapper {
      min-height: var(--item-size, 32px);
      border-bottom: 1px solid transparent;
    }

    .bc-virtual-toolbar__viewport--vertical .bc-virtual-toolbar__item-wrapper:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    /* 水平方向样式 */
    .bc-virtual-toolbar__viewport--horizontal .bc-virtual-toolbar__item-wrapper {
      min-width: var(--item-size, 48px);
      height: 100%;
      border-right: 1px solid transparent;
    }

    .bc-virtual-toolbar__viewport--horizontal .bc-virtual-toolbar__item-wrapper:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    /* 分隔符样式 */
    .bc-float-toolbar__divider {
      display: block;
      background: #e6e6e6;
    }

    .bc-virtual-toolbar__viewport--vertical .bc-float-toolbar__divider {
      width: 100%;
      height: 1px;
      margin: 4px 0;
    }

    .bc-virtual-toolbar__viewport--horizontal .bc-float-toolbar__divider {
      width: 1px;
      height: 24px;
      margin: 0 4px;
    }
  `],
  standalone: true,
  imports: [ScrollingModule, BcFloatToolbarItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.padding.px]': 'gapAround',
    '[style.--item-size.px]': 'itemSize'
  }
})
export class BcVirtualFloatToolbarComponent {
  /**
   * 工具栏项数组（必需）
   * 注意：每个 item 必须有唯一的 id 字段用于虚拟滚动追踪
   */
  @Input({ required: true })
  items!: IVirtualToolbarItem[];

  /**
   * 工具栏方向
   * - 'row': 水平方向（默认）
   * - 'column': 垂直方向
   */
  @Input()
  @HostBinding('attr.data-direction')
  direction: 'row' | 'column' = 'column';

  /**
   * 自定义样式
   */
  @Input()
  styles: string = '';

  /**
   * 主题
   */
  @Input()
  @HostBinding('class')
  theme: string = 'light';

  /**
   * 外边距
   */
  @Input()
  gapAround = 0;

  /**
   * 每个项的固定大小（像素）
   * - 垂直方向：项的高度
   * - 水平方向：项的宽度
   */
  @Input()
  itemSize: number = 32;

  /**
   * 最小缓冲区大小（像素）
   * 在可视区域外预渲染的最小像素数
   */
  @Input()
  minBufferPx: number = 100;

  /**
   * 最大缓冲区大小（像素）
   * 在可视区域外预渲染的最大像素数
   */
  @Input()
  maxBufferPx: number = 200;

  /**
   * 自定义 trackBy 函数
   * 默认使用 item.id 追踪
   */
  @Input()
  trackBy?: TrackByFunction<IVirtualToolbarItem>;

  /**
   * 点击事件
   */
  @Output()
  onItemClick = new EventEmitter<IVirtualToolbarClickEvent>();

  /**
   * 滚动事件
   * 参数：{ startIndex: number, endIndex: number }
   */
  @Output()
  onScroll = new EventEmitter<{ startIndex: number; endIndex: number }>();

  /**
   * 虚拟滚动视口引用
   */
  @ViewChild('viewport', { read: CdkVirtualScrollViewport })
  viewport?: CdkVirtualScrollViewport;

  constructor(
    private el: ElementRef<HTMLElement>,
    private vcr: ViewContainerRef
  ) { }

  ngAfterViewInit() {
    // 监听滚动事件
    if (this.viewport) {
      this.viewport.scrolledIndexChange.subscribe(index => {
        const range = this.viewport!.getRenderedRange();
        this.onScroll.emit({
          startIndex: range.start,
          endIndex: range.end
        });
      });
    }
  }

  /**
   * 默认 trackBy 函数：使用 id 追踪
   */
  protected trackByFn: TrackByFunction<IVirtualToolbarItem> = (index, item) => {
    if (this.trackBy) {
      return this.trackBy(index, item);
    }
    return item.id;
  };

  private timestamp: number = 0;

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();

    if (event.timeStamp - this.timestamp < 100) return;
    this.timestamp = event.timeStamp;

    const target = event.target as Node | null;
    if (!target) return;
    const targetEle = target instanceof HTMLElement ? target : target.parentElement!;
    const closetItem = targetEle.closest('bc-float-toolbar-item');
    if (!closetItem) return;

    // 从 DOM 属性中获取索引和 ID
    const index = parseInt(closetItem.getAttribute('data-index') || '-1');
    const itemId = closetItem.getAttribute('data-id');

    if (index >= 0 && index < this.items.length) {
      const item = this.items[index];

      // 验证 ID 是否匹配（防止滚动时索引错位）
      if (item.id === itemId && !item.divider) {
        this.onItemClick.emit({ item, index, event });
      }
    }
  }

  /**
   * 滚动到指定索引
   */
  scrollToIndex(index: number, behavior: ScrollBehavior = 'smooth') {
    this.viewport?.scrollToIndex(index, behavior);
  }

  /**
   * 滚动到指定的项（通过 ID）
   */
  scrollToItem(itemId: string, behavior: ScrollBehavior = 'smooth') {
    const index = this.items.findIndex(item => item.id === itemId);
    if (index >= 0) {
      this.scrollToIndex(index, behavior);
    }
  }

  /**
   * 获取当前可见范围
   */
  getVisibleRange(): { start: number; end: number } | null {
    if (!this.viewport) return null;
    return this.viewport.getRenderedRange();
  }

  /**
   * 获取当前滚动位置（偏移量）
   */
  getScrollOffset(): number {
    return this.viewport?.measureScrollOffset() || 0;
  }

  /**
   * 测量总内容大小
   */
  measureContentSize(): number {
    return this.viewport?.measureScrollOffset('bottom') || 0;
  }
}
