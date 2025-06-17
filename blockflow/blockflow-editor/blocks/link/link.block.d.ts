import { BaseBlock } from "../../core";
import { ILinkBlockModel } from "./type";
import { Overlay } from "@angular/cdk/overlay";
import * as i0 from "@angular/core";
export declare class LinkBlock extends BaseBlock<ILinkBlockModel> {
    private readonly ovr;
    constructor(ovr: Overlay);
    ngAfterViewInit(): void;
    onClick(e: MouseEvent): void;
    createOverlay(): import("@angular/cdk/overlay").OverlayRef;
    onSetLink(): void;
    unLink(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<LinkBlock, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<LinkBlock, "link-block", never, {}, {}, never, never, true, never>;
}
