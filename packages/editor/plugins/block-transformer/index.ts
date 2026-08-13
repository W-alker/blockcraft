import {
  filter,
  merge,
  skip,
  Subject,
  Subscription,
  take,
  takeUntil,
} from "rxjs";
import { outputToObservable } from "@angular/core/rxjs-interop";
import {
  CsEmojiPickerComponent,
  CsIconPickerComponent,
  type CsIconPickerChangeEvent,
  type CsPickerCategoryDirection,
  type CsPickerGridDirection,
  type CsPickerNavigationOptions,
} from "@cses/ui";
import {
  BLOCK_CREATOR_SERVICE_TOKEN,
  BindHotKey,
  BlockNodeType,
  createInlineImageDelta,
  type DeltaInsert,
  DocPlugin,
  EditableBlockComponent,
  EventListen,
  getPositionWithOffset,
  OneShotCursorAnchor,
  OneShotRangeAnchor,
} from "../../framework";
import { UIEventStateContext } from "../../framework";
import {nextTick, sliceDelta} from "../../global";
import { BlockTransformContextMenu } from "./widget/contextmenu";
import {
  blockTransforms,
  headingTransforms,
  IBlockTransformConfig,
} from "./const";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";
import {FormulaBlockToolbar} from "../formula-extension/widgets/formula-toolbar";
import {LinkEditFloatDialog} from "../inline-link-extension/widgets/link-edit-dialog";
import type {MentionPlugin} from "../mention";
import {
  BlockTransformerPluginOptions,
  SlashCommandContext,
  SlashCommandItem,
  SlashMenuItem,
} from "./command";
import {formatHotKeyHint, resolveSlashSearchAlias} from "./presentation";

const ALLOWED_HEADING_FLAVOURS: BlockCraft.BlockFlavour[] = [
  "paragraph",
  "ordered",
];

const GROUP_LABELS = {
  basic: "基础内容",
  inline: "行内内容",
  media: "媒体与布局",
  embed: "第三方嵌入",
} as const;

const EMOJI_NAV_PIN_WINDOW_MS = 150;

type ActivePickerSession = {
  close$: Subject<void>;
  scheduleRefresh?(): void;
  handleEditorKey(key: string, event?: KeyboardEvent): boolean;
};

type KeyboardNavigablePicker = {
  moveActive(
    direction: CsPickerGridDirection,
    options?: CsPickerNavigationOptions,
  ): boolean;
  moveCategory(
    direction: CsPickerCategoryDirection,
    options?: CsPickerNavigationOptions,
  ): boolean;
  selectActive(): boolean;
};

export class BlockTransformerPlugin extends DocPlugin {
  override name = "block-transformer";
  override version = 1.0;

  private mdTransformList: { regex: RegExp; flavour: string }[] = [];
  private pendingInputTriggerSeq = 0;
  private destroyed = false;
  private activeMenu?: BlockTransformContextMenu;
  private activePickerSession?: ActivePickerSession;
  private readonly commandRegistry = new Map<
    string,
    {command: SlashCommandItem; token: symbol}[]
  >();
  readonly transformList: readonly IBlockTransformConfig[];

  get commands(): readonly SlashCommandItem[] {
    return [...this.commandRegistry.values()].map(
      entries => entries[entries.length - 1].command,
    );
  }

  private isReadonly(block: BlockCraft.BlockComponent) {
    return this.doc.readonlyManager?.isReadonly(block) ?? this.doc.isReadonly;
  }

  constructor(config: readonly IBlockTransformConfig[] | BlockTransformerPluginOptions = {}) {
    super();
    if (Array.isArray(config)) {
      this.transformList = config;
    } else {
      const options = config as BlockTransformerPluginOptions;
      this.transformList = options.transformList ?? blockTransforms;
      this.registerCommands(options.commands ?? []);
    }
  }

  /**
   * Adds or replaces one slash command. The latest registration for a stable
   * id wins; disposing it only removes that exact registration.
   */
  registerCommand(command: SlashCommandItem): () => void {
    if (!command.id.trim()) {
      throw new Error("Slash command id must not be empty");
    }
    if (!command.label.trim()) {
      throw new Error("Slash command label must not be empty");
    }
    const token = Symbol(command.id);
    const entries = this.commandRegistry.get(command.id) ?? [];
    entries.push({command, token});
    this.commandRegistry.set(command.id, entries);
    return () => {
      const current = this.commandRegistry.get(command.id);
      const index = current?.findIndex(entry => entry.token === token) ?? -1;
      if (!current || index < 0) return;
      current.splice(index, 1);
      if (!current.length) this.commandRegistry.delete(command.id);
    };
  }

  registerCommands(commands: readonly SlashCommandItem[]): () => void {
    const disposers = commands.map(command => this.registerCommand(command));
    return () => disposers.reverse().forEach(dispose => dispose());
  }

