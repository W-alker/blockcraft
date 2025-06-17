import { DeltaInsert, IBlockModel, SchemaStore } from "../../../core";
export declare class HtmlConverter {
    readonly schemaStore: SchemaStore;
    private htmlToDelta;
    constructor(schemaStore: SchemaStore);
    convertToDeltas(html: string): DeltaInsert[];
    convertToBlocks(html: string): IBlockModel[];
    private attr2Type;
    private convertAttrs;
    convertWordDoc(html: string): void;
}
