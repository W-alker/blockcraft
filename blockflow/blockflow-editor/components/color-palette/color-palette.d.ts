import { ChangeDetectorRef, EventEmitter } from "@angular/core";
import * as i0 from "@angular/core";
export declare class ColorPalette {
    private cdr;
    activeColor: string | null;
    activeBgColor: string | null;
    activeEdgeColor: string | null;
    showEdgeColor: boolean;
    colorChange: EventEmitter<{
        type: 'c' | 'bc' | 'ec';
        value: string | null;
    }>;
    close: EventEmitter<boolean>;
    protected colorList: readonly import("./const").IColorItem[];
    protected bgColorList: readonly import("./const").IColorItem[];
    protected edgeColorList: import("./const").IColorItem[];
    constructor(cdr: ChangeDetectorRef);
    onMouseDown(e: Event): void;
    pickColor(type: 'c' | 'bc' | 'ec', value: string | null): void;
    ngOnDestroy(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<ColorPalette, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<ColorPalette, "color-palette", never, { "activeColor": { "alias": "activeColor"; "required": false; }; "activeBgColor": { "alias": "activeBgColor"; "required": false; }; "activeEdgeColor": { "alias": "activeEdgeColor"; "required": false; }; "showEdgeColor": { "alias": "showEdgeColor"; "required": false; }; }, { "colorChange": "colorChange"; "close": "close"; }, never, never, true, never>;
}
