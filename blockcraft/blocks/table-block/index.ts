import {generateId, NoEditableBlockNative} from "../../framework";
import {TableBlockComponent} from "./table.block";
import {BlockSchemaOptions} from "../../framework/schema/block-schema";
import {BlockNodeType} from "../../framework/types";
import {TableRowBlockComponent} from "./table-row.block";
import {TableCellBlockComponent} from "./table-cell.block";
import {ParagraphBlockSchema} from "../paragraph-block";

export interface TableBlockModel extends NoEditableBlockNative {
  flavour: 'table',
}

export interface TableRowBlockModel extends NoEditableBlockNative {
  flavour: 'table-row'
}

export interface TableCellBlockModel extends NoEditableBlockNative {
  flavour: 'table-cell'
}

export const TableBlockSchema: BlockSchemaOptions<TableBlockModel> = {
  flavour: 'table',
  nodeType: BlockNodeType.block,
  component: TableBlockComponent,
  createSnapshot: (rows, cells) => {
    const children = []
    for (let i = 0; i < rows; i++) {
      children.push(TableRowBlockSchema.createSnapshot(cells))
    }
    return {
      id: generateId(),
      flavour: 'table',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children
    }
  },
  metadata: {
    version: 1.0,
    label: '表格',
    children: ['table-row']
  }
}

export const TableRowBlockSchema: BlockSchemaOptions<TableRowBlockModel> = {
  flavour: 'table-row',
  nodeType: BlockNodeType.block,
  component: TableRowBlockComponent,
  createSnapshot: (cells) => {
    const children = []
    for (let i = 0; i < cells; i++) {
      children.push(TableCellBlockSchema.createSnapshot())
    }
    return {
      id: generateId(),
      flavour: 'table-row',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children
    }
  },
  metadata: {
    version: 1.0,
    label: '表格行',
    children: ['table-cell'],
    isLeaf: true
  }
}

export const TableCellBlockSchema: BlockSchemaOptions<TableCellBlockModel> = {
  flavour: 'table-cell',
  nodeType: BlockNodeType.block,
  component: TableCellBlockComponent,
  createSnapshot: () => ({
    id: generateId(),
    flavour: 'table-cell',
    nodeType: BlockNodeType.block,
    props: {},
    meta: {},
    children: [ParagraphBlockSchema.createSnapshot()]
  }),
  metadata: {
    version: 1.0,
    label: '表格单元格',
    children: ['*'],
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
