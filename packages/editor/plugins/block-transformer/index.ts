import {
  filter,
  fromEvent,
  merge,
  skip,
  Subject,
  Subscription,
  take,
  takeUntil,
} from "rxjs";
import {
  BindHotKey,
  DocPlugin,
  EditableBlockComponent,
  EventListen,
  getPositionWithOffset,
} from "../../framework";
import { UIEventStateContext } from "../../framework";
import { nextTick, sliceDelta } from "../../global";
import { BlockTransformContextMenu } from "./widget/contextmenu";
import {
  blockTransforms,
  headingTransforms,
  IBlockTransformConfig,
} from "./const";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";

const ALLOWED_HEADING_FLAVOURS: BlockCraft.BlockFlavour[] = [
  "paragraph",
  "ordered",
];

export class BlockTransformerPlugin extends DocPlugin {
  override name = "block-transformer";
  override version = 1.0;

  private mdTransformList: { regex: RegExp; flavour: string }[] = [];
  private pendingInputTriggerSeq = 0;
  private destroyed = false;

  constructor(
    readonly transformList: IBlockTransformConfig[] = blockTransforms,
  ) {
    super();
  }

  private sub = new Subscription();

  static transformEditableBlock = (
    doc: BlockCraft.Doc,
    from: EditableBlockComponent<any>,
    to: BlockCraft.BlockFlavour,
  ) => {
    const deltas = from.textDeltas();
    const newBlock = doc.schemas.createSnapshot(to, [deltas, from.props]);
    void doc
      .chain()
      .replaceWithSnapshots(from.id, [newBlock])
      .nextTick()
      .selectOrSetCursorAtBlock(newBlock.id, true)
      .recalculateSelection()
      .run();
  };

  init() {
    this.destroyed = false;
    this.transformList.forEach((item) => {
      const schema = this.doc.schemas.get(item.flavour, false);
      if (!schema) return;
      schema.metadata.description = item.description;

      // register hotkey
      item.hotkey &&
        this.doc.event.bindHotkey(item.hotkey, (evt) => {
          const state = evt.get("keyboardState");
          const selection = state.selection;
          if (
            !isSelectionAlive(selection as any, this.doc) ||
            !selection.isInSameBlock ||
            selection.start.type !== "text"
          )
            return;
          const block = selection.firstBlock as EditableBlockComponent<any>;
          if (
            block.flavour === item.flavour ||
            !this.isBlockAlive(block)
          )
            return;
          evt.preventDefault();
          BlockTransformerPlugin.transformEditableBlock(
            this.doc,
            block,
            item.flavour as any,
          );
          return true;
        });

      if (item.markdown) {
        this.mdTransformList.push({
          regex: item.markdown,
          flavour: item.flavour,
        });
      }
    });

    headingTransforms.forEach((item) => {
      this.mdTransformList.push({
        regex: item.markdown!,
        flavour: item.flavour,
      });
    });
  }

  @BindHotKey({ key: ["0", "1", "2", "3", "4"], shortKey: true })
  formatHeading(evt: UIEventStateContext) {
    const state = evt.get("keyboardState");
    const selection = state.selection;
    if (
      !isSelectionAlive(selection as any, this.doc) ||
      !selection.isInSameBlock ||
      selection.start.type !== "text"
    )
      return;
    const block = selection.firstBlock as EditableBlockComponent<any>;
    if (
      !ALLOWED_HEADING_FLAVOURS.includes(block.flavour) ||
      !this.isBlockAlive(block)
    )
      return;
    // shortKey + 0~4 collide with native browser shortcuts (Cmd/Ctrl+0 resets
    // zoom, Cmd/Ctrl+1~4 switch tabs). Returning true only stops internal
    // propagation, so we must prevent the native default explicitly — but only
    // once we've confirmed we're actually handling the heading change, to avoid
    // hijacking these keys when the cursor isn't in a heading-capable block.
    evt.preventDefault();
    block.updateProps({
      heading: state.raw.key === "0" ? null : parseInt(state.raw.key, 10),
    });
    return true;
  }

  @EventListen("beforeInput")
  onBeforeInput(evt: UIEventStateContext) {
    const e = evt.getDefaultEvent() as InputEvent;
    const inputText = getPlainTextFromInputEvent(e);
    this.queueInputTrigger(inputText);
  }

  @EventListen("keyDown")
  onKeyDown(evt: UIEventStateContext) {
    const state = evt.get("keyboardState");
    const raw = state.raw;
    if (raw.metaKey || raw.ctrlKey || raw.altKey) return;
    this.queueInputTrigger(raw.key);
  }

  private _mdTransform = () => {
    const selection = this.getCurrentSelection();
    if (!selection) return false;
    if (!isSelectionAlive(selection as any, this.doc)) return false;
    if (!selection.collapsed || selection.start.type !== "text") return false;
    const block = selection.firstBlock as any;
    if (!block || block.flavour !== "paragraph") return;
    if (!this.isBlockAlive(block)) return false;
    const blockText = block.textContent();
    const prefixes = [
      blockText.slice(
        0,
        Math.min(selection.start.offset + 1, blockText.length),
      ),
      blockText.slice(0, Math.min(selection.start.offset, blockText.length)),
    ];
    const matched = this.mdTransformList.find((item) =>
      prefixes.some((text) => item.regex.test(text)),
    );
    if (!matched) return false;
    const matchedText = prefixes.find((text) => matched.regex.test(text))!;

    // 设置heading
    if (matched.flavour.startsWith("heading-")) {
      const heading = headingTransforms.findIndex(
        (item) => item.flavour === matched.flavour,
      );
      if (heading < 0) return false;
      const selIdx = matchedText.length - 1;
      this.doc.crud.transact(() => {
        block.deleteText(0, selIdx + 1);
        block.updateProps({
          heading: heading + 1,
        });
      });
      return true;
    }

    const config = this.transformList.find(
      (item) => item.flavour === matched.flavour,
    )!;

    if (config.onConvert) {
      config.onConvert!(this.doc, block, matchedText);
      return;
    }

    const newBlock = this.doc.schemas.createSnapshot(matched.flavour as any, [
      sliceDelta(block.textDeltas(), matchedText.length),
      {
        ...block.props,
        heading: undefined,
      },
    ]);

    if (
      !this.doc.schemas.isValidChildren(
        newBlock.flavour,
        block.parentBlock!.flavour,
      )
    ) {
      return;
    }

    const appendBlocks = [newBlock];
    if (newBlock.nodeType === "void") {
      appendBlocks.push(
        this.doc.schemas.createSnapshot("paragraph", [[], block.props]),
      );
    }
    void this.doc
      .chain()
      .replaceWithSnapshots(block.id, appendBlocks)
      .nextTick()
      .setCursorAtBlock(appendBlocks[appendBlocks.length - 1].id, true)
      .recalculateSelection()
      .run();
    return true;
  };

