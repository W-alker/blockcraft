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
  private restoreRafId: number | null = null;

  constructor(
    public readonly cdr: ChangeDetectorRef,
    public readonly host: ElementRef<HTMLElement>,
    public readonly destroyRef: DestroyRef,
  ) {}

  ngOnInit() {
    const parentBlockSchema = this.doc.schemas.get(
      this.activeBlock.parentBlock!.flavour,
    )!;
    const blocks: IContextMenuOption[] = this.doc.schemas
      .getSchemaList()
      .filter(
        (v) =>
          !v.metadata.isLeaf &&
          !["paragraph", "root"].includes(v.flavour) &&
          this.doc.schemas.isValidChildren(v.flavour, parentBlockSchema),
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
      if (this.restoreRafId !== null) {
        cancelAnimationFrame(this.restoreRafId);
        this.restoreRafId = null;
      }
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
    return Date.now() - this.lastHandledNavigationAt < 120;
  }

  private markNavigationHandled() {
    this.lastHandledNavigationAt = Date.now();
    // WKWebView/Safari 在 contenteditable 中可能无视 keydown 的
    // preventDefault 仍然移动 DOM 光标，导致 selectionchange 触发
    // recalculate 把 BlockSelection 模型拽走、菜单被误关。这里 gate
    // 住原生 selectionchange 入口，让模型在导航期间保持锚定在
    // activeBlock。每次导航刷新窗口，菜单销毁时统一释放。
    this.doc.selection.setSuppressRecalculate(true);

    // Tauri/WKWebView 下，AppKit 在 JS keydown 之前同步执行
    // doCommandBySelector:(moveUp:/moveDown:/...) 把 DOM caret 拽走，
    // preventDefault 已经晚了。这里事后纠错：把 caret 拽回模型记录
    // 的位置。同步 + microtask + rAF 三重保险覆盖 IPC 时序所有可能。
    this._restoreCaret();
    queueMicrotask(() => this._restoreCaret());
    if (this.restoreRafId !== null) {
      cancelAnimationFrame(this.restoreRafId);
    }
    this.restoreRafId = requestAnimationFrame(() => {
      this.restoreRafId = null;
      this._restoreCaret();
    });

    if (this.suppressTimerId !== null) {
      clearTimeout(this.suppressTimerId);
    }
    this.suppressTimerId = setTimeout(() => {
      this.suppressTimerId = null;
      this.doc.selection.setSuppressRecalculate(false);
    }, 120);
  }

  private _restoreCaret() {
    const sel = this.doc.selection.value;
    if (!sel || sel.start.type !== "text") return;
    if (sel.firstBlock?.id !== this.activeBlock?.id) return;
    this.activeBlock.setInlineRange(sel.start.offset);
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
    if (this.activeIdx === -1) return;
    const item = this.list[this.activeIdx];
    if (!item) return;

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
        .setCursorAtBlock(snapshot.id, true)
        .run();
      return;
    }

    // TODO
    const blockCreator = this.doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN);
    blockCreator.getParamsByScheme(schema).then((params) => {
      if (!params) return;
      const newBlock = this.doc.schemas.createSnapshot(
        schema.flavour,
        params as any,
      );
      newBlock.props.depth = this.activeBlock.props.depth;
      void this.doc
        .chain()
        .replaceWithSnapshots(this.activeBlock.id, [newBlock])
        .setCursorAtBlock(newBlock.id, true)
        .run();
    });
  }
}
