import type {SimpleBasicType} from '@ccc/blockcraft/global/types';
import type {IInlineNodeAttrs} from "./inline";

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
