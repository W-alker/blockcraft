import { Controller, EditableBlock, IPlugin } from "../../core";
import { IToolbarMenuItem } from "./widget/float-text-toolbar.type";
export interface IExpandToolbarItem extends IToolbarMenuItem {
    children?: IExpandToolbarItem[];
    click?: (item: IToolbarMenuItem, activeBlock: EditableBlock, controller: Controller) => void;
}
export declare class FloatTextToolbarPlugin implements IPlugin {
    private expandToolbarList?;
    name: string;
    version: number;
    controller: Controller;
    private _vcr;
    private _cpr?;
    private _cprSub?;
    private timer?;
    private readonly expandToolbarMenuList?;
    constructor(expandToolbarList?: IExpandToolbarItem[] | undefined);
    init(controller: Controller): void;
    openToolbar(rect: DOMRect): void;
    moveToolbar(rect?: DOMRect | undefined, activeBlock?: EditableBlock): void;
    closeToolbar(): void;
    onLink(): void;
    destroy(): void;
}
