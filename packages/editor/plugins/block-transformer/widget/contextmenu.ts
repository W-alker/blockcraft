import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  Output,
} from "@angular/core";
import { NgForOf, NgTemplateOutlet } from "@angular/common";
import { MatIcon } from "@angular/material/icon";
import {
  BLOCK_CREATOR_SERVICE_TOKEN,
  BlockNodeType,
  EditableBlockComponent,
} from "../../../framework";
import { debounce } from "../../../global";
import {isSelectionAlive} from "../../../framework/modules/selection/liveness";

interface IContextMenuOption {
  flavour: string;
  type: "block" | "tool" | "heading";
  metadata: {
    label: string;
    icon?: string;
    svgIcon?: string;
    [key: string]: any;
  };
}

type MenuNavigationKey = "Escape" | "Enter" | "ArrowUp" | "ArrowDown";

const HEADING_LIST: IContextMenuOption[] = [
  {
    metadata: { label: "一级标题", icon: "bc_icon bc_biaoti_1", heading: 1 },
    flavour: "heading-one",
    type: "heading",
  },
  {
    metadata: { label: "二级标题", icon: "bc_icon bc_biaoti_2", heading: 2 },
    flavour: "heading-two",
    type: "heading",
  },
  {
    metadata: { label: "三级标题", icon: "bc_icon bc_biaoti_3", heading: 3 },
    flavour: "heading-three",
    type: "heading",
  },
  {
    metadata: { label: "四级标题", icon: "bc_icon bc_biaoti_4", heading: 4 },
    flavour: "heading-four",
    type: "heading",
  },
];
const TransformReg = /^[\/、].*/;

// 导航后把光标"钉"在原块里的时间窗口（ms）。WKWebView/Tauri 下 AppKit 的
// moveUp:/moveDown: 可能比任何 sync/microtask/rAF 都晚才把 DOM caret 拽走，
// 所以不再用固定时序补偿，而是在这个窗口内监听 selectionchange，等真正的
// 移动发生时再纠正，与底层 IPC 时序解耦。
const NAV_PIN_WINDOW_MS = 150;

@Component({
  selector: "block-transformer-contextmenu",
  template: `
    <ul
      class="list"
      (mousedown)="onMouseDown($event)"
      (mousemove)="onMouseMove()"
      (mouseover)="onMouseOver($event)"
    >
      @for (item of list; track item.flavour; let idx = $index) {
        <li
          class="list__item"
          [class.active]="activeIdx === idx"
          [attr.data-index]="idx"
        >
          @if (item.metadata.svgIcon) {
            <mat-icon
              [svgIcon]="item.metadata.svgIcon"
              style="width: 1em; height: 1em"
            ></mat-icon>
          } @else {
            <i [class]="item.metadata.icon"></i>
          }
          <span>{{ item.metadata.label }}</span>
        </li>
      }
    </ul>
  `,
  styleUrls: ["contextmenu.scss"],
  standalone: true,
  imports: [NgForOf, NgTemplateOutlet, MatIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[class]": `'bc-scrollable-container'`,
  },
})
export class BlockTransformContextMenu {
  @Input() doc!: BlockCraft.Doc;
  @Input() activeBlock!: EditableBlockComponent;

  @Output() close$ = new EventEmitter<boolean>();

  list: IContextMenuOption[] = [];
  protected activeIdx = 0;
  private isKeyboardNavigating = false;
  private lastHandledNavigationAt = 0;
  private suppressTimerId: ReturnType<typeof setTimeout> | null = null;
  private caretGuardArmed = false;
  private navTextLength = 0;
  // WKWebView/Tauri 下回车会被 document 捕获监听 + doc.event 热键双重派发，
  // stopImmediatePropagation 拦不住第二次，导致 select() 跑两遍（转换两次、
  // 多出一个 textarea 视图 + 对已删块报 Block not found）。一次性护栏，确保
  // 单次菜单只确认一次。Chrome 下本就只派发一次，加这个无副作用。
  private _consumed = false;

  constructor(
    public readonly cdr: ChangeDetectorRef,
    public readonly host: ElementRef<HTMLElement>,
    public readonly destroyRef: DestroyRef,
  ) {}

