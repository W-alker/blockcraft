import {
  closetBlockId,
  DocPlugin,
  EventListen,
  getPositionWithOffset,
  INLINE_ELEMENT_TAG,
  normalizeRange,
} from "../../framework";
import { Subject, Subscription, takeUntil } from "rxjs";
import { FormulaBlockToolbar } from "./widgets/formula-toolbar";
import { UIEventStateContext } from "../../framework";
import { ComponentRef } from "@angular/core";

export class FormulaBlockExtensionPlugin extends DocPlugin {
  override name = "FormulaBlockExtensionPlugin";

  private _closeToolbar$ = new Subject<void>();
  private _activeBlock: BlockCraft.IBlockComponents["formula"] | null = null;
  private _activeInlineFormulaEl: HTMLElement | null = null;
  private _toolbarRef: ComponentRef<FormulaBlockToolbar> | null = null;
  private _sub = new Subscription();

  init() {
    this._sub.add(
      this.doc.subscribeReadonlyChange((readonly) => {
        if (readonly) {
          this.closeToolbar();
        }
      }),
    );
  }

  @EventListen("mouseDown", { flavour: "formula" })
  onBlockClick(ctx: UIEventStateContext) {
    if (this.doc.isReadonly) return;

    const target = ctx.getDefaultEvent().target;
    const content = target instanceof Element
      ? target.closest(".formula-block-container")
      : null;
    if (!content) return;

    const blockId = closetBlockId(content);
    if (!blockId) return;

    const block = this._getLiveBlockById(blockId) as BlockCraft.IBlockComponents["formula"] | null;
    if (!block || block.flavour !== "formula") return;
    if (this._activeBlock === block) return;

    this.closeToolbar();
    this._activeBlock = block;
    block.hostElement.classList.add("editing");

    const { componentRef } =
      this.doc.overlayService.createConnectedOverlay<FormulaBlockToolbar>(
        {
          target: block,
          component: FormulaBlockToolbar,
          positions: [
            getPositionWithOffset("bottom-center", 0, 8),
            getPositionWithOffset("top-center", 0, 8),
          ],
          backdrop: true,
        },
        this._closeToolbar$,
        this.closeToolbar,
      );

    componentRef.setInput("block", block);
    componentRef.setInput("doc", this.doc);
    this._toolbarRef = componentRef;

    componentRef.instance.confirm
      .pipe(takeUntil(this._closeToolbar$))
      .subscribe((latex) => {
        if (!this._isBlockAlive(block)) {
          this.closeToolbar();
          return;
        }
        block.updateProps({ latex });
        this.closeToolbar();
      });

    return true;
  }

  @EventListen("mouseDown", { flavour: "root" })
  onInlineClick(ctx: UIEventStateContext) {
    if (this.doc.isReadonly) return;

    const target = ctx.getDefaultEvent().target as Element | null;
    if (!target || !(target instanceof Element)) return;

    const formulaEl = target.closest(".inline-formula") as HTMLElement | null;
    if (!formulaEl) return;

    const cElement = formulaEl.closest(
      INLINE_ELEMENT_TAG,
    ) as HTMLElement | null;
    if (!cElement) return;

    const blockId = closetBlockId(target);
    if (!blockId) return;

    const block = this._getLiveBlockById(blockId);
    if (!block) return;
    if (!this.doc.isEditable(block)) return;

    const latex = formulaEl.getAttribute("data-latex") || "";

    this.closeToolbar();
    this._activeInlineFormulaEl = formulaEl;
    formulaEl.classList.add("editing");

    const { componentRef } =
      this.doc.overlayService.createConnectedOverlay<FormulaBlockToolbar>(
        {
          target: formulaEl,
          component: FormulaBlockToolbar,
          positions: [
            getPositionWithOffset("bottom-center", 0, 8),
            getPositionWithOffset("top-center", 0, 8),
          ],
          backdrop: true,
        },
        this._closeToolbar$,
        this.closeToolbar,
      );

    componentRef.setInput("doc", this.doc);
    componentRef.setInput("initialLatex", latex);
    this._toolbarRef = componentRef;

    componentRef.instance.confirm
      .pipe(takeUntil(this._closeToolbar$))
      .subscribe((newLatex) => {
        if (!this._isBlockAlive(block)) {
          this.closeToolbar();
          return;
        }
        const range = this._tryGetEmbedRange(formulaEl);
        if (
          !range ||
          range.start.type !== "text" ||
          range.start.blockId !== block.id
        ) {
          this.closeToolbar();
          return;
        }
        const embedIndex = range.start.offset;
        if (!newLatex) {
          block.applyDeltaOperations([{ retain: embedIndex }, { delete: 1 }]);
        } else {
          block.applyDeltaOperations([
            { retain: embedIndex },
            { delete: 1 },
            { insert: { latex: newLatex } },
          ]);
        }
        requestAnimationFrame(() => {
          if (!this._isBlockAlive(block)) return;
          this.doc.selection.setCursorAt(block, embedIndex + 1);
        });
        this.closeToolbar();
      });

    return true;
  }

  createEmbedRange(cElement: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(cElement);
    range.collapse(true);
    return range;
  }

  getEmbedRange(target: HTMLElement) {
    const range = this.createEmbedRange(target);
    try {
      return normalizeRange(
        range,
        id => this.doc.getBlockById(id) as any,
      );
    } finally {
      range.detach();
    }
  }

  private _getLiveBlockById(blockId: string): BlockCraft.BlockComponent | null {
    try {
      const block = this.doc.getBlockById(blockId);
      return this._isBlockAlive(block) ? block : null;
    } catch {
      return null;
    }
  }

  private _tryGetEmbedRange(target: HTMLElement) {
    try {
      return this.getEmbedRange(target);
    } catch {
      return null;
    }
  }

  private _isBlockAlive(block: BlockCraft.BlockComponent): boolean {
    try {
      return this.doc.getBlockById(block.id) === block;
    } catch {
      return false;
    }
  }

  closeToolbar = () => {
    this._activeBlock?.hostElement.classList.remove("editing");
    this._activeInlineFormulaEl?.classList.remove("editing");
    this._closeToolbar$.next();
    this._activeBlock = null;
    this._activeInlineFormulaEl = null;
    this._toolbarRef = null;
  };

  destroy() {
    this.closeToolbar();
    this._sub.unsubscribe();
  }
}
