import { generateId, NoEditableBlockNative } from "../../framework";
import { TableBlockComponent } from "./table.block";
import { IBlockSchemaOptions } from "../../framework/block-std/schema/block-schema";
import { BlockNodeType, IBlockProps, IBlockSnapshot } from "../../framework";
import { TableRowBlockComponent } from "./table-row.block";
import { TableCellBlockComponent } from "./table-cell.block";
import { ParagraphBlockSchema } from "../paragraph-block";

export * from './agent'

export interface TableBlockModel extends NoEditableBlockNative {
  flavour: 'table',
  props: {
    colHead?: boolean
    rowHead?: boolean
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
    rowspan?: number | null
    colspan?: number | null
    display?: null | 'none'
  } & IBlockProps,
}

export const TableBlockSchema: IBlockSchemaOptions<TableBlockModel> = {
  flavour: 'table',
  nodeType: BlockNodeType.block,
  component: TableBlockComponent,
  createSnapshot: (rows = 3, cells = 3, values?: readonly (readonly string[])[]) => {
    if (values !== undefined) {
      if (!Number.isInteger(rows) || rows < 1 || rows > 100 || !Number.isInteger(cells) || cells < 1 || cells > 50
        || !Array.isArray(values) || values.length !== rows
        || values.some(row => !Array.isArray(row) || row.length !== cells || row.some(value => typeof value !== 'string' || value.length > 4000))
        || values.reduce((total, row) => total + row.reduce((size: number, value: string) => size + value.length, 0), 0) > 120000) {
        throw new Error('Table values must match the row/column dimensions and stay within the content limit.')
      }
    }
    const children = []
    for (let i = 0; i < rows; i++) {
      const row = TableRowBlockSchema.createSnapshot(cells)
      if (values) {
        (row.children as IBlockSnapshot[]).forEach((cell, index) => {
          cell.children = [ParagraphBlockSchema.createSnapshot(values[i][index])]
        })
      }
      children.push(row)
    }
    return {
      id: generateId(),
      flavour: 'table',
      nodeType: BlockNodeType.block,
      props: {
        colWidths: Array.from({ length: cells }, () => 100)
      },
      meta: {},
      children
    }
  },
  metadata: {
    version: 1.0,
    label: '表格',
    description: '使用行列结构整理数据',
    includeChildren: ['table-row'],
    icon: "bc_icn bc_column-vertical",
    svgIcon: "bc_column-vertical",
    selectionScope: 'table',
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
    description: '承载一行表格单元格',
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
    },
    meta: {},
    children: [ParagraphBlockSchema.createSnapshot()]
  }),
  metadata: {
    version: 1.0,
    label: '表格单元格',
    description: '承载单元格中的块内容',
    excludeChildren: ['table*', '*-embed', 'mermaid*', 'column*'],
    isLeaf: true,
    renderUnit: true,
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
      table: [number, number, (readonly (readonly string[])[])?]
      'table-row': [number]
      'table-cell': [string?]
    }
  }
}
