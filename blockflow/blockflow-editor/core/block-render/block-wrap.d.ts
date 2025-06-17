import { ElementRef, ViewContainerRef } from "@angular/core";
import { Controller } from "../controller";
import { BlockModel } from "../yjs";
import * as i0 from "@angular/core";
export declare class BlockWrap {
    private hostEl;
    controller: Controller;
    model: BlockModel;
    container: ViewContainerRef;
    constructor(hostEl: ElementRef<HTMLElement>);
    ngAfterViewInit(): void;
    onAppendAfter(e: Event): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<BlockWrap, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<BlockWrap, "div[bf-block-wrap]", never, { "controller": { "alias": "controller"; "required": true; }; "model": { "alias": "model"; "required": true; }; }, {}, never, never, true, never>;
}
