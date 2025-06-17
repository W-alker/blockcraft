import { Controller, IPlugin } from "../../core";
import { IContextMenuComponent } from "../../editor";
export declare class BlockControllerPlugin implements IPlugin {
    readonly contextMenu: IContextMenuComponent;
    name: string;
    version: number;
    private _controller;
    private _vcr;
    private _cpr;
    private _activeBlockWrap;
    private _timer;
    private mouseLeaveSub?;
    private eventSubs;
    constructor(contextMenu: IContextMenuComponent);
    init(controller: Controller): void;
    onLeave: () => void;
    private drag$;
    addDraggable(): void;
    onSortBlock(targetBlockWrap: HTMLElement, position: 'before' | 'after' | 'none'): void;
    destroy(): void;
}
