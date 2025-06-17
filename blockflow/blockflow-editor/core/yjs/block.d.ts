import { Subject } from "rxjs";
import { YMapEvent } from "yjs";
import Y from ".";
import { DeltaInsert, IBlockModel, IEditableBlockModel } from "../types";
export type YBlockModel = Y.Map<any>;
export declare const syncBlockModelChildren: (deltas: Array<{
    insert?: Array<YBlockModel>;
    delete?: number;
    retain?: number;
}>, array: Array<BlockModel>) => void;
export declare const syncMapUpdate: (event: YMapEvent<any>, map: Object, cb?: (e: YMapEvent<any>) => void) => void;
export declare const USER_CHANGE_SIGNAL: unique symbol;
export declare const NO_RECORD_CHANGE_SIGNAL: unique symbol;
export type UpdateEvent = {
    type: 'children';
    event: Y.YArrayEvent<YBlockModel> | Y.YTextEvent;
} | {
    type: 'props';
    event: YMapEvent<any>;
} | {
    type: 'meta';
    event: YMapEvent<any>;
};
export declare class BlockModel<Model extends IBlockModel = IBlockModel> {
    private readonly _model;
    readonly yModel: YBlockModel;
    private readonly _childrenModel?;
    readonly update$: Subject<UpdateEvent>;
    private _yChildrenObserver;
    constructor(_model: Exclude<IBlockModel, 'children'>, yModel: YBlockModel, _childrenModel?: (DeltaInsert | BlockModel<IBlockModel>)[] | undefined);
    static fromYModel(yModel: YBlockModel): BlockModel<IBlockModel>;
    static fromModel<T extends IBlockModel | IEditableBlockModel = IBlockModel>(block: T): BlockModel<T>;
    getParentId(): string | undefined;
    getPosition(): {
        parentId: string | null;
        index: number;
    };
    toJSON(): IBlockModel;
    get id(): string;
    get flavour(): string;
    get nodeType(): import("../types").BlockNodeType;
    get props(): Readonly<Model["props"]>;
    get meta(): Readonly<Model["meta"]>;
    get children(): Model extends IEditableBlockModel ? DeltaInsert[] : BlockModel<Model['children'] extends IEditableBlockModel[] ? IEditableBlockModel : IBlockModel>[];
    getYText(): Model extends IEditableBlockModel ? Y.Text : never;
    setProp<T extends keyof Model['props']>(key: T, value: Model['props'][T]): void;
    deleteProp<T extends keyof Model['props']>(key: T): void;
    setMeta<T extends keyof Model['meta']>(key: T, value: Model['meta'][T]): void;
    private getYChildren;
    insertChildren(index: number, children: BlockModel[]): void;
    deleteChildren(index: number, num: number): void;
}
