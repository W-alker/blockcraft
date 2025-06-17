import { ChangeDetectorRef, DestroyRef, ElementRef, EventEmitter } from "@angular/core";
import * as i0 from "@angular/core";
export declare class LinkInputPad {
    private cdr;
    readonly destroyRef: DestroyRef;
    constructor(cdr: ChangeDetectorRef, destroyRef: DestroyRef);
    onCancel: EventEmitter<void>;
    onConfirm: EventEmitter<string>;
    inputElement: ElementRef<HTMLInputElement>;
    onMouseDown($event: MouseEvent): void;
    isValid: boolean;
    ngAfterViewInit(): void;
    onInput($event: Event): void;
    submitValue(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<LinkInputPad, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<LinkInputPad, "link-input-pad", never, {}, { "onCancel": "onCancel"; "onConfirm": "onConfirm"; }, never, never, true, never>;
}
