import {SimpleBasicType} from "../../global";
import {IInlineNodeAttrs} from "./inline.type";

export type DeltaInsert = {
  insert: DeltaInsertText["insert"] | DeltaInsertEmbed["insert"]
} & DeltaOptionalAttributes;

export type DeltaInsertText = {
  insert: string
} & DeltaOptionalAttributes;

export type DeltaInsertEmbed = {
  insert: { [key: string]: SimpleBasicType }
} & DeltaOptionalAttributes;

export interface DeltaOptionalAttributes {
  attributes?: IInlineNodeAttrs;
}

export type DeltaOperation = {
  insert?: DeltaInsert["insert"]
  delete?: number;
  retain?: number;
} & DeltaOptionalAttributes;

export type DeltaRetain = {
  retain: number
} & DeltaOptionalAttributes