  unregisterCommand(id: string) {
    return this.commandRegistry.delete(id);
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
            !this.isBlockAlive(block) ||
            this.isReadonly(block)
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
      !this.isBlockAlive(block) ||
      this.isReadonly(block)
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
    if (raw.metaKey || raw.ctrlKey || raw.altKey) return false;
    if (this.activePickerSession?.handleEditorKey(raw.key, raw)) {
      evt.preventDefault();
      raw.stopPropagation?.();
      raw.stopImmediatePropagation?.();
      return true;
    }
    if (this.activeMenu?.handleEditorKey(raw.key)) {
      evt.preventDefault();
      raw.stopPropagation?.();
      raw.stopImmediatePropagation?.();
      return true;
    }
    this.queueInputTrigger(raw.key);
    return false;
  }

  @EventListen("compositionEnd")
  onCompositionEnd() {
    this.activePickerSession?.scheduleRefresh?.();
  }

  private _mdTransform = () => {
    const selection = this.getCurrentSelection();
    if (!selection) return false;
    if (!isSelectionAlive(selection as any, this.doc)) return false;
    if (!selection.collapsed || selection.start.type !== "text") return false;
    const block = selection.firstBlock as any;
    if (!block || block.flavour !== "paragraph") return;
    if (!this.isBlockAlive(block)) return false;
    if (this.isReadonly(block)) return false;
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

    const appendBlocks = [newBlock];
    if (newBlock.nodeType === "void") {
      appendBlocks.push(
        this.doc.schemas.createSnapshot("paragraph", [[], block.props]),
      );
    }
    const parentId = block.parentId;
    if (
      !parentId ||
      appendBlocks.some(snapshot =>
        !this.doc.canInsertChild(parentId, snapshot.flavour),
      )
    ) {
      return;
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

  private buildMenuItems(block: EditableBlockComponent): SlashMenuItem[] {
    const parentId = block.parentId;
    if (!parentId) return [];
    const transformConfigs = new Map<string, IBlockTransformConfig>();
    this.transformList.forEach(config => transformConfigs.set(config.flavour, config));

    const blockItems = this.doc.schemas
      .getSchemaList()
      .filter(schema =>
        !schema.metadata.isLeaf &&
        !schema.metadata.hideInInsertMenu &&
        schema.flavour !== "root" &&
        this.doc.canInsertChild(parentId, schema.flavour),
      )
      .map<SlashMenuItem>(schema => {
        const transform = transformConfigs.get(schema.flavour);
        const searchAlias = resolveSlashSearchAlias(
          schema.metadata.label,
          transform?.searchAlias,
        );
        const group = schema.flavour.endsWith("-embed")
          ? "embed"
          : schema.nodeType === BlockNodeType.editable
            ? "basic"
            : "media";
        return {
          id: `block:${schema.flavour}`,
          kind: "block",
          group,
          groupLabel: GROUP_LABELS[group],
          label: schema.metadata.label,
          description: transform?.description ?? schema.metadata.description,
          markdownHint: transform?.markdownHint,
          shortcutHint: formatHotKeyHint(transform?.hotkey),
          searchHint: searchAlias ? `/${searchAlias}` : undefined,
          icon: schema.metadata.icon,
          svgIcon: schema.metadata.svgIcon,
          flavour: schema.flavour,
          keywords: [
            schema.flavour,
            ...(transform?.keywords ?? []),
            ...(searchAlias ? [searchAlias] : []),
          ],
        };
      });

    const menuContext: SlashCommandContext = {
      doc: this.doc,
      block,
      query: "",
      triggerIndex: 0,
      triggerLength: 1,
      replace: () => false,
    };
    const registeredCommands = new Map<string, SlashCommandItem>();
    for (const command of [...this.builtinInlineCommands(), ...this.commands]) {
      // Host commands intentionally win on a stable id, which lets an app
      // replace a built-in action without creating duplicate Angular track ids.
      registeredCommands.set(command.id, command);
    }
    const inlineCommands = [...registeredCommands.values()]
      .filter(command => command.when?.(menuContext) !== false)
      .map<SlashMenuItem>(command => {
        const searchAlias = resolveSlashSearchAlias(
          command.label,
          command.searchAlias,
        );
        return {
          id: command.id,
          kind: "command",
          group: command.group ?? "inline",
          groupLabel: command.groupLabel ?? GROUP_LABELS[command.group ?? "inline"],
          label: command.label,
          description: command.description,
          keywords: [
            ...(command.keywords ?? []),
            ...(searchAlias ? [searchAlias] : []),
          ],
          shortcutHint: command.shortcutHint,
          searchHint: searchAlias ? `/${searchAlias}` : undefined,
          icon: command.icon,
          svgIcon: command.svgIcon,
          csIcon: command.csIcon,
          command,
        };
      });

    const paragraphBlocks = blockItems.filter(item => item.flavour === "paragraph");
    const basicBlocks = blockItems.filter(
      item => item.group === "basic" && item.flavour !== "paragraph",
    );
    const mediaBlocks = blockItems.filter(item => item.group === "media");
    const embedBlocks = blockItems.filter(item => item.group === "embed");
    return [
      ...paragraphBlocks,
      ...this.buildHeadingMenuItems(),
      ...basicBlocks,
      ...inlineCommands.filter(item => item.group === "basic"),
      ...inlineCommands.filter(item => item.group === "inline"),
      ...mediaBlocks,
      ...inlineCommands.filter(item => item.group === "media"),
      ...embedBlocks,
      ...inlineCommands.filter(item => item.group === "embed"),
    ];
  }

  private buildHeadingMenuItems(): SlashMenuItem[] {
    return headingTransforms.map((transform, index) => {
      const level = index + 1;
      const label = `${["一", "二", "三", "四"][index]}级标题`;
      const searchAlias = resolveSlashSearchAlias(label, transform.searchAlias);
      return {
        id: `heading-${level}`,
        kind: "heading",
        group: "basic",
        groupLabel: GROUP_LABELS.basic,
        label,
        description: transform.description,
        markdownHint: transform.markdownHint,
        shortcutHint: formatHotKeyHint(transform.hotkey),
        searchHint: searchAlias ? `/${searchAlias}` : undefined,
        icon: `bc_icon bc_biaoti_${level}`,
        heading: level,
        keywords: [
          `标题${level}`,
          ...(transform.keywords ?? []),
          ...(searchAlias ? [searchAlias] : []),
        ],
      };
    });
  }

  private builtinInlineCommands(): SlashCommandItem[] {
    return [
      {
        id: "inline:formula",
        label: "行内公式",
        description: "在文字中插入 LaTeX 公式",
        group: "inline",
        csIcon: "formula",
        searchAlias: "hngs",
        keywords: ["公式", "latex", "equation", "math"],
        run: context => this.openFormulaPicker(context),
      },
      {
        id: "inline:mention",
        label: "提及",
        description: "提及成员或文档",
        group: "inline",
        csIcon: "at",
        keywords: ["提及", "mention", "@"],
        when: () => this.doc.plugins.some(plugin => plugin.name === "mention"),
        run: context => this.openMention(context),
      },
      {
        id: "inline:emoji",
        label: "Emoji",
        description: "插入表情符号",
        group: "inline",
        csIcon: "smile",
        keywords: ["表情", "emoji"],
        run: context => this.openEmojiPicker(context),
      },
      {
        id: "inline:icon",
        label: "Icon",
        description: "插入 CSES 图标",
        group: "inline",
        csIcon: "icon",
        keywords: ["图标", "icon", "csicon"],
        run: context => this.openIconPicker(context),
      },
      {
        id: "inline:link",
        label: "链接",
        description: "插入带标题的网页链接",
        group: "inline",
        csIcon: "link",
        keywords: ["链接", "link", "url"],
        run: context => this.openLinkPicker(context),
      },
      {
        id: "inline:image",
        label: "行内图片",
        description: "在当前文字流中插入图片",
        group: "inline",
        csIcon: "picture",
        keywords: ["图片", "image", "photo"],
        when: () => !!this.doc.schemas.get("image", false),
        run: context => this.openInlineImagePicker(context),
      },
    ];
  }

  private resolveCommandContext(
    block: EditableBlockComponent,
    triggerIndex: number,
  ): SlashCommandContext | null {
    const state = this.resolveSlashQueryState(block, triggerIndex);
    if (!state) return null;
    const {query, triggerLength} = state;
    const range = this.createCommandRange({
      doc: this.doc,
      block,
      query,
      triggerIndex,
      triggerLength,
      replace: () => false,
    });
    return {
      doc: this.doc,
      block,
      query,
      triggerIndex,
      triggerLength,
      replace: inserts => this.replaceCommandRange(range, [...inserts]),
    };
  }

  /**
   * Slash commands own the complete text of an otherwise empty paragraph.
   * Keeping this invariant here prevents programmatic menu opens from
   * reintroducing the old middle-of-rich-text trigger path.
   */
  private resolveSlashQueryState(
    block: EditableBlockComponent,
    triggerIndex: number,
  ): {query: string; triggerLength: number} | null {
    const selection = this.getCurrentSelection();
    if (
      block.flavour !== "paragraph" ||
      triggerIndex !== 0 ||
      !selection ||
      !isSelectionAlive(selection as any, this.doc) ||
      !selection.collapsed ||
      selection.start.type !== "text" ||
      selection.firstBlock?.id !== block.id ||
      !this.isBlockAlive(block) ||
      this.isReadonly(block)
    ) return null;
    const triggerLength = block.textLength;
    if (triggerLength <= 0) return null;
    const trigger = modelCharacterAt(block.textDeltas(), triggerIndex);
    if (trigger !== "/" && trigger !== "、") return null;
    const queryDeltas = sliceDelta(
      block.textDeltas(),
      triggerIndex + 1,
      triggerLength,
    );
    if (queryDeltas.some(delta => typeof delta.insert !== "string")) return null;
    const query = queryDeltas.map(delta => delta.insert).join("");
    if (/\s/.test(query)) return null;
    return {query, triggerLength};
  }

  private async executeMenuItem(
    item: SlashMenuItem,
    context: SlashCommandContext,
  ) {
    if (item.kind === "heading") {
      await this.insertBlockAtQuery(context, "paragraph", [
        [],
        {...context.block.props, heading: item.heading},
      ]);
      return;
    }
    if (item.kind === "block" && item.flavour) {
      const schema = this.doc.schemas.get(item.flavour as BlockCraft.BlockFlavour, false);
      if (!schema) return;
      const anchor = this.createCommandRange(context);
      let params: unknown[] = [];
      if (schema.nodeType !== BlockNodeType.editable) {
        const creator = this.doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN);
        const resolved = await creator.getParamsByScheme(schema);
        if (!resolved) return;
        params = resolved as unknown[];
      } else {
        params = [[], {...context.block.props, heading: undefined}];
      }
      await this.insertBlockAtQuery(context, schema.flavour, params, anchor);
      return;
    }
    if (item.kind === "command" && item.command) {
      if (item.command.when?.(context) === false) return;
      await item.command.run(context);
    }
  }

  private async insertBlockAtQuery(
    context: SlashCommandContext,
    flavour: BlockCraft.BlockFlavour,
    params: unknown[],
    range = this.createCommandRange(context),
  ) {
    const resolved = range.consume();
    if (!resolved || !this.isBlockAlive(resolved.block) || this.isReadonly(resolved.block)) return;
    const block = resolved.block;
    const parentId = block.parentId;
    if (!parentId || !this.doc.canInsertChild(parentId, flavour)) return;

    const before = sliceDelta(block.textDeltas(), 0, resolved.index);
    const after = sliceDelta(
      block.textDeltas(),
      resolved.index + resolved.length,
    );
    const snapshots = [];
    if (before.length) {
      snapshots.push(this.doc.schemas.createSnapshot(block.flavour, [before, block.props]));
    }
    const inserted = this.doc.schemas.createSnapshot(flavour, params as any);
    inserted.props.depth = block.props.depth;
    snapshots.push(inserted);
    if (after.length) {
      snapshots.push(this.doc.schemas.createSnapshot(block.flavour, [after, block.props]));
    }
    if (snapshots.some(snapshot => !this.doc.canInsertChild(parentId, snapshot.flavour))) return;

    await this.doc.chain()
      .replaceWithSnapshots(block.id, snapshots)
      .nextTick()
      .selectOrSetCursorAtBlock(inserted.id, true)
      .recalculateSelection()
      .run();
  }

  private createCommandRange(context: SlashCommandContext) {
    const anchor = new OneShotRangeAnchor(this.doc);
    anchor.capture(context.block, context.triggerIndex, context.triggerLength);
    return anchor;
  }

  private replaceCommandRange(
    anchor: OneShotRangeAnchor,
    inserts: DeltaInsert[],
  ) {
    const range = anchor.consume();
    if (!range || !this.isBlockAlive(range.block) || this.isReadonly(range.block)) return false;
    range.block.applyDeltaOperations([
      ...(range.index ? [{retain: range.index}] : []),
      {delete: range.length},
      ...inserts,
    ]);
    const insertedLength = inserts.reduce(
      (length, delta) => length + (typeof delta.insert === "string" ? delta.insert.length : 1),
      0,
    );
    nextTick().then(() => {
      if (!this.isBlockAlive(range.block)) return;
      this.doc.selection.setCursorAt(range.block, range.index + insertedLength);
    });
    return true;
  }

  /**
   * Keep a secondary slash-command panel owned by the command range that
   * opened it. Relative positions allow unrelated edits before the trigger,
   * while deleting or rewriting `/query` closes the stale panel immediately.
   */
  private createCommandPanelClose(context: SlashCommandContext) {
    const close$ = new Subject<void>();
    const range = this.createCommandRange(context);
    const trigger = modelCharacterAt(
      context.block.textDeltas(),
      context.triggerIndex,
    );
    const expectedText =
      trigger === "/" || trigger === "、" ? `${trigger}${context.query}` : null;
    const yText = context.block.yText;
    const textObserver = () => {
      const resolved = range.resolve();
      if (
        !expectedText ||
        !resolved ||
        !this.isBlockAlive(resolved.block) ||
        resolved.length !== expectedText.length ||
        plainTextInRange(
          resolved.block.textDeltas(),
          resolved.index,
          resolved.length,
        ) !== expectedText
      ) {
        close$.next();
      }
    };

    yText.observe(textObserver);
    close$.pipe(take(1)).subscribe(() => {
      try {
        yText.unobserve(textObserver);
      } catch {}
      range.reset();
    });
    return close$;
  }

  private openFormulaPicker(context: SlashCommandContext) {
    const close$ = this.createCommandPanelClose(context);
    const { componentRef } =
      this.doc.overlayService.createConnectedOverlay<FormulaBlockToolbar>(
        {
          target: context.block,
          component: FormulaBlockToolbar,
          backdrop: true,
          positions: [
            getPositionWithOffset("bottom-left", 0, 8),
            getPositionWithOffset("top-left", 0, 8),
          ],
        },
        close$,
      );
    componentRef.setInput("doc", this.doc);
    componentRef.setInput("initialLatex", "");
    componentRef.instance.confirm.pipe(takeUntil(close$)).subscribe(latex => {
      if (!latex.trim()) return;
      context.replace([{insert: {latex}}]);
      close$.next();
    });
  }

  private openEmojiPicker(context: SlashCommandContext) {
    const close$ = this.createCommandPanelClose(context);
    const { componentRef } =
      this.doc.overlayService.createConnectedOverlay<CsEmojiPickerComponent>(
        {
          target: context.block,
          component: CsEmojiPickerComponent,
          backdrop: true,
          flexibleDimensions: true,
          positions: [
            getPositionWithOffset("bottom-left", 0, 8),
            getPositionWithOffset("top-left", 0, 8),
          ],
        },
        close$,
      );
    componentRef.setInput("csMode", "panel");
    componentRef.setInput("csLocale", "zh-CN");
    componentRef.setInput("csShowSearch", true);
    this.attachCommandPickerKeyboardSession(
      close$,
      componentRef.instance,
      context.block.containerElement,
      componentRef.location.nativeElement,
    );
    outputToObservable(componentRef.instance.csEmojiSelect)
      .pipe(takeUntil(close$))
      .subscribe(({emoji}) => {
        context.replace([{insert: emoji.native}]);
        close$.next();
      });
  }

  /**
   * Opens the type-ahead Emoji surface owned by a literal `:` in Y.Text.
   * The editor keeps focus while typing so text and IME commits continue
   * through InputTransformer. Arrow keys update the picker's virtual active
   * option while the canonical and native editor selections stay pinned.
   */
  private openColonEmojiPicker(
    block: EditableBlockComponent,
    triggerIndex: number,
  ) {
    if (
      this.destroyed ||
      !this.isBlockAlive(block) ||
      this.isReadonly(block)
    )
      return;

    this.closeContextMenu();
    this.closePickerSession();

    const anchor = new OneShotCursorAnchor(this.doc);
    anchor.capture(block, triggerIndex);
    const close$ = new Subject<void>();
    const { componentRef } =
      this.doc.overlayService.createConnectedOverlay<CsEmojiPickerComponent>(
        {
          target: block,
          component: CsEmojiPickerComponent,
          backdrop: true,
          flexibleDimensions: true,
          positions: [
            getPositionWithOffset("bottom-left", 0, 8),
            getPositionWithOffset("top-left", 0, 8),
          ],
        },
        close$,
      );
    componentRef.setInput("csMode", "panel");
    componentRef.setInput("csLocale", "zh-CN");
    componentRef.setInput("csShowSearch", false);
    componentRef.setInput("csShowCategories", true);

    let refreshSeq = 0;
    let keyboardNavigation = false;
    let suppressingSelectionRecalculate = false;
    let caretGuardArmed = false;
    let navPinTimer: ReturnType<typeof setTimeout> | null = null;
    let session!: ActivePickerSession;
    const ownerDocument = block.containerElement.ownerDocument;
    const picker = componentRef.instance;

    const caretIsAt = (offset: number) => {
      const dom = ownerDocument.getSelection();
      if (!dom || !dom.isCollapsed || !dom.focusNode) return false;
      if (!block.containerElement.contains(dom.focusNode)) return false;
      try {
        return (
          block.runtime.domPointToModel(dom.focusNode, dom.focusOffset) ===
          offset
        );
      } catch {
        return true;
      }
    };
    const restoreEditorCaret = () => {
      const selection = this.doc.selection.value;
      if (
        !selection ||
        !isSelectionAlive(selection as any, this.doc) ||
        !selection.collapsed ||
        selection.start.type !== "text" ||
        selection.firstBlock?.id !== block.id
      )
        return;
      if (!caretIsAt(selection.start.offset)) {
        block.setInlineRange(selection.start.offset);
      }
    };
    const handleCaretDrift = () => {
      if (!this.doc.event.status.isComposing) restoreEditorCaret();
    };
    const releaseCaretPin = () => {
      if (navPinTimer !== null) {
        clearTimeout(navPinTimer);
        navPinTimer = null;
      }
      if (caretGuardArmed) {
        caretGuardArmed = false;
        ownerDocument.removeEventListener("selectionchange", handleCaretDrift);
      }
      if (suppressingSelectionRecalculate) {
        suppressingSelectionRecalculate = false;
        this.doc.selection.setSuppressRecalculate(false);
      }
    };
    const pinEditorCaret = () => {
      if (!suppressingSelectionRecalculate) {
        suppressingSelectionRecalculate = true;
        this.doc.selection.setSuppressRecalculate(true);
      }
      restoreEditorCaret();
      if (!caretGuardArmed) {
        caretGuardArmed = true;
        ownerDocument.addEventListener("selectionchange", handleCaretDrift);
      }
      if (navPinTimer !== null) clearTimeout(navPinTimer);
      navPinTimer = setTimeout(releaseCaretPin, EMOJI_NAV_PIN_WINDOW_MS);
    };
    const refresh = () => {
      if (this.doc.event.status.isComposing) return;
      const context = this.resolveEmojiTriggerContext(anchor);
      if (!context) {
        close$.next();
        return;
      }
      componentRef.setInput("csQuery", context.query);
      if (keyboardNavigation) {
        componentRef.changeDetectorRef.detectChanges();
        picker.moveActive("first", { preserveFocus: true });
      }
    };
    const scheduleRefresh = () => {
      const seq = ++refreshSeq;
      nextTick().then(() => {
        if (
          this.destroyed ||
          this.activePickerSession !== session ||
          refreshSeq !== seq
        )
          return;
        refresh();
      });
    };
    const syncPickerQuery = () => {
      const context = this.resolveEmojiTriggerContext(anchor);
      if (!context) {
        close$.next();
        return false;
      }
      componentRef.setInput("csQuery", context.query);
      componentRef.changeDetectorRef.detectChanges();
      return true;
    };
    session = {
      close$,
      scheduleRefresh,
      handleEditorKey: (key, event) => {
        if (this.doc.event.status.isComposing) return false;
        if (key === "Escape") {
          close$.next();
          return true;
        }
        const direction = pickerGridDirectionForKey(key);
        if (!direction && key !== "Enter" && key !== "Tab") return false;
        if (!syncPickerQuery()) return true;
        if (key === "Tab") {
          const handled = picker.moveCategory(
            event?.shiftKey ? "previous" : "next",
            { preserveFocus: true },
          );
          if (handled) {
            keyboardNavigation = true;
            pinEditorCaret();
          }
          return handled;
        }
        if (key === "Enter") {
          if (!keyboardNavigation) {
            if (!picker.moveActive("first", { preserveFocus: true })) return false;
            keyboardNavigation = true;
          }
          return picker.selectActive(
            event ?? new KeyboardEvent("keydown", { key: "Enter" }),
          );
        }
        const handled = picker.moveActive(direction!, {
          preserveFocus: true,
        });
        if (handled) {
          keyboardNavigation = true;
          pinEditorCaret();
        }
        return handled;
      },
    };
    const handleEditorKeydownCapture = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const handled = session.handleEditorKey(event.key, event);
      if (!handled) {
        releaseCaretPin();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };
    ownerDocument.addEventListener(
      "keydown",
      handleEditorKeydownCapture,
      true,
    );
    this.activePickerSession = session;

    const textObserver = () => scheduleRefresh();
    block.yText.observe(textObserver);
    this.doc.selection.selectionChange$
      .pipe(skip(1), takeUntil(close$))
      .subscribe(() => scheduleRefresh());
    merge(
      this.doc.readonlySwitch$.pipe(filter(value => value)),
      this.doc.onDestroy$,
      block.onDestroy$,
    )
      .pipe(takeUntil(close$))
      .subscribe(() => close$.next());
    close$.pipe(take(1)).subscribe(() => {
      refreshSeq++;
      ownerDocument.removeEventListener(
        "keydown",
        handleEditorKeydownCapture,
        true,
      );
      releaseCaretPin();
      try {
        block.yText.unobserve(textObserver);
      } catch {}
      anchor.reset();
      if (this.activePickerSession === session) {
        this.activePickerSession = undefined;
      }
    });

    outputToObservable(componentRef.instance.csEmojiSelect)
      .pipe(takeUntil(close$))
      .subscribe(({ emoji }) => {
        const context = this.resolveEmojiTriggerContext(anchor);
        context?.replace([{ insert: emoji.native }]);
        close$.next();
      });

    refresh();
  }

  private resolveEmojiTriggerContext(
    anchor: OneShotCursorAnchor,
  ): SlashCommandContext | null {
    const point = anchor.resolve();
    const selection = this.doc.selection.value;
    if (
      !point ||
      !selection ||
      !isSelectionAlive(selection as any, this.doc) ||
      !selection.collapsed ||
      selection.start.type !== "text" ||
      selection.firstBlock?.id !== point.block.id ||
      selection.start.offset <= point.index ||
      !this.isBlockAlive(point.block) ||
      this.isReadonly(point.block) ||
      modelCharacterAt(point.block.textDeltas(), point.index) !== ":"
    )
      return null;

    const triggerLength = selection.start.offset - point.index;
    const query = plainTextInRange(
      point.block.textDeltas(),
      point.index + 1,
      triggerLength - 1,
    );
    if (query === null || query.length > 64 || /[\s:]/.test(query)) return null;

    const range = new OneShotRangeAnchor(this.doc);
    range.capture(point.block, point.index, triggerLength);
    return {
      doc: this.doc,
      block: point.block,
      query,
      triggerIndex: point.index,
      triggerLength,
      replace: (inserts) => this.replaceCommandRange(range, [...inserts]),
    };
  }

  private closePickerSession(session?: ActivePickerSession) {
    if (session && this.activePickerSession !== session) return;
    this.activePickerSession?.close$.next();
  }

  /**
   * Maps editor-owned shortcuts onto a CSES picker without moving real focus
   * into its grid. The capture route also covers the picker's search input:
   * navigation keys are owned here, while normal text and IME remain native to
   * that input.
   */
  private attachCommandPickerKeyboardSession(
    close$: Subject<void>,
    picker: KeyboardNavigablePicker,
    sourceElement: HTMLElement,
    pickerElement: HTMLElement,
  ) {
    this.closePickerSession();

    let keyboardNavigation = false;
    let session!: ActivePickerSession;
    const ownerDocument = sourceElement.ownerDocument;
    session = {
      close$,
      handleEditorKey: (key, event) => {
        if (this.doc.event.status.isComposing) return false;
        if (key === "Escape") {
          close$.next();
          return true;
        }
        if (key === "Tab") {
          const handled = picker.moveCategory(
            event?.shiftKey ? "previous" : "next",
            {preserveFocus: true},
          );
          if (handled) keyboardNavigation = true;
          return handled;
        }
        if (key === "Enter") {
          if (!keyboardNavigation) {
            if (!picker.moveActive("first", {preserveFocus: true})) return false;
            keyboardNavigation = true;
          }
          return picker.selectActive();
        }
        const direction = pickerGridDirectionForKey(key);
        if (!direction) return false;
        const handled = picker.moveActive(direction, {preserveFocus: true});
        if (handled) keyboardNavigation = true;
        return handled;
      },
    };

    const handleKeydownCapture = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as Node | null;
      if (
        target &&
        !sourceElement.contains(target) &&
        !pickerElement.contains(target)
      ) return;
      if (!session.handleEditorKey(event.key, event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };
    ownerDocument.addEventListener("keydown", handleKeydownCapture, true);
    this.activePickerSession = session;
    close$.pipe(take(1)).subscribe(() => {
      ownerDocument.removeEventListener("keydown", handleKeydownCapture, true);
      if (this.activePickerSession === session) {
        this.activePickerSession = undefined;
      }
    });
  }

  private openIconPicker(context: SlashCommandContext) {
    const close$ = this.createCommandPanelClose(context);
    const { componentRef } =
      this.doc.overlayService.createConnectedOverlay<CsIconPickerComponent>(
        {
          target: context.block,
          component: CsIconPickerComponent,
          backdrop: true,
          flexibleDimensions: true,
          positions: [
            getPositionWithOffset("bottom-left", 0, 8),
            getPositionWithOffset("top-left", 0, 8),
          ],
        },
        close$,
      );
    componentRef.setInput("csMode", "panel");
    componentRef.setInput("csShowSearch", true);
    componentRef.setInput("csShowCategories", true);
    this.attachCommandPickerKeyboardSession(
      close$,
      componentRef.instance,
      context.block.containerElement,
      componentRef.location.nativeElement,
    );
    outputToObservable(componentRef.instance.csChange)
      .pipe(takeUntil(close$))
      .subscribe((event: CsIconPickerChangeEvent) => {
        if (!event.value || event.value.useSvg) return;
        const className = `csicon csicon-${event.value.name}`;
        context.replace([{insert: {icon: className}}]);
        close$.next();
      });
  }

  private openLinkPicker(context: SlashCommandContext) {
    const close$ = this.createCommandPanelClose(context);
    const { componentRef } =
      this.doc.overlayService.createConnectedOverlay<LinkEditFloatDialog>(
        {
          target: context.block,
          component: LinkEditFloatDialog,
          backdrop: true,
          positions: [
            getPositionWithOffset("bottom-left", 0, 8),
            getPositionWithOffset("top-left", 0, 8),
          ],
        },
        close$,
      );
    componentRef.setInput("text", "链接文字");
    componentRef.setInput("href", "");
    requestAnimationFrame(() => componentRef.instance.focus());
    componentRef.instance.close.pipe(takeUntil(close$)).subscribe(() => close$.next());
    componentRef.instance.update.pipe(takeUntil(close$)).subscribe(value => {
      context.replace([{
        insert: value.text,
        attributes: {"a:link": value.href},
      }]);
      close$.next();
    });
  }

  private async openInlineImagePicker(context: SlashCommandContext) {
    const schema = this.doc.schemas.get("image", false);
    if (!schema) return;
    const creator = this.doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN);
    const params = await creator.getParamsByScheme(schema);
    if (!params) return;
    const source = (params as any[])[0];
    const src = typeof source === "string" ? source : source?.src ?? source?.url;
    const delta = createInlineImageDelta(src, source?.width, source?.height);
    if (!delta) return;
    context.replace([delta]);
  }

  private openMention(context: SlashCommandContext) {
    const mention = this.doc.plugins.find(plugin => plugin.name === "mention") as
      | MentionPlugin
      | undefined;
    mention?.openAt(context.block, context.triggerIndex, context.triggerLength);
  }

  private closeMenu$ = new Subject();

  private closeContextMenu(menu?: BlockTransformContextMenu) {
    if (menu && this.activeMenu !== menu) return;
    this.activeMenu = undefined;
    this.closeMenu$.next(true);
  }

  openContextMenu(block: EditableBlockComponent, triggerIndex = 0) {
    if (
      this.destroyed ||
      !this.resolveSlashQueryState(block, triggerIndex)
    ) return;
    // 关掉可能还存在的旧菜单。textObserver 关菜单有 debounce，用户在窗口内
    // "删除字符 → 重新输入 / 触发"时不能让两个 overlay 同时持有键盘事件。
    this.closePickerSession();
    this.closeContextMenu();

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
    cpr.setInput("triggerIndex", triggerIndex);
    cpr.setInput("items", this.buildMenuItems(block));
    this.activeMenu = cpr.instance;

    cpr.instance.commandSelected
      .pipe(takeUntil(this.closeMenu$))
      .subscribe(item => {
        const context = this.resolveCommandContext(block, triggerIndex);
        if (!context) return;
        void this.executeMenuItem(item, context).catch(error => {
          this.doc.logger.warn("slashCommandExecutionError: ", error);
        });
      });

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
        this.closeContextMenu(cpr.instance);
      });
  }

  destroy() {
    this.destroyed = true;
    this.pendingInputTriggerSeq++;
    this.closePickerSession();
    this.closeContextMenu();
    this.sub.unsubscribe();
  }

  private queueInputTrigger(inputText: string | null | undefined) {
    if (
      inputText !== " " &&
      inputText !== "\/" &&
      inputText !== "、" &&
      inputText !== ":"
    )
      return;
    const seq = ++this.pendingInputTriggerSeq;
    nextTick().then(() => {
      if (this.destroyed) return;
      if (this.pendingInputTriggerSeq !== seq) return;
      if (inputText === " ") {
        this._mdTransform();
        return;
      }
      this.tryOpenInputTrigger(inputText);
    });
  }

  private tryOpenInputTrigger(inputText: "/" | "、" | ":") {
    const selection = this.getCurrentSelection();
    if (
      !selection ||
      !isSelectionAlive(selection as any, this.doc) ||
      !selection.collapsed ||
      selection.start.type !== "text"
    )
      return;
    const block = selection.firstBlock as EditableBlockComponent;
    if (!this.isBlockAlive(block)) return;
    const schema = this.doc.schemas.get(block.flavour)!;
    if (schema.metadata.isLeaf || block.plainTextOnly) return;
    const triggerIndex = this.findTriggerIndex(
      block,
      inputText,
      selection.start.offset,
    );
    if (triggerIndex !== null) {
      this.openResolvedInputTrigger(block, inputText, triggerIndex);
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
      // compositionEnd 后选区会被刷新，重新确认仍在该 block 内
      const sel = this.getCurrentSelection();
      const index =
        sel && sel.start.type === "text" && sel.firstBlock.id === block.id
          ? this.findTriggerIndex(block, inputText, sel.start.offset)
          : null;
      if (index === null) return;
      cleanup();
      if (
        !this.destroyed &&
        this.isBlockAlive(block) &&
        sel &&
        isSelectionAlive(sel as any, this.doc) &&
        sel.collapsed &&
        sel.start.type === "text" &&
        sel.firstBlock.id === block.id
      ) {
        this.openResolvedInputTrigger(block, inputText, index);
      }
    };
    yText.observe(observer);
    timer = setTimeout(cleanup, 300);
  }

  private findTriggerIndex(
    block: EditableBlockComponent,
    trigger: "/" | "、" | ":",
    cursorOffset: number,
  ): number | null {
    for (const index of [cursorOffset - 1, cursorOffset]) {
      if (index < 0 || index >= block.textLength) continue;
      if (modelCharacterAt(block.textDeltas(), index) === trigger) return index;
    }
    return null;
  }

  private openResolvedInputTrigger(
    block: EditableBlockComponent,
    trigger: "/" | "、" | ":",
    triggerIndex: number,
  ) {
    if (trigger === ":") {
      this.openColonEmojiPicker(block, triggerIndex);
      return;
    }
    if (
      block.flavour !== "paragraph" ||
      triggerIndex !== 0 ||
      block.textLength !== 1
    ) return;
    this.openContextMenu(block, triggerIndex);
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

function modelCharacterAt(deltas: DeltaInsert[], index: number) {
  return sliceDelta(deltas, index, index + 1)[0]?.insert ?? null;
}

function plainTextInRange(
  deltas: DeltaInsert[],
  index: number,
  length: number,
) {
  const range = sliceDelta(deltas, index, index + length);
  if (range.some((delta) => typeof delta.insert !== "string")) return null;
  return range.map((delta) => delta.insert).join("");
}

function pickerGridDirectionForKey(key: string): CsPickerGridDirection | null {
  switch (key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    default:
      return null;
  }
}

export type {
  BlockTransformerPluginOptions,
  SlashCommandContext,
  SlashCommandGroup,
  SlashCommandItem,
} from "./command";
export * from "./const";
