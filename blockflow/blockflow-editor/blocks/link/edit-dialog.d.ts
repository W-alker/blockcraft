import { ElementRef, EventEmitter } from "@angular/core";
import { ILinkBlockModel } from "./type";
import * as i0 from "@angular/core";
export declare class LinkBlockFloatDialog {
    attrs?: ILinkBlockModel['props'];
    close: EventEmitter<void>;
    update: EventEmitter<{
        href: string;
        text: string;
        appearance: "text" | "card";
    }>;
    titleInput: ElementRef<HTMLInputElement>;
    urlInput: ElementRef<HTMLInputElement>;
    protected titleError: boolean;
    protected urlError: boolean;
    protected updatedText: string;
    protected updatedHref: string;
    protected appearanceUpdated: boolean;
    onTextUpdate(e: Event): void;
    onHrefUpdate(e: Event): void;
    onClose(): void;
    onAppearanceUpdate(value: ILinkBlockModel['props']['appearance']): void;
    onUpdate(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<LinkBlockFloatDialog, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<LinkBlockFloatDialog, "div.float-edit-dialog", never, { "attrs": { "alias": "attrs"; "required": true; }; }, { "close": "close"; "update": "update"; }, never, never, true, never>;
}
