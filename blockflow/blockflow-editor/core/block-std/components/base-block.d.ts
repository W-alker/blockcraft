import { ChangeDetectorRef, DestroyRef, ElementRef, EventEmitter } from "@angular/core";
import { IBlockModel, IEditableBlockModel } from "../../types";
import { Controller } from "../../controller";
import { BlockModel } from "../../yjs";
import * as i0 from "@angular/core";
export declare class BaseBlock<Model extends IBlockModel | IEditableBlockModel = IBlockModel> {
    controller: Controller;
    model: BlockModel<Model>;
    onDestroy: EventEmitter<void>;
    get id(): string;
    get nodeType(): import("../../types").BlockNodeType;
    get flavour(): string;
    get props(): Readonly<Model["props"]>;
    get children(): Model extends IEditableBlockModel ? import("../../types").DeltaInsert[] : BlockModel<Model["children"] extends IEditableBlockModel[] ? IEditableBlockModel : IBlockModel>[];
    readonly destroyRef: DestroyRef;
    readonly cdr: ChangeDetectorRef;
    readonly hostEl: ElementRef<HTMLElement>;
    protected DOCUMENT: Document;
    setProp<T extends keyof Model['props']>(key: T, value: Model['props'][T]): void;
    deleteProp<T extends keyof Model['props']>(key: T): void;
    ngOnInit(): void;
    ngAfterViewInit(): void;
    ngOnDestroy(): void;
    private setModifyRecord;
    getParentId(): string;
    getPosition(): {
        parentId: string;
        index: number;
    };
    destroySelf(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<BaseBlock<any>, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<BaseBlock<any>, "[bf-base-block]", never, { "controller": { "alias": "controller"; "required": true; }; "model": { "alias": "model"; "required": true; }; }, { "onDestroy": "onDestroy"; }, never, never, true, never>;
}
