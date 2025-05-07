import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {HastUtils} from "../../utils";
import {BlockNodeType, generateId, IBlockSnapshot} from "../../../framework";
import {ParagraphBlockSchema, TableCellBlockModel, TableCellBlockSchema} from "../../../blocks";
import {BlockCraftError, ErrorCode} from "../../../global";

export const tableBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'table',
  fromMatch: o => o.node.flavour === 'table',
  toBlockSnapshot: {
    enter: async (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const {walkerContext} = context;
      walkerContext.openNode(
        {
          id: generateId(),
          nodeType: BlockNodeType.block,
          flavour: 'table',
          props: {},
          meta: {},
          children: [],
        },
        'children'
      )
    },
    leave: async (o, context) => {
      if (!HastUtils.isElement(o.node) || o.node.tagName !== 'table') {
        return;
      }
      const {walkerContext} = context;

      const currentNode = walkerContext.currentNode()!
      if (currentNode?.flavour === 'table' && !currentNode.props['colWidths']) {
        const firstTr = currentNode.children[0] as IBlockSnapshot
        const colWidths = firstTr.children.reduce((prev, acc) => {
          return prev + 1 + ((((acc as IBlockSnapshot).props['colspan'] as number) || 1) - 1)
        }, 0)
        currentNode.props['colWidths'] = new Array(colWidths).fill(120)
      }

      const createHiddenCell = (mergedBy: string) => {
        const snapshot = TableCellBlockSchema.createSnapshot()
        snapshot.props.display = 'none'
        snapshot.props.mergedBy = mergedBy
        return snapshot
      }

      // 出栈时遍历单元格，补全colspan和rowspan大于1时缺少的隐藏单元格
      for (let rowIdx = 0; rowIdx < currentNode.children.length; rowIdx++) {
        const row = currentNode.children[rowIdx] as IBlockSnapshot
        if (row.flavour !== 'table-row') {
          throw new BlockCraftError(ErrorCode.DefaultRuntimeError, `Unexpected block type in table`)
        }

        for (let colIdx = 0; colIdx < row.children.length; colIdx++) {
          const cell = row.children[colIdx] as IBlockSnapshot<TableCellBlockModel['props']>
          if (cell.flavour !== 'table-cell') {
            throw new BlockCraftError(ErrorCode.DefaultRuntimeError, `Unexpected block type in table-row`)
          }

          if (!cell.children.length) {
            // @ts-ignore
            cell.children.push(ParagraphBlockSchema.createSnapshot())
          }

          if (cell.props.colspan && cell.props.colspan > 1) {
            // 添加隐藏单元格
            for (let k = 1; k < cell.props.colspan; k++) {
              row.children.splice(colIdx + k, 0, createHiddenCell(cell.id))
            }
          }

          if (cell.props.rowspan && cell.props.rowspan > 1) {
            // 添加隐藏单元格
            for (let k = 1; k < cell.props.rowspan; k++) {
              const row = currentNode.children[k + rowIdx] as IBlockSnapshot
              row.children.splice(colIdx, 0, ...new Array(cell.props.colspan || 1).fill(0).map(() => createHiddenCell(cell.id)))
            }
          }
        }
      }

      walkerContext.closeNode();
    }
  },
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const {walkerContext} = context;

      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'table',
            properties: {},
            children: [
              {
                type: 'element',
                tagName: 'tbody',
                properties: {},
                children: [],
              }
            ],
          },
          'children'
        )
    },
    leave: async (o, context) => {
      if (o.node.flavour !== 'table') return
      const {walkerContext} = context;
      walkerContext.closeNode();
    }
  },
};

export const tableRowBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'tr',
  fromMatch: o => o.node.flavour === 'table-row',
  toBlockSnapshot: {
    enter: async (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const {walkerContext} = context;
      walkerContext.openNode(
        {
          id: generateId(),
          nodeType: BlockNodeType.block,
          flavour: 'table-row',
          props: {},
          meta: {},
          children: [],
        }
      )
    },
    leave: async (o, context) => {
      if (!HastUtils.isElement(o.node) || o.node.tagName !== 'tr') {
        return;
      }
      const {walkerContext} = context;
      walkerContext.closeNode();
    }
  },
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const {walkerContext} = context;

      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'tr',
            properties: {},
            children: [],
          },
          'children'
        )
    },
    leave: async (o, context) => {
      if (o.node.flavour !== 'table-row') return
      const {walkerContext} = context;
      walkerContext.closeNode();
    }
  },
};

export const tableCellBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'td',
  fromMatch: o => o.node.flavour === 'table-cell',
  toBlockSnapshot: {
    enter: async (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const {walkerContext} = context;
      const colspan = Number(o.node.properties["colSpan"])
      const rowspan = Number(o.node.properties["rowSpan"])

      walkerContext.openNode({
        id: generateId(),
        nodeType: BlockNodeType.block,
        flavour: 'table-cell',
        props: {
          colspan: colspan > 1 ? colspan : null,
          rowspan: rowspan > 1 ? rowspan : null,
        },
        meta: {},
        children: [],
      }, 'children')
    },
    leave: async (o, context) => {
      if (!HastUtils.isElement(o.node) || o.node.tagName !== 'td') {
        return;
      }
      const {walkerContext} = context;
      walkerContext.closeNode();
    }
  },
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const {walkerContext} = context;

      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'td',
            properties: {},
            children: [],
          },
          'children'
        )
    },
    leave: async (o, context) => {
      if (o.node.flavour !== 'table-cell') return
      const {walkerContext} = context;
      walkerContext.closeNode();
    }
  },
};