  private closeMenu$ = new Subject();

  openContextMenu(block: EditableBlockComponent) {
    if (this.destroyed || !this.isBlockAlive(block)) return;
    // 关掉可能还存在的旧菜单。textObserver 关菜单是 debounce 300ms 的，
    // 用户在 300ms 内"删除字符 → 重新输入 / 触发"会让旧菜单还活着、
    // 新菜单又叠上来。旧 menu 的 document keydown listener 先注册先派发，
    // 把事件吃掉之后 stopImmediatePropagation 让新 menu 的 listener
    // 无法触发，看起来就是"按上下键不动但 activeIdx 在变"。
    this.closeMenu$.next(true);

    const { componentRef: cpr } =
      this.doc.overlayService.createConnectedOverlay<BlockTransformContextMenu>(
        {
          target: block.containerElement,
          positions: [
            getPositionWithOffset("top-left"),
            getPositionWithOffset("bottom-left"),
          ],
          component: BlockTransformContextMenu,
        },
        this.closeMenu$,
        () => {},
      );
    cpr.setInput("activeBlock", block);
    cpr.setInput("doc", this.doc);

    merge(
      cpr.instance.close$,
      this.doc.selection.selectionChange$.pipe(
        skip(1),
        filter(() => !cpr.instance.shouldIgnoreSelectionChange()),
        filter(
          (v) =>
            !v ||
            !isSelectionAlive(v as any, this.doc) ||
            !v.isInSameBlock ||
            !v.collapsed ||
            v.firstBlock.id !== block.id,
        ),
      ),
      block.onDestroy$,
    )
      .pipe(takeUntil(this.closeMenu$))
      .subscribe(() => {
        this.closeMenu$.next(true);
      });
  }

  destroy() {
    this.destroyed = true;
    this.pendingInputTriggerSeq++;
    this.closeMenu$.next(true);
    this.sub.unsubscribe();
  }

  private queueInputTrigger(inputText: string | null | undefined) {
    if (inputText !== " " && inputText !== "\/" && inputText !== "、") return;
    const seq = ++this.pendingInputTriggerSeq;
    nextTick().then(() => {
      if (this.destroyed) return;
      if (this.pendingInputTriggerSeq !== seq) return;
      if (inputText === " ") {
        this._mdTransform();
        return;
      }
      this.tryOpenContextMenu(inputText);
    });
  }

  private tryOpenContextMenu(inputText: "/" | "、") {
    const selection = this.getCurrentSelection();
    if (
      !selection ||
      !isSelectionAlive(selection as any, this.doc) ||
      !selection.collapsed ||
      selection.start.type !== "text" ||
      selection.firstBlock.flavour !== "paragraph"
    )
      return;
    const block = selection.firstBlock as any;
    if (!this.isBlockAlive(block)) return;
    const schema = this.doc.schemas.get(block.flavour)!;
    if (schema.metadata.isLeaf) return;
    if (block.textContent() === inputText) {
      this.openContextMenu(block);
      return;
    }
    // 兜底：IME 输入 `、` 时 beforeInput 在 compositionEnd 之前触发，
    // 但 Yjs yText 要等 compositionEnd 才落地。nextTick 时 textContent
    // 还不匹配，这里挂一次性 yText observer 等内容落地后重试。
    const yText = block.yText;
    if (!yText) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      try {
        yText.unobserve(observer);
      } catch {}
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const observer = () => {
      if (block.textContent() !== inputText) return;
      cleanup();
      // compositionEnd 后选区会被刷新，重新确认仍在该 block 内
      const sel = this.getCurrentSelection();
      if (
        !this.destroyed &&
        this.isBlockAlive(block) &&
        sel &&
        isSelectionAlive(sel as any, this.doc) &&
        sel.collapsed &&
        sel.start.type === "text" &&
        sel.firstBlock.id === block.id
      ) {
        this.openContextMenu(block);
      }
    };
    yText.observe(observer);
    timer = setTimeout(cleanup, 300);
  }

  private getCurrentSelection() {
    try {
      return (
        this.doc.selection.recalculate(false).value || this.doc.selection.value
      );
    } catch {
      return null;
    }
  }

  private isBlockAlive(block: EditableBlockComponent | null | undefined) {
    if (!block) return false;
    try {
      return this.doc.getBlockById(block.id) === block;
    } catch {
      return false;
    }
  }
}

function getPlainTextFromInputEvent(event: InputEvent) {
  if (typeof event.data === "string") {
    return event.data;
  }
  if (event.dataTransfer?.types.includes("text/plain")) {
    return event.dataTransfer.getData("text/plain");
  }
  return null;
}
