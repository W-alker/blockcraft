import { IBlockModel, IEditableBlockModel } from "../../core";
export interface ITableBlockModel extends IBlockModel {
    flavour: 'table';
    nodeType: 'block';
    props: {
        colHead?: boolean;
        rowHead?: boolean;
        colWidths: number[];
    };
}
export interface ITableRowBlockModel extends IBlockModel {
    flavour: 'table-row';
    nodeType: 'block';
    props: {
        textAlign: string;
    };
    children: IEditableBlockModel[];
}
