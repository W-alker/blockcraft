import { DeltaInsert, DeltaInsertEmbed, IInlineAttrs } from "../../types";
export type EmbedConverter = {
    toDelta: EmbedViewToDelta;
    toView: CreateEmbedView;
};
export type CreateEmbedView = (delta: DeltaInsertEmbed) => HTMLElement;
export type EmbedViewToDelta = (ele: HTMLElement) => DeltaInsertEmbed;
export declare class BlockflowInline {
    readonly embedConverterMap: Map<string, EmbedConverter>;
    constructor(embedConverterMap?: Map<string, EmbedConverter>);
    createView(delta: DeltaInsert): HTMLElement | Text;
    elementToDelta(ele: HTMLElement): DeltaInsert;
    static setAttributes(element: HTMLElement, attributes?: IInlineAttrs, embed?: boolean): void;
    static getAttributes(element: HTMLElement): IInlineAttrs;
    static compareAttributesWithEle(element: HTMLElement, attributes?: IInlineAttrs): boolean;
}
