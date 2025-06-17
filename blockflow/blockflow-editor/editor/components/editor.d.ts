import { EventEmitter, Injector } from "@angular/core";
import { Controller, EditorRoot } from "../../core";
import { GlobalConfig } from "../types";
import * as i0 from "@angular/core";
export declare class BlockFlowEditor {
    private injector;
    private _globalConfig;
    set globalConfig(config: GlobalConfig);
    get globalConfig(): GlobalConfig;
    onReady: EventEmitter<Controller>;
    root: EditorRoot;
    protected _controller: Controller;
    get controller(): Controller;
    constructor(injector: Injector);
    ngAfterViewInit(): void;
    private createController;
    private mouseDownEventPhase;
    onMouseDown(event: MouseEvent): void;
    onMouseUp(event: MouseEvent): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<BlockFlowEditor, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<BlockFlowEditor, "bf-editor", never, { "globalConfig": { "alias": "config"; "required": true; }; }, { "onReady": "onReady"; }, never, never, true, never>;
}
