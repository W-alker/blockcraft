import {IInlineAttrs} from "./inline.type";

export type DeltaInsert = {
  insert: DeltaInsertEmbed["insert"] | DeltaInsertText["insert"]
} & OptionalAttributes;

export type DeltaInsertText = {
  insert: string
} & OptionalAttributes;

export type DeltaInsertEmbed = {
  insert: { [key: string]: any } & IInlineAttrs
} & OptionalAttributes;

export interface OptionalAttributes {
  attributes?: IInlineAttrs;
}

export type DeltaOperation = {
  insert?: DeltaInsert["insert"]
  delete?: number;
  retain?: number;
} & OptionalAttributes;



