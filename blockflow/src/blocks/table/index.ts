import {BlockSchema} from "../../core";
import {ITableBlockModel} from "./type";
import {TableBlock} from "./table.block";
import {TableRowBlock} from "./table-row.block";
import {TableCellBlock} from "./table-cell.block";

export const TableBlockSchema: BlockSchema<ITableBlockModel['props']> = {
  flavour: 'table',
  nodeType: 'block',
  label: "表格",
  icon: "bf_icn bf_column-vertical",
  svgIcon: "bf_column-vertical",
  render: TableBlock,
  onCreate: (rowNum: number = 3, col: number = 3) => {
    return {
      props: () => ({
        colWidths: new Array(col).fill(100),
      }),
      children: Array.from({length: rowNum}, () => ({
        flavour: 'table-row',
        params: [[col]]
      }))
    }
  },
}

export const TableRowBlockSchema: BlockSchema = {
  flavour: 'table-row',
  nodeType: 'block',
  label: "表格行",
  isLeaf: true,
  render: TableRowBlock,
  onCreate: (col: number) => {
    return {
      children: Array.from({length: col}, () => ({
        flavour: 'table-cell'
      }))
    }
  }
}

export const TableCellBlockSchema: BlockSchema = {
  flavour: 'table-cell',
  nodeType: 'editable',
  label: "表格单元",
  isLeaf: true,
  render: TableCellBlock,
  children: []
}
