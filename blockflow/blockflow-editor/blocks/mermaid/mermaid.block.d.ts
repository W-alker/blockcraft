import { Overlay } from '@angular/cdk/overlay';
import { ElementRef, TemplateRef } from '@angular/core';
import { EditableBlock } from '../../core';
import { ITemplate } from './const';
import { ViewContainerRef } from '@angular/core';
import { IMermaidBlockModel } from './type';
import * as i0 from "@angular/core";
export declare class MermaidBlock extends EditableBlock<IMermaidBlockModel> {
    private overlay;
    private vcr;
    protected readonly templateList: {
        name: string;
        prefix: string;
        template: string;
    }[];
    graph: ElementRef<HTMLElement>;
    templateListTpl: TemplateRef<any>;
    protected _viewMode: string;
    private modalRef?;
    protected isIntersecting: boolean;
    protected intersectionObserver: IntersectionObserver;
    constructor(overlay: Overlay, vcr: ViewContainerRef);
    ngAfterViewInit(): void;
    renderGraph: () => Promise<void>;
    onSwitchView(): void;
    setView(view: 'graph' | 'text'): void;
    private dialogFlag;
    onShowTemplateList(e: Event, flag: 'template' | 'prefix'): void;
    useTemplate(item: ITemplate): void;
    ngOnDestroy(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<MermaidBlock, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<MermaidBlock, "div.mermaid", never, {}, {}, never, never, true, never>;
}
