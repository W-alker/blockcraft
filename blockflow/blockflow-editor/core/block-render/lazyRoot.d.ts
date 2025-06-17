import { IBlockModel } from "../types";
import { EditorRoot } from "./root";
import { BlockModel } from "../yjs";
import { Controller } from "../controller";
import * as i0 from "@angular/core";
interface IRequester {
    (page: number): Promise<IResponse>;
}
interface IResponse {
    totalCount: number;
    data: IBlockModel[];
}
export interface LazyLoadConfig {
    pageSize: number;
    requester: IRequester;
}
export declare class LazyEditorRoot extends EditorRoot {
    config: LazyLoadConfig;
    get model(): BlockModel<IBlockModel>[];
    private pagination;
    private lastEle;
    private parentEle;
    private parentHeight;
    private lastEleIntersection;
    private resizeObserver;
    private loadMore;
    setController(controller: Controller): void;
    private observe;
    private unobserve;
    static ɵfac: i0.ɵɵFactoryDeclaration<LazyEditorRoot, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<LazyEditorRoot, "div[bf-node-type=\"root\"][lazy-load=\"true\"]", never, { "config": { "alias": "config"; "required": true; }; }, {}, never, never, true, never>;
}
export {};
