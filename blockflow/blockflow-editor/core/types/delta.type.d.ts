import { IInlineAttrs } from "./inline.type";
import { SimpleBasicType } from "./currency.type";
export type DeltaInsert = {
    insert: DeltaInsertText["insert"] | DeltaInsertEmbed["insert"];
} & OptionalAttributes;
export type DeltaInsertText = {
    insert: string;
} & OptionalAttributes;
export type DeltaInsertEmbed = {
    insert: {
        [key: string]: SimpleBasicType;
    };
} & OptionalAttributes;
export interface OptionalAttributes {
    attributes?: IInlineAttrs;
}
export type DeltaOperation = {
    insert?: DeltaInsert["insert"];
    delete?: number;
    retain?: number;
} & OptionalAttributes;
