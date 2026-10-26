import {CsModalRef, CsModalService} from '@cses/ui';
import {take} from 'rxjs';
import {BlockNodeType, TextToolbarHelper, createInlineTypographyPatch, normalizeParagraphSpacing, normalizeTypographyLineHeight} from '../../../framework';
import type {ISelectionJSON, IInlineNodeAttrs, IBlockProps, IEditableBlockProps} from '../../../framework';
import {normalizeParagraphDecoration} from '../../../blocks/paragraph-block/decoration';
import {getSelectionCoveredBlockIds} from '../../../framework/modules/selection/covered-blocks';
import {isSelectionAlive} from '../../../framework/modules/selection/liveness';
import {getSelectionFormatBlockIds, getSelectionFormatRootIds, isSelectedContainer} from '../../../framework/utils/selection-format-blocks';
import {ToolbarSelectionSession} from './toolbar-selection-session';
import {FontSettingsDialogComponent} from './font-settings-dialog.component';
import {ParagraphSettingsDialogComponent} from './paragraph-settings-dialog.component';
import type {FontSettingsTarget, FontSettingsDialogData, FontSettingsDialogResult, ParagraphSettingsTarget, ParagraphSettingsDialogData, ParagraphSettingsDialogResult} from './typography-settings-dialog.types';

/** Internal text/paragraph commands shared by fixed toolbar and context menu. */
export class TypographySettingsController {
  private settingsSelection?: ToolbarSelectionSession;
  private _settingsModalRef?: CsModalRef<any, any>;
  private _destroyed = false;

  constructor(
    private readonly doc: BlockCraft.Doc,
    private readonly modalService: CsModalService | null | undefined,
    private readonly toolbarHelper = new TextToolbarHelper(doc),
    private readonly onClosed?: () => void,
  ) {}

  get isOpen(): boolean { return !!this.settingsSelection; }
  private get readonly(): boolean { return this._destroyed || this.doc.isReadonly; }

  close(): void {
    this.settingsSelection?.dispose();
    this.settingsSelection = undefined;
    const ref = this._settingsModalRef;
    this._settingsModalRef = undefined;
    ref?.close();
  }

  destroy(): void {
    this._destroyed = true;
    this.close();
  }

  private runWithSavedSelection(
    source: ISelectionJSON,
    run: () => void,
    options: {allowFontScaleTargets?: boolean; allowParagraphSpacingTargets?: boolean},
  ): void {
    if (this.readonly) return;
    const selection = this.doc.selection.createSelection(source);
    if (!(options.allowFontScaleTargets ? this.canSetFontScaleForSelection(selection) : this.canSetParagraphSpacingForSelection(selection))) return;
    this.doc.selection.replay(source);
    run();
  }
  public openFontSettings(target: FontSettingsTarget, savedSelection: ISelectionJSON): void {
    if (!this.modalService || this.readonly) return;
    const selectionToOpen = this.doc.selection.createSelection(savedSelection);
    if (!(target === "font-size" || target === "font-scale"
      ? this.canSetFontScaleForSelection(selectionToOpen) : this.canFormatTextSelection(selectionToOpen))) return;
    // Read the saved model range without stealing focus from the modal trigger.
    const common = this.toolbarHelper.getCurrentCommonAttrs(selectionToOpen!);

    this.settingsSelection?.dispose();
    this._settingsModalRef?.close();
    const session = new ToolbarSelectionSession(this.doc, savedSelection, () => this._settingsModalRef?.close());
    if (!session.resolve()) return;
    this.settingsSelection = session;
    const data: FontSettingsDialogData = {
      target,
      typography: { ...(common.typography ?? {ff: null, fs: null, ls: null}) },
      fontSize: common.fontSize,
      fontWeight: common.fontWeight,
      attrs: {
        bold: common.attrs.has("bold") && common.attrs.get("bold") !== null,
        italic: common.attrs.has("italic") && common.attrs.get("italic") !== null,
        underline: common.attrs.has("underline") && common.attrs.get("underline") !== null,
        strike: common.attrs.has("strike") && common.attrs.get("strike") !== null,
        code: common.attrs.has("code") && common.attrs.get("code") !== null,
      },
      colors: {
        color: common.colors["color"],
        backColor: common.colors["backColor"],
      },
    };

    let ref!: CsModalRef<FontSettingsDialogComponent, FontSettingsDialogResult>;
    ref = this.modalService.open<
      FontSettingsDialogData,
      FontSettingsDialogResult,
      FontSettingsDialogComponent
    >({
      content: FontSettingsDialogComponent,
      data,
      title: "字体",
      ariaLabel: "字体高级设置",
      width: "min(352px, calc(100vw - 24px))",
      centered: true,
      mask: true,
      maskClosable: false,
      keyboard: true,
      okText: "确定",
      cancelText: "取消",
      onOk: () => ref.componentInstance?.buildResult(),
    });
    this._settingsModalRef = ref;
    ref.afterOpen
      .pipe(take(1))
      .subscribe(() => ref.componentInstance?.focusTarget());
    ref.afterClose.pipe(take(1)).subscribe((result) => {
      if (this._settingsModalRef === ref) this._settingsModalRef = undefined;
      const current = this.settingsSelection === session;
      if (current) this.settingsSelection = undefined;
      const restored = session.finish(current && !this._destroyed && !this.readonly);
      if (!restored) return;
      if (result) this.applyFontSettingsResult(restored, result);
      this.onClosed?.();
    });
  }

