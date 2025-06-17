import { BehaviorSubject } from "rxjs";
import { BaseStore } from "../store";
import { SchemaStore } from "../schemas";
import { IPlugin } from "../plugins";
import { BaseBlock, BlockflowInline, EditableBlock, EmbedConverter, KeyEventBus } from "../block-std";
import { BlockModel, YBlockModel } from "../yjs";
import Y from "../yjs";
import { EditorRoot } from "../block-render";
import { Injector } from "@angular/core";
import { CharacterIndex, IBlockFlavour, IBlockFlowRange, IBlockModel } from "../types";
import { IOrderedListBlockModel } from "../../blocks";
import { HtmlConverter } from "../modules/clipboard/htmlConverter";
export interface HistoryConfig {
    open: boolean;
    duration?: number;
}
export interface IControllerConfig {
    rootId: string;
    schemas: SchemaStore;
    embeds?: [string, EmbedConverter][];
    readonly?: boolean;
    historyConfig?: HistoryConfig;
    plugins?: IPlugin[];
    localUser?: {
        userId: string;
        userName: string;
    };
}
export declare class Controller {
    readonly config: IControllerConfig;
    readonly injector: Injector;
    readonly readonly$: BehaviorSubject<boolean>;
    private blockRefStore;
    private blocksWaiting;
    private readonly blocksReady$;
    readonly rootModel: BlockModel[];
    readonly yDoc: Y.Doc;
    readonly rootYModel: Y.Array<YBlockModel>;
    private _rootYModelObserver;
    readonly historyManager?: Y.UndoManager;
    readonly undoRedo$: BehaviorSubject<boolean>;
    clipboard: BlockFlowClipboard;
    selection: BlockFlowSelection;
    readonly keyEventBus: KeyEventBus;
    readonly inlineManger: BlockflowInline;
    readonly pluginStore: BaseStore<string, IPlugin>;
    private _root;
    constructor(config: IControllerConfig, injector: Injector);
    attach(root: EditorRoot): Promise<unknown>;
    addPlugins(plugins: IPlugin[]): void;
    toggleReadonly(bol?: boolean): void;
    get schemas(): SchemaStore;
    get root(): EditorRoot;
    get rootElement(): HTMLElement;
    get rootId(): string;
    toJSON(): IBlockModel[];
    /**
     * Just store block instance when it rendered
     * @param blockRef block instance
     */
    storeBlockRef<B extends BaseBlock>(blockRef: B): void;
    /** ---------------history---------------- start **/
    transact(fn: () => void, origin?: any): void;
    stopCapturing(): void;
    undo(): void;
    redo(): void;
    /** ---------------history---------------- end **/
    /** ---------------block operation---------------- start **/
    get blockLength(): number;
    getBlockModel(id: string): BlockModel<IBlockModel> | BlockModel<import("../types").IEditableBlockModel> | undefined;
    createBlock(flavour: IBlockFlavour, params?: any[]): BlockModel<IBlockModel>;
    insertBlocks(index: number, blocks: BlockModel[], parentId?: string, unRecord?: boolean): Promise<unknown>;
    deleteBlocks(index: number, count: number, parentId?: string): void;
    replaceBlocks(index: number, count: number, blocks: BlockModel[], parentId?: string): Promise<unknown>;
    deleteBlockById(id: string): void;
    replaceWith(id: string, newBlocks: BlockModel[]): Promise<unknown>;
    moveBlock(origin: string, target: string, position: 'before' | 'after'): void;
    /** ---------------block operation---------------- end **/
    /** ---------------query block---------------- start **/
    get firstBlock(): BlockModel<IBlockModel>;
    get lastBlock(): BlockModel<IBlockModel>;
    getBlockPosition(id: string): {
        parentId: string;
        index: number;
    };
    getBlockRef(id: string): EditableBlock<import("../types").IEditableBlockModel> | BaseBlock<IBlockModel> | undefined;
    findPrevEditableBlockModel(id: string): BlockModel<IBlockModel> | null;
    findPrevEditableBlock(id: string): EditableBlock | null;
    findNextBlockModel(id: string): BlockModel<IBlockModel> | null;
    findNextEditableBlockModel(id: string): BlockModel<IBlockModel> | null;
    findNextEditableBlock(id: string): EditableBlock | null;
    /** ---------------query block---------------- end **/
    /** ---------------focus , selection---------------- start **/
    get activeElement(): HTMLElement | null;
    isEditableBlock(block: BaseBlock<any>): block is EditableBlock;
    isEditable(b: string | BlockModel | BaseBlock | EditableBlock): boolean;
    getFocusingBlockId(): string | null | undefined;
    getFocusingBlockRef(): EditableBlock<import("../types").IEditableBlockModel> | null;
    deleteSelectedBlocks(): number[] | undefined;
    /** ---------------focus , selection---------------- end **/
    /** ---------------For ordered-list block---------------- start **/
    updateOrderAround(block: BlockModel<IOrderedListBlockModel>): void;
}
export interface SelectionChangeEvent {
    documentSelection: Selection;
    blockFlowSelection: BlockFlowSelection;
}
export declare class BlockFlowSelection {
    readonly controller: Controller;
    readonly activeBlock$: BehaviorSubject<EditableBlock<import("../types").IEditableBlockModel> | null>;
    constructor(controller: Controller);
    get activeElement(): HTMLElement | null;
    get root(): EditorRoot;
    normalizeStaticRange(element: HTMLElement, range: StaticRange): import("../types").ICharacterRange;
    focusTo(id: string, from: CharacterIndex, to?: CharacterIndex): void;
    getSelection(): IBlockFlowRange | null;
    setSelection(target: string, from: CharacterIndex, to?: CharacterIndex): void;
    applyRange(range: IBlockFlowRange): void;
    getCurrentCharacterRange(): import("../types").ICharacterRange;
}
declare class BlockFlowClipboard {
    readonly controller: Controller;
    static readonly CLIPBOARD_DATA_TYPE = "@bf/json";
    static readonly SIGN_CLIPBOARD_JSON_DELTA = "@bf-delta/json: ";
    static readonly SIGN_CLIPBOARD_JSON_BLOCKS = "@bf-blocks/json: ";
    protected readonly htmlConverter: HtmlConverter;
    constructor(controller: Controller);
    execCommand(command: 'cut' | 'copy'): void;
    copy(): void;
    cut(): void;
    writeText(text: string): Promise<void>;
    private _data_write;
    private _data_write_ok;
    writeData(data: typeof this._data_write): Promise<boolean>;
    private onCopy;
    private onCut;
    private uploadImg;
    private onPaste;
    private onDrop;
}
export {};
