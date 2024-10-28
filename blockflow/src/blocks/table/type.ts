import {IBlockModel, IEditableBlockModel} from "../../core";

export interface ITableBlockModel extends IBlockModel {
    flavour: 'table',
    nodeType: 'block',
    props: {
        cols: number,
        colWidths: number[],
    },
}

export interface ITableRowBlockModel extends IBlockModel {
    flavour: 'table-row',
    nodeType: 'block',
    children: IEditableBlockModel[]
}
