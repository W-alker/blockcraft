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
import { NgForOf } from "@angular/common";
import { MatIcon } from "@angular/material/icon";
import { CsIconComponent } from "@cses/ui";
import { EditableBlockComponent } from "../../../framework";
import { debounce } from "../../../global";
import {isSelectionAlive} from "../../../framework/modules/selection/liveness";
import type {SlashMenuItem} from "../command";
import {createSlashSearchIndex, matchesSlashSearch} from "../search";
import {
  installBlockTransformerKeyboardCapture,
  isSlashMenuNavigationKey,
  normalizeBlockTransformerNavigationKey,
  type BlockTransformerKeyboardCapture,
} from "../keyboard-routing";
import {
  isSlashQueryCursorOwned,
  resolveSlashQueryRange,
} from "../slash-query";

// 导航后把光标"钉"在原块里的时间窗口（ms）。WKWebView/Tauri 下 AppKit 的
// moveUp:/moveDown: 可能比任何 sync/microtask/rAF 都晚才把 DOM caret 拽走，
// 所以不再用固定时序补偿，而是在这个窗口内监听 selectionchange，等真正的
// 移动发生时再纠正，与底层 IPC 时序解耦。
const NAV_PIN_WINDOW_MS = 300;

@Component({
  selector: "block-transformer-contextmenu",
  template: `
    <ul
      class="list"
      role="listbox"
      aria-label="插入内容"
      (mousedown)="onMouseDown($event)"
      (mousemove)="onMouseMove()"
      (mouseover)="onMouseOver($event)"
    >
      @for (item of list; track item.id; let idx = $index) {
        @if (showGroupLabel(idx)) {
          <li class="list__group" role="presentation">{{ item.groupLabel }}</li>
        }
        <li
          class="list__item"
          role="option"
          [class.active]="activeIdx === idx"
          [attr.aria-selected]="activeIdx === idx"
          [attr.data-index]="idx"
        >
          @if (item.svgIcon) {
            <mat-icon
              [svgIcon]="item.svgIcon"
              style="width: 1em; height: 1em"
            ></mat-icon>
          } @else if (item.csIcon) {
            <cs-icon [csType]="item.csIcon"></cs-icon>
          } @else {
            <i [class]="item.icon"></i>
          }
          <span class="list__content">
            <span class="list__main">
              <span class="list__label">{{ item.label }}</span>
              @if (item.description) {
                <span class="list__description">{{ item.description }}</span>
              }
            </span>
            @if (item.shortcutHint || item.searchHint || item.markdownHint) {
              <span class="list__hint-stack">
                <span class="list__hints">
                  @if (item.shortcutHint) {
                    <kbd
                      class="list__hint list__hint--shortcut"
                      aria-label="快捷键"
                    >{{ item.shortcutHint }}</kbd>
                  }
                  @if (item.searchHint) {
                    <kbd
                      class="list__hint list__hint--search"
                      aria-label="快捷搜索"
                    >{{ item.searchHint }}</kbd>
                  }
                </span>
                @if (item.markdownHint) {
                  <span class="list__markdown">
                    <span class="list__markdown-label">Markdown</span>
                    <kbd
                      class="list__hint list__hint--markdown"
                      aria-label="Markdown 快捷输入"
                    >{{ item.markdownHint }}</kbd>
                  </span>
                }
              </span>
            }
          </span>
        </li>
      } @empty {
        <li class="list__empty" role="status">没有匹配的命令</li>
      }
    </ul>
  `,
  styleUrls: ["contextmenu.scss"],
  standalone: true,
  imports: [NgForOf, MatIcon, CsIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[class]": `'bc-scrollable-container'`,
  },
})
export class BlockTransformContextMenu {
  @Input() doc!: BlockCraft.Doc;
  @Input() activeBlock!: EditableBlockComponent;
  @Input() triggerIndex = 0;
  @Input() items: readonly SlashMenuItem[] = [];

  @Output() close$ = new EventEmitter<boolean>();
  @Output() commandSelected = new EventEmitter<SlashMenuItem>();

  list: SlashMenuItem[] = [];
  protected activeIdx = 0;
  private isKeyboardNavigating = false;
  private lastHandledNavigationAt = 0;
  private suppressTimerId: ReturnType<typeof setTimeout> | null = null;
  private caretGuardArmed = false;
  private navTextLength = 0;
  // 一次性护栏，避免宿主桥接层重复派发回车时执行两次命令。
  private _consumed = false;
  private keyboardCapture?: BlockTransformerKeyboardCapture;

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
    if (!this.activeBlock.parentBlock) {
      queueMicrotask(() => this.close$.next(true));
      return;
    }
    const listAll = [...this.items];
    const searchIndexes = new Map(
      listAll.map(item => [item.id, createSlashSearchIndex(item)]),
    );
    this.list = listAll;