  ngOnInit() {
    // activeBlock 可能在菜单打开瞬间被远端删除：parentBlock 变 null，
    // 原 parentBlock! 非空断言会抛 TypeError 让整个 ngOnInit 崩溃。关闭菜单兜底。
    // close$ 的订阅在 createConnectedOverlay 之后已就绪（ngOnInit 在更晚的 CD
    // 周期才跑），但同步 emit 会让 overlay 在自身 ngOnInit 内 dispose 形成
    // ngOnInit→ngOnDestroy 重入，推迟一个微任务发出更干净。
    const parentBlock = this.activeBlock.parentBlock;
    if (!parentBlock) {
      queueMicrotask(() => this.close$.next(true));
      return;
    }
    const blocks: IContextMenuOption[] = this.doc.schemas
      .getSchemaList()
      .filter(
        (v) =>
          !v.metadata.isLeaf &&
          !v.metadata.hideInInsertMenu &&
          !["paragraph", "root"].includes(v.flavour) &&
          this.doc.canInsertChild(parentBlock.id, v.flavour),
      )
      .map((v) => ({
        flavour: v.flavour,
        metadata: v.metadata,
        type: "block",
      }));
    const listAll = HEADING_LIST.concat(blocks);

    this.list = listAll;

    const textObserver = debounce(() => {
      if (this.doc.event.status.isComposing) return;
      const text = this.activeBlock.textContent();
      if (!text || !TransformReg.test(text)) {
        this.close$.next(true);
        return;
      }
      const searchText = text.slice(1).toLowerCase();
      const matchedItems = listAll.filter(
        (v) =>
          v.metadata.label.startsWith(searchText) ||
          v.flavour.toLowerCase().startsWith(searchText),
      );
      if (!matchedItems.length) {
        this.close$.next(true);
        return;
      }
      this.list = matchedItems;
      this.activeIdx = 0;
      this.cdr.markForCheck();
    }, 300);

    this.activeBlock.yText.observe(textObserver);

    const hotKeyEvents = [
      this.doc.event.bindHotkey({ key: "Escape" }, (evt) =>
        this.handleHotkeyEvent(evt, "Escape"),
      ),
      this.doc.event.bindHotkey({ key: "Enter" }, (evt) =>
        this.handleHotkeyEvent(evt, "Enter"),
      ),
      this.doc.event.bindHotkey({ key: "ArrowUp" }, (evt) =>
        this.handleHotkeyEvent(evt, "ArrowUp"),
      ),
      this.doc.event.bindHotkey({ key: "ArrowDown" }, (evt) =>
        this.handleHotkeyEvent(evt, "ArrowDown"),
      ),
    ];

    document.addEventListener("keydown", this.handleRootKeydown, true);

    this.destroyRef.onDestroy(() => {
      document.removeEventListener("keydown", this.handleRootKeydown, true);
      hotKeyEvents.forEach((off) => off());
      this.activeBlock.yText?.unobserve(textObserver);
      if (this.suppressTimerId !== null) {
        clearTimeout(this.suppressTimerId);
        this.suppressTimerId = null;
      }
      this._disarmCaretGuard();
      this.doc.selection.setSuppressRecalculate(false);
    });
  }

