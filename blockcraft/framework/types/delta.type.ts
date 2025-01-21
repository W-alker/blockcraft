import {SimpleBasicType} from "../../global";
import {IInlineNodeAttr} from "./inline.type";

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
  attributes?: IInlineNodeAttr;
}

export type DeltaOperation = {
  insert?: DeltaInsert["insert"]
  delete?: number;
  retain?: number;
} & DeltaOptionalAttributes;



