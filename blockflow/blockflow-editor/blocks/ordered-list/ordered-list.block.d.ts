import { EditableBlock } from "../../core";
import { IOrderedListBlockModel } from "./type";
import * as i0 from "@angular/core";
export declare class OrderedListBlock extends EditableBlock<IOrderedListBlockModel> {
    protected _numPrefix: string;
    ngOnInit(): void;
    private setOrder;
    static ɵfac: i0.ɵɵFactoryDeclaration<OrderedListBlock, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<OrderedListBlock, "div.ordered-list", never, {}, {}, never, never, true, never>;
}
