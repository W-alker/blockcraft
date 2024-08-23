import {IInlineAttrs} from "./inline.type";

export interface DeltaInsert {
  insert: string
  attributes?: IInlineAttrs
}

export interface OptionalAttributes {
  attributes?: IInlineAttrs;
}

export type DeltaOperation = {
  insert?: string;
  delete?: number;
  retain?: number;
} & OptionalAttributes;



