import { ElementRef, EventEmitter } from "@angular/core";
import * as i0 from "@angular/core";
export declare class InlineLinkBlockFloatDialog {
    private _text;
    set text(v: string);
    get text(): string;
    private _href;
    set href(v: string);
    get href(): string;
    close: EventEmitter<void>;
    update: EventEmitter<{
        text: string;
        href: string;
    }>;
    constructor();
    titleInput: ElementRef<HTMLInputElement>;
    urlInput: ElementRef<HTMLInputElement>;
    protected titleError: boolean;
    protected urlError: boolean;
    protected updatedText: string;
    protected updatedHref: string;
    ngAfterViewInit(): void;
    verifyText(): void;
    verifyUrl(): void;
    onClose(): void;
    onUpdate(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<InlineLinkBlockFloatDialog, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<InlineLinkBlockFloatDialog, "div.float-edit-dialog", never, { "text": { "alias": "text"; "required": true; }; "href": { "alias": "href"; "required": true; }; }, { "close": "close"; "update": "update"; }, never, never, true, never>;
}