    const textObserver = debounce(() => {
      if (this.doc.event.status.isComposing) return;
      const query = this.currentQuery();
      if (query === null) {
        this.close$.next(true);
        return;
      }
      const matchedItems = listAll.filter(
        item => matchesSlashSearch(searchIndexes.get(item.id) ?? [], query),
      );
      if (!matchedItems.length) {
        this.list = [];
        this.activeIdx = -1;
      } else {
        this.list = matchedItems;
        this.activeIdx = 0;
      }
      this.cdr.markForCheck();
    }, 100);

    this.activeBlock.yText.observe(textObserver);

    const ownerDocument = this.activeBlock.containerElement.ownerDocument;
    this.keyboardCapture = installBlockTransformerKeyboardCapture({
      ownerDocument,
      elements: [
        this.activeBlock.containerElement,
        this.host.nativeElement,
        this.doc.root?.hostElement ?? this.activeBlock.containerElement,
      ],
      accepts: isSlashMenuNavigationKey,
      isComposing: () => this.doc.event.status.isComposing,
      onKey: key => this.handleEditorKey(key),
    });

    this.destroyRef.onDestroy(() => {
      this.keyboardCapture?.close();
      this.keyboardCapture = undefined;
      this.activeBlock.yText?.unobserve(textObserver);
      if (this.suppressTimerId !== null) {
        clearTimeout(this.suppressTimerId);
        this.suppressTimerId = null;
      }
      this._disarmCaretGuard();
      this.doc.selection.setSuppressRecalculate(false);
    });
  }

  showGroupLabel(index: number) {
    return index === 0 ||
      this.list[index - 1]?.groupLabel !== this.list[index]?.groupLabel;
  }

  currentQuery(): string | null {
    const selection = this.doc.selection.value;
    if (
      this.activeBlock.flavour !== "paragraph" ||
      !isSelectionAlive(selection as any, this.doc) ||
      !selection?.collapsed ||
      selection.start.type !== "text" ||
      selection.firstBlock?.id !== this.activeBlock.id ||
      this.activeBlock.textLength <= 0
    ) return null;
    const state = resolveSlashQueryRange(
      this.activeBlock.textDeltas(),
      this.triggerIndex,
    );
    if (!state || !isSlashQueryCursorOwned(
      this.triggerIndex,
      state.triggerLength,
      selection.start.offset,
    )) return null;
    return state.query;
  }

  private handleRootKeydown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (!this.canHandleMenuKeydown()) return;
    const navigationKey = normalizeBlockTransformerNavigationKey(
      event.key,
      event.keyCode,
    );
    if (!navigationKey || !isSlashMenuNavigationKey(navigationKey)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    this.handleEditorKey(navigationKey);
  };

  private canHandleMenuKeydown() {
    return !this.doc.event.status.isComposing;
  }

  /**
   * Routes editor-owned keyboard events when a native document keydown is not
   * available (for example through a WebView host bridge).
   */
  handleEditorKey(key: string) {
    if (!this.canHandleMenuKeydown()) return false;
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
    const li = (evt.target as HTMLElement).closest<HTMLElement>(".list__item");
    if (!li) return;
    const index = Number(li.dataset["index"]);
    if (!Number.isInteger(index) || index < 0 || index >= this.list.length) return;
    this.activeIdx = index;
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
    this.activeIdx = this.activeIdx < 0
      ? this.list.length - 1
      : (this.activeIdx - 1 + this.list.length) % this.list.length;
    this._syncActiveClass();
    this.scrollToActive();
  }

  selectDown() {
    if (!this.list.length) return;
    this.enterKeyboardNavigation();
    this.activeIdx = this.activeIdx < 0
      ? 0
      : (this.activeIdx + 1) % this.list.length;
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
        el.setAttribute("aria-selected", "true");
      } else {
        el.classList.remove("active");
        el.setAttribute("aria-selected", "false");
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
    this.activeBlock.containerElement.ownerDocument.addEventListener(
      "selectionchange",
      this._onSelectionDrift,
    );
  }

  private _disarmCaretGuard() {
    if (!this.caretGuardArmed) return;
    this.caretGuardArmed = false;
    this.activeBlock.containerElement.ownerDocument.removeEventListener(
      "selectionchange",
      this._onSelectionDrift,
    );
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
    const dom = this.activeBlock.containerElement.ownerDocument.getSelection();
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

    this.commandSelected.emit(item);
    this.close$.next(true);
  }
}
