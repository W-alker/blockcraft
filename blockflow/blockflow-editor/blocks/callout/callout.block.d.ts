import { ICalloutBlockModel } from "./type";
import { EditableBlock } from "../../core";
import { Overlay } from "@angular/cdk/overlay";
import * as i0 from "@angular/core";
export declare class CalloutBlock extends EditableBlock<ICalloutBlockModel> {
    private overlay;
    protected _backgroundColor: string | null;
    protected _borderColor: string | null;
    private _toolbarDispose$;
    private toolbarOverlayRef?;
    private _colorPickerOverlayRef?;
    constructor(overlay: Overlay);
    ngOnInit(): void;
    setStyle(): void;
    showToolbar(e: FocusEvent): void;
    showColorPicker(target: HTMLElement): void;
    closeToolbar: () => void;
    closeColorPicker: () => void;
    ngOnDestroy(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<CalloutBlock, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<CalloutBlock, "div.callout-block", never, {}, {}, never, never, true, never>;
}