  public openParagraphSettings(target: ParagraphSettingsTarget, savedSelection: ISelectionJSON): void {
    if (!this.modalService || this.readonly) return;
    const selectionToOpen = this.doc.selection.createSelection(savedSelection);
    if (!this.canSetParagraphSpacingForSelection(selectionToOpen)) return;
    // Read the saved model range without stealing focus from the modal trigger.
    const common = this.toolbarHelper.getCurrentCommonAttrs(selectionToOpen!);

    this.settingsSelection?.dispose();
    this._settingsModalRef?.close();
    const session = new ToolbarSelectionSession(this.doc, savedSelection, () => this._settingsModalRef?.close());
    if (!session.resolve()) return;
    this.settingsSelection = session;
    const selection = selectionToOpen;
    const formatIds = selection ? this.getFormatBlockIds(selection) : [];
    const selectedSpacingOwner = selection ? this.getSelectedSpacingOwnerId(selection) : null;
    const allowTextSettings = (!selectedSpacingOwner || this.isEditableTextBlockId(selectedSpacingOwner)) &&
      formatIds.some(id => this.isEditableTextBlockId(id));
    const allowDecoration = allowTextSettings && formatIds.length > 0 && formatIds.every(id => this.doc.model.getFlavour(id) === 'paragraph');
    const data: ParagraphSettingsDialogData = {
      allowTextSettings,
      allowDecoration,
      decoration: allowDecoration ? normalizeParagraphDecoration(this.doc.model.getProps(formatIds[0])?.['decoration']) : null,
      target: allowTextSettings ? target : 'paragraph-spacing',
      align:
        common.props.textAlign === "center" ||
        common.props.textAlign === "right" ||
        common.props.textAlign === "justify" ||
        common.props.textAlign === "distributed"
          ? common.props.textAlign
          : "left",
      defaults: {
        lineHeight:
          normalizeTypographyLineHeight(
            this.doc.layoutMetrics.lineHeight /
              this.doc.layoutMetrics.baseFontSize,
          ) ?? 1.5,
        spaceAfter:
          normalizeParagraphSpacing(this.doc.layoutMetrics.segmentGap * 0.75) ??
          0,
      },
      paragraph: { lh: null, ...common.paragraph, ...this.getCommonParagraphSpacing(selectionToOpen!) },
    };

    let ref!: CsModalRef<
      ParagraphSettingsDialogComponent,
      ParagraphSettingsDialogResult
    >;
    ref = this.modalService.open<
      ParagraphSettingsDialogData,
      ParagraphSettingsDialogResult,
      ParagraphSettingsDialogComponent
    >({
      content: ParagraphSettingsDialogComponent,
      data,
      title: "段落",
      ariaLabel: "段落高级设置",
      width: "min(480px, calc(100vw - 24px))",
      centered: true,
      mask: true,
      maskClosable: false,
      keyboard: true,
      okText: "确定",
      cancelText: "取消",
      onOk: () => ref.componentInstance?.buildResult(),
    });
    this._settingsModalRef = ref;
    ref.afterOpen
      .pipe(take(1))
      .subscribe(() => ref.componentInstance?.focusTarget());
    ref.afterClose.pipe(take(1)).subscribe((result) => {
      if (this._settingsModalRef === ref) this._settingsModalRef = undefined;
      const current = this.settingsSelection === session;
      if (current) this.settingsSelection = undefined;
      const restored = session.finish(current && !this._destroyed && !this.readonly);
      if (!restored) return;
      if (result) this.applyParagraphSettingsResult(restored, result);
      this.onClosed?.();
    });
  }

