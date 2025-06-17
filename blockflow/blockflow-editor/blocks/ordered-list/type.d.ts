import { IEditableBlockModel } from "../../core";
export interface IOrderedListBlockModel extends IEditableBlockModel {
    flavor: 'ordered-list';
    props: {
        order: number;
    } & IEditableBlockModel['props'];
}
