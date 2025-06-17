import { ChangeDetectorRef, ElementRef, EventEmitter } from "@angular/core";
import { BlockSchema } from "../../../core";
import * as i0 from "@angular/core";
export declare class BlockTransformContextMenu {
    readonly cdr: ChangeDetectorRef;
    readonly host: ElementRef<HTMLElement>;
    blocks: BlockSchema[];
    blockSelected: EventEmitter<BlockSchema<import("../../../core").IBlockProps>>;
    constructor(cdr: ChangeDetectorRef, host: ElementRef<HTMLElement>);
    activeIdx: number;
    selectUp(): void;
    selectDown(): void;
    select(): void;
    onMouseDown(event: MouseEvent, item: BlockSchema): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<BlockTransformContextMenu, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<BlockTransformContextMenu, "block-transform-contextmenu", never, { "blocks": { "alias": "blocks"; "required": false; }; }, { "blockSelected": "blockSelected"; }, never, never, true, never>;
}
