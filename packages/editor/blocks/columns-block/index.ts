import {NoEditableBlockNative, BlockNodeType, IBlockSnapshot} from "../../framework";
import {IBlockSchemaOptions} from "../../framework/block-std/schema/block-schema";
import {nanoid} from "nanoid";

// 先导出组件（会在下面定义全局类型后使用）
export * from './column.block';
export * from './columns.block';

import {ColumnBlockComponent} from "./column.block";
import {ColumnsBlockComponent} from "./columns.block";
import {ParagraphBlockSchema} from "../paragraph-block";

/**
 * 单列块模型
 */
export interface ColumnBlockModel extends NoEditableBlockNative {
  flavour: 'column',
  nodeType: BlockNodeType.block
  props: {
    /** 列索引 */
    columnIndex?: number
  }
}

/**
 * 多栏布局块模型
 */
export interface ColumnsBlockModel extends NoEditableBlockNative {
  flavour: 'columns',
  nodeType: BlockNodeType.block
  props: {
    /** 栏数 (2-6) */
    columnCount: number
    /** 每栏的宽度百分比数组 */
    columnWidths: number[]
  }
}

/**
 * 单列块 Schema
 */
export const ColumnBlockSchema: IBlockSchemaOptions<ColumnBlockModel> = {
  flavour: 'column',
  nodeType: BlockNodeType.block,
  component: ColumnBlockComponent,
  createSnapshot: (children?: IBlockSnapshot[]) => {
    if (!children) {
      children = [ParagraphBlockSchema.createSnapshot()];
    }
    return {
      id: nanoid(),
      flavour: 'column',
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children
    }
  },
  metadata: {
    version: 1,
    label: "列容器",
    icon: "bc_icon bc_fenlan",
    svgIcon: "bc_fenlan",
    description: "单列容器，用于多栏布局",
    excludeChildren: ['table*', 'root', 'columns', 'column'],
    isLeaf: true,
    renderUnit: true
  }
}

/**
 * 多栏布局块 Schema
 */
export const ColumnsBlockSchema: IBlockSchemaOptions<ColumnsBlockModel> = {
  flavour: 'columns',
  nodeType: BlockNodeType.block,
  component: ColumnsBlockComponent,
  createSnapshot: (columnCount: number = 2) => {
    // 默认平均分配宽度
    const equalWidth = 100 / columnCount;
    const columnWidths = Array(columnCount).fill(equalWidth);

    // 创建对应数量的 column blocks
    const columnBlocks = Array(columnCount).fill(0).map((_, index) =>
      ColumnBlockSchema.createSnapshot()
    );

    return {
      id: nanoid(),
      flavour: 'columns',
      nodeType: BlockNodeType.block,
      props: {
        columnCount,
        columnWidths,
      },
      meta: {},
      children: columnBlocks
    }
  },
  metadata: {
    version: 1,
    label: "多栏布局",
    icon: "bc_icon bc_fenlan",
    svgIcon: "bc_fenlan",
    description: "创建 2-6 栏的响应式布局，每栏可独立编辑",
    includeChildren: ['column']
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      column: ColumnBlockComponent
      columns: ColumnsBlockComponent
    }

    interface IBlockCreateParameters {
      column: [IBlockSnapshot[]?]
      columns: [number?]
    }
  }
}
