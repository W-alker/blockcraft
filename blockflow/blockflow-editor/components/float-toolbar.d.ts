import { ChangeDetectorRef, DestroyRef, EventEmitter } from "@angular/core";
import * as i0 from "@angular/core";
export interface IToolbarItem {
    id: string;
    name: string;
    icon?: string;
    value?: string;
    title?: string;
    text?: string;
    divide?: boolean;
}
export declare class FloatToolbar {
    readonly destroyRef: DestroyRef;
    readonly cdr: ChangeDetectorRef;
    activeMenu?: Set<string>;
    toolbarList: IToolbarItem[];
    itemClick: EventEmitter<{
        item: IToolbarItem;
        event: MouseEvent;
    }>;
    constructor(destroyRef: DestroyRef, cdr: ChangeDetectorRef);
    addActive(id: string): void;
    removeActive(id: string): void;
    clearActive(): void;
    clearActiveByName(name: string): void;
    replaceActiveGroupByName(name: string, id?: string): void;
    onMouseEvent(event: MouseEvent): void;
    onItemClick(event: MouseEvent, item: IToolbarItem): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<FloatToolbar, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<FloatToolbar, "div.bf-float-toolbar", never, { "activeMenu": { "alias": "activeMenu"; "required": false; }; "toolbarList": { "alias": "toolbarList"; "required": true; }; }, { "itemClick": "itemClick"; }, never, never, true, never>;
}