  private handleRootKeydown = (event: KeyboardEvent) => {
    if (!this.canHandleMenuKeydown()) return;
    if (!this.handleMenuKey(event.key)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  private handleHotkeyEvent(
    evt: BlockCraft.EventStateContext,
    key: MenuNavigationKey,
  ) {
    if (!this.canHandleMenuKeydown()) return false;
    if (!this.handleMenuKey(key)) return false;

    evt.preventDefault();
    const event = evt.getDefaultEvent() as KeyboardEvent;
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    return true;
  }

  private canHandleMenuKeydown() {
    return !this.doc.event.status.isComposing;
  }

  private handleMenuKey(key: string) {
    switch (key) {
      case "Escape":
        this.markNavigationHandled();
        this.close$.next(true);
        return true;
      case "Enter":
        this.markNavigationHandled();
        this.select();
        return true;
      case "ArrowUp":
        this.markNavigationHandled();
        this.selectUp();
        return true;
      case "ArrowDown":
        this.markNavigationHandled();
        this.selectDown();
        return true;
      default:
        return false;
    }
  }

  onMouseDown(evt: MouseEvent) {
    evt.preventDefault();
    if (evt.eventPhase === Event.AT_TARGET) {
      return;
    }

    this.select();
  }

  onMouseOver(event: MouseEvent) {
    if (this.isKeyboardNavigating) return;

    const li = (event.target as HTMLElement).closest(".list__item");
    if (!li) return;

    const dataIdx = li.getAttribute("data-index");
    if (!dataIdx) return;
    const idx = parseInt(dataIdx, 10);
    if (idx === -1 || idx === this.activeIdx) return;

    this.activeIdx = idx;
  }

  onMouseMove() {
    // 一旦鼠标真的移动，说明用户正在用鼠标导航
    if (this.isKeyboardNavigating) {
      this.isKeyboardNavigating = false;
    }
  }

  selectUp() {
    if (!this.list.length) return;
    this.enterKeyboardNavigation();
    this.activeIdx = (this.activeIdx - 1 + this.list.length) % this.list.length;
    this._syncActiveClass();
    this.scrollToActive();
  }

  selectDown() {
    if (!this.list.length) return;
    this.enterKeyboardNavigation();
    this.activeIdx = (this.activeIdx + 1) % this.list.length;
    this._syncActiveClass();
    this.scrollToActive();
  }

  /**
   * CDK overlay + OnPush 组件 + 原生 keydown 监听的组合下，在某些场景（首次
   * 聚焦的新段落）detectChanges 不能可靠地把 `[class.active]` 绑定推进到
   * DOM。这里既做 Angular 侧的标脏 + 本地 CD，又用原生 DOM API 把 `.active`
   * 类强制同步一次，保证视觉一定更新。
   */
  private _syncActiveClass() {
    this.cdr.markForCheck();
    this.cdr.detectChanges();
    const items = this.host.nativeElement.querySelectorAll<HTMLElement>(
      ".list__item",
    );
    items.forEach((el) => {
      const idx = Number(el.getAttribute("data-index"));
      if (idx === this.activeIdx) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });
  }

  enterKeyboardNavigation() {
    this.isKeyboardNavigating = true;
  }

  shouldIgnoreSelectionChange() {
    return Date.now() - this.lastHandledNavigationAt < NAV_PIN_WINDOW_MS;
  }

  private markNavigationHandled() {
    this.lastHandledNavigationAt = Date.now();
    this.navTextLength = this.activeBlock?.textLength ?? 0;
    // WKWebView/Safari 在 contenteditable 中可能无视 keydown 的
    // preventDefault 仍然移动 DOM 光标，导致 selectionchange 触发
    // recalculate 把 BlockSelection 模型拽走、菜单被误关。这里 gate
    // 住原生 selectionchange 入口，让模型在导航期间保持锚定在
    // activeBlock。每次导航刷新窗口，菜单销毁时统一释放。
    this.doc.selection.setSuppressRecalculate(true);

    // 立刻纠正一次：覆盖 "AppKit 在 JS keydown 之前就把 caret 拽走" 的
    // 场景——此时模型还停在导航前的位置，能直接还原。
    this._restoreCaret();

    // 事件驱动纠正：Tauri/WKWebView 下 AppKit 的 moveUp:/moveDown: 可能
    // 晚于任何 sync/microtask/rAF 才把 DOM caret 拽走，固定时序的补偿会全部
    // 赶在移动之前空跑，移动随后覆盖 caret 且无人再拉回——表现就是“菜单
    // 高亮对、光标却跟着上下跳”。改成在导航窗口内监听 selectionchange，等
    // 真正的移动触发事件时再把 caret 拉回锚点，与底层 IPC 时序解耦。
    this._armCaretGuard();

    if (this.suppressTimerId !== null) {
      clearTimeout(this.suppressTimerId);
    }
    this.suppressTimerId = setTimeout(() => {
      this.suppressTimerId = null;
      this._disarmCaretGuard();
      this.doc.selection.setSuppressRecalculate(false);
    }, NAV_PIN_WINDOW_MS);
  }

  private _armCaretGuard() {
    if (this.caretGuardArmed) return;
    this.caretGuardArmed = true;
    document.addEventListener("selectionchange", this._onSelectionDrift);
  }

  private _disarmCaretGuard() {
    if (!this.caretGuardArmed) return;
    this.caretGuardArmed = false;
    document.removeEventListener("selectionchange", this._onSelectionDrift);
  }

  private _onSelectionDrift = () => {
    if (this.doc.event.status.isComposing) return;
    // 窗口内用户继续打字 → 文本长度变化 → 这是合法的光标右移而非上下键
    // 漂移，停止纠正、交还给正常输入流程，避免把刚输入字符的光标吞掉。
    if ((this.activeBlock?.textLength ?? 0) !== this.navTextLength) {
      this._disarmCaretGuard();
      return;
    }
    this._restoreCaret();
  };

  private _restoreCaret() {
    const sel = this.doc.selection.value;
    if (!isSelectionAlive(sel as any, this.doc)) return;
    if (!sel || sel.start.type !== "text") return;
    if (sel.firstBlock?.id !== this.activeBlock?.id) return;
    const target = sel.start.offset;
    // 幂等：DOM caret 已经落在锚点上就不要再 set——否则 setInlineRange 触发
    // 的 selectionchange 会再次进入本函数，形成自激循环。
    if (this._caretIsAt(target)) return;
    this.activeBlock.setInlineRange(target);
  }

  /** 当前 DOM 折叠光标是否恰好落在 activeBlock 的 `offset` 处。 */
  private _caretIsAt(offset: number): boolean {
    const dom = document.getSelection();
    if (!dom || !dom.isCollapsed || !dom.focusNode) return false;
    const container = this.activeBlock?.containerElement;
    if (!container || !container.contains(dom.focusNode)) return false;
    try {
      return (
        this.activeBlock.runtime.domPointToModel(
          dom.focusNode,
          dom.focusOffset,
        ) === offset
      );
    } catch {
      // 读不出来就当作"已在锚点"，宁可不纠正也不要陷入 setInlineRange →
      // selectionchange 的自激循环（跨块漂移已被上面的 contains 判断兜住）。
      return true;
    }
  }

  scrollToActive() {
    const container = this.host.nativeElement;
    const activeItem =
      container.querySelector<HTMLElement>(".list__item.active");
    if (!activeItem) return;

    const containerRect = container.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();

    if (itemRect.top < containerRect.top) {
      container.scrollTop = Math.max(
        0,
        container.scrollTop - (containerRect.top - itemRect.top),
      );
      return;
    }

    if (itemRect.bottom > containerRect.bottom) {
      container.scrollTop += itemRect.bottom - containerRect.bottom;
    }
  }

  select() {
    if (this._consumed) return;
    if (this.activeIdx === -1) return;
    const item = this.list[this.activeIdx];
    if (!item) return;
    this._consumed = true;

    switch (item.type) {
      case "block":
        this.transform2Block(item.flavour as any);
        break;
      case "heading":
        this.activeBlock.deleteText(0, this.activeBlock.textLength);
        this.activeBlock.updateProps({
          heading: item.metadata["heading"],
        });
        break;
    }

    this.close$.next(true);
  }

  transform2Block(flavour: BlockCraft.BlockFlavour) {
    const schema = this.doc.schemas.get(flavour)!;
    if (schema.nodeType === BlockNodeType.editable) {
      const snapshot = this.doc.schemas.createSnapshot(schema.flavour, [
        [],
        this.activeBlock.props,
      ]);
      void this.doc
        .chain()
        .replaceWithSnapshots(this.activeBlock.id, [snapshot])
        .nextTick()
        .setCursorAtBlock(snapshot.id, true)
        .recalculateSelection()
        .run();
      return;
    }

    // TODO
    const blockCreator = this.doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN);
    blockCreator.getParamsByScheme(schema).then((params) => {
      if (!params) return;
      // activeBlock 可能在 getParamsByScheme（弹窗/异步）期间被远端删除：
      // 对已删块 replaceWithSnapshots 无效，且读 props 会拿到陈旧值，直接放弃
      if (!this.doc.vm.get(this.activeBlock.id)) return;
      const newBlock = this.doc.schemas.createSnapshot(
        schema.flavour,
        params as any,
      );
      newBlock.props.depth = this.activeBlock.props.depth;
      void this.doc
        .chain()
        .replaceWithSnapshots(this.activeBlock.id, [newBlock])
        .nextTick()
        .setCursorAtBlock(newBlock.id, true)
        .recalculateSelection()
        .run();
    });
  }
}
