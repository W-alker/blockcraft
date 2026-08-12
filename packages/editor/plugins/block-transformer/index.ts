import {
  filter,
  merge,
  skip,
  Subject,
  Subscription,
  takeUntil,
} from "rxjs";
import {outputToObservable} from "@angular/core/rxjs-interop";
import {
  CsEmojiPickerComponent,
  CsIconPickerComponent,
  type CsIconPickerChangeEvent,
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

export class BlockTransformerPlugin extends DocPlugin {
  override name = "block-transformer";
  override version = 1.0;

  private mdTransformList: { regex: RegExp; flavour: string }[] = [];
  private pendingInputTriggerSeq = 0;
  private destroyed = false;
  private activeMenu?: BlockTransformContextMenu;
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
    if (this.activeMenu?.handleEditorKey(raw.key)) {
      evt.preventDefault();
      raw.stopPropagation?.();
      raw.stopImmediatePropagation?.();
      return true;
    }
    this.queueInputTrigger(raw.key);
    return false;
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
    const selection = this.getCurrentSelection();
    if (
      !selection ||
      !isSelectionAlive(selection as any, this.doc) ||
      !selection.collapsed ||
      selection.start.type !== "text" ||
      selection.firstBlock?.id !== block.id ||
      selection.start.offset <= triggerIndex ||
      !this.isBlockAlive(block) ||
      this.isReadonly(block)
    ) return null;
    const trigger = modelCharacterAt(block.textDeltas(), triggerIndex);
    if (trigger !== "/" && trigger !== "、") return null;
    const queryDeltas = sliceDelta(
      block.textDeltas(),
      triggerIndex + 1,
      selection.start.offset,
    );
    if (queryDeltas.some(delta => typeof delta.insert !== "string")) return null;
    const query = queryDeltas.map(delta => delta.insert).join("");
    if (/\s/.test(query)) return null;
    const range = this.createCommandRange({
      doc: this.doc,
      block,
      query,
      triggerIndex,
      triggerLength: selection.start.offset - triggerIndex,
      replace: () => false,
    });
    return {
      doc: this.doc,
      block,
      query,
      triggerIndex,
      triggerLength: selection.start.offset - triggerIndex,
      replace: inserts => this.replaceCommandRange(range, [...inserts]),
    };
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

  private openFormulaPicker(context: SlashCommandContext) {
    const close$ = new Subject<void>();
    const {componentRef} = this.doc.overlayService.createConnectedOverlay<FormulaBlockToolbar>({
      target: context.block,
      component: FormulaBlockToolbar,
      backdrop: true,
      positions: [
        getPositionWithOffset("bottom-left", 0, 8),
        getPositionWithOffset("top-left", 0, 8),
      ],
    }, close$);
    componentRef.setInput("doc", this.doc);
    componentRef.setInput("initialLatex", "");
    componentRef.instance.confirm.pipe(takeUntil(close$)).subscribe(latex => {
      if (!latex.trim()) return;
      context.replace([{insert: {latex}}]);
      close$.next();
    });
  }

  private openEmojiPicker(context: SlashCommandContext) {
    const close$ = new Subject<void>();
    const {componentRef} = this.doc.overlayService.createConnectedOverlay<CsEmojiPickerComponent>({
      target: context.block,
      component: CsEmojiPickerComponent,
      backdrop: true,
      flexibleDimensions: true,
      positions: [
        getPositionWithOffset("bottom-left", 0, 8),
        getPositionWithOffset("top-left", 0, 8),
      ],
    }, close$);
    componentRef.setInput("csMode", "panel");
    componentRef.setInput("csShowSearch", true);
    outputToObservable(componentRef.instance.csEmojiSelect)
      .pipe(takeUntil(close$))
      .subscribe(({emoji}) => {
        context.replace([{insert: emoji.native}]);
        close$.next();
      });
  }

  private openIconPicker(context: SlashCommandContext) {
    const close$ = new Subject<void>();
    const {componentRef} = this.doc.overlayService.createConnectedOverlay<CsIconPickerComponent>({
      target: context.block,
      component: CsIconPickerComponent,
      backdrop: true,
      flexibleDimensions: true,
      positions: [
        getPositionWithOffset("bottom-left", 0, 8),
        getPositionWithOffset("top-left", 0, 8),
      ],
    }, close$);
    componentRef.setInput("csMode", "panel");
    componentRef.setInput("csShowSearch", true);
    componentRef.setInput("csShowCategories", true);
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
    const close$ = new Subject<void>();
    const {componentRef} = this.doc.overlayService.createConnectedOverlay<LinkEditFloatDialog>({
      target: context.block,
      component: LinkEditFloatDialog,
      backdrop: true,
      positions: [
        getPositionWithOffset("bottom-left", 0, 8),
        getPositionWithOffset("top-left", 0, 8),
      ],
    }, close$);
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
    if (this.destroyed || !this.isBlockAlive(block) || this.isReadonly(block)) return;
    // 关掉可能还存在的旧菜单。textObserver 关菜单有 debounce，用户在窗口内
    // "删除字符 → 重新输入 / 触发"时不能让两个 overlay 同时持有键盘事件。
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
    this.closeContextMenu();
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
      this.openContextMenu(block, triggerIndex);
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
        this.openContextMenu(block, index);
      }
    };
    yText.observe(observer);
    timer = setTimeout(cleanup, 300);
  }

  private findTriggerIndex(
    block: EditableBlockComponent,
    trigger: "/" | "、",
    cursorOffset: number,
  ): number | null {
    for (const index of [cursorOffset - 1, cursorOffset]) {
      if (index < 0 || index >= block.textLength) continue;
      if (modelCharacterAt(block.textDeltas(), index) === trigger) return index;
    }
    return null;
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

export type {
  BlockTransformerPluginOptions,
  SlashCommandContext,
  SlashCommandGroup,
  SlashCommandItem,
} from "./command";
export * from "./const";
