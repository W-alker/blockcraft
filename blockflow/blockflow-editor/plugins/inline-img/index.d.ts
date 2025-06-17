import { Controller, IPlugin } from "../../core";
export declare class InlineImgPlugin implements IPlugin {
    name: string;
    version: number;
    private _controller;
    private sub;
    private prevImg?;
    private inlineImg$;
    private _viewer;
    init(controller: Controller): void;
    previewImg(ele: HTMLElement): void;
    private wrapImg;
    unWrapImg(ele: HTMLElement): void;
    private onResizeHandleMouseDown;
    destroy(): void;
}
