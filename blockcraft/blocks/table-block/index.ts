import {generateId, NoEditableBlockNative} from "../../framework";
import {TableBlockComponent} from "./table.block";
import {IBlockSchemaOptions} from "../../framework/block-std/schema/block-schema";
import {BlockNodeType, IBlockProps} from "../../framework";
import {TableRowBlockComponent} from "./table-row.block";
import {TableCellBlockComponent} from "./table-cell.block";
import {ParagraphBlockSchema} from "../paragraph-block";

export interface TableBlockModel extends NoEditableBlockNative {
  flavour: 'table',
  props: {
    colHead: boolean
    rowHead: boolean
    colWidths: number[]
  }
}

export interface TableRowBlockModel extends NoEditableBlockNative {
  flavour: 'table-row',
  props: {
    height: number
  }
}

export interface TableCellBlockModel extends NoEditableBlockNative {
  flavour: 'table-cell',
  props: {
    backColor?: string | null
    color?: string | null
    verticalAlign: 'top' | 'middle' | 'bottom'
    rowspan: number | null
    colspan: number | null
    display: null | 'none'
    mergedBy?: string
  } & IBlockProps,
}

export const TableBlockSchema: IBlockSchemaOptions<TableBlockModel> = {
  flavour: 'table',
  nodeType: BlockNodeType.block,
  component: TableBlockComponent,
  createSnapshot: (rows = 3, cells = 3) => {
    const children = []
    for (let i = 0; i < rows; i++) {
      children.push(TableRowBlockSchema.createSnapshot(cells))
    }
    return {
      id: generateId(),
      flavour: 'table',
      nodeType: BlockNodeType.block,
      props: {
        colHead: false,
        rowHead: false,
        colWidths: Array.from({length: cells}, () => 100)
      },
      meta: {},
      children
    }
  },
  metadata: {
    version: 1.0,
    label: '表格',
    includeChildren: ['table-row'],
    icon: "bf_icn bf_column-vertical",
    svgIcon: "bf_column-vertical",
  }
}

export const TableRowBlockSchema: IBlockSchemaOptions<TableRowBlockModel> = {
  flavour: 'table-row',
  nodeType: BlockNodeType.block,
  component: TableRowBlockComponent,
  createSnapshot: (cellCount) => {
    const children = []
    for (let i = 0; i < cellCount; i++) {
      children.push(TableCellBlockSchema.createSnapshot())
    }
    return {
      id: generateId(),
      flavour: 'table-row',
      nodeType: BlockNodeType.block,
      props: {
        height: 60,
      },
      meta: {},
      children
    }
  },
  metadata: {
    version: 1.0,
    label: '表格行',
    includeChildren: ['table-cell'],
    isLeaf: true,
  }
}

export const TableCellBlockSchema: IBlockSchemaOptions<TableCellBlockModel> = {
  flavour: 'table-cell',
  nodeType: BlockNodeType.block,
  component: TableCellBlockComponent,
  createSnapshot: () => ({
    id: generateId(),
    flavour: 'table-cell',
    nodeType: BlockNodeType.block,
    props: {
      verticalAlign: 'top',
      rowspan: null,
      colspan: null,
      display: null,
    },
    meta: {},
    children: [ParagraphBlockSchema.createSnapshot()]
  }),
  metadata: {
    version: 1.0,
    label: '表格单元格',
    excludeChildren: ['table*', '*-embed', 'mermaid*', 'callout'],
    isLeaf: true
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      table: TableBlockComponent
      'table-row': TableRowBlockComponent,
      'table-cell': TableCellBlockComponent
    }

    interface IBlockCreateParameters {
      table: [number, number]
      'table-row': [number]
      'table-cell': [string?]
    }
  }
}
