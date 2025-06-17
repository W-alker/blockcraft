import { ChangeDetectorRef, ElementRef } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { IToolbarItem } from "../../components";
import { IImgBlockModel } from "./type";
import { BaseBlock } from "../../core";
import * as i0 from "@angular/core";
export declare class ImageBlock extends BaseBlock<IImgBlockModel> {
    private readonly _cdr;
    img: ElementRef<HTMLImageElement>;
    constructor(_cdr: ChangeDetectorRef);
    protected TOOLBAR_LIST: IToolbarItem[];
    protected activeMenu?: Set<string>;
    protected imgLoadState: 'loading' | 'loaded' | 'error';
    protected _showWidth: number;
    protected _align: string;
    protected isFocusing$: BehaviorSubject<boolean>;
    private _viewer;
    ngOnInit(): void;
    ngAfterViewInit(): void;
    onKeydown(e: KeyboardEvent): void;
    setAlign(): void;
    setToolbarActive(): void;
    onImgFocus(event: FocusEvent): void;
    onImgBlur(event: FocusEvent): void;
    onImgClick(event: MouseEvent): void;
    previewImg(): void;
    private startPoint?;
    private mouseMove$?;
    onResizeHandleMouseDown(event: MouseEvent, direction: 'left' | 'right'): void;
    onToolbarItemClick(e: {
        item: IToolbarItem;
    }): void;
    download(src: string, caption?: string): void;
    onDragStart(e: DragEvent): void;
    ngOnDestroy(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<ImageBlock, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<ImageBlock, "div.image-block", never, {}, {}, never, never, true, never>;
}