  public applyFontSettingsResult(
    savedSelection: ISelectionJSON,
    result: FontSettingsDialogResult,
  ): void {
    const patch: IInlineNodeAttrs = { ...result.attrs };
    for (const [key, value] of Object.entries(result.typography)) {
      if (key === "fs") continue;
      Object.assign(
        patch,
        createInlineTypographyPatch(key as "ff" | "fs" | "ls", value),
      );
    }
    const hasFontScale = Object.prototype.hasOwnProperty.call(
      result.typography,
      "fs",
    );
    const hasFontSize = Object.prototype.hasOwnProperty.call(result, "fontSize");
    if (!Object.keys(patch).length && !hasFontScale && !hasFontSize) return;
    this.runWithSavedSelection(
      savedSelection,
      () => {
        this.doc.crud.transact(() => {
          this.toolbarHelper.formatTypography({attrs: patch});
          if (hasFontScale) this.toolbarHelper.formatFontScale(result.typography.fs);
          if (hasFontSize) this.toolbarHelper.formatFontSizePixels(result.fontSize);
        });
      },
      { allowFontScaleTargets: true },
    );
  }

  public applyParagraphSettingsResult(
    savedSelection: ISelectionJSON,
    result: ParagraphSettingsDialogResult,
  ): void {
    if (!Object.keys(result.patch).length) return;
    this.runWithSavedSelection(
      savedSelection,
      () => {
        const {psb, psa, ...textPatch} = result.patch;
        const spacingPatch: Partial<IBlockProps> = {};
        if (Object.prototype.hasOwnProperty.call(result.patch, 'psb')) spacingPatch['psb'] = psb;
        if (Object.prototype.hasOwnProperty.call(result.patch, 'psa')) spacingPatch['psa'] = psa;
        const selection = this.doc.selection.value;
        if (!selection) return;
        this.doc.crud.transact(() => {
          if (Object.keys(textPatch).length) {
            this.toolbarHelper.updateBlockProps(textPatch as Partial<IEditableBlockProps>, selection);
          }
          if (Object.keys(spacingPatch).length) {
            for (const id of this.getParagraphSpacingTargetIds(selection)) {
              this.doc.crud.updateBlockProps(id, spacingPatch);
            }
          }
        });
      },
      { allowParagraphSpacingTargets: true },
    );
  }

  public getSelectedBlockIds(selection: BlockCraft.Selection) {
    return getSelectionCoveredBlockIds(selection, this.doc);
  }

  public getFormatBlockIds(selection: BlockCraft.Selection) {
    return getSelectionFormatBlockIds(selection, this.doc);
  }

  public canFormatTextSelection(selection: BlockCraft.Selection | null) {
    if (this.readonly || !this.isLiveSelection(selection) ||
        (selection.isAllSelected && !isSelectedContainer(selection, this.doc)))
      return false;
    if (this.isReadonlyFormatSelection(selection)) return false;
    if (selection.collapsed && selection.start.type !== "text" && !selection.getTableCellSelection?.()) return false;
    return this.hasEditableTextTarget(selection);
  }

  public canSetParagraphSpacingForSelection(selection: BlockCraft.Selection | null) {
    if (this.readonly || !this.isLiveSelection(selection)) return false;
    if (this.isReadonlyFormatSelection(selection)) return false;
    return this.getParagraphSpacingTargetIds(selection).length > 0;
  }

