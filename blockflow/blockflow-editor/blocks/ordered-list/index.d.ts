import { EditableBlockSchema } from "../../core";
import { IOrderedListBlockModel } from "./type";
export * from './utils/index';
export * from './type';
export * from './ordered-list.block';
export declare const OrderedListSchema: EditableBlockSchema<IOrderedListBlockModel['props']>;
