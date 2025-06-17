import { BaseStore } from "../store";
import { DeltaInsert, IBlockFlavour, IBlockModel } from "../types";
import { BlockSchema } from "./block-schema.type";
export declare class SchemaStore extends BaseStore<IBlockFlavour, BlockSchema> {
    constructor(schemaList: BlockSchema[]);
    isDeltaInsert: (schema: BlockSchema, params: any[]) => params is DeltaInsert[];
    create: (flavour: IBlockFlavour, params?: any[]) => IBlockModel;
}