  public getParagraphSpacingTargetIds(selection: BlockCraft.Selection): string[] {
    // A whole-block selection owns its spacing, even when text formatting
    // expands the same selection to editable descendants (such as a caption).
    const selectedBlockId = this.getSelectedSpacingOwnerId(selection);
    const ids = selectedBlockId
      ? [selectedBlockId]
      : isSelectedContainer(selection, this.doc) || selection.getTableCellSelection?.()
        ? this.getFormatBlockIds(selection)
        : this.getSelectedBlockIds(selection);
    return ids.filter(id => this.isParagraphSpacingTargetId(id));
  }

  public getSelectedSpacingOwnerId(selection: BlockCraft.Selection): string | null {
    const id = selection.start.type === 'selected' &&
      selection.end.type === 'selected' &&
      selection.start.blockId === selection.end.blockId
        ? selection.start.blockId
        : null;
    return id && this.isParagraphSpacingTargetId(id) ? id : null;
  }

  public isParagraphSpacingTargetId(id: string): boolean {
    try {
      const model = this.doc.model;
      const inModel = model?.exists(id);
      const block = inModel ? null : this.doc.getBlockById(id);
      const nodeType = inModel ? model.getNodeType(id) : block?.nodeType;
      const flavour = inModel ? model.getFlavour(id) : block?.flavour;
      const props = inModel ? model.getProps(id) : block?.props;
      if (nodeType !== BlockNodeType.editable && nodeType !== BlockNodeType.block && nodeType !== BlockNodeType.void) return false;
      if (flavour === 'table-row' || flavour === 'table-cell' || flavour === 'column' || flavour === 'placement-layout' || flavour === 'object-group') return false;
      return !props?.['position'];
    } catch {
      return false;
    }
  }

  public getCommonParagraphSpacing(selection: BlockCraft.Selection): {psb: number | null | undefined; psa: number | null | undefined} {
    const ids = this.getParagraphSpacingTargetIds(selection);
    const values = ids.map(id => {
      const props = this.doc.model?.exists(id) ? this.doc.model.getProps(id) : this.doc.getBlockById(id).props;
      return {
        psb: normalizeParagraphSpacing(props?.['psb']),
        psa: normalizeParagraphSpacing(props?.['psa']),
      };
    });
    const first = values[0] ?? {psb: null, psa: null};
    return {
      psb: values.every(value => value.psb === first.psb) ? first.psb : undefined,
      psa: values.every(value => value.psa === first.psa) ? first.psa : undefined,
    };
  }

  public hasEditableTextTarget(selection: BlockCraft.Selection) {
    try {
      return this.getFormatBlockIds(selection).some((id) =>
        this.isEditableTextBlockId(id),
      );
    } catch {
      return false;
    }
  }

  public canSetFontScaleForSelection(selection: BlockCraft.Selection | null) {
    if (this.readonly || !this.isLiveSelection(selection) ||
        (selection.isAllSelected && !isSelectedContainer(selection, this.doc)))
      return false;
    if (this.isReadonlyFormatSelection(selection)) return false;
    return this.toolbarHelper.canFormatFontScale(selection);
  }

  public isEditableTextBlockId(id: string) {
    if (
      typeof (this.doc as any).model?.exists === "function" &&
      this.doc.model.exists(id)
    ) {
      return (
        this.doc.model.getNodeType(id) === BlockNodeType.editable &&
        !this.doc.isPlainTextBlock(id)
      );
    }
    try {
      const block = this.doc.getBlockById(id);
      return this.doc.isEditable(block) && !block.plainTextOnly;
    } catch {
      return false;
    }
  }

  public isLiveSelection(
    selection: BlockCraft.Selection | null | undefined,
  ): selection is BlockCraft.Selection {
    return isSelectionAlive(selection as any, this.doc);
  }

  public isReadonlySelection(selection: BlockCraft.Selection) {
    return (
      this.doc.readonlyManager?.isSelectionReadonly(selection) ??
      this.doc.isReadonly
    );
  }

  public isReadonlyFormatSelection(selection: BlockCraft.Selection) {
    if (this.isReadonlySelection(selection)) return true;
    const readonlyManager = this.doc.readonlyManager;
    return !!readonlyManager?.containsReadonly &&
      getSelectionFormatRootIds(selection, this.doc).some(id => readonlyManager.containsReadonly(id));
  }
}
